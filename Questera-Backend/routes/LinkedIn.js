const express = require('express');
const linkedinRouter = express.Router();
const authMiddleware = require('../middlewares/auth');
const LinkedInController = require('../functions/LinkedIn');
const LinkedInPublisher = require('../functions/LinkedInPublisher');

const linkedinController = new LinkedInController();
const linkedinPublisher = new LinkedInPublisher(linkedinController);

// Every LinkedIn route is authenticated and derives userId from the JWT.
// These endpoints mint and spend OAuth tokens that can post to a real
// professional account - they must not trust a client-supplied userId the way
// the older /api/instagram routes do.
linkedinRouter.use(authMiddleware);

/**
 * Wrap a controller method that returns { status, json }.
 */
const handle = (fn) => async (req, res) => {
  try {
    const { status, json } = await fn(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('❌ [LINKEDIN ROUTE]', error);
    return res.status(500).json({ error: error.message });
  }
};

// --- Connection -------------------------------------------------------------

// Start the OAuth flow
linkedinRouter.get('/oauth-url', handle((req) => linkedinController.getOAuthUrl(req)));

// Finish the OAuth flow (called by the frontend callback page)
linkedinRouter.post('/callback', handle((req) => linkedinController.handleCallback(req)));

// Connected account(s) for the signed-in user
linkedinRouter.get('/info', handle((req) => linkedinController.getInfo(req)));

// Company pages the member administers (needs Community Management API)
linkedinRouter.get('/organizations', handle((req) => linkedinController.listOrganizations(req)));

// Choose whether posts are authored as the member or as a company page
linkedinRouter.post('/author', handle((req) => linkedinController.setAuthor(req)));

linkedinRouter.post('/disconnect', handle((req) => linkedinController.disconnect(req)));

linkedinRouter.post('/refresh-token', handle((req) => linkedinController.refreshTokenEndpoint(req)));

// --- Publishing -------------------------------------------------------------

/**
 * POST /api/linkedin/publish
 * Direct publish, mainly for testing the pipeline end to end. Scheduled and
 * autopilot posts go through SchedulerController.publishPost instead.
 *
 * body: { postType, caption, imageUrl, imageUrls, videoUrl, title, accountId }
 */
linkedinRouter.post('/publish', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postType, imageUrl, imageUrls, videoUrl } = req.body;
    const body = { ...req.body, userId };

    let result;
    if (postType === 'video' || videoUrl) {
      result = await linkedinPublisher.publishVideo({ body });
    } else if (postType === 'multi_image' || postType === 'carousel' || (imageUrls && imageUrls.length > 1)) {
      result = await linkedinPublisher.publishMultiImage({ body });
    } else if (imageUrl) {
      result = await linkedinPublisher.publishImage({ body });
    } else {
      result = await linkedinPublisher.publishText({ body });
    }

    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('❌ [LINKEDIN ROUTE] publish', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = linkedinRouter;
