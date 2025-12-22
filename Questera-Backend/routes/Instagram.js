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

    // Find all user's Instagram connections
    const instagramDocs = await Instagram.find({ userId, isConnected: true });

    if (!instagramDocs || instagramDocs.length === 0) {
      return res.status(200).json({
        success: true,
        pages: [],
        message: 'No connected account found'
      });
    }

    // Collect all Facebook Pages from connected accounts
    const pagesMap = new Map();

    for (const doc of instagramDocs) {
      // Check accounts array first (multi-account)
      if (doc.accounts && doc.accounts.length > 0) {
        for (const account of doc.accounts) {
          if (account.facebookPageId && account.isConnected !== false) {
            // Try to get page details from Facebook Graph API
            let pageDetails = {
              id: account.facebookPageId,
              name: account.facebookPageName || 'Facebook Page',
              picture: null,
              category: null,
              fanCount: 0,
              hasInstagram: true,
              instagramId: account.instagramBusinessAccountId,
              instagramUsername: account.instagramUsername,
            };

            // Fetch additional page details if we have access token
            if (account.accessToken) {
              try {
                const pageResponse = await fetch(
                  `https://graph.facebook.com/v21.0/${account.facebookPageId}?fields=id,name,picture,category,fan_count&access_token=${account.accessToken}`
                );
                const pageData = await pageResponse.json();
                if (!pageData.error) {
                  pageDetails.name = pageData.name || pageDetails.name;
                  pageDetails.picture = pageData.picture?.data?.url || null;
                  pageDetails.category = pageData.category || null;
                  pageDetails.fanCount = pageData.fan_count || 0;
                }
              } catch (e) {
                console.log('[INSTAGRAM] Could not fetch page details:', e.message);
              }
            }

            pagesMap.set(account.facebookPageId, pageDetails);
          }
        }
      }

      // Also check single account fields (backward compatibility)
      if (doc.facebookPageId && !pagesMap.has(doc.facebookPageId)) {
        let pageDetails = {
          id: doc.facebookPageId,
          name: doc.facebookPageName || 'Facebook Page',
          picture: null,
          category: null,
          fanCount: 0,
          hasInstagram: true,
          instagramId: doc.instagramBusinessAccountId,
          instagramUsername: doc.instagramUsername,
        };

        if (doc.accessToken) {
          try {
            const pageResponse = await fetch(
              `https://graph.facebook.com/v21.0/${doc.facebookPageId}?fields=id,name,picture,category,fan_count&access_token=${doc.accessToken}`
            );
            const pageData = await pageResponse.json();
            if (!pageData.error) {
              pageDetails.name = pageData.name || pageDetails.name;
              pageDetails.picture = pageData.picture?.data?.url || null;
              pageDetails.category = pageData.category || null;
              pageDetails.fanCount = pageData.fan_count || 0;
            }
          } catch (e) {
            console.log('[INSTAGRAM] Could not fetch page details:', e.message);
          }
        }

        pagesMap.set(doc.facebookPageId, pageDetails);
      }
    }

    const pages = Array.from(pagesMap.values());

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