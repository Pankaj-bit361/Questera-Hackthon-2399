const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * A reply Velos drafted to a comment on one of the autopilot's posts (functions/ReplyDrafts.js). Nothing is sent
 * until the user approves it.
 */
const commentReplySchema = new mongoose.Schema({
  replyId: { type: String, unique: true, default: () => `rp-${uuidv4()}` },
  userId: { type: String, required: true, index: true },
  autopilotId: { type: String, default: null, index: true },
  platform: { type: String, enum: ['instagram', 'linkedin', 'twitter'], required: true },
  postId: String, // ScheduledPost
  postCaption: String,
  postUrl: String,
  commentId: { type: String, required: true },
  commentText: String,
  commentAuthor: String,
  commentedAt: Date,
  kind: { type: String, enum: ['question', 'praise', 'feedback', 'complaint', 'other'], default: 'other' },
  draft: String,
  note: String, // why it needs care, for complaints
  status: { type: String, enum: ['draft', 'sent', 'dismissed', 'failed'], default: 'draft', index: true },
  sentText: String,
  sentAt: Date,
  error: String,
}, { timestamps: true });

commentReplySchema.index({ platform: 1, commentId: 1 }, { unique: true });

module.exports = mongoose.model('CommentReply', commentReplySchema);
