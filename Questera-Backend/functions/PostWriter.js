const { OpenRouterProvider } = require('../agent/LLMProvider');
const { PlatformDefaults } = require('../agent/PlatformDefaults');

const SYSTEM = `You write the posts for one company's autonomous {PLATFORM} account. You are the person at the company who knows the product best and writes like a human, not like marketing.

HARD RULES:
- Only claim what the brand profile or the given fact supports. No invented numbers, customers, awards, features or guarantees.
- If a fact is given, use it - the concrete detail is the point of the post. Quote numbers exactly.
- Say what the product DOES, from the facts; do not state outcomes or benefits the facts do not state ("scales with you", "saves hours", "protects your domain", "boosts conversions"). Let the reader draw the benefit. Framing the reader's problem in general terms is fine; promising a result is not.
- Every claim about the product comes from the fact, the facts listed, or "Things they can truthfully say". Do not explain how a feature works, what it shows or what it flags beyond what those say; general knowledge about the field (why broken links hurt, what a sitemap is) is fine.
- Match the audience and tone given. No "unlock", "game-changer", "ultimate hack", "revolutionize", "dominate", "skyrocket", "unleash", "next-level", "world-class", "cutting-edge", "guaranteed", no exclamation-mark stacks, no emoji stacks.
- The first line carries the most specific thing in the post - a number, a name, a concrete before/after - never a generic opener ("Stop doing X", "Building Y usually means...").
- Open with the substance, not a teaser. A post that only says "here's why X (thread)" with nothing after it is a failure.
- Never promise screenshots, demos, giveaways or anything the account cannot deliver.
- Do NOT put a URL in the text - the system appends the link afterwards. You may reference "link below" if a CTA is given.
- Do not repeat the recent posts listed.
- The user rejected the posts listed under "Rejected"; do not make those mistakes again.

{PLATFORM_RULES}

Respond with ONLY JSON:
{"caption": "the post text (for a thread: the first post)", "threadParts": ["post 1", "post 2", "..."], "hashtags": "#one #two", "headline": "the post's point in 3-8 words, for the image"{SLIDES_SHAPE}}
threadParts is empty unless format is thread. hashtags may be empty. The headline is plain words, no hashtags or emoji, and claims nothing the caption does not.{SLIDES_RULE}`;

const SLIDES_SHAPE = `, "cover": {"kicker": "2-5 words naming the topic", "headline": "the promise of the carousel in 4-9 words", "body": "one short sentence or empty"}, "slides": [{"headline": "one point in 3-8 words", "body": "one or two sentences, under 160 characters"}], "end": {"headline": "what to do next, 3-7 words", "cta": "the site or a short action"}`;
const SLIDES_RULE = `
This is a carousel: write "slides" with {N} points that build one story (the problem, how the product handles it, the result), each from the facts given; never invent a step, number or feature.`;

const RULES = {
  twitter: `X RULES:
- Each post within the character budget given below, INCLUDING hashtags. Count carefully.
- Format "text": one post, one idea, ends on the point - no cliffhanger.
- Format "thread": 3-6 posts. The FIRST post must already deliver value on its own and end with a reason to keep reading. Each following post is one self-contained point. Last post lands the takeaway. Do not number posts.
- Hashtags: at most 1, and only if it is a real community tag. Usually none.`,
  linkedin: `LINKEDIN RULES:
- 600-1300 characters. Short paragraphs, one idea per line, blank lines between. No headline in caps.
- First line is the hook and must survive the "see more" cut (under 140 chars) - make it a specific claim or observation, not a question dump.
- End with one line that invites a reply or points to the link.
- 3-5 hashtags, specific to the industry, at the very end.
- At most 1-2 emoji, or none.`,
  instagram: `INSTAGRAM RULES:
- 400-1200 characters. First line hooks; then value; then a call to action.
- Line breaks between short paragraphs. Emoji welcome but purposeful.
- 5-10 hashtags mixing broad and niche, at the end.
- The image/video is generated from the visual concept given; the caption should match it.`,
};

/**
 * Writes the copy for an autopilot post. Platform-native, brand-grounded,
 * aware of what the account posted recently.
 */
// Chosen with `npm run velos:eval` (2026-10-04): with the same strict reviewer, Claude Sonnet's posts averaged 80
// against 73 for Gemini Flash, with no unsupported claims. The planners keep the cheaper AUTOPILOT_LLM_MODEL.
const WRITER_MODEL = process.env.AUTOPILOT_WRITER_MODEL || 'anthropic/claude-sonnet-5.5';

class PostWriter {
  constructor() {
    this.llm = new OpenRouterProvider({ model: WRITER_MODEL });
  }

  async write({ platform, format, brand = {}, idea, proofPoint = '', proofSource = '', visualConcept = '', cta = '', hasLink = false, recentCaptions = [], rejections = [], goal = 'reach', slideCount = 0, facts = [], revise = null }) {
    const spec = PlatformDefaults.getCaptionSettings(platform);
    const system = SYSTEM
      .replace(/\{PLATFORM\}/g, PlatformDefaults.get(platform).name)
      .replace('{PLATFORM_RULES}', RULES[platform] || RULES.instagram)
      .replace('{SLIDES_SHAPE}', slideCount ? SLIDES_SHAPE : '')
      .replace('{SLIDES_RULE}', slideCount ? SLIDES_RULE.replace('{N}', String(slideCount)) : '');

    const user = `## Company
${brand.companyName || ''} - ${brand.oneLiner || ''}
Audience: ${brand.targetAudience || 'n/a'}
Tone: ${brand.tone || 'professional'}
What they talk about: ${(brand.topicsAllowed || []).join(', ') || 'n/a'}
Things they can truthfully say: ${(brand.uniqueSellingPoints || []).join('; ') || 'n/a'}

## This post
Format: ${format}${platform === 'twitter' ? `\nCharacter budget per post: ${hasLink ? 280 - 4 - [...(cta || 'Learn more')].length - 23 : 280}` : ''}
Goal: ${goal}
Idea: ${idea}
Fact to use${proofPoint ? '' : ' (none - do not invent one)'}: ${proofPoint || '-'}${proofSource ? ` (from ${proofSource})` : ''}
${visualConcept ? `Visual that will accompany it: ${visualConcept}` : 'No media - text only.'}
${hasLink ? `After your text Velos adds the line "${cta || 'Learn more'}: <link>". Do not write a call to action, "link below" or a URL yourself; end on your point.` : 'No link on this post.'}

${facts.length ? `## Other facts from the site (supporting detail${slideCount ? ' and the slides' : ''}: anything you say about the product comes from these or the fact above)\n${facts.filter((f) => f !== proofPoint).slice(0, 15).map((f) => `- ${f}`).join('\n')}\n\n` : ''}## Recent posts on this account (do not repeat)
${recentCaptions.map((c) => `- ${c.slice(0, 160)}`).join('\n') || '(none)'}

## Rejected by the user (the reason, their note, and how the post began)
${rejections.slice(0, 10).map((r) => `- ${String(r.reason || 'other').replace('_', ' ')}${r.note ? `: "${r.note}"` : ''}${r.caption ? ` - "${r.caption.slice(0, 100)}"` : ''}`).join('\n') || '(none)'}

Write it.`;

    // A revision: the last draft and exactly what the review found. Everything else stays.
    const revision = revise ? `\n\n## Your last draft\n${revise.draft}\n\n## Fix exactly this, keep everything else\n${revise.problems.map((p) => `- ${p}`).join('\n')}\nRemove any claim listed as unsupported rather than rewording it.` : '';
    const out = await this.llm.chatJSON([{ role: 'system', content: system }, { role: 'user', content: user + revision }], { temperature: revise ? 0.3 : 0.7, fallback: null });
    if (!out || (!out.caption && !out.threadParts?.length)) throw new Error('Writer returned no copy');

    let hashtags = String(out.hashtags || '').split(/\s+/).filter((t) => /^#\w+$/.test(t)).slice(0, spec.hashtagLimit).join(' ');
    let threadParts = Array.isArray(out.threadParts) ? out.threadParts.map((p) => String(p).trim()).filter(Boolean) : [];
    // Hashtags belong in their own field; a caption that also ends with them would post them twice.
    const stripTags = (t) => String(t || '').replace(/(\n\s*)?(#[\p{L}\p{N}_]+\s*)+$/u, '').trim();
    // Velos adds the link itself; one the writer typed would appear twice.
    const stripUrls = (t) => (hasLink ? String(t).replace(/\s*https?:\/\/\S+/g, '').trim() : t);
    let caption = stripUrls(stripTags(out.caption || threadParts[0] || ''));
    threadParts = threadParts.map((t) => stripUrls(stripTags(t))).filter(Boolean);

    if (platform === 'twitter') {
      // 280, less the line Velos adds: the call to action, and the link X counts as 23 characters.
      const limit = hasLink ? 280 - 2 - [...(cta || 'Learn more')].length - 2 - 23 : 280;
      const clip = (t) => ([...t].length > limit ? `${[...t].slice(0, limit - 1).join('')}…` : t);
      if (format === 'thread' && threadParts.length < 2) threadParts = [caption];
      if (threadParts.length > 1) {
        threadParts = threadParts.slice(0, 6).map(clip);
        caption = threadParts[0];
        hashtags = '';
      } else {
        threadParts = [];
        const room = limit - (hashtags ? [...hashtags].length + 1 : 0);
        if ([...caption].length > room) caption = `${[...caption].slice(0, room - 1).join('')}…`;
      }
    } else {
      threadParts = [];
      const budget = spec.maxLength - (hashtags ? [...hashtags].length + 2 : 0) - 60; // room for the link line
      if ([...caption].length > budget) caption = `${[...caption].slice(0, budget - 1).join('')}…`;
    }
    const clean = (t, n) => String(t || '').replace(/[#*_]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    const headline = clean(out.headline, 90);
    const slides = slideCount
      ? (Array.isArray(out.slides) ? out.slides : []).map((x) => ({ headline: clean(x?.headline, 90), body: clean(x?.body, 200) })).filter((x) => x.headline).slice(0, slideCount)
      : [];
    const cover = slideCount ? { kicker: clean(out.cover?.kicker, 40), headline: clean(out.cover?.headline, 100) || headline, body: clean(out.cover?.body, 160) } : null;
    const end = slideCount ? { headline: clean(out.end?.headline, 70), cta: clean(out.end?.cta, 40) } : null;
    return { caption, hashtags, threadParts, headline, slides, cover, end };
  }
}

module.exports = PostWriter;
module.exports.WRITER_MODEL = WRITER_MODEL;
