const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotEvent = require('../models/autopilotEvent');
const ScheduledPost = require('../models/scheduledPost');
const Credits = require('../models/credits');
const TrustLadder = require('./TrustLadder');

/**
 * Watches every switched-on autopilot, every 15 minutes, for signs it should stop, and stops it with a reason the
 * user can read (an AutopilotEvent on the autopilot page, plus an email):
 *
 * - publish failures: FAILURES_TO_PAUSE posts failed to publish in a day → paused for PAUSE_HOURS
 * - falling scores: the last SCORE_WINDOW reviews average under SCORE_FLOOR while on autopilot → back to supervised
 * - spend spike: today's autopilot credits are SPIKE_FACTOR times the daily average of the last week (and at least
 *   SPIKE_MIN) → paused for PAUSE_HOURS
 *
 * A full approval queue needs no pause: the autopilot makes nothing more while it is full
 * (AutopilotService.assertPlatformBudget).
 */

const FAILURES_TO_PAUSE = 3;
const SCORE_WINDOW = 6;
const SCORE_FLOOR = 60;
const SPIKE_FACTOR = 2;
const SPIKE_MIN = 10;
const PAUSE_HOURS = 24;
const NAME = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X' };

const scopeOf = (config) => (config.autopilotId ? { autopilotId: config.autopilotId } : { userId: config.userId });

async function pause(config, reason, emailService) {
  const until = new Date(Date.now() + PAUSE_HOURS * 3600e3);
  // Only a config that is not already paused: one event and one email per pause.
  const res = await AutopilotConfig.updateOne(
    { _id: config._id, $or: [{ pausedUntil: null }, { pausedUntil: { $lte: new Date() } }] },
    { $set: { pausedUntil: until } },
  );
  if (!res.modifiedCount) return false;
  await AutopilotEvent.create({
    userId: config.userId,
    autopilotId: config.autopilotId || null,
    platform: config.platform,
    action: 'paused',
    reason: `${reason}. Paused until ${until.toUTCString()}; resume it any time from the autopilot page.`,
  });
  if (emailService) {
    const email = await emailService.getUserEmail(config.userId).catch(() => null);
    const app = process.env.FRONTEND_URL || 'https://www.velosapps.com';
    if (email) {
      emailService
        .sendNotificationEmail(email, 'Your autopilot paused itself', `${reason}. It is paused for ${PAUSE_HOURS} hours so nothing else goes wrong while you take a look.`, `${app}/autopilot`, 'Open autopilot')
        .catch(() => {});
    }
  }
  console.log(`🛑 [SUPERVISOR] ${config.userId} ${config.platform} paused: ${reason}`);
  return true;
}

/** The rules for one config. Returns what it did, for logs and tests. */
async function check(config, { emailService = null, now = new Date() } = {}) {
  const base = { ...scopeOf(config), platform: config.platform, source: 'autopilot' };
  const dayAgo = new Date(now.getTime() - 24 * 3600e3);

  const failed = await ScheduledPost.countDocuments({ ...base, status: 'failed', updatedAt: { $gte: dayAgo } });
  if (failed >= FAILURES_TO_PAUSE) {
    const paused = await pause(config, `${failed} ${NAME[config.platform] || config.platform} posts failed to publish in the last 24 hours`, emailService);
    return paused ? 'paused_failures' : null;
  }

  if (config.trust?.mode === 'autopilot') {
    const reviewed = await ScheduledPost.find({ ...base, 'review.score': { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(SCORE_WINDOW)
      .select('review.score')
      .lean();
    if (reviewed.length >= SCORE_WINDOW) {
      const avg = Math.round(reviewed.reduce((sum, p) => sum + p.review.score, 0) / reviewed.length);
      if (avg < SCORE_FLOOR) {
        await TrustLadder.demote(config, `Review scores fell: the last ${SCORE_WINDOW} posts averaged ${avg} (the floor is ${SCORE_FLOOR}), so every post waits for you again`);
        return 'demoted_scores';
      }
    }
  }

  const credits = await Credits.findOne({ userId: config.userId }).select('transactions').lean();
  if (credits) {
    const day = (t) => Math.floor(new Date(t.createdAt).getTime() / 86400e3);
    const today = Math.floor(now.getTime() / 86400e3);
    const spent = {};
    for (const t of credits.transactions || []) {
      if (t.referenceType !== 'autopilot') continue;
      const d = day(t);
      if (d < today - 7 || d > today) continue;
      spent[d] = (spent[d] || 0) - (t.amount || 0);
    }
    const todaySpend = spent[today] || 0;
    const past = Array.from({ length: 7 }, (_, i) => spent[today - 1 - i] || 0);
    const avg = past.reduce((a, b) => a + b, 0) / 7;
    if (todaySpend >= SPIKE_MIN && avg > 0 && todaySpend >= SPIKE_FACTOR * avg) {
      const paused = await pause(config, `Autopilot spent ${todaySpend} credits today, ${Math.round(todaySpend / avg)} times its daily average of ${avg.toFixed(1)}`, emailService);
      return paused ? 'paused_spend' : null;
    }
  }
  return null;
}

/** Every switched-on config. */
async function run() {
  const EmailService = require('./EmailService');
  const emailService = new EmailService();
  const configs = await AutopilotConfig.find({ enabled: true });
  const actions = [];
  for (const config of configs) {
    try {
      const action = await check(config, { emailService });
      if (action) actions.push({ configId: String(config._id), action });
    } catch (err) {
      console.error(`❌ [SUPERVISOR] ${config._id}:`, err.message);
    }
  }
  return actions;
}

module.exports = { run, check, FAILURES_TO_PAUSE, SCORE_FLOOR, SCORE_WINDOW, SPIKE_FACTOR, SPIKE_MIN };
