const mongoose = require('mongoose');

const instagramSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    instagramBusinessAccountId: {
      type: String,
      required: true,
    },
    facebookPageId: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
    },
    tokenExpiresAt: {
      type: Date,
    },
    instagramUsername: {
      type: String,
    },
    instagramName: {
      type: String,
    },
    profilePictureUrl: {
      type: String,
    },
    isConnected: {
      type: Boolean,
      default: true,
    },
    lastTokenRefresh: {
      type: Date,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Instagram', instagramSchema);

