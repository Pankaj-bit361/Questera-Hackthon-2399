const mongoose = require('mongoose');

/**
 * A user's posting on one platform is paused: the platform blocked, rate-limited or flagged the account, or its
 * login stopped working (functions/AccountHealth.js). Nothing publishes or generates for it until `until`.
 * Per user and platform, not per account: a block on one account is reason enough to slow the others down too.
 */
const accountPauseSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  platform: { type: String, enum: ['instagram', 'linkedin', 'twitter'], required: true },
  kind: { type: String, enum: ['blocked', 'reconnect', 'manual'], required: true },
  reason: { type: String, default: '' },
  until: { type: Date, required: true },
  pausedAt: { type: Date, default: Date.now },
}, { timestamps: true });

accountPauseSchema.index({ userId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('AccountPause', accountPauseSchema);
