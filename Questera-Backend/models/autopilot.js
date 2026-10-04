const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * An Autopilot is one company/brand being promoted. A user can have many,
 * the way they have many chats. Each one owns its own brand profile
 * (AutopilotMemory), one config per platform (AutopilotConfig), its tasks
 * (AutopilotTask), and picks exactly one connected account per platform.
 */
const autopilotSchema = new mongoose.Schema(
  {
    autopilotId: { type: String, required: true, unique: true, default: () => `ap-${uuidv4()}` },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    websiteUrl: { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    // Which connected account this autopilot posts through, per platform.
    // Instagram stores the business account id; the others the SocialAccount
    // accountId. Null means "the user's first active account".
    accounts: {
      instagram: { type: String, default: null },
      linkedin: { type: String, default: null },
      twitter: { type: String, default: null },
    },
    // The one auto-created when a user first touches autopilot. Unique per
    // user (partial index) so concurrent first requests cannot make several.
    isDefault: { type: Boolean, default: false },
    // Signs Seovyn's publish webhook into this autopilot (routes/Integrations.js); made when the user asks for it.
    seovynSecret: { type: String, default: null, select: false },
    // When the weekly report last went out (functions/WeeklyReport.js).
    lastReportAt: { type: Date, default: null },
    // What the platform agents changed on their own, newest first (capped).
    agentLog: [{
      date: { type: Date, default: () => new Date() },
      platform: String,
      summary: String,
      insights: [String],
      applied: [String],
    }],
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

autopilotSchema.index({ userId: 1, createdAt: 1 });
autopilotSchema.index({ userId: 1 }, { name: 'userId_default_unique', unique: true, partialFilterExpression: { isDefault: true } });

/**
 * The user's default autopilot id: their oldest one, created on the spot if they have none. Posts that do not come
 * from an autopilot (campaigns, live generation) go into its approval queue.
 */
autopilotSchema.statics.defaultIdFor = async function (userId) {
  let ap = await this.findOne({ userId, archived: false }).sort({ createdAt: 1 }).select('autopilotId');
  if (!ap) {
    // Atomic: the partial unique index on {userId, isDefault} means parallel first calls land on one document.
    ap = await this.findOneAndUpdate(
      { userId, isDefault: true },
      { $setOnInsert: { userId, isDefault: true, name: 'My autopilot', archived: false } },
      { upsert: true, new: true }
    );
  }
  return ap.autopilotId;
};

module.exports = mongoose.model('Autopilot', autopilotSchema);
