const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * "Your first week": a week of ready posts and one product video, made from a company's website before any social
 * account is connected (functions/Preview.js). When accounts are connected, the posts go into the approval queue.
 */
const previewPostSchema = new mongoose.Schema({
  day: Number, // 1-7
  platform: { type: String, enum: ['instagram', 'linkedin', 'twitter'] },
  format: String, // text | thread | image | carousel | reel
  caption: String,
  hashtags: String,
  threadParts: [String],
  headline: String,
  imageUrls: [String],
  fact: String,
  factSource: String,
  queuedPostId: { type: String, default: null },
  review: { type: Object, default: null }, // { score, verdict, issues, ruleIssues, ruleFailed, model }
}, { _id: false });

const previewSchema = new mongoose.Schema({
  previewId: { type: String, unique: true, default: () => `pv-${uuidv4()}` },
  userId: { type: String, required: true, index: true },
  autopilotId: { type: String, default: null },
  url: { type: String, required: true },
  status: { type: String, enum: ['reading', 'writing', 'imaging', 'done', 'failed'], default: 'reading' },
  activity: { type: String, default: 'Reading your site' },
  error: { type: String, default: null },
  company: { type: String, default: '' },
  factsRead: { type: Number, default: 0 },
  posts: { type: [previewPostSchema], default: [] },
  video: {
    jobId: { type: String, default: null },
    status: { type: String, default: null }, // queued | running | done | failed
    url: { type: String, default: null },
    thumb: { type: String, default: null },
  },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Preview', previewSchema);
