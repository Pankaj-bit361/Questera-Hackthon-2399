const { OpenRouterProvider } = require('../agent/LLMProvider');
const { PlatformDefaults } = require('../agent/PlatformDefaults');

const SYSTEM = `You are the quality gate for an autonomous social media account. A post is about to go out with no human looking at it. Score it 0-100.

Score HIGH (75+) only if ALL of these hold:
- Every factual claim is supported by the brand profile or the given fact. No invented numbers, customers, awards or features.
- It reads like a person from this company, in the stated tone, for the stated audience. No generic marketing filler, no "unlock the power of".
- Fits the platform: length within limits, hashtag count within limit, hook in the first line, no Instagram-style caption on X.
- Nothing promised that the account cannot deliver (screenshots, real photos, live demos, giveaways).
- When the actual image(s) or video are attached, judge THEM: on-brand, no garbled text or extra fingers, no fake UI or fake screenshots posing as real, nothing embarrassing, matches the caption. A bad image is a failing post even with a perfect caption.
- Not a near-duplicate of the recent posts listed.

Score LOW for: unsupported claims, off-tone, placeholder text, broken or missing link when a CTA is present, cut-off sentences, hashtag spam, anything embarrassing or risky (politics, competitors named, medical/financial advice).

Respond with ONLY JSON:
{"score": 0-100, "verdict": "one sentence", "issues": ["specific problem", "..."], "strengths": ["...", "..."], "unsupportedClaims": ["each claim about the company or product, quoted from the post, that the brand facts and the given fact do not support"]}
unsupportedClaims is empty when every product claim is backed. General knowledge about the field is not a product claim.`;

// Never the model that wrote the post (PostWriter.WRITER_MODEL): a model grading its own writing misses the same
// things it got wrong. Claude Opus is strict and calibrated (it scores weak drafts as low as Sonnet does, where
// Gemini Pro passed nearly everything), which is what a gate that lets posts publish on their own needs. Videos need
// a model that can watch them.
const REVIEW_MODEL = process.env.AUTOPILOT_REVIEW_MODEL || 'anthropic/claude-opus-5.5';
const VIDEO_REVIEW_MODEL = process.env.AUTOPILOT_VIDEO_REVIEW_MODEL || 'google/gemini-3.1-pro-preview';

/**
 * Scores a generated post before it is allowed to publish unattended.
 */
class PostReviewer {
  constructor() {
    const { WRITER_MODEL } = require('./PostWriter');
    if (WRITER_MODEL === REVIEW_MODEL) console.warn(`⚠️ [REVIEW] The reviewer is the writer (${REVIEW_MODEL}); set AUTOPILOT_REVIEW_MODEL to a different model.`);
    this.llm = new OpenRouterProvider({ model: REVIEW_MODEL });
    this.videoLlm = new OpenRouterProvider({ model: VIDEO_REVIEW_MODEL });
  }

  async review({ platform, brand = {}, post, recentCaptions = [], imageUrls = [], videoUrl = null, ruleIssues = [], textOnly = false }) {
    const spec = PlatformDefaults.getCaptionSettings(platform);
    const body = post.threadParts?.length > 1
      ? post.threadParts.map((p, i) => `(${i + 1}/${post.threadParts.length}) ${p}`).join('\n')
      : [post.caption, post.hashtags].filter(Boolean).join('\n');

    const user = `## Platform
${platform}: max ${spec.maxLength} chars per post${platform === 'twitter' ? ' (a link counts as 23)' : ''}, max ${spec.hashtagLimit} hashtags, usual tone ${spec.tone} - where the brand's own tone differs, the brand's tone is right.

## Brand
${brand.companyName || ''} - ${brand.oneLiner || ''}
Audience: ${brand.targetAudience || 'n/a'}. Tone: ${brand.tone || 'n/a'}.
Allowed topics: ${(brand.topicsAllowed || []).join(', ') || 'n/a'}
Known facts: ${[...(brand.proofPoints || []), ...(brand.uniqueSellingPoints || [])].map((p) => `"${p}"`).join('; ') || 'none'}

## The post (${post.postType})
${body}

Link: ${post.linkUrl ? `${post.linkUrl} (the system adds it as the post's last line; seeing it there once is correct)` : 'none'}
Fact it was meant to use: ${post.proofPoint || 'none'}
Visual concept: ${post.imagePrompt || 'none (text only)'}\nMedia attached: ${textOnly ? 'checked separately - judge only the words' : imageUrls.length ? `${imageUrls.length} image(s)` : videoUrl ? 'video' : 'none'}

## Recent posts from this account
${recentCaptions.map((c) => `- ${c.slice(0, 140)}`).join('\n') || '(none)'}

## Already found by the rule check
${ruleIssues.map((i) => `- ${i}`).join('\n') || '(nothing)'}

Score it.`;

    // Attach the real media so the model grades what will actually be seen.
    const parts = [{ type: 'text', text: user }];
    for (const url of imageUrls.filter(Boolean).slice(0, 4)) parts.push({ type: 'image_url', image_url: { url } });
    const withVideo = videoUrl ? [...parts, { type: 'video_url', video_url: { url: videoUrl } }] : parts;

    let out;
    let model = videoUrl ? VIDEO_REVIEW_MODEL : REVIEW_MODEL;
    try {
      const llm = videoUrl ? this.videoLlm : this.llm;
      out = await llm.chatJSON([{ role: 'system', content: SYSTEM }, { role: 'user', content: withVideo }], { temperature: 0.2, fallback: null });
    } catch (err) {
      // Video attachment support varies by route; fall back to images + text
      // rather than skipping the review entirely.
      if (!videoUrl) throw err;
      console.warn('[REVIEW] video attachment rejected, reviewing without it:', err.message.slice(0, 120));
      model = REVIEW_MODEL;
      out = await this.llm.chatJSON([{ role: 'system', content: SYSTEM }, { role: 'user', content: parts }], { temperature: 0.2, fallback: null });
    }
    if (!out || typeof out.score !== 'number') throw new Error('Reviewer returned no score');
    return {
      score: Math.max(0, Math.min(100, Math.round(out.score))),
      verdict: String(out.verdict || '').slice(0, 300),
      issues: (Array.isArray(out.issues) ? out.issues : []).slice(0, 6).map(String),
      strengths: (Array.isArray(out.strengths) ? out.strengths : []).slice(0, 4).map(String),
      unsupportedClaims: (Array.isArray(out.unsupportedClaims) ? out.unsupportedClaims : []).slice(0, 6).map((c) => String(c).slice(0, 200)).filter(Boolean),
      reviewedAt: new Date(),
      model,
    };
  }
}

module.exports = PostReviewer;
module.exports.REVIEW_MODEL = REVIEW_MODEL;
module.exports.VIDEO_REVIEW_MODEL = VIDEO_REVIEW_MODEL;
