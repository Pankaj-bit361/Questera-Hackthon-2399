const mongoose = require('mongoose');

const generationUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  tool: { type: String, required: true },
  model: String,
  provider: String,
  creditsCost: { type: Number, default: 0 },
  latencyMs: { type: Number, default: 0 },
  success: { type: Boolean, default: true },
  error: String,
  chatId: String,
  jobId: String,
  resultUrl: String,
}, { timestamps: true });

generationUsageSchema.index({ userId: 1, createdAt: -1 });
generationUsageSchema.index({ tool: 1, createdAt: -1 });

module.exports = mongoose.model('GenerationUsage', generationUsageSchema);
