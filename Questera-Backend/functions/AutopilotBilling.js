const CreditsController = require('./Credits');

/**
 * What the autopilot's media costs, and a per-day ceiling on it.
 *
 * Images and videos the autopilot makes are charged to the user's credits at the same rates as making them by hand.
 * Before generating, `assertCanSpend` checks the balance and the day's autopilot spend against the plan's daily cap,
 * so a runaway schedule cannot drain an account in a day; `charge` runs only after the media exists, so a failed
 * generation costs nothing. Both errors mention "credit", which TaskRunner treats as an infrastructure failure: the
 * task is not switched off for it.
 */

const COSTS = {
  image: 1, // per image
  video: 10, // a generated clip
  product_video: 10, // a Studio product video
};

/** Autopilot credits per UTC day, by plan. AUTOPILOT_DAILY_CREDIT_CAP overrides every plan. */
const DAILY_CAP = { free: 5, growth: 15, pro: 30, business: 120 };

const credits = new CreditsController();

const startOfDay = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

function dailyCap(plan) {
  const env = Number(process.env.AUTOPILOT_DAILY_CREDIT_CAP);
  if (Number.isFinite(env) && env > 0) return env;
  return DAILY_CAP[plan] ?? DAILY_CAP.free;
}

/** { balance, plan, cap, spentToday } for a user. */
async function status(userId, now = new Date()) {
  const doc = await credits.getOrCreateCredits(userId);
  const since = startOfDay(now);
  const spentToday = (doc.transactions || [])
    .filter((t) => t.referenceType === 'autopilot' && new Date(t.createdAt) >= since)
    .reduce((sum, t) => sum - (t.amount || 0), 0);
  return { balance: doc.balance, plan: doc.plan || 'free', cap: dailyCap(doc.plan), spentToday };
}

/** Throws when the user cannot afford `amount` now, or it would pass today's autopilot cap. */
async function assertCanSpend(userId, amount) {
  const s = await status(userId);
  if (s.balance < amount) {
    const err = new Error(`Not enough credits: this post needs ${amount}, the balance is ${s.balance}`);
    err.code = 'credits';
    throw err;
  }
  if (s.spentToday + amount > s.cap) {
    const err = new Error(`Daily autopilot credit cap reached: ${s.spentToday} of ${s.cap} used today`);
    err.code = 'credits';
    throw err;
  }
  return s;
}

/** Charge media that now exists. Never throws on a short balance (the work is done); logs it instead. */
async function charge(userId, amount, reference, description) {
  if (!userId || !amount) return null;
  const result = await credits.deductCredits(userId, amount, reference, description, 'autopilot');
  if (!result.success) console.warn(`⚠️ [BILLING] ${userId} could not be charged ${amount} for ${reference}: ${result.error}`);
  return result;
}

module.exports = { COSTS, DAILY_CAP, dailyCap, status, assertCanSpend, charge };
