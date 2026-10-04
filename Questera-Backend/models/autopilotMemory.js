const mongoose = require('mongoose');

const contentHistorySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  postId: { type: String },
  platform: { type: String, enum: ['instagram', 'linkedin', 'twitter', 'tiktok'], default: 'instagram' },
  type: { type: String, enum: ['feed', 'story', 'reel'] },
  format: { type: String, enum: ['image', 'carousel', 'video', 'reel', 'text', 'multi_image', 'thread'] },
  theme: { type: String },
  hookStyle: { type: String },
  // What was posted, so "don't repeat yourself" can compare against it (per platform).
  caption: { type: String, default: '' },
  performance: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
  },
}, { _id: false });

const autopilotMemorySchema = new mongoose.Schema({
  // Which autopilot this brand profile belongs to.
  autopilotId: { type: String, default: null },
  userId: {
    type: String,
    required: true,
    // No `index: true` here - the unique {userId} index declared below covers
    // it, and declaring both collides on the auto-generated name `userId_1`.
  },
  // Legacy - the brand profile is per user now, not per chat.
  chatId: {
    type: String,
    default: null,
    index: true,
  },

  // Brand understanding (learned over time)
  brand: {
    tone: { type: String, default: 'friendly' },
    topicsAllowed: { type: [String], default: [] },
    topicsBlocked: { type: [String], default: [] },
    visualStyle: { type: String, default: 'modern' },
    targetAudience: { type: String, default: '' },
    uniqueSellingPoints: { type: [String], default: [] },
    // Filled by BrandCrawler from the company's own website.
    companyName: { type: String, default: '' },
    oneLiner: { type: String, default: '' },
    // Concrete, checkable claims taken from the site. These are what stop the
    // agent writing generic filler - a post cites a real capability instead.
    proofPoints: { type: [String], default: [] },
    // Recurring themes this account can credibly return to.
    contentAngles: { type: [String], default: [] },
  },

  // Where the brand profile came from, so it can be refreshed later.
  website: {
    url: { type: String, default: '' },
    pagesRead: [{ url: String, label: String, title: String }],
    lastCrawledAt: { type: Date, default: null },
    confidence: { type: String, default: '' },
    // Every page the site lists that is worth reading (functions/SiteFacts.js), to spot new ones next week.
    pages: [{ _id: false, url: String, label: String, lastmod: String, firstSeen: Date }],
    factsRefreshedAt: { type: Date, default: null },
    factsClaimedAt: { type: Date, default: null },
    // The blog's RSS/Atom feed, checked daily for new articles (SiteFacts.checkFeed).
    feedUrl: { type: String, default: null },
    feedCheckedAt: { type: Date, default: null },
    feedSeen: { type: [String], default: [] },
    feedClaimedAt: { type: Date, default: null },
  },

  // What posts are built on: facts read from the site, each with its page (SiteFacts.refresh, weekly).
  facts: {
    type: [new mongoose.Schema({
      text: String,
      kind: String,
      sourceUrl: String,
      sourceTitle: String,
      firstSeen: Date,
      lastSeen: Date,
    }, { _id: false })],
    default: [],
  },

  // New on the site since the last read: each is announced once per platform, before anything else.
  whatsNew: {
    type: [new mongoose.Schema({
      key: String,
      kind: { type: String, enum: ['page', 'blog', 'feature'] },
      title: String,
      url: String,
      summary: String,
      fact: String,
      foundAt: Date,
      source: { type: String, default: 'site' }, // 'site' | 'seovyn' | 'rss'
      announced: { type: Map, of: String, default: {} }, // platform -> postId
    }, { _id: false })],
    default: [],
  },

  // Proof points already used, so the agent rotates through them instead of
  // hammering the same fact every day.
  usedProofPoints: [{
    text: { type: String },
    usedAt: { type: Date, default: Date.now },
    platform: { type: String },
  }],

  // Reference images for content generation
  referenceImages: {
    // Product images - actual products to feature in content
    productImages: [{
      url: { type: String, required: true },
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now },
    }],
    // Style references - aesthetic/mood references
    styleReferences: [{
      url: { type: String, required: true },
      name: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now },
    }],
    // Personal reference - user's face for personalized AI images
    personalReference: {
      url: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
    },
  },

  // Performance insights (updated daily)
  performance: {
    // Best performing content types
    bestFormats: {
      type: Map,
      of: Number, // format -> avg engagement rate
      default: {},
    },
    bestThemes: {
      type: Map,
      of: Number, // theme -> avg engagement rate
      default: {},
    },
    bestHooks: {
      type: Map,
      of: Number, // hook style -> avg engagement rate
      default: {},
    },

    // Best posting times
    bestTimes: {
      type: [String], // ['10:00', '18:00']
      default: ['10:00', '18:00'],
    },
    bestDays: {
      type: [String], // ['monday', 'wednesday', 'friday']
      default: ['monday', 'wednesday', 'friday'],
    },

    // Overall metrics
    avgEngagementRate: { type: Number, default: 0 },
    avgReach: { type: Number, default: 0 },
    avgLikes: { type: Number, default: 0 },
    avgComments: { type: Number, default: 0 },

    // Trends
    engagementTrend7d: { type: String, enum: ['up', 'down', 'flat'], default: 'flat' },
    reachTrend7d: { type: String, enum: ['up', 'down', 'flat'], default: 'flat' },
  },

  // Recent content history (last 30 posts)
  contentHistory: {
    type: [contentHistorySchema],
    default: [],
  },

  // What worked, per platform (functions/Performance.js): { instagram: { posts, average, byTheme, byFormat, byTime } }.
  stats: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Why the user rejected recent posts, newest first (last 10). The planner and the writer read these.
  rejections: {
    type: [new mongoose.Schema({
      at: { type: Date, default: Date.now },
      platform: String,
      reason: String,
      note: String,
      caption: String,
    }, { _id: false })],
    default: [],
  },

  // Last decision reasoning (for transparency)
  lastDecisionSummary: {
    type: String,
    default: null,
  },
  lastDecisionAt: {
    type: Date,
    default: null,
  },

  // Exploration mode (when things aren't working)
  explorationMode: {
    enabled: { type: Boolean, default: false },
    reason: { type: String, default: null },
    startedAt: { type: Date, default: null },
  },

  // Stats
  totalPostsGenerated: { type: Number, default: 0 },
  totalStoriesGenerated: { type: Number, default: 0 },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound unique index
// One brand profile per user, shared by all of their autopilots. The brand is
// a property of the company, not of a conversation.
autopilotMemorySchema.index({ userId: 1 });
// One brand profile per autopilot. Partial so legacy rows without an
// autopilotId do not collide on null.
autopilotMemorySchema.index({ autopilotId: 1 }, { unique: true, partialFilterExpression: { autopilotId: { $type: 'string' } } });

// Update timestamp on save
autopilotMemorySchema.pre('save', function () {
  this.updatedAt = new Date();
});

// Add content to history (keep last 30)
autopilotMemorySchema.methods.addContentHistory = function (content) {
  this.contentHistory.unshift(content);
  if (this.contentHistory.length > 30) {
    this.contentHistory = this.contentHistory.slice(0, 30);
  }
};

// Get last N posts
// Recent content, optionally scoped to one platform.
//
// The brand profile is shared across a chat's autopilots, but history is not:
// posting the same theme on LinkedIn and on X on the same day is fine, whereas
// repeating it twice on X is not. Callers pass the platform so each autopilot
// judges repetition against its own timeline.
autopilotMemorySchema.methods.getRecentContent = function (n = 7, platform = null) {
  const history = platform
    ? this.contentHistory.filter((c) => (c.platform || 'instagram') === platform)
    : this.contentHistory;
  return history.slice(0, n);
};

// Check if theme was used recently on this platform
autopilotMemorySchema.methods.wasThemeUsedRecently = function (theme, days = 3, platform = null) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.contentHistory.some(
    (c) =>
      c.theme === theme &&
      c.date > cutoff &&
      (!platform || (c.platform || 'instagram') === platform)
  );
};

/**
 * Proof points that have not been posted recently, so each run reaches for
 * something the audience has not just seen. Falls back to the full list once
 * everything has been used - better to repeat than to post nothing.
 */
autopilotMemorySchema.methods.freshProofPoints = function (days = 14, platform = null) {
  // The site's facts when they have been read (SiteFacts), newest first; the brand profile's otherwise.
  const all = this.facts?.length ? this.facts.map((f) => f.text) : this.brand?.proofPoints || [];
  if (all.length === 0) return [];

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recentlyUsed = new Set(
    (this.usedProofPoints || [])
      .filter((u) => u.usedAt > cutoff && (!platform || u.platform === platform))
      .map((u) => u.text)
  );

  const fresh = all.filter((p) => !recentlyUsed.has(p));
  return fresh.length ? fresh : all;
};

/** The page a fact came from, or null. */
autopilotMemorySchema.methods.factSource = function (text) {
  const f = (this.facts || []).find((x) => x.text === text);
  return f ? { url: f.sourceUrl, title: f.sourceTitle } : null;
};

/** The oldest news not yet announced on this platform (found in the last 30 days), or null. */
autopilotMemorySchema.methods.nextAnnouncement = function (platform) {
  const since = Date.now() - 30 * 86400e3;
  return [...(this.whatsNew || [])]
    .filter((w) => new Date(w.foundAt).getTime() > since && !w.announced?.get?.(platform))
    .sort((a, b) => new Date(a.foundAt) - new Date(b.foundAt))[0] || null;
};

autopilotMemorySchema.methods.markAnnounced = function (key, platform, postId) {
  const item = (this.whatsNew || []).find((w) => w.key === key);
  if (item) item.announced.set(platform, postId || 'skipped');
};

autopilotMemorySchema.methods.markProofPointUsed = function (text, platform) {
  if (!text) return;
  this.usedProofPoints.unshift({ text, usedAt: new Date(), platform });
  // Keep this bounded; anything older than the rotation window is noise.
  this.usedProofPoints = this.usedProofPoints.slice(0, 60);
};

module.exports = mongoose.model('AutopilotMemory', autopilotMemorySchema);

