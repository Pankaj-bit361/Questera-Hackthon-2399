const AccountPause = require('../models/accountPause');

/**
 * When a platform blocks, rate-limits or flags an account, or its login stops working, Velos stops posting there:
 * scheduled posts wait, autopilot stops making posts for that platform, and the user gets one email saying why.
 * Posting through a block is how accounts get suspended.
 *
 * A block lifts by itself after BLOCK_HOURS; a broken login lifts when the user reconnects (the connect flows call
 * `resume`). The user can also resume by hand from the autopilot page.
 */

const BLOCK_HOURS = 24;
const RECONNECT_DAYS = 30;

const BLOCKED = [
  'request limit reached',
  'action is blocked',
  'rate limit',
  'too many requests',
  'spam',
  'temporarily blocked',
  'feedback_required',
];
const RECONNECT = [
  'access_denied',
  'revoked_access_token',
  'reconnect the account',
  'error validating access token',
  'session has been invalidated',
  'invalid oauth',
  'token expired',
];

/** 'blocked' | 'reconnect' | null for a publish or API error. */
function classify(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const status = error?.status || error?.statusCode || error?.response?.status;
  if (status === 429 || BLOCKED.some((s) => msg.includes(s))) return 'blocked';
  if (RECONNECT.some((s) => msg.includes(s))) return 'reconnect';
  return null;
}

/** The pause in force for this user and platform, or null. */
async function activePause(userId, platform, now = new Date()) {
  return AccountPause.findOne({ userId, platform, until: { $gt: now } }).lean();
}

/** Every platform paused for a user: { instagram: pause, ... }. */
async function pausesFor(userId, now = new Date()) {
  const rows = await AccountPause.find({ userId, until: { $gt: now } }).lean();
  return Object.fromEntries(rows.map((p) => [p.platform, p]));
}

/** Pause a platform for a user. Never shortens a pause already in force. Returns { pause, isNew }. */
async function pause({ userId, platform, kind, reason, hours }) {
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3600e3);
  const current = await activePause(userId, platform, now);
  if (current && current.until >= until) return { pause: current, isNew: false };
  const row = await AccountPause.findOneAndUpdate(
    { userId, platform },
    { $set: { kind, reason: String(reason || '').slice(0, 300), until, pausedAt: current ? current.pausedAt : now } },
    { upsert: true, new: true },
  ).lean();
  return { pause: row, isNew: !current };
}

/**
 * Pause the platform behind a failed publish or API call if the error calls for it. Returns the pause, or null when
 * the error is an ordinary failure. Emails the user when a new pause starts.
 */
async function pauseForError({ userId, platform, error, emailService }) {
  const kind = classify(error);
  if (!kind || !userId || !platform) return null;
  const hours = kind === 'blocked' ? BLOCK_HOURS : RECONNECT_DAYS * 24;
  const { pause: row, isNew } = await pause({ userId, platform, kind, reason: error?.message || error, hours });
  if (isNew && emailService?.sendAccountPausedEmail) {
    emailService
      .sendAccountPausedEmail(userId, { platform, kind, reason: row.reason, until: row.until })
      .catch((err) => console.error('❌ [ACCOUNT] Pause email failed:', err.message));
  }
  console.log(`⏸️ [ACCOUNT] ${userId} ${platform} paused (${kind}) until ${row.until.toISOString()}`);
  return row;
}

/**
 * End a pause. Reconnecting ends a 'reconnect' pause only: a new login does not lift a platform block, which ends
 * on its own or when the user resumes it by hand (`{ any: true }`).
 */
async function resume(userId, platform, { any = false } = {}) {
  const filter = { userId, platform };
  if (!any) filter.kind = 'reconnect';
  await AccountPause.deleteOne(filter);
}

module.exports = { classify, activePause, pausesFor, pause, pauseForError, resume, BLOCK_HOURS };
