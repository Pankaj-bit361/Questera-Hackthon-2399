const express = require('express');
const twitterRouter = express.Router();
const authMiddleware = require('../middlewares/auth');
const TwitterController = require('../functions/Twitter');
const TwitterPublisher = require('../functions/TwitterPublisher');

const twitterController = new TwitterController();
const twitterPublisher = new TwitterPublisher(twitterController);

// Authenticated, userId from the JWT - same reasoning as the LinkedIn router.
twitterRouter.use(authMiddleware);

const handle = (fn) => async (req, res) => {
  try {
    const { status, json } = await fn(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('❌ [TWITTER ROUTE]', error);
    return res.status(500).json({ error: error.message });
  }
};

// --- Connection -------------------------------------------------------------

twitterRouter.get('/oauth-url', handle((req) => twitterController.getOAuthUrl(req)));
twitterRouter.post('/callback', handle((req) => twitterController.handleCallback(req)));
twitterRouter.get('/info', handle((req) => twitterController.getInfo(req)));
twitterRouter.post('/disconnect', handle((req) => twitterController.disconnect(req)));
twitterRouter.post('/refresh-token', handle((req) => twitterController.refreshTokenEndpoint(req)));

// --- Publishing -------------------------------------------------------------

/**
 * POST /api/twitter/publish
 * Direct publish, mainly for testing the pipeline. Scheduled and autopilot
 * posts go through SchedulerController.publishPost instead.
 *
 * body: { postType, caption, threadParts, imageUrl, imageUrls, videoUrl, accountId }
 */
twitterRouter.post('/publish', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postType, imageUrl, imageUrls, videoUrl, threadParts } = req.body;
    const body = { ...req.body, userId };

    let result;
    if (postType === 'thread' || threadParts?.length > 1) {
      result = await twitterPublisher.publishThread({ body });
    } else if (postType === 'video' || videoUrl) {
      result = await twitterPublisher.publishVideo({ body });
    } else if (postType === 'multi_image' || imageUrls?.length > 1) {
      result = await twitterPublisher.publishMultiImage({ body });
    } else if (imageUrl) {
      result = await twitterPublisher.publishImage({ body });
    } else {
      result = await twitterPublisher.publishText({ body });
    }

    return res.status(result.status).json(result.json);
  } catch (error) {
    console.error('❌ [TWITTER ROUTE] publish', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = twitterRouter;
