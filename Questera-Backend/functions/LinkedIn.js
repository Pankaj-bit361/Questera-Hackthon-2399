const jwt = require('jsonwebtoken');
const SocialAccount = require('../models/socialAccount');
const { resume } = require('./AccountHealth');

const OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const API_BASE = 'https://api.linkedin.com';

// Scopes granted by the self-serve "Sign In with LinkedIn using OpenID Connect"
// and "Share on LinkedIn" products. Everything here is available without review.
const MEMBER_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

// Company-page scopes. These require the Community Management API product,
// which LinkedIn gates behind a manual review. Opt in with LINKEDIN_ENABLE_ORG=true
// only once that review has been approved, otherwise consent will fail outright.
const ORG_SCOPES = ['w_organization_social', 'r_organization_social'];

// The Community Management API product must be the ONLY product on its app,
// so it cannot coexist with "Sign In with LinkedIn" (which grants openid /
// profile / email). On a CM-only app identify the member with r_basicprofile
// and /v2/me instead. LINKEDIN_ENABLE_ORG=true switches to this scope set.
const CM_SCOPES = ['r_basicprofile', 'w_member_social', 'w_organization_social', 'r_organization_social', 'r_organization_admin'];

// Refresh this far ahead of expiry so a publish never races the token clock.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * LinkedIn OAuth + account management.
 *
 * Follows the same calling convention as InstagramController: methods take an
 * express-ish `req` and return `{ status, json }` rather than touching `res`,
 * so routes and internal callers can share them.
 */
class LinkedInController {
  constructor() {
    this.clientId = process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    this.redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    this.apiVersion = process.env.LINKEDIN_API_VERSION || '202608';
    this.enableOrg = String(process.env.LINKEDIN_ENABLE_ORG || '').toLowerCase() === 'true';
  }

  /**
   * Headers required on every versioned LinkedIn REST call.
   */
  restHeaders(accessToken, extra = {}) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': this.apiVersion,
      ...extra,
    };
  }

  scopes() {
    return this.enableOrg ? CM_SCOPES : MEMBER_SCOPES;
  }

  /**
   * Who the token belongs to. Tries OpenID userinfo first (Sign In product),
   * then falls back to /v2/me (r_basicprofile, CM API product). Returns the
   * same shape either way: { sub, name, picture, email }.
   */
  async fetchProfile(accessToken) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const ui = await fetch(`${API_BASE}/v2/userinfo`, { headers });
    if (ui.ok) {
      const j = await ui.json();
      if (j.sub) return j;
    }
    const me = await fetch(`${API_BASE}/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))`, { headers });
    const j = await me.json();
    if (!me.ok || !j.id) {
      const err = new Error('Failed to read LinkedIn profile');
      err.details = j;
      throw err;
    }
    const pics = j.profilePicture?.['displayImage~']?.elements || [];
    const picture = pics.length ? pics[pics.length - 1]?.identifiers?.[0]?.identifier : undefined;
    return { sub: j.id, name: [j.localizedFirstName, j.localizedLastName].filter(Boolean).join(' '), picture, email: undefined };
  }

  /**
   * Build the consent URL.
   *
   * `state` is a short-lived signed JWT rather than a random string, so the
   * callback can actually verify it came from us and belongs to this user.
   * (The Instagram flow generates a state it never checks - do not copy that.)
   */
  getOAuthUrl(req) {
    try {
      if (!this.clientId || !this.redirectUri) {
        return { status: 500, json: { error: 'LinkedIn is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI.' } };
      }

      const userId = req.user?.userId || req.query?.userId;
      if (!userId) {
        return { status: 400, json: { error: 'userId is required' } };
      }

      const state = jwt.sign(
        { userId, purpose: 'linkedin_oauth' },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      const oauthUrl = `${OAUTH_BASE}/authorization?` +
        `response_type=code` +
        `&client_id=${encodeURIComponent(this.clientId)}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&state=${encodeURIComponent(state)}` +
        `&scope=${encodeURIComponent(this.scopes().join(' '))}`;

      console.log('🔐 [LINKEDIN] Generated OAuth URL');
      return { status: 200, json: { success: true, oauthUrl, state, scopes: this.scopes() } };
    } catch (error) {
      console.error('❌ [LINKEDIN] Error generating OAuth URL:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Exchange the authorization code for tokens, identify the member, and persist
   * the connection as a SocialAccount row.
   */
  async handleCallback(req) {
    try {
      const { code, state } = req.body;

      if (!code || !state) {
        return { status: 400, json: { error: 'code and state are required' } };
      }

      // Verify state before spending the code.
      let decoded;
      try {
        decoded = jwt.verify(state, process.env.JWT_SECRET);
      } catch (err) {
        console.warn('❌ [LINKEDIN] Invalid OAuth state:', err.message);
        return { status: 400, json: { error: 'Invalid or expired OAuth state. Please start the connection again.' } };
      }

      if (decoded.purpose !== 'linkedin_oauth') {
        return { status: 400, json: { error: 'Invalid OAuth state' } };
      }

      // Trust the authenticated user over anything in the body; fall back to
      // the userId sealed into the state when the route is unauthenticated.
      const userId = req.user?.userId || decoded.userId;
      if (decoded.userId !== userId) {
        return { status: 403, json: { error: 'OAuth state does not belong to this user' } };
      }

      console.log('🔐 [LINKEDIN] Exchanging code for access token...');

      const tokenRes = await fetch(`${OAUTH_BASE}/accessToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
        }).toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('❌ [LINKEDIN] Token exchange failed:', tokenData);
        return { status: 400, json: { error: 'Failed to exchange code for token', details: tokenData } };
      }

      console.log('✅ [LINKEDIN] Got access token');

      // Identify the member (OpenID userinfo, or /v2/me on a CM-only app).
      let userinfo;
      try {
        userinfo = await this.fetchProfile(tokenData.access_token);
      } catch (e) {
        console.error('❌ [LINKEDIN] profile lookup failed:', e.details || e.message);
        return { status: 400, json: { error: 'Failed to read LinkedIn profile', details: e.details } };
      }

      const grantedScopes = (tokenData.scope || '').split(/[\s,]+/).filter(Boolean);
      const account = await this.saveAccount({
        userId,
        platformUserId: userinfo.sub,
        platformUsername: userinfo.name || userinfo.email,
        profilePictureUrl: userinfo.picture,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
        scopes: grantedScopes,
        authorUrn: `urn:li:person:${userinfo.sub}`,
        authorType: 'member',
      });

      console.log(`✅ [LINKEDIN] Connected ${userinfo.name} (${account.authorUrn})`);

      return {
        status: 200,
        json: {
          success: true,
          account: this.publicAccount(account),
          // Surfaced so the UI can warn that this connection needs a manual
          // reconnect in ~60 days instead of silently refreshing.
          canAutoRefresh: Boolean(tokenData.refresh_token),
        },
      };
    } catch (error) {
      console.error('❌ [LINKEDIN] Callback error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Upsert a connection. The unique index is {userId, platform, platformUserId},
   * so reconnecting the same profile updates in place.
   */
  async saveAccount(data) {
    const now = Date.now();
    const update = {
      userId: data.userId,
      platform: 'linkedin',
      platformUserId: data.platformUserId,
      platformUsername: data.platformUsername,
      profilePictureUrl: data.profilePictureUrl,
      accessToken: data.accessToken,
      scopes: data.scopes,
      authorUrn: data.authorUrn,
      authorType: data.authorType,
      isActive: true,
      lastSyncedAt: new Date(),
      connectionError: undefined,
    };

    if (data.refreshToken) update.refreshToken = data.refreshToken;
    if (data.expiresIn) update.tokenExpiresAt = new Date(now + data.expiresIn * 1000);
    if (data.refreshTokenExpiresIn) {
      update.refreshTokenExpiresAt = new Date(now + data.refreshTokenExpiresIn * 1000);
    }

    const account = await SocialAccount.findOneAndUpdate(
      { userId: data.userId, platform: 'linkedin', platformUserId: data.platformUserId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (account) await resume(account.userId, account.platform); // a fresh login ends a 'reconnect' pause
    return account;
  }

  /**
   * Resolve the account to publish as.
   * `accountId` is the SocialAccount.accountId; omit it to use the first active one.
   */
  async resolveAccount(userId, accountId) {
    const query = { userId, platform: 'linkedin', isActive: true };
    if (accountId) query.accountId = accountId;

    const account = await SocialAccount.findOne(query).sort({ createdAt: 1 });
    if (!account) {
      const err = new Error(
        accountId
          ? `LinkedIn account ${accountId} not found or disconnected`
          : 'No LinkedIn account connected. Connect one in Settings first.'
      );
      err.code = 'NO_ACCOUNT';
      throw err;
    }
    return account;
  }

  /**
   * Refresh the access token if it is close to expiring.
   *
   * LinkedIn member tokens last 60 days. Refresh tokens (365 days) are only
   * issued to apps approved for programmatic refresh - if we do not have one,
   * flag the connection so the user gets told to reconnect rather than
   * discovering it through a failed post.
   */
  async ensureFreshToken(account) {
    const expiresAt = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : null;
    if (!expiresAt || expiresAt - Date.now() > REFRESH_WINDOW_MS) {
      return account;
    }

    if (!account.refreshToken || (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt < new Date())) {
      await this.flagConnectionError(account, 'RECONNECT_REQUIRED', 'LinkedIn access has expired. Reconnect the account in Settings.');
      const err = new Error('LinkedIn access has expired. Reconnect the account in Settings.');
      err.code = 'RECONNECT_REQUIRED';
      err.nonRetryable = true;
      throw err;
    }

    console.log('🔄 [LINKEDIN] Refreshing access token...');

    const res = await fetch(`${OAUTH_BASE}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error('❌ [LINKEDIN] Token refresh failed:', data);
      await this.flagConnectionError(account, 'REFRESH_FAILED', data.error_description || 'Token refresh failed');
      const err = new Error('LinkedIn token refresh failed. Reconnect the account in Settings.');
      err.code = 'RECONNECT_REQUIRED';
      err.nonRetryable = true;
      throw err;
    }

    account.accessToken = data.access_token;
    if (data.expires_in) account.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    if (data.refresh_token) account.refreshToken = data.refresh_token;
    if (data.refresh_token_expires_in) {
      account.refreshTokenExpiresAt = new Date(Date.now() + data.refresh_token_expires_in * 1000);
    }
    account.connectionError = undefined;
    await account.save();

    console.log('✅ [LINKEDIN] Access token refreshed');
    return account;
  }

  async flagConnectionError(account, code, message) {
    try {
      account.connectionError = { code, message, occurredAt: new Date() };
      await account.save();
    } catch (err) {
      console.warn('[LINKEDIN] Could not record connection error:', err.message);
    }
  }

  /**
   * Company pages the member administers. Requires the org scopes.
   */
  async listOrganizations(req) {
    try {
      const userId = req.user?.userId || req.params?.userId;
      let account = await this.resolveAccount(userId);
      account = await this.ensureFreshToken(account);

      if (!account.scopes?.includes('w_organization_social')) {
        return {
          status: 200,
          json: {
            success: true,
            organizations: [],
            note: 'Company page posting requires the Community Management API product on your LinkedIn app.',
          },
        };
      }

      const url = `${API_BASE}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED` +
        `&projection=(elements*(organization~(id,localizedName,logoV2)))`;

      const res = await fetch(url, { headers: this.restHeaders(account.accessToken) });
      const data = await res.json();

      if (!res.ok) {
        return { status: res.status, json: { error: 'Failed to list organizations', details: data } };
      }

      const organizations = (data.elements || []).map((el) => {
        const org = el['organization~'] || {};
        return {
          id: org.id,
          name: org.localizedName,
          authorUrn: `urn:li:organization:${org.id}`,
        };
      });

      return { status: 200, json: { success: true, organizations } };
    } catch (error) {
      console.error('❌ [LINKEDIN] listOrganizations error:', error.message);
      return { status: error.code === 'NO_ACCOUNT' ? 404 : 500, json: { error: error.message } };
    }
  }

  /**
   * Switch the author to a company page (or back to the member profile).
   */
  async setAuthor(req) {
    try {
      const userId = req.user?.userId || req.body?.userId;
      const { accountId, organizationId } = req.body;

      const account = await this.resolveAccount(userId, accountId);

      if (organizationId) {
        if (!account.scopes?.includes('w_organization_social')) {
          return { status: 403, json: { error: 'This connection does not have company page posting permission.' } };
        }
        account.authorUrn = `urn:li:organization:${organizationId}`;
        account.authorType = 'organization';
      } else {
        account.authorUrn = `urn:li:person:${account.platformUserId}`;
        account.authorType = 'member';
      }

      await account.save();
      return { status: 200, json: { success: true, account: this.publicAccount(account) } };
    } catch (error) {
      console.error('❌ [LINKEDIN] setAuthor error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async getInfo(req) {
    try {
      const userId = req.user?.userId || req.params?.userId;
      const accounts = await SocialAccount.find({ userId, platform: 'linkedin' }).sort({ createdAt: 1 });

      return {
        status: 200,
        json: {
          success: true,
          connected: accounts.some((a) => a.isActive),
          accounts: accounts.map((a) => this.publicAccount(a)),
        },
      };
    } catch (error) {
      console.error('❌ [LINKEDIN] getInfo error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async disconnect(req) {
    try {
      const userId = req.user?.userId || req.params?.userId;
      const { accountId } = req.body || {};

      const query = { userId, platform: 'linkedin' };
      if (accountId) query.accountId = accountId;

      const result = await SocialAccount.deleteMany(query);
      console.log(`🔌 [LINKEDIN] Disconnected ${result.deletedCount} account(s) for ${userId}`);

      return { status: 200, json: { success: true, disconnected: result.deletedCount } };
    } catch (error) {
      console.error('❌ [LINKEDIN] disconnect error:', error.message);
      return { status: 500, json: { error: error.message } };
    }
  }

  async refreshTokenEndpoint(req) {
    try {
      const userId = req.user?.userId || req.body?.userId;
      const { accountId } = req.body || {};

      let account = await this.resolveAccount(userId, accountId);
      // Force a refresh regardless of the window when asked explicitly.
      account.tokenExpiresAt = new Date(Date.now() + 1000);
      account = await this.ensureFreshToken(account);

      return { status: 200, json: { success: true, account: this.publicAccount(account) } };
    } catch (error) {
      console.error('❌ [LINKEDIN] refreshToken error:', error.message);
      return { status: 400, json: { error: error.message, code: error.code } };
    }
  }

  /**
   * Never return tokens to the client.
   */
  publicAccount(account) {
    return {
      accountId: account.accountId,
      platform: account.platform,
      platformUserId: account.platformUserId,
      name: account.platformUsername,
      profilePictureUrl: account.profilePictureUrl,
      authorUrn: account.authorUrn,
      authorType: account.authorType,
      scopes: account.scopes,
      isActive: account.isActive,
      tokenExpiresAt: account.tokenExpiresAt,
      canAutoRefresh: Boolean(account.refreshToken),
      connectionError: account.connectionError,
      connectedAt: account.createdAt,
    };
  }
}

module.exports = LinkedInController;
