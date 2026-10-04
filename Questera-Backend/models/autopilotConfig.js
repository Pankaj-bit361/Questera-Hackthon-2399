const mongoose = require('mongoose');
const { minutesOfDayInZone, nextOccurrenceOf, isValidTimeZone } = require('../functions/timeHelpers');

const autopilotConfigSchema = new mongoose.Schema({
  autopilotId: { type: String, default: null },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  // Legacy. Autopilots used to live inside a chat thread; they are now
  // standalone, one per platform per user. Kept only so old rows are readable
  // and so a run can optionally be attributed back to a chat.
  chatId: {
    type: String,
    default: null,
    index: true,
  },
  platform: {
    type: String,
    enum: ['instagram', 'twitter', 'linkedin', 'tiktok'],
    default: 'instagram',
  },
  // X tolerates more frequency than the other platforms, so the shared
  // maxFeedPostsPerDay cap of 5 is raised for it in SocialGrowthAgent's
  // per-platform rules rather than here.

  enabled: {
    type: Boolean,
    default: false,
  },

  // Posting limits
  limits: {
    maxFeedPostsPerDay: { type: Number, default: 1, min: 0, max: 5 },
    maxStoriesPerDay: { type: Number, default: 2, min: 0, max: 10 },
    maxRepliesPerHour: { type: Number, default: 5, min: 0, max: 20 },
  },

  // What autopilot is allowed to do
  permissions: {
    autoPost: { type: Boolean, default: true },
    autoStory: { type: Boolean, default: false },
    autoReplyComments: { type: Boolean, default: false },
    autoDMs: { type: Boolean, default: false }, // Always false for safety
    // "Always ask": every post waits for the user, even once autopilot is earned (see `trust`).
    requireApproval: { type: Boolean, default: false },
    // Review-agent score (0-100) a post needs to publish without a human once autopilot is earned.
    autoPublishMinScore: { type: Number, default: 75, min: 0, max: 100 },
  },

  // The trust ladder (functions/TrustLadder.js). 'supervised': every post waits for the user's approval.
  // 'autopilot': a post that passes the rule check and the review publishes on its own after a hold the user can
  // stop. Earned with PROMOTE_AFTER clean approvals in a row; one rejection returns it to supervised.
  // `mode: null` is a config from before the ladder; its first use decides from its record (TrustLadder.ensure).
  trust: {
    mode: { type: String, enum: ['supervised', 'autopilot', null], default: null },
    approvalStreak: { type: Number, default: 0 },
    holdHours: { type: Number, default: 12, min: 0, max: 72 },
    promotedAt: { type: Date, default: null },
    demotedAt: { type: Date, default: null },
    demotedReason: { type: String, default: null },
  },

  // Quiet hours - no posting during this time
  quietHours: {
    enabled: { type: Boolean, default: true },
    start: { type: String, default: '22:00' }, // 10 PM
    end: { type: String, default: '07:00' },   // 7 AM
    timezone: { type: String, default: 'Asia/Kolkata' },
  },

  // Content preferences
  contentPreferences: {
    allowedThemes: {
      type: [String],
      default: ['educational', 'behind_the_scenes', 'promotional', 'engagement', 'trending'],
    },
    blockedThemes: {
      type: [String],
      default: [],
    },
    preferredFormats: {
      type: [String],
      default: ['image', 'carousel'],
    },
    tone: {
      type: String,
      enum: ['professional', 'casual', 'friendly', 'bold', 'inspirational'],
      default: 'friendly',
    },
  },

  // Pause functionality
  pausedUntil: {
    type: Date,
    default: null,
  },

  // Which connected account to publish through. Null means "the user's default
  // account on this platform", which is the common case.
  socialAccountId: {
    type: String,
    default: null,
  },

  // When the daily planning run should happen, as wall-clock time in
  // quietHours.timezone.
  dailyRunTime: {
    type: String,
    default: '08:00',
  },
  // Persisted next run. Replaces the old in-memory "hour === 8" day guard,
  // which reset on every restart and had no lock across instances.
  nextRunAt: {
    type: Date,
    default: null,
    index: true,
  },

  // Last run info
  // When the platform agent last reviewed this autopilot's tasks on its own.
  lastReviewAt: { type: Date, default: null },
  lastRunAt: {
    type: Date,
    default: null,
  },
  lastRunResult: {
    type: String,
    enum: ['success', 'partial', 'failed', 'skipped'],
    default: null,
  },
  lastRunSummary: {
    type: String,
    default: null,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// One autopilot per platform per user.
//
// An autopilot is a standing thing that runs on a schedule - it is not part of
// a conversation. Keying it on chatId tied its lifetime to a chat thread and
// meant the same brand needed re-configuring in every new chat. It is now
// {userId, platform}: three autopilots per user, sharing one brand profile.
//
// Which social account each one publishes through is `socialAccountId`.
//
// NOTE: mongoose creates new indexes but never drops old ones, so the previous
// unique index must be removed explicitly.
// See scripts/migrateAutopilotStandalone.js
autopilotConfigSchema.index({ userId: 1, platform: 1 });
// One config per platform per autopilot.
autopilotConfigSchema.index({ autopilotId: 1, platform: 1 }, { unique: true, partialFilterExpression: { autopilotId: { $type: 'string' } } });

// Update timestamp on save
autopilotConfigSchema.pre('save', function () {
  this.updatedAt = new Date();
});

// Check if autopilot is currently active (enabled and not paused)
autopilotConfigSchema.methods.isActive = function () {
  if (!this.enabled) return false;
  if (this.pausedUntil && new Date() < this.pausedUntil) return false;
  return true;
};

// The IANA zone this config's wall-clock times are expressed in.
autopilotConfigSchema.methods.timezone = function () {
  const tz = this.quietHours?.timezone;
  return isValidTimeZone(tz) ? tz : 'UTC';
};

// Check if current time is within quiet hours.
// Evaluated in the config's own timezone, not the server's.
autopilotConfigSchema.methods.isQuietHours = function (now = new Date()) {
  if (!this.quietHours?.enabled) return false;

  const currentTime = minutesOfDayInZone(now, this.timezone());

  const [startH, startM] = this.quietHours.start.split(':').map(Number);
  const [endH, endM] = this.quietHours.end.split(':').map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }
  return currentTime >= startTime && currentTime < endTime;
};

// Advance nextRunAt to the next dailyRunTime in this config's timezone.
autopilotConfigSchema.methods.scheduleNextRun = function (from = new Date()) {
  this.nextRunAt = nextOccurrenceOf(this.dailyRunTime || '08:00', this.timezone(), from);
  return this.nextRunAt;
};

/**
 * Configs whose daily run is due.
 * A null nextRunAt means "never scheduled" - pick it up so pre-existing
 * configs get a nextRunAt assigned on the first tick after deploy.
 */
autopilotConfigSchema.statics.findDueConfigs = function (now = new Date()) {
  return this.find({
    enabled: true,
    $and: [
      { $or: [{ pausedUntil: null }, { pausedUntil: { $lte: now } }] },
      { $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }] },
    ],
  }).sort({ nextRunAt: 1 });
};

module.exports = mongoose.model('AutopilotConfig', autopilotConfigSchema);

