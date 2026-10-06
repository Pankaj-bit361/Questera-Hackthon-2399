const CommentReply = require('../models/commentReply');
const ScheduledPost = require('../models/scheduledPost');
const AutopilotMemory = require('../models/autopilotMemory');
const { instagramToken } = require('./PlatformTokens');
const { OpenRouterProvider } = require('../agent/LLMProvider');

/**
 * Replies to comments, drafted for the user to approve. Instagram: comments on the autopilot's posts from the last
 * two weeks, each answered once, in the brand's voice and only with what the site says. Spam gets no draft. A
 * complaint gets a draft marked to handle with care. Nothing is posted until the user sends it (`send`).
 *
 * X's free API tier cannot read replies at any volume, and LinkedIn member posts cannot be read at all, so those
 * are not covered.
 */

const WINDOW_DAYS = 14;
const PER_RUN = 20;
const GRAPH = 'https://graph.facebook.com/v22.0';

const SYSTEM = `You answer comments on a company's social media posts, as the company. You write the draft; a person approves it.

Rules:
- Short: one to three sentences. Warm, direct, no exclamation stacks, at most one emoji.
- Answer questions only with what the company facts say. If they do not say, offer to help ("Send us a message and we'll check") rather than guess.
- Never promise discounts, refunds, dates or features. Never argue. For a complaint, acknowledge, apologise once and move it to a private message.
- Spam, bots and abuse get no reply.

Respond with ONLY JSON: {"kind":"question|praise|feedback|complaint|other|spam","reply":"...","note":"for a complaint: what the person should check before sending, else empty"}`;

const defaultFetchJson = async (url, init) => {
  const res = await fetch(url, init);
  return res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
};

async function collectInstagram(userId, { llm = null, fetchJson = defaultFetchJson } = {}) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400e3);
  const posts = await ScheduledPost.find({
    userId, platform: 'instagram', source: 'autopilot', status: 'published', publishedMediaId: { $ne: null }, publishedAt: { $gte: since },
  }).sort({ publishedAt: -1 }).limit(20);
  if (!posts.length) return 0;
  const model = llm || new OpenRouterProvider({ model: process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash' });
  let drafted = 0;
  for (const post of posts) {
    const auth = await instagramToken(userId, post.accountId || null);
    if (!auth) return drafted;
    const res = await fetchJson(`${GRAPH}/${post.publishedMediaId}/comments?fields=id,text,username,timestamp,replies{username}&limit=50&access_token=${auth.accessToken}`);
    if (res?.error) continue;
    const memory = await AutopilotMemory.findOne(post.autopilotId ? { autopilotId: post.autopilotId } : { userId }).lean();
    const brand = memory?.brand || {};
    const facts = (memory?.facts?.length ? memory.facts.map((f) => f.text) : brand.proofPoints || []).slice(0, 30);
    for (const c of res.data || []) {
      if (drafted >= PER_RUN) return drafted;
      // Our own comments, and comments we have already answered on the platform or here, are skipped.
      if (!c.text || c.username === auth.username) continue;
      if ((c.replies?.data || []).some((r) => r.username === auth.username)) continue;
      if (await CommentReply.exists({ platform: 'instagram', commentId: c.id })) continue;
      const out = await model.chatJSON([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Company: ${brand.companyName || ''} - ${brand.oneLiner || ''}\nTone: ${brand.tone || 'friendly'}\nFacts:\n${facts.map((f) => `- ${f}`).join('\n') || '(none)'}\n\nThe post: ${String(post.caption || '').slice(0, 600)}\n\nComment from @${c.username}: ${c.text}` },
      ], { temperature: 0.4, fallback: null }).catch(() => null);
      if (!out) continue;
      const kind = String(out.kind || 'other');
      await CommentReply.create({
        userId,
        autopilotId: post.autopilotId || null,
        platform: 'instagram',
        postId: post.postId,
        postCaption: String(post.caption || '').slice(0, 300),
        postUrl: post.platformPostUrl || null,
        commentId: c.id,
        commentText: c.text,
        commentAuthor: c.username,
        commentedAt: c.timestamp ? new Date(c.timestamp) : null,
        kind: kind === 'spam' ? 'other' : ['question', 'praise', 'feedback', 'complaint'].includes(kind) ? kind : 'other',
        draft: kind === 'spam' ? '' : String(out.reply || '').slice(0, 600),
        note: String(out.note || '').slice(0, 300),
        // Spam is recorded (so it is not drafted again) but never shown.
        status: kind === 'spam' || !out.reply ? 'dismissed' : 'draft',
      }).catch((err) => {
        if (err.code !== 11000) throw err; // another server drafted it first
      });
      if (kind !== 'spam' && out.reply) drafted += 1;
    }
  }
  return drafted;
}

/** Post the approved reply (the user's edited text if they changed it). */
async function send(userId, replyId, text, { fetchJson = defaultFetchJson } = {}) {
  const reply = await CommentReply.findOneAndUpdate({ userId, replyId, status: 'draft' }, { $set: { status: 'failed', error: 'sending' } }, { new: true });
  if (!reply) throw Object.assign(new Error('This reply was already handled'), { statusCode: 409 });
  const message = String(text || reply.draft || '').trim().slice(0, 2000);
  try {
    if (!message) throw new Error('The reply is empty');
    const post = await ScheduledPost.findOne({ postId: reply.postId }).select('accountId').lean();
    const auth = await instagramToken(userId, post?.accountId || null);
    if (!auth) throw new Error('Instagram is not connected');
    const res = await fetchJson(`${GRAPH}/${reply.commentId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: auth.accessToken }),
    });
    if (res?.error) throw new Error(res.error.message || 'Instagram refused the reply');
    await CommentReply.updateOne({ _id: reply._id }, { $set: { status: 'sent', sentText: message, sentAt: new Date(), error: null } });
    return { sent: true };
  } catch (err) {
    // Back to a draft so the user can try again; the error is shown with it.
    await CommentReply.updateOne({ _id: reply._id }, { $set: { status: 'draft', error: err.message } });
    throw Object.assign(err, { statusCode: 502 });
  }
}

/** Hourly: users with recent Instagram posts. */
async function collectDue() {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400e3);
  const users = await ScheduledPost.distinct('userId', { platform: 'instagram', source: 'autopilot', status: 'published', publishedAt: { $gte: since } });
  let total = 0;
  for (const userId of users) total += await collectInstagram(userId).catch((err) => (console.warn(`⚠️ [REPLIES] ${userId}:`, err.message), 0));
  if (total) console.log(`💬 [REPLIES] ${total} new reply draft(s)`);
  return total;
}

module.exports = { collectInstagram, collectDue, send };
