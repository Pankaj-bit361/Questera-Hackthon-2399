const Instagram = require('../models/instagram');
const SocialAccount = require('../models/socialAccount');

/**
 * The access token and business account id for one of a user's Instagram accounts (`igBusinessId`, or the first
 * connected one). Instagram connections live in the Instagram collection (accounts[]), older ones in its top-level
 * fields, and some in SocialAccount; this looks in that order. Returns { accessToken, igBusinessId, username } or
 * null.
 */
async function instagramToken(userId, igBusinessId = null) {
  for (const doc of await Instagram.find({ userId })) {
    for (const acc of doc.accounts || []) {
      if (acc.isConnected === false || !acc.accessToken) continue;
      if (igBusinessId && acc.instagramBusinessAccountId !== igBusinessId) continue;
      return { accessToken: acc.accessToken, igBusinessId: acc.instagramBusinessAccountId, username: acc.instagramUsername };
    }
    if (doc.accessToken && (!igBusinessId || doc.instagramBusinessAccountId === igBusinessId)) {
      return { accessToken: doc.accessToken, igBusinessId: doc.instagramBusinessAccountId, username: doc.instagramUsername };
    }
  }
  const query = { userId, platform: 'instagram', isActive: true };
  if (igBusinessId) query.instagramBusinessAccountId = igBusinessId;
  const sa = await SocialAccount.findOne(query).sort({ createdAt: 1 });
  const token = sa && (sa.facebookPageAccessToken || sa.accessToken);
  return token ? { accessToken: token, igBusinessId: sa.instagramBusinessAccountId, username: sa.platformUsername } : null;
}

module.exports = { instagramToken };
