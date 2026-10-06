const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { nextOccurrenceOf, isValidTimeZone } = require('../functions/timeHelpers');

/**
 * A recurring content job.
 *
 * An autopilot is not "post twice a day" - it is a small set of standing jobs,
 * each with its own subject, format and cadence. The agent proposes these from
 * the company's website; the user keeps, edits or drops them.
 *
 * e.g. "Customer proof point" - image - weekdays at 09:00
 *      "Industry commentary"  - text  - twice daily
 *      "Product demo"         - video - Mondays
 */
const autopilotTaskSchema = new mongoose.Schema({
  taskId: {
    type: String,
    unique: true,
    default: () => 'task-' + uuidv4(),
  },
  autopilotId: { type: String, default: null, index: true },
  // Product link this task's posts point to (a page on the company site) and
  // the call to action wording. Empty = no link.
  linkUrl: { type: String, default: '' },
  cta: { type: String, default: '' },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['instagram', 'linkedin', 'twitter'],
    required: true,
    index: true,
  },

  // 'beat': one recurring post on one angle (the agent proposes these). 'daily_plan': the platform's daily plan,
  // one per autopilot and platform, kept in step with its AutopilotConfig (TaskRunner.syncDailyPlan) - the planner
  // decides that day's posts. Both run on this one engine.
  kind: { type: String, enum: ['beat', 'daily_plan'], default: 'beat', index: true },

  // What this task posts
  name: { type: String, required: true },
  description: { type: String, default: '' },
  // The recurring angle - what every run of this task should be about.
  angle: { type: String, default: '' },

  format: {
    type: String,
    enum: ['text', 'image', 'multi_image', 'video', 'thread'],
    default: 'image',
  },
  theme: { type: String, default: '' },
  hookStyle: { type: String, default: '' },
  goal: { type: String, default: '' },

  // How often it runs.
  schedule: {
    // Runs per day on an active day. 1, 2, 3...
    timesPerDay: { type: Number, default: 1, min: 1, max: 6 },
    // Wall-clock times, one per run. Length should match timesPerDay.
    times: { type: [String], default: ['09:00'] },
    // 0=Sunday. Empty means every day.
    daysOfWeek: { type: [Number], default: [1, 2, 3, 4, 5] },
    timezone: { type: String, default: 'Asia/Kolkata' },
  },

  enabled: { type: Boolean, default: true },

  /**
   * `idle` | `running` - this field IS the claim.
   *
   * A due task is taken with one atomic findOneAndUpdate from idle to running.
   * Only one worker can win that race, so there is no separate lock document
   * that could drift out of sync with this one.
   */
  status: { type: String, enum: ['idle', 'running'], default: 'idle' },

  // Precomputed. This, not a schedule evaluated at query time, is what the
  // due-list query indexes on.
  nextRunAt: { type: Date, default: null, index: true },

  /**
   * Fixed per task, added to every firing time.
   *
   * Left alone, every task anyone creates wants to fire at exactly 09:00:00
   * and the whole platform takes its daily load in one spike. Derived once
   * from the taskId so a task keeps its slot instead of wandering.
   */
  jitterSeconds: { type: Number, default: 0 },

  // Set on every successful claim, before the min-gap check reads it.
  // Guards against a double-fire across a DST boundary.
  lastFiredAt: { type: Date, default: null },

  // Touched while running; a sweep reclaims rows whose heartbeat went stale.
  heartbeatAt: { type: Date, default: null },

  /**
   * Bumped on every user edit to the schedule or content of this task.
   *
   * A run's completion write is conditioned on this still matching what it was
   * at claim time - so if the user retimed the task mid-run, the run does not
   * clobber their change with a nextRunAt computed from the old settings.
   */
  configVersion: { type: Number, default: 0 },

  // Hard ceiling per day for this task, checked before any expensive work.
  dailyRunCap: { type: Number, default: 4 },

  /**
   * Set when a run ended ambiguously rather than cleanly - generation produced
   * nothing usable, or the account went away mid-run. Deliberately separate
   * from consecutiveFailures: it does not auto-disable and does not clear
   * itself. A task can be healthy and still sit here until someone looks.
   */
  needsReview: { type: Boolean, default: false },
  needsReviewReason: { type: String, default: '' },

  /**
   * Reset to 0 by any success. Counts only genuine content failures - an
   * infrastructure error (no credits, provider down) is recorded but must not
   * increment this, or one provider outage disables every task at once.
   */
  consecutiveFailures: { type: Number, default: 0 },

  runCount: { type: Number, default: 0 },
  postsCreated: { type: Number, default: 0 },

  lastRunAt: { type: Date, default: null },
  lastRunResult: { type: String, enum: ['success', 'failed', 'skipped', null], default: null },
  lastRunSummary: { type: String, default: '' },

  // Where the task came from
  source: { type: String, enum: ['agent', 'manual'], default: 'agent' },
}, { timestamps: true });

/** Consecutive content failures before a task switches itself off. */
autopilotTaskSchema.statics.MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Backoff after a failure, in minutes. A task failing on the same error keeps
 * its normal cadence otherwise and burns credits on it all day.
 * Resets to the front of the list after any success.
 */
autopilotTaskSchema.statics.BACKOFF_MINUTES = [5, 15, 60, 240, 720];

autopilotTaskSchema.index({ userId: 1, platform: 1 });
// The tick's only query: everything due right now, across all users.
autopilotTaskSchema.index({ nextRunAt: 1, enabled: 1, status: 1 });

autopilotTaskSchema.methods.timezone = function () {
  const tz = this.schedule?.timezone;
  return isValidTimeZone(tz) ? tz : 'UTC';
};

/**
 * Next run, from the soonest of this task's configured times that falls on an
 * active weekday. Looks ahead up to a week so a Mondays-only task schedules
 * correctly on a Friday.
 */
autopilotTaskSchema.methods.scheduleNextRun = function (from = new Date()) {
  const tz = this.timezone();
  const times = this.schedule?.times?.length ? this.schedule.times : ['09:00'];
  const days = this.schedule?.daysOfWeek?.length ? this.schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

  // Candidate instants for every configured time, then keep the earliest that
  // lands on an allowed weekday.
  let best = null;
  for (const t of times) {
    let candidate = nextOccurrenceOf(t, tz, from);
    // Walk forward until the weekday is allowed (at most 7 days).
    for (let i = 0; i < 7; i++) {
      const weekday = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
          .format(candidate)
          .replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, (m) =>
            ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[m])
          )
      );
      if (days.includes(weekday)) break;
      candidate = nextOccurrenceOf(t, tz, new Date(candidate.getTime() + 60 * 1000));
    }
    if (!best || candidate < best) best = candidate;
  }

  // Spread the load off the exact top of the hour.
  this.nextRunAt = best ? new Date(best.getTime() + (this.jitterSeconds || 0) * 1000) : null;
  return this.nextRunAt;
};

/**
 * Tasks due to run now.
 * A null nextRunAt means never scheduled - pick it up so it gets one.
 */
autopilotTaskSchema.statics.findDueTasks = function (now = new Date()) {
  return this.find({
    enabled: true,
    status: 'idle',
    $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }],
  }).sort({ nextRunAt: 1 });
};

/**
 * Stable per-task jitter, so a task keeps the same offset run after run.
 */
autopilotTaskSchema.methods.assignJitter = function (maxSeconds = 300) {
  let h = 0;
  for (const ch of this.taskId || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  this.jitterSeconds = h % maxSeconds;
  return this.jitterSeconds;
};

module.exports = mongoose.model('AutopilotTask', autopilotTaskSchema);
