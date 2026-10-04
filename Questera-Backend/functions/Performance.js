const ScheduledPost = require('../models/scheduledPost');
const AutopilotMemory = require('../models/autopilotMemory');
const AutopilotConfig = require('../models/autopilotConfig');
const { minutesOfDayInZone, isValidTimeZone } = require('./timeHelpers');

/**
 * What worked, per platform: how each theme, format and time of day did against the account's own average, from
 * the engagement the platforms report (EngagementSync). Saved on the brand memory (memory.stats[platform]) for the
 * planners, and written back into contentHistory so each post's numbers sit next to what it was.
 *
 * A post's result is its engagement rate - interactions over reach - where the platform reports reach, otherwise
 * its interactions. "lift" is a group's average over the account's average: 1.4 means 40% better than usual.
 * Groups with fewer than MIN_POSTS posts are left out; they say nothing yet.
 */

const WINDOW_DAYS = 90;
const MIN_POSTS = 2;

const slot = (minutes) => (minutes < 11 * 60 ? 'morning' : minutes < 15 * 60 ? 'midday' : minutes < 19 * 60 ? 'afternoon' : 'evening');

function resultOf(e) {
  const interactions = (e.likes || 0) + (e.comments || 0) + (e.shares || 0) + (e.saves || 0);
  const reach = e.reach || e.impressions || 0;
  return reach > 0 ? { value: interactions / reach, kind: 'rate' } : { value: interactions, kind: 'count' };
}

function groups(rows, key, overall) {
  const by = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!k) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r.value);
  }
  return [...by.entries()]
    .filter(([, v]) => v.length >= MIN_POSTS)
    .map(([k, v]) => ({ key: k, posts: v.length, lift: overall > 0 ? Math.round((v.reduce((a, b) => a + b, 0) / v.length / overall) * 100) / 100 : null }))
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
}

/** Stats for one brand memory and platform. */
async function statsFor(memory, platform, config = null) {
  const scope = memory.autopilotId ? { autopilotId: memory.autopilotId } : { userId: memory.userId };
  const posts = await ScheduledPost.find({
    ...scope,
    platform,
    source: 'autopilot',
    status: 'published',
    publishedAt: { $gte: new Date(Date.now() - WINDOW_DAYS * 86400e3) },
    'engagement.lastUpdated': { $ne: null },
  }).select('postId postType theme publishedAt engagement').lean();
  if (!posts.length) return null;

  const tz = isValidTimeZone(config?.quietHours?.timezone) ? config.quietHours.timezone : 'UTC';
  const history = new Map((memory.contentHistory || []).map((h) => [h.postId, h]));
  // Rates and counts do not mix; use whichever most posts have.
  const results = posts.map((p) => ({ p, r: resultOf(p.engagement || {}) }));
  const kind = results.filter((x) => x.r.kind === 'rate').length >= results.length / 2 ? 'rate' : 'count';
  const rows = results
    .filter((x) => x.r.kind === kind)
    .map(({ p, r }) => ({
      postId: p.postId,
      value: r.value,
      theme: p.theme || history.get(p.postId)?.theme || null,
      format: p.postType,
      time: slot(minutesOfDayInZone(p.publishedAt, tz)),
    }));
  if (!rows.length) return null;
  const overall = rows.reduce((a, b) => a + b.value, 0) / rows.length;
  return {
    updatedAt: new Date(),
    posts: rows.length,
    measure: kind === 'rate' ? 'engagement rate (interactions / reach)' : 'interactions',
    average: Math.round(overall * (kind === 'rate' ? 10000 : 10)) / (kind === 'rate' ? 100 : 10), // % or count
    byTheme: groups(rows, 'theme', overall),
    byFormat: groups(rows, 'format', overall),
    byTime: groups(rows, 'time', overall),
    best: rows.sort((a, b) => b.value - a.value).slice(0, 3).map((r) => r.postId),
  };
}

/** Recompute stats for every brand memory of a user, and write each post's numbers into contentHistory. */
async function refreshForUser(userId) {
  const memories = await AutopilotMemory.find({ userId });
  for (const memory of memories) {
    const stats = { ...(memory.stats || {}) };
    for (const platform of ['instagram', 'linkedin', 'twitter']) {
      const config = await AutopilotConfig.findOne({ ...(memory.autopilotId ? { autopilotId: memory.autopilotId } : { userId }), platform }).lean();
      const s = await statsFor(memory, platform, config);
      if (s) stats[platform] = s;
    }
    memory.stats = stats;
    memory.markModified('stats');

    const ids = (memory.contentHistory || []).map((h) => h.postId).filter(Boolean);
    if (ids.length) {
      const published = await ScheduledPost.find({ postId: { $in: ids }, 'engagement.lastUpdated': { $ne: null } }).select('postId engagement').lean();
      const byId = new Map(published.map((p) => [p.postId, p.engagement]));
      for (const h of memory.contentHistory) {
        const e = byId.get(h.postId);
        if (!e) continue;
        const reach = e.reach || e.impressions || 0;
        h.performance = {
          likes: e.likes || 0,
          comments: e.comments || 0,
          saves: e.saves || 0,
          reach,
          engagementRate: reach ? Math.round((((e.likes || 0) + (e.comments || 0) + (e.shares || 0) + (e.saves || 0)) / reach) * 10000) / 100 : 0,
        };
      }
    }
    await memory.save();
  }
}

/**
 * The stats in words, for a planner. Includes the exploration rule: some posts must try something the numbers do
 * not favour yet, or the account only ever repeats its first winners.
 */
function describe(stats, platform) {
  const s = stats?.[platform];
  if (!s || s.posts < 4) {
    return `Not enough results on ${platform} yet to learn from (${s?.posts || 0} measured posts). Vary themes, formats and times on purpose so there is something to learn.`;
  }
  const fmt = (list) => list.slice(0, 4).map((g) => `${g.key} ${g.lift}x (${g.posts} posts)`).join(', ') || 'no clear pattern yet';
  return [
    `From ${s.posts} measured ${platform} posts (average ${s.measure === 'interactions' ? `${s.average} interactions` : `${s.average}% engagement`}); 1.0x is the account's average:`,
    `- Themes: ${fmt(s.byTheme)}`,
    `- Formats: ${fmt(s.byFormat)}`,
    `- Time of day: ${fmt(s.byTime)}`,
    'Lean on what is above 1.0x. But at least one post in five must try a theme, format or time that is NOT in the lists above, to keep learning.',
  ].join('\n');
}

module.exports = { statsFor, refreshForUser, describe, resultOf, MIN_POSTS };
