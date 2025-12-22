const express = require('express');
const instagramRouter = express.Router();
const InstagramController = require('../functions/Instagram');
const instagramController = new InstagramController();
const Instagram = require('../models/instagram');

// Get OAuth URL
instagramRouter.get('/oauth-url', (req, res) => {
  try {
    const { status, json } = instagramController.getOAuthUrl(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
instagramRouter.post('/callback', async (req, res) => {
  try {
    const { status, json } = await instagramController.handleCallback(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Get Instagram account info
instagramRouter.get('/info/:userId', async (req, res) => {
  try {
    const { status, json } = await instagramController.getInstagramInfo(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Disconnect Instagram account
instagramRouter.post('/disconnect/:userId', async (req, res) => {
  try {
    const { status, json } = await instagramController.disconnectInstagram(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Publish image to Instagram
instagramRouter.post('/publish', async (req, res) => {
  try {
    const { status, json } = await instagramController.publishImage(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Refresh access token
instagramRouter.post('/refresh-token', async (req, res) => {
  try {
    const { status, json } = await instagramController.refreshToken(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Publish Story to Instagram
instagramRouter.post('/publish-story', async (req, res) => {
  try {
    const { status, json } = await instagramController.publishStory(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /instagram/facebook-pages/:userId
 * Get Facebook Pages the user manages (for Meta App Review - pages_show_list)
 */
instagramRouter.get('/facebook-pages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user's Instagram connection to get access token
    const instagramDoc = await Instagram.findOne({ userId, isConnected: true });

    if (!instagramDoc) {
      return res.status(200).json({
        success: true,
        pages: [],
        message: 'No connected account found'
      });
    }

    // Get access token from main doc or first account
    let accessToken = instagramDoc.accessToken;
    if (!accessToken && instagramDoc.accounts?.length > 0) {
      accessToken = instagramDoc.accounts[0].accessToken;
    }

    if (!accessToken) {
      return res.status(200).json({
        success: true,
        pages: [],
        message: 'No access token available'
      });
    }

    // Fetch Facebook Pages from Meta Graph API
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture,category,fan_count,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('[INSTAGRAM] Facebook Pages API error:', pagesData.error);
      return res.status(400).json({ error: pagesData.error.message });
    }

    // Format pages for frontend
    const pages = (pagesData.data || []).map(page => ({
      id: page.id,
      name: page.name,
      picture: page.picture?.data?.url || null,
      category: page.category,
      fanCount: page.fan_count || 0,
      hasInstagram: !!page.instagram_business_account,
      instagramId: page.instagram_business_account?.id || null,
    }));

    return res.status(200).json({
      success: true,
      pages,
      totalPages: pages.length,
    });
  } catch (error) {
    console.error('[INSTAGRAM] Facebook Pages Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = instagramRouter;