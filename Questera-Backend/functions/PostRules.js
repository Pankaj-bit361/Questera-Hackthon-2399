const { PlatformDefaults } = require('../agent/PlatformDefaults');

/**
 * Free checks a post must pass before the review model looks at it: length, hashtags, words we never publish,
 * placeholders, the link, and repeating a recent post. Any failure holds the post for the user whatever the review
 * score (TrustLadder.decide), and the reasons are shown with it.
 */

// Hype and filler the writer is told not to use; a post containing one is never published unattended.
const BANNED = [
  /\bdominat(e|es|ing)\b/i,
  /\bskyrocket/i,
  /\brevolutioni[sz]e/i,
  /\bgame[- ]?changer/i,
  /\bunlock (the|your) (full )?(power|potential)/i,
  /\bunleash/i,
  /\bnext[- ]level\b/i,
  /\bin today's (fast[- ]paced|digital) world\b/i,
  /\bguarantee[ds]?\b/i,
  /\b10x\b/i,
  /\bworld[- ]class\b/i,
  /\bcutting[- ]edge\b/i,
];
const PLACEHOLDER = /\[(company|brand|name|product|link|url|insert[^\]]*)\]|\{\{|\}\}|lorem ipsum|\bTODO\b|<insert/i;

// Instagram allows 30 hashtags; more than this reads as spam.
const HASHTAG_CAP = { instagram: 10 };

const words = (text) => String(text || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[#@][\w]+/g, ' ').match(/[a-z0-9']+/g) || [];

/** Share of three-word sequences two texts have in common (0-1). */
function overlap(a, b) {
  const grams = (t) => {
    const w = words(t);
    const out = new Set();
    for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size < 4 || B.size < 4) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / Math.min(A.size, B.size);
}

/**
 * Check a post. `post` = { postType, caption, hashtags, threadParts, linkUrl }; `recentCaptions` = this platform's
 * recent posts. Returns { failed, issues }.
 */
function check({ platform = 'instagram', post, recentCaptions = [] }) {
  const spec = PlatformDefaults.getCaptionSettings(platform);
  const issues = [];
  const caption = String(post.caption || '');
  const hashtags = String(post.hashtags || '');
  const parts = post.threadParts?.length > 1 ? post.threadParts : null;
  const full = [caption, hashtags].filter(Boolean).join('\n\n');
  const text = parts ? parts.join('\n') : full;

  if (post.postType !== 'story' && !text.trim()) issues.push('The post has no text');

  // X counts every link as 23 characters, whatever its length; the others count it as written.
  const count = (t) => [...(platform === 'twitter' ? String(t).replace(/https?:\/\/\S+/g, 'x'.repeat(23)) : String(t))].length;
  if (parts) {
    parts.forEach((p, i) => {
      if (count(p) > spec.maxLength) issues.push(`Part ${i + 1} of the thread is ${count(p)} characters (limit ${spec.maxLength})`);
    });
  } else if (count(full) > spec.maxLength) {
    issues.push(`${count(full)} characters is over ${platform}'s ${spec.maxLength}`);
  }

  const tags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
  const tagCap = Math.min(spec.hashtagLimit, HASHTAG_CAP[platform] ?? spec.hashtagLimit);
  if (tags > tagCap) issues.push(`${tags} hashtags (at most ${tagCap} on ${platform})`);

  for (const re of BANNED) {
    const m = text.match(re);
    if (m) issues.push(`Uses "${m[0]}", which we never publish`);
  }
  const ph = text.match(PLACEHOLDER);
  if (ph) issues.push(`Contains a placeholder: "${ph[0]}"`);

  // Instagram captions cannot carry a clickable link, so the link is only checked where it works.
  if (post.linkUrl && platform !== 'instagram' && !text.includes(post.linkUrl)) issues.push('The link is missing from the post');

  for (const prev of recentCaptions) {
    const o = overlap(text, prev);
    if (o >= 0.5) {
      issues.push(`Repeats a recent post (${Math.round(o * 100)}% the same wording)`);
      break;
    }
  }

  return { failed: issues.length > 0, issues };
}

module.exports = { check, overlap, BANNED };
