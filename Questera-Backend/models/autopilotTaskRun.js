const mongoose = require('mongoose');

/**
 * One firing of an autopilot task.
 *
 * The task document is the CONFIG; this is the HISTORY. Splitting them is what
 * makes a claim safe to retry: the task's `status` field is the lock, and this
 * ledger row is how a retry knows whether the work it is about to do has
 * already been done.
 *
 * `slot` is the scheduled instant the claim was for - never wall-clock now. A
 * retry after a crash reuses the same slot and therefore finds the same row,
 * so it can never mistake unfinished work for a fresh firing. The unique index
 * on {taskId, slot} enforces that.
 */
const STATUSES = ['started', 'created', 'published', 'failed', 'zombie',
  'skipped_mingap', 'skipped_budget', 'skipped_quiet', 'skipped_disabled', 'skipped_paused'];

const STEPS = ['claim', 'plan', 'media', 'copy', 'save', 'done'];

const autopilotTaskRunSchema = new mongoose.Schema({
  taskId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  platform: { type: String, required: true },

  // The scheduled instant this run is for. Idempotency key.
  slot: { type: Date, required: true },

  step: { type: String, enum: STEPS, default: 'claim' },
  status: { type: String, enum: STATUSES, default: 'started' },

  startedAt: { type: Date, default: () => new Date() },
  finishedAt: { type: Date, default: null },
  heartbeatAt: { type: Date, default: () => new Date() },

  detail: { type: String, default: '' },

  // What the run produced
  postId: { type: String, default: null },
  postType: { type: String, default: null },
  imageUrl: { type: String, default: null },
  videoUrl: { type: String, default: null },
  proofPointUsed: { type: String, default: null },

  // What it cost
  creditsSpent: { type: Number, default: 0 },
}, { timestamps: true });

// One row per task per slot - this is the idempotency guarantee.
autopilotTaskRunSchema.index({ taskId: 1, slot: 1 }, { unique: true });
// History for one user, newest first.
autopilotTaskRunSchema.index({ userId: 1, startedAt: -1 });

module.exports = mongoose.model('AutopilotTaskRun', autopilotTaskRunSchema);
module.exports.STATUSES = STATUSES;
module.exports.STEPS = STEPS;
