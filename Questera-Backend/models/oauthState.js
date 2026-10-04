const mongoose = require('mongoose');

/**
 * Short-lived OAuth handshake state.
 *
 * Needed for PKCE: the `code_verifier` generated at the start of the flow must
 * survive until the callback, but it must NOT travel through the browser -
 * that is the whole point of PKCE. Sealing it into a signed `state` JWT would
 * hand it to anyone who can see the redirect, so it is stored server-side and
 * looked up by the opaque state value.
 *
 * Documents self-delete via a TTL index, so nothing needs to sweep them.
 */
const oauthStateSchema = new mongoose.Schema({
  state: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['twitter', 'linkedin', 'instagram', 'tiktok', 'facebook'],
    required: true,
  },
  codeVerifier: {
    type: String,
  },
  redirectUri: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Mongo removes these 10 minutes after creation - an authorization code that
// has not been redeemed by then is dead anyway.
oauthStateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

/**
 * Look up and immediately consume a state value.
 * Deleting on read makes the handshake single-use, so a replayed callback
 * cannot mint a second connection.
 */
oauthStateSchema.statics.consume = function (state, platform) {
  return this.findOneAndDelete({ state, platform });
};

module.exports = mongoose.model('OAuthState', oauthStateSchema);
