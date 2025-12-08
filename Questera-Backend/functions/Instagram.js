const Instagram = require('../models/instagram');

class InstagramController {
  constructor() {
    this.appId = process.env.INSTAGRAM_APP_ID;
    this.appSecret = process.env.INSTAGRAM_APP_SECRET;
    this.redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
    this.apiVersion = 'v20.0';
  }

  /**
   * Get OAuth URL for user to connect Instagram
   */
  getOAuthUrl(req, res) {
    try {
      const state = Math.random().toString(36).substring(7);
      const scope = 'instagram_basic,instagram_content_publish,pages_show_list,instagram_manage_comments,pages_read_engagement,pages_manage_posts';
      
      const oauthUrl = `https://www.facebook.com/${this.apiVersion}/dialog/oauth?` +
        `client_id=${this.appId}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&response_type=code` +
        `&state=${state}`;

      return { status: 200, json: { success: true, oauthUrl, state } };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error generating OAuth URL:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Handle OAuth callback and exchange code for token
   */
  async handleCallback(req, res) {
    try {
      const { code, state, userId } = req.body;

      if (!code || !userId) {
        return { status: 400, json: { error: 'Code and userId are required' } };
      }

      console.log('🔐 [INSTAGRAM] Exchanging code for access token...');

      // Step 1: Exchange code for short-lived access token
      const tokenResponse = await fetch('https://graph.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.appId,
          client_secret: this.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error('❌ [INSTAGRAM] Token exchange failed:', tokenData);
        return { status: 400, json: { error: 'Failed to get access token' } };
      }

      console.log('✅ [INSTAGRAM] Got short-lived access token');

      // Step 2: Exchange for long-lived token
      const longLivedResponse = await fetch(
        `https://graph.instagram.com/${this.apiVersion}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${this.appId}` +
        `&client_secret=${this.appSecret}` +
        `&access_token=${tokenData.access_token}`
      );

      const longLivedData = await longLivedResponse.json();
      const accessToken = longLivedData.access_token || tokenData.access_token;

      console.log('✅ [INSTAGRAM] Got long-lived access token');

      // Step 3: Get user info and page/IG account IDs
      const userResponse = await fetch(
        `https://graph.instagram.com/me?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
      );

      const userData = await userResponse.json();

      if (!userData.id) {
        return { status: 400, json: { error: 'Failed to get user info' } };
      }

      console.log('✅ [INSTAGRAM] Got user info:', userData.username);

      // Step 4: Get Instagram Business Account ID from Page
      const pageResponse = await fetch(
        `https://graph.instagram.com/${userData.id}?fields=instagram_business_account&access_token=${accessToken}`
      );

      const pageData = await pageResponse.json();
      const igBusinessAccountId = pageData.instagram_business_account?.id;

      if (!igBusinessAccountId) {
        return { status: 400, json: { error: 'No Instagram Business Account found' } };
      }

      console.log('✅ [INSTAGRAM] Got IG Business Account ID:', igBusinessAccountId);

      // Step 5: Save to database
      const instagram = await Instagram.findOneAndUpdate(
        { userId },
        {
          userId,
          instagramBusinessAccountId: igBusinessAccountId,
          facebookPageId: userData.id,
          accessToken,
          instagramUsername: userData.username,
          instagramName: userData.name,
          profilePictureUrl: userData.profile_picture_url,
          isConnected: true,
          lastTokenRefresh: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log('✅ [INSTAGRAM] Instagram account connected for user:', userId);

      return {
        status: 200,
        json: {
          success: true,
          message: 'Instagram connected successfully',
          instagram: {
            username: instagram.instagramUsername,
            name: instagram.instagramName,
            profilePictureUrl: instagram.profilePictureUrl,
          },
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error in callback:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Get connected Instagram account info
   */
  async getInstagramInfo(req, res) {
    try {
      const { userId } = req.params;

      const instagram = await Instagram.findOne({ userId });

      if (!instagram) {
        return { status: 404, json: { error: 'Instagram account not connected' } };
      }

      return {
        status: 200,
        json: {
          success: true,
          instagram: {
            username: instagram.instagramUsername,
            name: instagram.instagramName,
            profilePictureUrl: instagram.profilePictureUrl,
            isConnected: instagram.isConnected,
            connectedAt: instagram.connectedAt,
          },
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error getting info:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Disconnect Instagram account
   */
  async disconnectInstagram(req, res) {
    try {
      const { userId } = req.params;

      await Instagram.findOneAndUpdate(
        { userId },
        { isConnected: false }
      );

      console.log('✅ [INSTAGRAM] Account disconnected for user:', userId);

      return { status: 200, json: { success: true, message: 'Instagram disconnected' } };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error disconnecting:', error);
      return { status: 500, json: { error: error.message } };
    }
  }
}

module.exports = InstagramController;

