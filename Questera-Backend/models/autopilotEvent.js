const mongoose = require('mongoose');

/**
 * Something the autopilot decided about itself, in words the user can read: it earned autopilot, a rejection sent
 * it back to supervised, the supervisor paused it and why. Shown on the autopilot page.
 */
const autopilotEventSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  autopilotId: { type: String, default: null, index: true },
  platform: { type: String, default: null },
  action: {
    type: String,
    enum: ['promoted', 'demoted', 'reset', 'paused', 'resumed', 'auto_approved', 'held'],
    required: true,
  },
  reason: { type: String, default: '' },
  postId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('AutopilotEvent', autopilotEventSchema);
