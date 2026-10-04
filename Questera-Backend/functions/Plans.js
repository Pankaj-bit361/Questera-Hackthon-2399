/**
 * The plans proposed in the rebuild plan (sold by what the autopilot does, not by credits), enforced only when
 * VELOS_PLANS=v2. Until then every account keeps today's behaviour: these functions allow everything.
 *
 * Prices are not here: they live in Razorpay, and the new plans need creating there before launch. Today's plan keys
 * map onto the new ones: free -> Free, growth -> Growth, pro -> Pro, business -> Agency.
 */
const Credits = require('../models/credits');

const PLANS = {
  free: { name: 'Free', brands: 1, platforms: 1, postsPerDay: 1, videosPerMonth: 1, autopilot: false },
  growth: { name: 'Growth', brands: 1, platforms: 2, postsPerDay: 1, videosPerMonth: 4, autopilot: true },
  pro: { name: 'Pro', brands: 1, platforms: 3, postsPerDay: 2, videosPerMonth: 12, autopilot: true },
  business: { name: 'Agency', brands: 5, platforms: 3, postsPerDay: 2, videosPerMonth: 40, autopilot: true },
};

const enabled = () => process.env.VELOS_PLANS === 'v2';

async function planFor(userId) {
  const credits = await Credits.findOne({ userId }).select('plan subscriptionStatus').lean();
  const key = credits?.subscriptionStatus === 'canceled' ? 'free' : credits?.plan || 'free';
  return { key, ...(PLANS[key] || PLANS.free) };
}

const limitError = (message) => Object.assign(new Error(message), { statusCode: 402, skip: 'skipped_budget', planLimit: true });

/** May this user switch autopilot on (earned on the trust ladder)? Free plans stay supervised. */
async function allowsAutopilot(userId) {
  if (!enabled()) return true;
  return (await planFor(userId)).autopilot;
}

/** Throws when another brand (autopilot) would pass the plan. */
async function assertBrands(userId, current) {
  if (!enabled()) return;
  const plan = await planFor(userId);
  if (current >= plan.brands) throw limitError(`The ${plan.name} plan includes ${plan.brands} brand${plan.brands > 1 ? 's' : ''}. Upgrade to add another.`);
}

/** Throws when switching on another platform would pass the plan. */
async function assertPlatforms(userId, enabledCount) {
  if (!enabled()) return;
  const plan = await planFor(userId);
  if (enabledCount >= plan.platforms) throw limitError(`The ${plan.name} plan includes ${plan.platforms} platform${plan.platforms > 1 ? 's' : ''}. Upgrade to post on more.`);
}

/** The plan's posts a day per platform, or Infinity without v2 plans. */
async function postsPerDay(userId) {
  if (!enabled()) return Infinity;
  return (await planFor(userId)).postsPerDay;
}

/** Throws when this month's product videos are used up. */
async function assertVideo(userId) {
  if (!enabled()) return;
  const plan = await planFor(userId);
  const ScheduledPost = require('../models/scheduledPost');
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const used = await ScheduledPost.countDocuments({ userId, source: 'autopilot', postType: { $in: ['reel', 'video'] }, createdAt: { $gte: start } });
  if (used >= plan.videosPerMonth) throw limitError(`This month's ${plan.videosPerMonth} product video${plan.videosPerMonth > 1 ? 's are' : ' is'} used (${plan.name} plan)`);
}

module.exports = { PLANS, enabled, planFor, allowsAutopilot, assertBrands, assertPlatforms, postsPerDay, assertVideo };
