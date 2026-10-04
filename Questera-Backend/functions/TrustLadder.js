const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');
const AutopilotEvent = require('../models/autopilotEvent');
const ScheduledPost = require('../models/scheduledPost');

/**
 * The trust ladder: an autopilot earns the right to publish on its own, per platform.
 *
 * - Supervised (where every autopilot starts): every post waits for the user to approve or reject it.
 * - After PROMOTE_AFTER approvals in a row, each of a post whose review scored at least the config's
 *   autoPublishMinScore, it switches to autopilot.
 * - On autopilot, a post that passes the rule check and scores at least autoPublishMinScore still waits
 *   `holdHours` (12 by default) in the queue, marked with when it will go out, so the user can stop it. Anything
 *   below the bar waits for the user as before.
 * - One rejection resets the streak; a rejection while on autopilot also returns it to supervised.
 * - "Always ask" (permissions.requireApproval) holds every post regardless.
 *
 * Only the user's approvals count toward the streak: the autopilot approving its own posts proves nothing.
 */

const PROMOTE_AFTER = 5;
const REJECT_REASONS = ['inaccurate', 'off_brand', 'generic', 'repetitive', 'bad_visual', 'wrong_timing', 'other'];

const minScore = (config) =>
  Number.isFinite(config?.permissions?.autoPublishMinScore) ? config.permissions.autoPublishMinScore : 75;

/** The config a post belongs to. */
function configFor(post) {
  return post.autopilotId
    ? AutopilotConfig.findOne({ autopilotId: post.autopilotId, platform: post.platform })
    : AutopilotConfig.findOne({ userId: post.userId, platform: post.platform });
}

const scopeOf = (config) => (config.autopilotId ? { autopilotId: config.autopilotId } : { userId: config.userId });

const event = (config, action, reason, postId = null) =>
  AutopilotEvent.create({
    userId: config.userId,
    autopilotId: config.autopilotId || null,
    platform: config.platform,
    action,
    reason,
    postId,
  }).catch((err) => console.error('[TRUST] Event not recorded:', err.message));

/**
 * The config's ladder position, deciding it for configs from before the ladder: one that published at least
 * PROMOTE_AFTER autopilot posts in the last 30 days, with none rejected or cancelled, keeps publishing on its own
 * (it already has a clean record); everyone else starts supervised.
 */
async function ensure(config) {
  if (config.trust?.mode) return config.trust.mode;
  const since = new Date(Date.now() - 30 * 86400e3);
  const scope = { ...scopeOf(config), platform: config.platform, source: 'autopilot', createdAt: { $gte: since } };
  const [published, cancelled] = await Promise.all([
    ScheduledPost.countDocuments({ ...scope, status: 'published' }),
    ScheduledPost.countDocuments({ ...scope, status: 'cancelled' }),
  ]);
  const clean = !config.permissions?.requireApproval && published >= PROMOTE_AFTER && cancelled === 0;
  const mode = clean ? 'autopilot' : 'supervised';
  await AutopilotConfig.updateOne(
    { _id: config._id, 'trust.mode': null },
    { $set: { 'trust.mode': mode, ...(clean ? { 'trust.promotedAt': new Date() } : {}) } },
  );
  config.trust = { ...(config.trust?.toObject?.() || config.trust || {}), mode };
  if (clean) await event(config, 'promoted', `Kept on autopilot: ${published} posts published in the last 30 days, none rejected`);
  return mode;
}

/**
 * Status for a post the autopilot just made: { status, autoApproveAt, why }.
 * `review` is the review agent's verdict (null when it was unavailable), with the rule check's ruleFailed.
 */
async function decide(config, review) {
  const mode = await ensure(config);
  const hold = (why) => ({ status: 'pending_approval', autoApproveAt: null, why });
  if (config.permissions?.requireApproval) return hold('"Always ask" is on');
  if (mode !== 'autopilot') return hold(`Supervised: ${config.trust?.approvalStreak || 0} of ${PROMOTE_AFTER} clean approvals`);
  if (!review || typeof review.score !== 'number') return hold('The review was unavailable');
  if (review.ruleFailed) return hold(`The rule check found: ${(review.ruleIssues || []).join('; ')}`);
  if (review.unsupportedClaims?.length) return hold(`Claims the site does not back: ${review.unsupportedClaims.join('; ')}`);
  if (review.score < minScore(config)) return hold(`Review score ${review.score} is under ${minScore(config)}`);
  const hours = config.trust?.holdHours ?? 12;
  if (hours <= 0) return { status: 'scheduled', autoApproveAt: null, why: 'Autopilot, no hold' };
  return { status: 'pending_approval', autoApproveAt: new Date(Date.now() + hours * 3600e3), why: `Autopilot: publishes in ${hours}h unless stopped` };
}

/**
 * Approve a waiting post. `by: 'user'` counts toward the ladder; `by: 'autopilot'` is the hold running out.
 * Returns the post, or null when it was no longer waiting.
 */
async function approve(postId, { by = 'user', scheduledAt = null } = {}) {
  const now = new Date();
  const current = await ScheduledPost.findOne({ postId, status: 'pending_approval' });
  if (!current) return null;
  let when = scheduledAt ? new Date(scheduledAt) : current.scheduledAt;
  // A slot that has already passed would publish the instant the cron next ticks; give it a minute.
  if (!when || when <= now) when = new Date(now.getTime() + 60e3);

  const post = await ScheduledPost.findOneAndUpdate(
    { postId, status: 'pending_approval' },
    { $set: { status: 'scheduled', scheduledAt: when, approvedAt: now, approvedBy: by, autoApproveAt: null } },
    { new: true },
  );
  if (!post) return null;

  const config = post.source === 'autopilot' ? await configFor(post) : null;
  if (config && by === 'user') await countApproval(config, post);
  if (config && by === 'autopilot') await event(config, 'auto_approved', `Published after the ${config.trust?.holdHours ?? 12}h hold`, post.postId);
  return post;
}

async function countApproval(config, post) {
  const mode = await ensure(config);
  const streak = (config.trust?.approvalStreak || 0) + 1;
  const set = { 'trust.approvalStreak': streak };
  let promoted = false;

  if (mode === 'supervised' && streak >= PROMOTE_AFTER) {
    // The streak alone is not enough: the last PROMOTE_AFTER posts the user approved must all have been scored at
    // or above the bar. An unscored post counts against promotion, not for it.
    const recent = await ScheduledPost.find({
      ...scopeOf(config),
      platform: config.platform,
      source: 'autopilot',
      approvedBy: 'user',
    })
      .sort({ approvedAt: -1 })
      .limit(PROMOTE_AFTER)
      .select('review.score')
      .lean();
    const scores = recent.map((r) => r.review?.score).filter((s) => typeof s === 'number');
    const earned = recent.length >= PROMOTE_AFTER && scores.length === recent.length && scores.every((s) => s >= minScore(config));
    // Earned either way; it switches on only on a plan that includes autopilot (functions/Plans.js).
    if (earned && (await require('./Plans').allowsAutopilot(config.userId))) {
      Object.assign(set, { 'trust.mode': 'autopilot', 'trust.promotedAt': new Date() });
      promoted = true;
    } else if (earned) {
      await event(config, 'held', `${streak} clean approvals: autopilot is earned, and switches on with a paid plan`, post.postId);
    }
  }
  await AutopilotConfig.updateOne({ _id: config._id }, { $set: set });

  if (promoted) {
    config.trust.mode = 'autopilot';
    await event(config, 'promoted', `${streak} approvals in a row, all scoring ${minScore(config)} or more: posts now publish on their own after a ${config.trust?.holdHours ?? 12}h hold`, post.postId);
    await startHolds(config);
  }
}

/** On promotion, posts already waiting that would have qualified get a hold too. */
async function startHolds(config) {
  const hours = config.trust?.holdHours ?? 12;
  const waiting = await ScheduledPost.find({
    ...scopeOf(config),
    platform: config.platform,
    source: 'autopilot',
    status: 'pending_approval',
    autoApproveAt: null,
    'review.score': { $gte: minScore(config) },
    'review.ruleFailed': { $ne: true },
  }).select('_id');
  if (!waiting.length || config.permissions?.requireApproval) return;
  await ScheduledPost.updateMany(
    { _id: { $in: waiting.map((w) => w._id) } },
    { $set: { autoApproveAt: new Date(Date.now() + hours * 3600e3) } },
  );
}

/**
 * Reject a waiting post, with a reason from REJECT_REASONS and an optional note. Resets the streak, returns the
 * autopilot to supervised if it was on autopilot, and saves the reason where the planner and writer will see it.
 */
async function reject(postId, { reason = 'other', note = '' } = {}) {
  const why = REJECT_REASONS.includes(reason) ? reason : 'other';
  const cleanNote = String(note || '').trim().slice(0, 500);
  const post = await ScheduledPost.findOneAndUpdate(
    { postId, status: { $in: ['pending_approval', 'scheduled'] } },
    {
      $set: { status: 'cancelled', rejectedAt: new Date(), rejectReason: why, rejectNote: cleanNote || null, autoApproveAt: null },
    },
    { new: true },
  );
  if (!post) return null;
  if (post.source !== 'autopilot') return post;

  const config = await configFor(post);
  if (config) {
    const mode = await ensure(config);
    const set = { 'trust.approvalStreak': 0 };
    if (mode === 'autopilot') {
      Object.assign(set, {
        'trust.mode': 'supervised',
        'trust.demotedAt': new Date(),
        'trust.demotedReason': `You rejected a post (${why.replace('_', ' ')})`,
      });
    }
    await AutopilotConfig.updateOne({ _id: config._id }, { $set: set });
    if (mode === 'autopilot') {
      await stopHolds(config);
      await event(config, 'demoted', `You rejected a post (${why.replace('_', ' ')}${cleanNote ? `: "${cleanNote}"` : ''}), so every post waits for you again`, post.postId);
    }
    const memory = await AutopilotMemory.findOne(scopeOf(config));
    if (memory) {
      memory.rejections = [
        { at: new Date(), platform: post.platform, reason: why, note: cleanNote, caption: String(post.caption || '').slice(0, 300) },
        ...(memory.rejections || []),
      ].slice(0, 10);
      await memory.save();
    }
  }
  return post;
}

/** Back to supervised by hand (or by the supervisor); waiting posts lose their hold. */
async function demote(config, reason, action = 'demoted') {
  await AutopilotConfig.updateOne(
    { _id: config._id },
    { $set: { 'trust.mode': 'supervised', 'trust.approvalStreak': 0, 'trust.demotedAt': new Date(), 'trust.demotedReason': reason } },
  );
  config.trust = { ...(config.trust?.toObject?.() || config.trust || {}), mode: 'supervised', approvalStreak: 0 };
  await stopHolds(config);
  await event(config, action, reason);
}

async function stopHolds(config) {
  await ScheduledPost.updateMany(
    { ...scopeOf(config), platform: config.platform, status: 'pending_approval', autoApproveAt: { $ne: null } },
    { $set: { autoApproveAt: null } },
  );
}

/** Called every scheduler tick: approve posts whose hold ran out, if their autopilot is still trusted. */
async function approveHeldPosts(now = new Date()) {
  const due = await ScheduledPost.find({ status: 'pending_approval', autoApproveAt: { $lte: now } }).limit(50);
  let approved = 0;
  for (const post of due) {
    const config = await configFor(post);
    const trusted = config && config.trust?.mode === 'autopilot' && !config.permissions?.requireApproval;
    if (!trusted) {
      await ScheduledPost.updateOne({ _id: post._id, autoApproveAt: post.autoApproveAt }, { $set: { autoApproveAt: null } });
      continue;
    }
    if (await approve(post.postId, { by: 'autopilot' })) approved++;
  }
  return approved;
}

/** For the UI: where each platform stands. */
async function summary(config) {
  const mode = await ensure(config);
  return {
    platform: config.platform,
    mode,
    approvalStreak: config.trust?.approvalStreak || 0,
    promoteAfter: PROMOTE_AFTER,
    minScore: minScore(config),
    holdHours: config.trust?.holdHours ?? 12,
    alwaysAsk: !!config.permissions?.requireApproval,
    promotedAt: config.trust?.promotedAt || null,
    demotedAt: config.trust?.demotedAt || null,
    demotedReason: config.trust?.demotedReason || null,
    // Paused by the user or the supervisor (Supervisor.js).
    pausedUntil: config.pausedUntil && config.pausedUntil > new Date() ? config.pausedUntil : null,
    enabled: !!config.enabled,
  };
}

module.exports = {
  PROMOTE_AFTER,
  REJECT_REASONS,
  ensure,
  decide,
  approve,
  reject,
  demote,
  approveHeldPosts,
  summary,
  configFor,
};
