const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const scheduledPostSchema = new mongoose.Schema({
  postId: {
    type: String,
    unique: true,
    default: () => 'post-' + uuidv4(),
  },
  // Set on posts an autopilot task produced, so its queue can be filtered.
  autopilotId: { type: String, default: null, index: true },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  // Content
  imageUrl: {
    type: String,
    required: false, // Not required for video posts
  },
  imageUrls: [{
    type: String, // For carousel posts
  }],
  videoUrl: {
    type: String, // For video/reel posts
  },
  videoChatId: {
    type: String, // Reference to video chat
  },
  // The Studio job that made this video (autopilot product videos), so the post can link back to it.
  studioJobId: {
    type: String,
    default: null,
  },
  caption: {
    type: String,
    default: '',
  },
  hashtags: {
    type: String,
    default: '',
  },
  postType: {
    type: String,
    // 'text'/'multi_image' are LinkedIn and X formats; 'story'/'reel' are
    // Instagram-only; 'thread' is X-only.
    enum: ['image', 'carousel', 'video', 'reel', 'story', 'text', 'multi_image', 'thread'],
    default: 'image',
  },
  // X/Twitter threads: each entry becomes one post, chained as replies.
  // threadParts[0] is the opening post; `caption` mirrors it so existing
  // list/calendar views that read `caption` still show something sensible.
  threadParts: [{
    type: String,
  }],
  // Buffer-like features
  music: {
    type: String,
    default: '',
  },
  tagProducts: {
    type: String,
    default: '',
  },
  firstComment: {
    type: String,
    default: '',
  },
  // Campaign reference
  campaignId: {
    type: String,
    index: true,
  },
  // Platform & Account
  platform: {
    type: String,
    enum: ['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin'],
    default: 'instagram',
  },
  accountId: {
    type: String, // For multi-account support
  },
  // Scheduling
  scheduledAt: {
    type: Date,
    required: true,
    index: true,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  // Recurring/Frequency settings
  isRecurring: {
    type: Boolean,
    default: false,
  },
  frequency: {
    type: String,
    enum: ['once', 'daily', 'weekly', 'custom'],
    default: 'once',
  },
  frequencyDays: [{
    type: Number, // 0=Sunday, 1=Monday, etc.
    min: 0,
    max: 6,
  }],
  frequencyTime: {
    type: String, // HH:MM format
  },
  repeatUntil: {
    type: Date,
  },
  // Status
  status: {
    type: String,
    // 'pending_approval' is held out of findDuePosts() until a human approves it.
    // 'publishing' is the claim: one worker moved it there atomically and is publishing it now (Scheduler.js).
    enum: ['pending_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'],
    default: 'scheduled',
    index: true,
  },
  // What created this post - lets the approval queue and analytics tell
  // autopilot output apart from something the user scheduled by hand.
  source: {
    type: String,
    enum: ['manual', 'autopilot', 'campaign', 'agent', 'live'],
    default: 'manual',
    index: true,
  },
  // What the autopilot meant the post to be, so results can be grouped by it (functions/Performance.js).
  theme: { type: String, default: null },
  hookStyle: { type: String, default: null },
  // When a worker claimed it for publishing; a claim this old means the worker died mid-publish.
  claimedAt: {
    type: Date,
  },
  // Publishing results
  publishedAt: {
    type: Date,
  },
  publishedMediaId: {
    type: String, // ID from Instagram/platform
  },
  publishError: {
    type: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  // Link to content job (if from AI generation)
  contentJobId: {
    type: String,
  },
  // Original chat context
  imageChatId: {
    type: String,
  },
  // Engagement tracking (updated after posting)
  // The review agent's verdict before publishing. Posts scoring at or above
  // the autopilot's threshold are scheduled straight away; the rest wait.
  review: {
    score: { type: Number, default: null },
    verdict: { type: String, default: '' },
    issues: [String],
    strengths: [String],
    reviewedAt: Date,
    // Which model reviewed it (never the one that wrote it), and what the free rule check found first.
    model: { type: String, default: null },
    ruleIssues: [String],
    ruleFailed: { type: Boolean, default: false },
    // Claims the reviewer found no support for in the site's facts; such a post never publishes on its own.
    unsupportedClaims: [String],
    revised: { type: Boolean, default: false },
  },
  // The trust ladder (functions/TrustLadder.js). An autopilot post waiting out its hold has autoApproveAt set;
  // it is approved by the scheduler then unless the user acted first.
  autoApproveAt: { type: Date, default: null, index: true },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: String, enum: ['user', 'autopilot', null], default: null },
  rejectedAt: { type: Date, default: null },
  rejectReason: { type: String, default: null },
  rejectNote: { type: String, default: null },
  engagement: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    lastUpdated: Date,
  },
  // Platform URL after posting
  platformPostUrl: {
    type: String,
  },
}, { timestamps: true });

// Indexes for efficient queries
scheduledPostSchema.index({ userId: 1, status: 1, scheduledAt: 1 });
scheduledPostSchema.index({ status: 1, scheduledAt: 1 }); // For cron job to find due posts

// Virtual for full caption (caption + hashtags)
scheduledPostSchema.virtual('fullCaption').get(function () {
  const parts = [];
  if (this.caption) parts.push(this.caption);
  if (this.hashtags) parts.push(this.hashtags);
  return parts.join('\n\n');
});

// Static method to find posts due for publishing
/**
 * Claim the oldest due post: move it from 'scheduled' to 'publishing' in one atomic update, so of any number of
 * workers on any number of servers exactly one gets it. `exclude` is a list of {userId, platform} not to take
 * (paused platforms, platforms that just posted).
 */
scheduledPostSchema.statics.claimNextDue = function (exclude = [], now = new Date()) {
  const filter = { status: 'scheduled', scheduledAt: { $lte: now }, retryCount: { $lt: 3 } };
  if (exclude.length) filter.$nor = exclude.map(({ userId, platform }) => ({ userId, platform }));
  return this.findOneAndUpdate(
    filter,
    { $set: { status: 'publishing', claimedAt: now } },
    { sort: { scheduledAt: 1 }, new: true },
  );
};

scheduledPostSchema.statics.findDuePosts = function () {
  return this.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() },
    retryCount: { $lt: 3 }, // Max 3 retries
  }).sort({ scheduledAt: 1 });
};

// Static method to get posts for calendar view
scheduledPostSchema.statics.getCalendarPosts = function (userId, startDate, endDate) {
  return this.find({
    userId,
    scheduledAt: { $gte: startDate, $lte: endDate },
    status: { $in: ['scheduled', 'published'] },
  }).sort({ scheduledAt: 1 });
};

module.exports = mongoose.model('ScheduledPost', scheduledPostSchema);

