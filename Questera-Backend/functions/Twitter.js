const crypto = require('crypto');
const SocialAccount = require('../models/socialAccount');
const { resume } = require('./AccountHealth');
const OAuthState = require('../models/oauthState');

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const API_BASE = 'https://api.x.com/2';

// tweet.write to post, users.read to identify the account, offline.access to
// get a refresh token. Without offline.access the connection dies in 2 hours.
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

// X access tokens live only 2 hours, so unlike LinkedIn's 60 days the refresh
// window is minutes, not days. Anything inside this gets refreshed first.
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

/**
 * X (Twitter) OAuth 2.0 with PKCE, plus account management.
 *
 * Same `{ status, json }` calling convention as the Instagram and LinkedIn
 * controllers so routes and internal callers can share these methods.
 */
class TwitterController {
  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID;
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET;
    this.redirectUri = process.env.TWITTER_REDIRECT_URI;
  }

  /**
   * X requires PKCE even for confidential clients.
   * verifier: 43-128 chars of unreserved characters; challenge: base64url(sha256(verifier)).
   */
  generatePkce() {
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Confidential clients authenticate at the token endpoint with HTTP Basic.
   * Public clients (no secret configured) send client_id in the body instead.
   */
  tokenAuthHeaders() {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.clientSecret) {
      const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${basic}`;
    }
    return headers;
  }

  async getOAuthUrl(req) {
    try {
      if (!this.clientId || !this.redirectUri) {
        return { status: 500, json: { error: 'X is not configured. Set TWITTER_CLIENT_ID and TWITTER_REDIRECT_URI.' } };
      }

      const userId = req.user?.userId || req.query?.userId;
      if (!userId) {
        return { status: 400, json: { error: 'userId is required' } };
      }

      const { codeVerifier, codeChallenge } = this.generatePkce();
      const state = crypto.randomBytes(24).toString('base64url');

      // The verifier stays server-side. Putting it in the state parameter
      // would defeat the point of PKCE.
      await OAuthState.create({
        state,
        userId,
        platform: 'twitter',
        codeVerifier,
        redirectUri: this.redirectUri,
      });

      const oauthUrl = `${AUTHORIZE_URL}?` + new URLSearchParams({
        response_type: 'code',
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        scope: SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();

      console.log('🔐 [TWITTER] Generated OAuth URL');
      return { status: 200, json: { success: true, oauthUrl, state, scopes: SCOPES } };
    } catch (error) {
      console.error('❌ [TWITTER] Error generating OAuth URL:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async handleCallback(req) {
    try {
      const { code, state } = req.body;
      if (!code || !state) {
        return { status: 400, json: { error: 'code and state are required' } };
      }

      // Single-use: consume() deletes as it reads, so a replayed callback fails.
      const handshake = await OAuthState.consume(state, 'twitter');
      if (!handshake) {
        return { status: 400, json: { error: 'Invalid or expired OAuth state. Please start the connection again.' } };
      }

      const userId = req.user?.userId || handshake.userId;
      if (handshake.userId !== userId) {
        return { status: 403, json: { error: 'OAuth state does not belong to this user' } };
      }

      console.log('🔐 [TWITTER] Exchanging code for access token...');

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: handshake.redirectUri || this.redirectUri,
        code_verifier: handshake.codeVerifier,
      });
      if (!this.clientSecret) body.set('client_id', this.clientId);

      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: this.tokenAuthHeaders(),
        body: body.toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('❌ [TWITTER] Token exchange failed:', tokenData);
        return { status: 400, json: { error: 'Failed to exchange code for token', details: tokenData } };
      }

      if (!tokenData.refresh_token) {
        console.warn('⚠️ [TWITTER] No refresh token returned - offline.access may not have been granted');
      }

      const meRes = await fetch(`${API_BASE}/users/me?user.fields=profile_image_url,username,name`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const me = await meRes.json();

      if (!meRes.ok || !me?.data?.id) {
        console.error('❌ [TWITTER] users/me failed:', me);
        return { status: 400, json: { error: 'Failed to read X profile', details: me } };
      }

      const account = await this.saveAccount({
        userId,
        platformUserId: me.data.id,
        platformUsername: me.data.username,
        profilePictureUrl: me.data.profile_image_url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scopes: (tokenData.scope || '').split(/[\s,]+/).filter(Boolean),
      });

      console.log(`✅ [TWITTER] Connected @${me.data.username} (${me.data.id})`);

      return {
        status: 200,
        json: {
          success: true,
          account: this.publicAccount(account),
          canAutoRefresh: Boolean(tokenData.refresh_token),
        },
      };
    } catch (error) {
      console.error('❌ [TWITTER] Callback error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async saveAccount(data) {
    const update = {
      userId: data.userId,
      platform: 'twitter',
      platformUserId: data.platformUserId,
      platformUsername: data.platformUsername,
      profilePictureUrl: data.profilePictureUrl,
      accessToken: data.accessToken,
      scopes: data.scopes,
      // X has no URN concept; the numeric user id is the author identity.
      authorUrn: data.platformUserId,
      authorType: 'member',
      isActive: true,
      lastSyncedAt: new Date(),
      connectionError: undefined,
    };

    if (data.refreshToken) update.refreshToken = data.refreshToken;
    if (data.expiresIn) update.tokenExpiresAt = new Date(Date.now() + data.expiresIn * 1000);

    const account = await SocialAccount.findOneAndUpdate(
      { userId: data.userId, platform: 'twitter', platformUserId: data.platformUserId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (account) await resume(account.userId, account.platform); // a fresh login ends a 'reconnect' pause
    return account;
  }

  async resolveAccount(userId, accountId) {
    const query = { userId, platform: 'twitter', isActive: true };
    if (accountId) query.accountId = accountId;

    const account = await SocialAccount.findOne(query).sort({ createdAt: 1 });
    if (!account) {
      const err = new Error(
        accountId
          ? `X account ${accountId} not found or disconnected`
          : 'No X account connected. Connect one in Settings first.'
      );
      err.code = 'NO_ACCOUNT';
      throw err;
    }
    return account;
  }

  /**
   * Refresh if the 2-hour access token is close to expiring.
   *
   * X rotates refresh tokens: every refresh returns a NEW refresh_token and
   * invalidates the old one. Failing to persist it bricks the connection, so
   * the write happens before the new access token is used for anything.
   */
  async ensureFreshToken(account) {
    const expiresAt = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : 0;
    if (expiresAt - Date.now() > REFRESH_WINDOW_MS) {
      return account;
    }

    if (!account.refreshToken) {
      await this.flagConnectionError(account, 'RECONNECT_REQUIRED', 'X access expired and there is no refresh token. Reconnect the account in Settings.');
      const err = new Error('X access expired. Reconnect the account in Settings.');
      err.code = 'RECONNECT_REQUIRED';
      err.nonRetryable = true;
      throw err;
    }

    console.log('🔄 [TWITTER] Refreshing access token...');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    });
    if (!this.clientSecret) body.set('client_id', this.clientId);

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: this.tokenAuthHeaders(),
      body: body.toString(),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error('❌ [TWITTER] Token refresh failed:', data);
      await this.flagConnectionError(account, 'REFRESH_FAILED', data.error_description || 'Token refresh failed');
      const err = new Error('X token refresh failed. Reconnect the account in Settings.');
      err.code = 'RECONNECT_REQUIRED';
      err.nonRetryable = true;
      throw err;
    }

    account.accessToken = data.access_token;
    if (data.expires_in) account.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    // Rotation: the old refresh token is now dead. Persist the replacement.
    if (data.refresh_token) account.refreshToken = data.refresh_token;
    account.connectionError = undefined;
    await account.save();

    console.log('✅ [TWITTER] Access token refreshed');
    return account;
  }

  async flagConnectionError(account, code, message) {
    try {
      account.connectionError = { code, message, occurredAt: new Date() };
      await account.save();
    } catch (err) {
      console.warn('[TWITTER] Could not record connection error:', err.message);
    }
  }

  async getInfo(req) {
    try {
      const userId = req.user?.userId || req.params?.userId;
      const accounts = await SocialAccount.find({ userId, platform: 'twitter' }).sort({ createdAt: 1 });

      return {
        status: 200,
        json: {
          success: true,
          connected: accounts.some((a) => a.isActive),
          accounts: accounts.map((a) => this.publicAccount(a)),
        },
      };
    } catch (error) {
      console.error('❌ [TWITTER] getInfo error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async disconnect(req) {
    try {
      const userId = req.user?.userId || req.params?.userId;
      const { accountId } = req.body || {};

      const query = { userId, platform: 'twitter' };
      if (accountId) query.accountId = accountId;

      const result = await SocialAccount.deleteMany(query);
      console.log(`🔌 [TWITTER] Disconnected ${result.deletedCount} account(s) for ${userId}`);
      return { status: 200, json: { success: true, disconnected: result.deletedCount } };
    } catch (error) {
      console.error('❌ [TWITTER] disconnect error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async refreshTokenEndpoint(req) {
    try {
      const userId = req.user?.userId || req.body?.userId;
      const { accountId } = req.body || {};

      let account = await this.resolveAccount(userId, accountId);
      account.tokenExpiresAt = new Date(Date.now() + 1000);
      account = await this.ensureFreshToken(account);

      return { status: 200, json: { success: true, account: this.publicAccount(account) } };
    } catch (error) {
      console.error('❌ [TWITTER] refreshToken error:', error.message);
      return { status: 400, json: { error: error.message, code: error.code } };
    }
  }

  publicAccount(account) {
    return {
      accountId: account.accountId,
      platform: account.platform,
      platformUserId: account.platformUserId,
      username: account.platformUsername,
      name: account.platformUsername ? `@${account.platformUsername}` : account.platformUserId,
      profilePictureUrl: account.profilePictureUrl,
      scopes: account.scopes,
      isActive: account.isActive,
      tokenExpiresAt: account.tokenExpiresAt,
      canAutoRefresh: Boolean(account.refreshToken),
      connectionError: account.connectionError,
      connectedAt: account.createdAt,
    };
  }
}

module.exports = TwitterController;
