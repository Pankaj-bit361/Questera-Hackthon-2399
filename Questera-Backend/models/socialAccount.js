const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Social Account Model
 * Stores connected social media accounts (Instagram, TikTok, LinkedIn)
 */
const socialAccountSchema = new mongoose.Schema({
  accountId: {
    type: String,
    unique: true,
    default: () => 'sa-' + uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['instagram', 'tiktok', 'linkedin', 'facebook', 'twitter'],
    required: true,
  },
  // Platform-specific identifiers
  platformUserId: {
    type: String,
    required: true,
  },
  platformUsername: {
    type: String,
  },
  // OAuth tokens
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
  refreshTokenExpiresAt: {
    type: Date,
  },
  // OAuth scopes actually granted by the platform (may be fewer than requested)
  scopes: [{
    type: String,
  }],
  // LinkedIn-specific: the URN posts are authored as.
  // urn:li:person:{sub} for a member, urn:li:organization:{id} for a company page.
  authorUrn: {
    type: String,
  },
  authorType: {
    type: String,
    enum: ['member', 'organization'],
    default: 'member',
  },
  // Instagram-specific: Need page ID for posting
  instagramBusinessAccountId: {
    type: String,
  },
  facebookPageId: {
    type: String,
  },
  facebookPageAccessToken: {
    type: String,
  },
  // Account metadata
  profilePictureUrl: {
    type: String,
  },
  followersCount: {
    type: Number,
    default: 0,
  },
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  lastSyncedAt: {
    type: Date,
  },
  connectionError: {
    message: String,
    code: String,
    occurredAt: Date,
  },
}, { timestamps: true });

// Compound index for unique platform per user
socialAccountSchema.index({ userId: 1, platform: 1, platformUserId: 1 }, { unique: true });

module.exports = mongoose.model('SocialAccount', socialAccountSchema);

