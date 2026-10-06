const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const mediaJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    unique: true,
    default: () => 'mjob-' + uuidv4(),
    index: true,
  },
  userId: { type: String, required: true, index: true },
  kind: {
    type: String,
    enum: ['image', 'video'],
    required: true,
  },
  provider: {
    type: String,
    enum: ['veo', 'kie', 'seedance', 'seedance-fast', 'gemini'],
    default: 'veo',
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued',
    index: true,
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  prompt: String,
  operationId: String,
  resultUrl: String,
  error: String,
  videoChatId: String,
  imageChatId: String,
  messageId: String,
  creditsDeducted: { type: Boolean, default: false },
  creditsCost: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

mediaJobSchema.index({ userId: 1, createdAt: -1 });
mediaJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('MediaJob', mediaJobSchema);
