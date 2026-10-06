const express = require('express');
const { selfParam, ownedParam } = require('../middlewares/auth');
const autopilotRouter = express.Router();
const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');
const AutopilotService = require('../functions/AutopilotService');
const ScheduledPost = require('../models/scheduledPost');
const ContentJob = require('../models/contentJob');
const AutopilotTask = require('../models/autopilotTask');
const ImageOrchestrator = require('../functions/ImageOrchestrator');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { ensureCredits, deductCreditsSafe } = require('../functions/sharedHelpers');
const TrustLadder = require('../functions/TrustLadder');

const autopilotService = new AutopilotService();

// A chat runs one autopilot per platform. Every config route therefore needs a
// platform to identify which one it means; it comes from the query string on
// reads and the body on writes, defaulting to Instagram so older callers that
// predate the split keep working.
const Autopilot = require('../models/autopilot');

// The caller's own records only (middlewares/auth.js).
autopilotRouter.param('userId', selfParam);
autopilotRouter.param('postId', ownedParam(ScheduledPost, 'postId'));
autopilotRouter.param('taskId', ownedParam(AutopilotTask, 'taskId'));
autopilotRouter.param('autopilotId', ownedParam(Autopilot, 'autopilotId'));

const SUPPORTED_PLATFORMS = ['instagram', 'linkedin', 'twitter'];

/**
 * Which autopilot a request is about. Explicit `autopilotId` (query or body)
 * must belong to the user; without one, the user's oldest autopilot is used,
 * created on the spot if they have none - so callers that predate multiple
 * autopilots keep working.
 */
const resolveAutopilot = async (userId, req) => {
  const wanted = req.query?.autopilotId || req.body?.autopilotId;
  if (wanted) {
    const ap = await Autopilot.findOne({ autopilotId: wanted, userId, archived: false });
    if (!ap) {
      const err = new Error('Autopilot not found');
      err.statusCode = 404;
      throw err;
    }
    return ap.autopilotId;
  }
  let ap = await Autopilot.findOne({ userId, archived: false }).sort({ createdAt: 1 });
  if (!ap) {
    // Atomic: the partial unique index on {userId, isDefault} means parallel
    // first requests all land on the same document.
    ap = await Autopilot.findOneAndUpdate(
      { userId, isDefault: true },
      { $setOnInsert: { userId, isDefault: true, name: 'My autopilot', archived: false } },
      { upsert: true, new: true }
    );
  }
  return ap.autopilotId;
};
const resolvePlatform = (req) => {
  const p = (req.query?.platform || req.body?.platform || 'instagram').toLowerCase();
  return SUPPORTED_PLATFORMS.includes(p) ? p : 'instagram';
};

// Sensible starting point for a platform that has no config saved yet, so the
// UI can render all three cards whether or not they have been set up.
const defaultConfigFor = (platform) => ({
  enabled: false,
  platform,
  dailyRunTime: platform === 'linkedin' ? '08:00' : '09:00',
  limits: {
    // X rewards more frequency than the others; LinkedIn punishes it.
    maxFeedPostsPerDay: platform === 'twitter' ? 2 : 1,
    maxStoriesPerDay: platform === 'instagram' ? 2 : 0,
    maxRepliesPerHour: 5,
  },
  permissions: {
    autoPost: true,
    autoStory: platform === 'instagram' ? false : false,
    autoReplyComments: false,
    autoDMs: false,
    requireApproval: false,
    autoPublishMinScore: 75,
  },
  quietHours: { enabled: true, start: '22:00', end: '07:00', timezone: 'Asia/Kolkata' },
  contentPreferences: {
    allowedThemes: ['educational', 'behind_the_scenes', 'promotional', 'engagement', 'trending'],
    tone: platform === 'instagram' ? 'friendly' : 'professional',
  },
});
const imageOrchestrator = new ImageOrchestrator();

// S3 client for image uploads
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const bucketName = process.env.AWS_S3_BUCKET_NAME;

// Helper to upload base64 image to S3
async function uploadToS3(base64Data, mimeType, folder = 'autopilot') {
  const extension = mimeType?.split('/')[1] || 'png';
  const fileName = `${folder}/${uuidv4()}.${extension}`;
  const buffer = Buffer.from(base64Data, 'base64');

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  }));

  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

/**
 * GET /autopilot/config/:userId
 * Get autopilot configuration for a chat
 */
autopilotRouter.get('/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const platform = resolvePlatform(req);

    const config = await AutopilotConfig.findOne({ autopilotId, platform });

    if (!config) {
      return res.status(200).json({
        success: true,
        config: defaultConfigFor(platform),
        exists: false,
      });
    }

    return res.status(200).json({ success: true, config, exists: true });
  } catch (error) {
    console.error('[AUTOPILOT] Config Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/config/:userId
 * Create or update autopilot configuration
 */
autopilotRouter.post('/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { enabled, limits, permissions, quietHours, contentPreferences, dailyRunTime } = req.body;
    const platform = resolvePlatform(req);

    let config = await AutopilotConfig.findOne({ autopilotId, platform });

    if (!config) {
      // Seed from this platform's defaults rather than the schema's, so a new
      // X autopilot starts at 2 posts/day and a LinkedIn one at 1.
      config = new AutopilotConfig({ ...defaultConfigFor(platform), userId, autopilotId, platform });
    }

    // Update fields
    if (enabled === true && !config.enabled) {
      const on = await AutopilotConfig.countDocuments({ userId, enabled: true });
      await require('../functions/Plans').assertPlatforms(userId, on);
    }
    if (enabled !== undefined) config.enabled = enabled;
    if (dailyRunTime) config.dailyRunTime = dailyRunTime;
    if (limits) {
      config.limits = { ...config.limits, ...limits };
    }
    if (permissions) {
      config.permissions = { ...config.permissions, ...permissions };
      // Never allow autoDMs without explicit permission
      config.permissions.autoDMs = false;
    }
    if (quietHours) {
      config.quietHours = { ...config.quietHours, ...quietHours };
    }
    if (contentPreferences) {
      config.contentPreferences = { ...config.contentPreferences, ...contentPreferences };
    }

    // Keep the cron's schedule in step with the run time / timezone, and give
    // a newly enabled config a nextRunAt so it is picked up.
    if (config.enabled && (!config.nextRunAt || dailyRunTime || quietHours?.timezone)) {
      config.scheduleNextRun();
    }

    await config.save();
    await require('../functions/TaskRunner').syncDailyPlan(config);

    // Create memory if doesn't exist
    let memory = await AutopilotMemory.findOne({ autopilotId });
    if (!memory) {
      memory = new AutopilotMemory({ userId, autopilotId });
      await memory.save();
    }

    return res.status(200).json({
      success: true,
      message: config.enabled ? 'Autopilot enabled' : 'Autopilot configuration saved',
      config,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Save Config Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/toggle/:userId
 * Quick toggle autopilot on/off
 */
autopilotRouter.post('/toggle/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    let config = await AutopilotConfig.findOne({ autopilotId, platform: resolvePlatform(req) });

    if (!config) {
      config = new AutopilotConfig({ userId, autopilotId, platform: resolvePlatform(req), enabled: true });
    } else {
      config.enabled = !config.enabled;
    }
    if (config.enabled) {
      const on = await AutopilotConfig.countDocuments({ userId, enabled: true, _id: { $ne: config._id } });
      await require('../functions/Plans').assertPlatforms(userId, on);
    }

    // Enabling schedules the first run; disabling clears it so a re-enable
    // does not immediately fire against a stale timestamp.
    if (config.enabled) config.scheduleNextRun();
    else config.nextRunAt = null;

    await config.save();
    await require('../functions/TaskRunner').syncDailyPlan(config);

    return res.status(200).json({
      success: true,
      enabled: config.enabled,
      message: config.enabled ? 'Autopilot enabled' : 'Autopilot disabled',
    });
  } catch (error) {
    console.error('[AUTOPILOT] Toggle Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/pause/:userId
 * Pause autopilot for specified hours
 */
autopilotRouter.post('/pause/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { hours = 24 } = req.body;

    const config = await AutopilotConfig.findOne({ autopilotId, platform: resolvePlatform(req) });

    if (!config) {
      return res.status(404).json({ error: 'Autopilot not configured for this chat' });
    }

    config.pausedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await config.save();

    return res.status(200).json({
      success: true,
      message: `Autopilot paused for ${hours} hours`,
      pausedUntil: config.pausedUntil,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Pause Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/resume/:userId
 * Resume paused autopilot
 */
autopilotRouter.post('/resume/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const config = await AutopilotConfig.findOne({ autopilotId, platform: resolvePlatform(req) });

    if (!config) {
      return res.status(404).json({ error: 'Autopilot not configured' });
    }

    const wasPaused = config.pausedUntil && config.pausedUntil > new Date();
    config.pausedUntil = null;
    await config.save();
    if (wasPaused) {
      await require('../models/autopilotEvent').create({ userId, autopilotId, platform: config.platform, action: 'resumed', reason: 'You resumed it' });
    }

    return res.status(200).json({ success: true, message: 'Autopilot resumed' });
  } catch (error) {
    console.error('[AUTOPILOT] Resume Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/memory/:userId
 * Get autopilot memory (performance insights, history)
 */
autopilotRouter.get('/memory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const memory = await AutopilotMemory.findOne({ autopilotId });

    if (!memory) {
      return res.status(200).json({ success: true, memory: null, exists: false });
    }

    return res.status(200).json({ success: true, memory, exists: true });
  } catch (error) {
    console.error('[AUTOPILOT] Memory Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * PUT /autopilot/memory/:userId
 * Update autopilot memory (brand info)
 */
autopilotRouter.put('/memory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { brand } = req.body;

    let memory = await AutopilotMemory.findOne({ autopilotId });

    if (!memory) {
      memory = new AutopilotMemory({ userId, autopilotId });
    }

    // Update brand info
    if (brand) {
      if (brand.niche || brand.topics || brand.topicsAllowed) {
        const topics = brand.topicsAllowed || brand.topics || brand.niche;
        memory.brand.topicsAllowed = Array.isArray(topics)
          ? topics
          : topics.split(',').map(t => t.trim());
      }
      if (brand.targetAudience) {
        memory.brand.targetAudience = brand.targetAudience;
      }
      if (brand.visualStyle) {
        memory.brand.visualStyle = brand.visualStyle;
      }
      if (brand.tone) {
        memory.brand.tone = brand.tone;
      }
      if (brand.uniqueSellingPoints) {
        memory.brand.uniqueSellingPoints = Array.isArray(brand.uniqueSellingPoints)
          ? brand.uniqueSellingPoints
          : [brand.uniqueSellingPoints];
      }
    }

    await memory.save();

    // Brand is complete if we have the 3 required fields (topics is optional)
    const brandComplete = !!(
      memory.brand.targetAudience?.trim() &&
      memory.brand.visualStyle?.trim() &&
      memory.brand.tone?.trim()
    );

    console.log('[AUTOPILOT] Brand saved:', {
      topics: memory.brand.topicsAllowed,
      targetAudience: !!memory.brand.targetAudience,
      visualStyle: !!memory.brand.visualStyle,
      tone: !!memory.brand.tone,
      brandComplete
    });

    return res.status(200).json({
      success: true,
      memory,
      brandComplete,
      message: brandComplete
        ? 'Brand info saved successfully! Autopilot is ready to run.'
        : 'Brand info partially saved. Please complete all required fields.',
    });
  } catch (error) {
    console.error('[AUTOPILOT] Update Memory Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/status/:userId
 * Get full autopilot status (config + memory + last run)
 */
autopilotRouter.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const config = await AutopilotConfig.findOne({ autopilotId, platform: resolvePlatform(req) });
    const memory = await AutopilotMemory.findOne({ autopilotId });

    // Check if brand info is complete
    const brandComplete = !!(
      memory?.brand?.targetAudience?.trim() &&
      memory?.brand?.visualStyle?.trim() &&
      memory?.brand?.tone?.trim()
    );

    return res.status(200).json({
      success: true,
      status: {
        configured: !!config,
        enabled: config?.enabled || false,
        paused: config?.pausedUntil ? new Date() < config.pausedUntil : false,
        pausedUntil: config?.pausedUntil,
        lastRunAt: config?.lastRunAt,
        lastRunResult: config?.lastRunResult,
        lastRunSummary: config?.lastRunSummary,
        lastDecision: memory?.lastDecisionSummary,
        totalPostsGenerated: memory?.totalPostsGenerated || 0,
        totalStoriesGenerated: memory?.totalStoriesGenerated || 0,
      },
      memory: memory || null,
      brandComplete,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Status Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/run/:userId
 * Manually trigger autopilot for a chat (for testing)
 */
autopilotRouter.post('/run/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const config = await AutopilotConfig.findOne({ autopilotId, platform: resolvePlatform(req) });

    if (!config) {
      return res.status(404).json({ error: 'Autopilot not configured' });
    }

    // Force enable for this run
    const wasEnabled = config.enabled;
    config.enabled = true;

    const result = await autopilotService.runForChat(config, { force: true });

    // Restore original state
    config.enabled = wasEnabled;
    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Autopilot run complete',
      result,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Manual Run Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/crawl/:userId
 * Read the company's website and build the shared brand profile from it,
 * instead of making the user type it all in.
 *
 * body: { url, overwrite? }
 */
autopilotRouter.post('/crawl/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { url, overwrite = true } = req.body || {};

    if (!url) return res.status(400).json({ error: 'url is required' });

    const BrandCrawler = require('../functions/BrandCrawler');
    const result = await new BrandCrawler().crawl(url);

    if (!result.success) {
      return res.status(422).json({ success: false, error: result.error });
    }

    const b = result.brand;
    let memory = await AutopilotMemory.findOne({ autopilotId });
    if (!memory) memory = new AutopilotMemory({ userId, autopilotId });

    // Preserve anything the user typed by hand unless they asked to overwrite.
    const keep = (existing, incoming) =>
      overwrite ? (incoming ?? existing) : (existing || incoming);

    memory.brand = {
      ...(memory.brand?.toObject?.() || memory.brand || {}),
      companyName: keep(memory.brand?.companyName, b.companyName),
      oneLiner: keep(memory.brand?.oneLiner, b.oneLiner),
      topicsAllowed: overwrite ? (b.topicsAllowed || []) : (memory.brand?.topicsAllowed?.length ? memory.brand.topicsAllowed : b.topicsAllowed || []),
      targetAudience: keep(memory.brand?.targetAudience, b.targetAudience),
      visualStyle: keep(memory.brand?.visualStyle, b.visualStyle),
      tone: keep(memory.brand?.tone, b.tone),
      uniqueSellingPoints: overwrite ? (b.uniqueSellingPoints || []) : memory.brand?.uniqueSellingPoints,
      proofPoints: b.proofPoints || [],
      contentAngles: b.contentAngles || [],
    };

    memory.website = {
      url: result.website,
      pagesRead: result.pages,
      lastCrawledAt: new Date(),
      confidence: b.confidence || 'medium',
    };

    await memory.save();

    console.log(`🕷️  [AUTOPILOT] Brand profile built for ${userId} from ${result.website}`);

    // The full read - 30-100 facts with their pages - takes a minute; it continues after this answer and repeats weekly.
    const SiteFacts = require('../functions/SiteFacts');
    (async () => {
      const fresh = await AutopilotMemory.findById(memory._id);
      fresh.website.factsRefreshedAt = null; // a new site: nothing on it is "new" yet
      fresh.website.pages = [];
      const r = await SiteFacts.refresh(fresh, { captureCopies: await SiteFacts.studioCopies(fresh) });
      await fresh.save();
      console.log(`📚 [FACTS] ${result.website}: ${r.facts.length} facts from ${r.pagesRead} pages`);
    })().catch((err) => console.error('❌ [FACTS] First read failed:', err.message));

    return res.status(200).json({
      success: true,
      website: result.website,
      pagesRead: result.pages,
      brand: memory.brand,
      confidence: b.confidence,
      factsPending: true,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Crawl Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/configs/:userId
 * Every autopilot for a chat - one entry per supported platform, whether or
 * not it has been configured yet, so the UI can render all three cards.
 */
autopilotRouter.get('/configs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const saved = await AutopilotConfig.find({ autopilotId });
    const byPlatform = Object.fromEntries(saved.map((c) => [c.platform, c]));

    const configs = SUPPORTED_PLATFORMS.map((platform) => ({
      platform,
      exists: Boolean(byPlatform[platform]),
      config: byPlatform[platform] || defaultConfigFor(platform),
    }));

    // The brand profile and reference images are shared across all of them.
    const memory = await AutopilotMemory.findOne({ autopilotId });
    const brand = memory?.brand || null;
    const brandComplete = Boolean(
      brand?.targetAudience && brand?.visualStyle && brand?.tone && brand?.topicsAllowed?.length
    );

    const autopilot = await Autopilot.findOne({ autopilotId });

    return res.status(200).json({
      success: true,
      autopilot,
      configs,
      brand,
      brandComplete,
      referenceImages: memory?.referenceImages || {},
      enabledCount: saved.filter((c) => c.enabled).length,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Configs Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/list/:userId
 * List all autopilot configs for a user
 */
autopilotRouter.get('/list/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const configs = await AutopilotConfig.find({ autopilotId });

    return res.status(200).json({
      success: true,
      count: configs.length,
      configs: configs.map(c => ({
        platform: c.platform,
        enabled: c.enabled,
        paused: c.pausedUntil ? new Date() < c.pausedUntil : false,
        lastRunAt: c.lastRunAt,
        lastRunResult: c.lastRunResult,
      })),
    });
  } catch (error) {
    console.error('[AUTOPILOT] List Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/images/:userId
 * Upload reference images (products, style, personal)
 */
autopilotRouter.post('/images/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { images, type = 'product' } = req.body;
    // images: [{ data: base64, mimeType: 'image/png', name?: '', description?: '' }]

    if (!images || !images.length) {
      return res.status(400).json({ error: 'images array is required' });
    }

    let memory = await AutopilotMemory.findOne({ autopilotId });
    if (!memory) {
      memory = new AutopilotMemory({ userId, autopilotId });
    }

    // Initialize referenceImages if not exists
    if (!memory.referenceImages) {
      memory.referenceImages = {
        productImages: [],
        styleReferences: [],
        personalReference: { url: null, uploadedAt: null },
      };
    }

    const uploadedUrls = [];

    for (const img of images) {
      const url = await uploadToS3(img.data, img.mimeType, `autopilot/${type}`);
      uploadedUrls.push(url);

      if (type === 'product') {
        memory.referenceImages.productImages.push({
          url,
          name: img.name || '',
          description: img.description || '',
          uploadedAt: new Date(),
        });
      } else if (type === 'style') {
        memory.referenceImages.styleReferences.push({
          url,
          name: img.name || '',
          uploadedAt: new Date(),
        });
      } else if (type === 'personal') {
        // Personal reference is single image, replace existing
        memory.referenceImages.personalReference = {
          url,
          uploadedAt: new Date(),
        };
      }
    }

    await memory.save();

    return res.status(200).json({
      success: true,
      message: `${uploadedUrls.length} image(s) uploaded successfully`,
      urls: uploadedUrls,
      referenceImages: memory.referenceImages,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Image Upload Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * DELETE /autopilot/images/:userId
 * Delete a reference image
 */
autopilotRouter.delete('/images/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { type, url } = req.body;

    const memory = await AutopilotMemory.findOne({ autopilotId });
    if (!memory || !memory.referenceImages) {
      return res.status(404).json({ error: 'No reference images found' });
    }

    if (type === 'product') {
      memory.referenceImages.productImages = memory.referenceImages.productImages.filter(
        img => img.url !== url
      );
    } else if (type === 'style') {
      memory.referenceImages.styleReferences = memory.referenceImages.styleReferences.filter(
        img => img.url !== url
      );
    } else if (type === 'personal') {
      memory.referenceImages.personalReference = { url: null, uploadedAt: null };
    }

    await memory.save();

    return res.status(200).json({
      success: true,
      message: 'Image deleted',
      referenceImages: memory.referenceImages,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Image Delete Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/images/:userId
 * Get all reference images
 */
autopilotRouter.get('/images/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);

    const memory = await AutopilotMemory.findOne({ autopilotId });

    if (!memory || !memory.referenceImages) {
      return res.status(200).json({
        success: true,
        referenceImages: {
          productImages: [],
          styleReferences: [],
          personalReference: { url: null },
        },
      });
    }

    return res.status(200).json({
      success: true,
      referenceImages: memory.referenceImages,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Get Images Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});


/* ------------------------------------------------------------------------- *
 * Approval queue
 *
 * Autopilot writes posts with status 'pending_approval'. ScheduledPost's
 * findDuePosts() only ever selects status 'scheduled', so a pending post is
 * held out of the publishing cron by construction until it is approved here.
 * ------------------------------------------------------------------------- */

/**
 * GET /autopilot/queue/:userId
 * Posts waiting for review. Optional ?chatId= and ?platform= filters.
 */
autopilotRouter.get('/queue/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { chatId, platform, limit } = req.query;

    // Default is the approval queue; ?status=scheduled lists what is already
    // approved (or auto-approved) and waiting for its slot.
    const status = req.query.status === 'scheduled' ? 'scheduled' : 'pending_approval';
    const query = { userId, status, ...(status === 'scheduled' ? { source: 'autopilot' } : {}) };
    if (req.query.autopilotId) query.autopilotId = autopilotId;
    if (chatId) query.imageChatId = chatId;
    if (platform) query.platform = platform;

    const posts = await ScheduledPost.find(query)
      .sort({ scheduledAt: 1 })
      .limit(Math.min(Number(limit) || 50, 100));

    return res.status(200).json({
      success: true,
      count: posts.length,
      posts: posts.map((p) => ({
        postId: p.postId,
        platform: p.platform,
        postType: p.postType,
        imageUrl: p.imageUrl,
        imageUrls: p.imageUrls,
        videoUrl: p.videoUrl,
        caption: p.caption,
        hashtags: p.hashtags,
        // Without this the reviewer only ever sees the opening post of a
        // thread, and would be approving content they cannot read.
        threadParts: p.threadParts,
        review: p.review,
        status: p.status,
        fullCaption: p.fullCaption,
        scheduledAt: p.scheduledAt,
        source: p.source,
        contentJobId: p.contentJobId,
        createdAt: p.createdAt,
        // Set while an autopilot post waits out its hold: it publishes on its own then unless rejected.
        autoApproveAt: p.autoApproveAt,
        approvedBy: p.approvedBy,
      })),
    });
  } catch (error) {
    console.error('[AUTOPILOT] Queue Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * PUT /autopilot/queue/:postId
 * Edit a pending post before approving it.
 */
autopilotRouter.put('/queue/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { caption, hashtags, scheduledAt, imageUrl, imageUrls, postType, threadParts } = req.body;

    const post = await ScheduledPost.findOne({ postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'pending_approval') {
      return res.status(409).json({ error: `Post is ${post.status}, not pending approval` });
    }

    if (caption !== undefined) post.caption = caption;
    if (hashtags !== undefined) post.hashtags = hashtags;
    if (threadParts !== undefined) {
      post.threadParts = threadParts;
      // Keep the opener mirrored into `caption` so calendar and list views,
      // which only read `caption`, stay in sync with the edited thread.
      if (threadParts.length) post.caption = threadParts[0];
    }
    if (imageUrl !== undefined) post.imageUrl = imageUrl;
    if (imageUrls !== undefined) post.imageUrls = imageUrls;
    if (postType !== undefined) post.postType = postType;
    if (scheduledAt !== undefined) {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ error: 'scheduledAt is not a valid date' });
      }
      post.scheduledAt = when;
    }

    await post.save();
    return res.status(200).json({ success: true, post });
  } catch (error) {
    console.error('[AUTOPILOT] Queue Edit Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/queue/:postId/approve
 * Release a post to the publishing cron.
 */
autopilotRouter.post('/queue/:postId/approve', async (req, res) => {
  try {
    const { scheduledAt } = req.body || {};
    if (scheduledAt && Number.isNaN(new Date(scheduledAt).getTime())) {
      return res.status(400).json({ error: 'scheduledAt is not a valid date' });
    }
    const post = await TrustLadder.approve(req.params.postId, { by: 'user', scheduledAt });
    if (!post) {
      const current = await ScheduledPost.findOne({ postId: req.params.postId }).select('status');
      return res.status(409).json({ error: `Post is ${current?.status || 'gone'}, not pending approval` });
    }
    console.log(`✅ [AUTOPILOT] Post ${post.postId} approved for ${post.scheduledAt.toISOString()}`);
    const config = post.source === 'autopilot' ? await TrustLadder.configFor(post) : null;
    return res.status(200).json({ success: true, post, trust: config ? await TrustLadder.summary(config) : null });
  } catch (error) {
    console.error('[AUTOPILOT] Queue Approve Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/queue/:postId/reject
 */
autopilotRouter.post('/queue/:postId/reject', async (req, res) => {
  try {
    const { reason, note } = req.body || {};
    const post = await TrustLadder.reject(req.params.postId, { reason, note });
    if (!post) {
      const current = await ScheduledPost.findOne({ postId: req.params.postId }).select('status');
      return res.status(409).json({ error: `Post is ${current?.status || 'gone'}, so it cannot be rejected` });
    }
    const config = post.source === 'autopilot' ? await TrustLadder.configFor(post) : null;
    return res.status(200).json({ success: true, post, trust: config ? await TrustLadder.summary(config) : null });
  } catch (error) {
    console.error('[AUTOPILOT] Queue Reject Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/queue/:postId/publish-now
 * Publish this post immediately - whether it is waiting for approval, already
 * scheduled for later, or failed. Claims the row first so the publishing
 * cron cannot pick it up at the same time, and uses the same publishPost the
 * cron uses so behaviour is identical.
 */
autopilotRouter.post('/queue/:postId/publish-now', async (req, res) => {
  try {
    const { postId } = req.params;
    let before = await ScheduledPost.findOne({ postId }).select('status platform');
    if (!before) return res.status(404).json({ error: 'Post not found' });
    if (!['pending_approval', 'scheduled', 'failed'].includes(before.status)) {
      return res.status(409).json({ error: `Post is already ${before.status}` });
    }
    // Publishing a waiting post is approving it, and counts on the trust ladder like any approval.
    if (before.status === 'pending_approval') {
      before = await TrustLadder.approve(postId, { by: 'user' });
      if (!before) return res.status(409).json({ error: 'Post changed while publishing, try again' });
    }

    // Atomic claim, the same one the publish loop uses, so a cron tick cannot publish it too.
    const { activePause } = require('../functions/AccountHealth');
    const paused = await activePause(req.user.userId, before.platform);
    if (paused) return res.status(409).json({ error: `Posting to ${before.platform} is paused until ${paused.until.toISOString()}: ${paused.reason}` });
    const post = await ScheduledPost.findOneAndUpdate(
      { postId, status: before.status },
      { $set: { status: 'publishing', claimedAt: new Date(), retryCount: 0 } },
      { new: true }
    );
    if (!post) return res.status(409).json({ error: 'Post changed while publishing, try again' });

    const SchedulerController = require('../functions/Scheduler');
    try {
      const result = await new SchedulerController().publishPost(post);
      const fresh = await ScheduledPost.findOne({ postId });
      return res.status(200).json({
        success: true,
        status: fresh.status,
        permalink: fresh.platformPostUrl || result?.json?.permalink || null,
        publishedAt: fresh.publishedAt,
      });
    } catch (err) {
      // Put it back the way it was rather than leaving a claimed row behind, and pause the platform if it blocked us.
      await ScheduledPost.updateOne({ postId }, { $set: { status: before.status, publishError: err.message }, $unset: { claimedAt: 1 } });
      const { pauseForError } = require('../functions/AccountHealth');
      const EmailService = require('../functions/EmailService');
      await pauseForError({ userId: post.userId, platform: post.platform, error: err, emailService: new EmailService() }).catch(() => null);
      console.error(`❌ [AUTOPILOT] Publish now failed for ${postId}:`, err.message);
      return res.status(502).json({ success: false, error: err.message });
    }
  } catch (error) {
    console.error('[AUTOPILOT] Publish now error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/queue/:postId/fix   { instructions? }
 * Let the agent fix a held post itself. It reads the review's issues, then:
 *  - text/thread: rewrites the copy
 *  - image/carousel: rewrites the image prompt and re-renders
 * and re-reviews the result so the new score is shown. Optional free-text
 * instructions from the user are folded in; nothing is asked of them.
 */
autopilotRouter.post('/queue/:postId/fix', async (req, res) => {
  try {
    const { postId } = req.params;
    const { instructions = '' } = req.body || {};
    const post = await ScheduledPost.findOne({ postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!['pending_approval', 'scheduled'].includes(post.status)) return res.status(409).json({ error: `Post is ${post.status}` });
    if (post.videoUrl) return res.status(400).json({ error: 'Video posts cannot be fixed from the queue yet - run the task again instead' });

    const memory = post.autopilotId
      ? await AutopilotMemory.findOne({ autopilotId: post.autopilotId })
      : await AutopilotMemory.findOne({ userId: post.userId });
    const config = post.autopilotId
      ? await AutopilotConfig.findOne({ autopilotId: post.autopilotId, platform: post.platform })
      : null;
    const brand = memory?.brand || {};
    const issues = (post.review?.issues || []).join('; ') || post.review?.verdict || '';
    const { OpenRouterProvider } = require('../agent/LLMProvider');
    const llm = new OpenRouterProvider();

    const isText = post.postType === 'text' || post.postType === 'thread' || (!post.imageUrl && !post.imageUrls?.length);
    let imagePrompt = null;

    if (isText) {
      const PostWriter = require('../functions/PostWriter');
      const rewritten = await new PostWriter().write({
        platform: post.platform,
        format: post.postType === 'thread' ? 'thread' : 'text',
        brand,
        idea: `Rewrite this ${post.platform} post so it no longer has these problems: ${issues || 'weak'}. ${instructions ? `The owner also asks: ${instructions}.` : ''} Keep the topic: "${(post.threadParts?.length ? post.threadParts.join(' ') : post.caption).slice(0, 600)}"`,
        proofPoint: '',
        cta: '',
        hasLink: /https?:\/\//.test(post.caption || ''),
        recentCaptions: [],
      });
      // Keep the link line the original carried, if any.
      const link = (post.caption || '').match(/\n\n[^\n]*https?:\/\/\S+[^\n]*$/)?.[0] || '';
      post.caption = rewritten.caption + (rewritten.threadParts.length > 1 ? '' : link);
      post.hashtags = rewritten.hashtags;
      post.threadParts = rewritten.threadParts.length > 1 ? rewritten.threadParts : [];
    } else {
      const originalJob = post.contentJobId ? await ContentJob.findOne({ jobId: post.contentJobId }) : null;
      const oldPrompt = originalJob?.prompts?.[0] || '';
      const out = await llm.chatJSON([
        { role: 'system', content: 'You rewrite image-generation prompts so the next render fixes what a reviewer flagged. Keep the brand visual style. Be concrete about composition, text (if any - keep it short and spell it out), colours and mood. No screenshots, no real people. Respond ONLY with JSON {"prompt":"..."}' },
        { role: 'user', content: `Brand visual style: ${brand.visualStyle || 'modern'}\nPost caption: ${(post.caption || '').slice(0, 400)}\nPrevious prompt: ${oldPrompt || '(unknown)'}\nReviewer's problems with the previous image: ${issues || 'none recorded - make it stronger and more on-brand'}\n${instructions ? `Owner's instructions: ${instructions}` : ''}\nWrite the improved prompt.` },
      ], { temperature: 0.6, fallback: null });
      imagePrompt = out?.prompt || oldPrompt;
      if (!imagePrompt) return res.status(400).json({ error: 'No prompt available to improve' });

      const imageCount = post.imageUrls?.length > 1 ? post.imageUrls.length : 1;
      const job = await ContentJob.create({
        userId: post.userId,
        type: imageCount > 1 ? 'batch' : 'single',
        status: 'pending',
        userRequest: `Autopilot agent fix: ${postId}`,
        inputBrief: originalJob?.inputBrief,
        prompts: Array.from({ length: imageCount }, () => imagePrompt),
        progress: { total: imageCount, completed: 0, failed: 0 },
      });
      await ensureCredits(post.userId, imageCount); // a user's click, charged like a manual image
      const { results } = await imageOrchestrator.executeJob(job.jobId);
      const urls = (results || []).map((r) => r.url).filter(Boolean);
      if (urls.length === 0) return res.status(500).json({ error: 'Re-render produced no images' });
      post.imageUrl = urls[0];
      if (imageCount > 1) post.imageUrls = urls;
      post.contentJobId = job.jobId;
      await deductCreditsSafe(post.userId, urls.length, job.jobId, `Autopilot fix: ${urls.length} image(s)`);
    }

    // Re-review so the user sees whether the fix worked.
    const AutopilotService = require('../functions/AutopilotService');
    const svc = new AutopilotService();
    const review = await svc.reviewPost(
      { platform: post.platform, autopilotId: post.autopilotId, userId: post.userId },
      memory,
      { postType: post.postType, caption: post.caption, hashtags: post.hashtags, threadParts: post.threadParts, imagePrompt },
      { imageUrls: post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [] }
    );
    if (review) post.review = review;
    // If it now clears the bar and the autopilot has earned trust, it starts the hold (TrustLadder);
    // otherwise it keeps waiting for the user.
    if (post.status === 'pending_approval' && config) {
      const decision = await svc.resolveStatus(config, review);
      post.autoApproveAt = decision.autoApproveAt;
      if (decision.status === 'scheduled') {
        post.status = 'scheduled';
        post.approvedBy = 'autopilot';
        post.approvedAt = new Date();
        if (post.scheduledAt <= new Date()) post.scheduledAt = new Date(Date.now() + 60 * 1000);
      }
    }
    await post.save();

    console.log(`🛠️  [AUTOPILOT] Agent fixed ${postId}: ${isText ? 'rewrote copy' : 're-rendered image'} -> score ${review?.score ?? 'n/a'}`);
    return res.status(200).json({ success: true, post, fixed: isText ? 'copy' : 'image', prompt: imagePrompt, review, nowScheduled: post.status === 'scheduled', autoApproveAt: post.autoApproveAt });
  } catch (error) {
    console.error('[AUTOPILOT] Queue fix error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/queue/:postId/regenerate
 * Re-render the image for a pending post, optionally with an edited prompt.
 */
autopilotRouter.post('/queue/:postId/regenerate', async (req, res) => {
  try {
    const { postId } = req.params;
    const { prompt } = req.body || {};

    const post = await ScheduledPost.findOne({ postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'pending_approval') {
      return res.status(409).json({ error: `Post is ${post.status}, not pending approval` });
    }
    if (post.postType === 'text') {
      return res.status(400).json({ error: 'Text posts have no image to regenerate' });
    }
    if (post.videoUrl) {
      return res.status(400).json({ error: 'Video regeneration is not supported from the queue' });
    }

    // Reuse the original brief and prompt unless the user supplied a new one.
    const originalJob = post.contentJobId ? await ContentJob.findOne({ jobId: post.contentJobId }) : null;
    const finalPrompt = prompt || originalJob?.prompts?.[0];

    if (!finalPrompt) {
      return res.status(400).json({ error: 'No prompt available - pass one in the request body' });
    }

    const imageCount = post.imageUrls?.length > 1 ? post.imageUrls.length : 1;
    const job = await ContentJob.create({
      userId: post.userId,
      type: imageCount > 1 ? 'batch' : 'single',
      status: 'pending',
      userRequest: `Autopilot regenerate: ${postId}`,
      inputBrief: originalJob?.inputBrief,
      prompts: Array.from({ length: imageCount }, () => finalPrompt),
      progress: { total: imageCount, completed: 0, failed: 0 },
    });

    await ensureCredits(post.userId, imageCount); // a user's click, charged like a manual image
    const { results } = await imageOrchestrator.executeJob(job.jobId);
    const urls = (results || []).map((r) => r.url).filter(Boolean);

    if (urls.length === 0) {
      return res.status(500).json({ error: 'Regeneration produced no images' });
    }

    post.imageUrl = urls[0];
    if (imageCount > 1) post.imageUrls = urls;
    post.contentJobId = job.jobId;
    await deductCreditsSafe(post.userId, urls.length, job.jobId, `Autopilot regenerate: ${urls.length} image(s)`);
    await post.save();

    console.log(`🔄 [AUTOPILOT] Regenerated ${urls.length} image(s) for ${postId}`);
    return res.status(200).json({ success: true, post, prompt: finalPrompt });
  } catch (error) {
    console.error('[AUTOPILOT] Queue Regenerate Error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});


/* ------------------------------------------------------------------------- *
 * Tasks
 *
 * An autopilot is a set of standing jobs, not a single "post N times a day".
 * The agent proposes 4-5 from the brand profile; each has its own format and
 * its own cadence, and each runs independently.
 * ------------------------------------------------------------------------- */

/**
 * POST /autopilot/tasks/:userId/generate  { platform, timezone?, replace? }
 * Read the brand profile and design this platform's task set.
 */
autopilotRouter.post('/tasks/:userId/generate', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const { timezone, replace = true } = req.body || {};
    const platform = resolvePlatform(req);

    const memory = await AutopilotMemory.findOne({ autopilotId });
    if (!memory?.brand) {
      return res.status(409).json({ error: 'No brand profile yet. Read the website first.' });
    }
    const ap = await Autopilot.findOne({ autopilotId }).select('accounts');
    if (!ap?.accounts?.[platform]) {
      return res.status(409).json({ error: `Add a ${platform} account to this autopilot first.` });
    }

    const TaskPlanner = require('../functions/TaskPlanner');
    const result = await new TaskPlanner().generate({
      userId,
      autopilotId,
      platform,
      brand: memory.brand,
      website: memory.website,
      timezone: timezone || 'Asia/Kolkata',
      replace,
    });

    if (!result.success) return res.status(422).json({ success: false, error: result.error });

    return res.status(200).json({
      success: true,
      reasoning: result.reasoning,
      tasks: result.tasks,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Task generation error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/test/:userId  { autopilotId, platform }
 * Publish a real "test post" through this autopilot's account for the
 * platform, right now, bypassing tasks and the queue - so the user can see
 * the connection works end to end. Instagram needs an image, so a plain
 * branded card is generated and uploaded for it.
 */
autopilotRouter.post('/test/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const platform = resolvePlatform(req);
    const ap = await Autopilot.findOne({ autopilotId });
    if (!ap?.accounts?.[platform]) return res.status(409).json({ error: `Add a ${platform} account to this autopilot first.` });

    const AutopilotService = require('../functions/AutopilotService');
    const accountId = await new AutopilotService().resolveAccountId({ userId, autopilotId, platform });
    const stamp = new Date().toLocaleString('en-IN', { timeZone: ap.timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const caption = `Test post from ${ap.name} autopilot - connection check ${stamp}. If you can see this, publishing works.`;
    const body = { userId, accountId, caption };

    let result;
    if (platform === 'linkedin') {
      const LinkedInPublisher = require('../functions/LinkedInPublisher');
      result = await new LinkedInPublisher().publishText({ body });
    } else if (platform === 'twitter') {
      const TwitterPublisher = require('../functions/TwitterPublisher');
      result = await new TwitterPublisher().publishText({ body });
    } else {
      const { testCardPng } = require('../functions/testCard');
      const { uploadBufferToS3 } = require('../functions/sharedHelpers');
      const imageUrl = await uploadBufferToS3(testCardPng(), 'image/png', 'autopilot/test');
      const InstagramController = require('../functions/Instagram');
      result = await new InstagramController().publishImage({ body: { ...body, imageUrl } });
    }

    const json = result?.json || {};
    if (result?.status >= 400 || json.success === false || json.error) {
      return res.status(502).json({ success: false, error: json.error || json.message || `Publish failed (${result?.status})`, details: json });
    }
    return res.status(200).json({ success: true, platform, permalink: json.permalink || json.url || json.platformPostUrl || null, mediaId: json.mediaId || json.id || null, caption });
  } catch (error) {
    console.error('[AUTOPILOT] Test post error:', error);
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

/**
 * POST /autopilot/tasks/:userId/self-review  { autopilotId, platform }
 * Run the weekly agent review now and apply its safe changes.
 */
autopilotRouter.post('/tasks/:userId/self-review', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const platform = resolvePlatform(req);
    await AutopilotConfig.updateOne({ autopilotId, platform }, { $set: { lastReviewAt: null } });
    const TaskRunner = require('../functions/TaskRunner');
    await new TaskRunner().selfReview();
    const ap = await Autopilot.findOne({ autopilotId }).select('agentLog');
    return res.status(200).json({ success: true, agentLog: ap?.agentLog || [] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/tasks/:userId/insights?platform=&autopilotId=
 * The platform agent's review of this autopilot's tasks, with applyable patches.
 */
autopilotRouter.get('/tasks/:userId/insights', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    const platform = resolvePlatform(req);
    const memory = await AutopilotMemory.findOne({ autopilotId });
    if (!memory?.brand) return res.status(409).json({ error: 'No brand profile yet. Read the website first.' });
    const TaskPlanner = require('../functions/TaskPlanner');
    const result = await new TaskPlanner().review({ userId, autopilotId, platform, brand: memory.brand, website: memory.website });
    return res.status(result.success ? 200 : 422).json(result);
  } catch (error) {
    console.error('[AUTOPILOT] Insights error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/tasks/:userId?platform=
 */
autopilotRouter.get('/tasks/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const autopilotId = await resolveAutopilot(userId, req);
    // The daily plans are tasks too, but the platform cards stand for them.
    const query = { userId, autopilotId, kind: { $ne: 'daily_plan' } };
    if (req.query.platform) query.platform = req.query.platform;

    const tasks = await AutopilotTask.find(query).sort({ platform: 1, createdAt: 1 });
    return res.status(200).json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    console.error('[AUTOPILOT] Task list error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * PATCH /autopilot/tasks/:taskId
 * Edit a task. Any change to what it posts or when bumps configVersion, which
 * is how an in-flight run knows not to overwrite the new schedule.
 */
autopilotRouter.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { name, description, angle, format, schedule, enabled, dailyRunCap, linkUrl, cta } = req.body || {};

    const task = await AutopilotTask.findOne({ taskId });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    let reschedule = false;

    if (name !== undefined) task.name = name;
    if (description !== undefined) task.description = description;
    if (angle !== undefined) task.angle = angle;
    if (format !== undefined) task.format = format;
    if (dailyRunCap !== undefined) task.dailyRunCap = dailyRunCap;
    if (linkUrl !== undefined) task.linkUrl = String(linkUrl || '').slice(0, 500);
    if (cta !== undefined) task.cta = String(cta || '').slice(0, 40);
    if (enabled !== undefined) {
      task.enabled = enabled;
      // Re-enabling a task that had given up starts it clean.
      if (enabled) {
        task.consecutiveFailures = 0;
        task.needsReview = false;
        task.needsReviewReason = '';
        reschedule = true;
      }
    }
    if (schedule) {
      task.schedule = { ...task.schedule.toObject(), ...schedule };
      // times must line up with timesPerDay or the wrong number of runs fire.
      if (task.schedule.times.length !== task.schedule.timesPerDay) {
        const t = [...task.schedule.times];
        while (t.length < task.schedule.timesPerDay) t.push('09:00');
        task.schedule.times = t.slice(0, task.schedule.timesPerDay);
      }
      reschedule = true;
    }

    if (reschedule && task.enabled) task.scheduleNextRun();
    // Signals to any in-flight run that the config moved under it.
    task.configVersion += 1;
    await task.save();

    return res.status(200).json({ success: true, task });
  } catch (error) {
    console.error('[AUTOPILOT] Task update error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

autopilotRouter.delete('/tasks/:taskId', async (req, res) => {
  try {
    const result = await AutopilotTask.deleteOne({ taskId: req.params.taskId });
    return res.status(200).json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/tasks/:taskId/run - fire once now, ignoring the schedule.
 */
autopilotRouter.post('/tasks/:taskId/run', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await AutopilotTask.findOne({ taskId });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Make it due, and clear the double-fire guard - the user asked for this
    // explicitly, so "you already ran recently" is not a reason to refuse.
    await AutopilotTask.updateOne(
      { taskId },
      { $set: { status: 'idle', nextRunAt: new Date(Date.now() - 1000), lastFiredAt: null } }
    );

    const TaskRunner = require('../functions/TaskRunner');
    const result = await new TaskRunner().claimAndRun(taskId, { force: true });

    const fresh = await AutopilotTask.findOne({ taskId });
    return res.status(200).json({ success: true, result, task: fresh });
  } catch (error) {
    console.error('[AUTOPILOT] Task run error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/tasks/:taskId/runs - what this task has done.
 */
autopilotRouter.get('/tasks/:taskId/runs', async (req, res) => {
  try {
    const AutopilotTaskRun = require('../models/autopilotTaskRun');
    const runs = await AutopilotTaskRun.find({ taskId: req.params.taskId })
      .sort({ startedAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 20, 100));
    return res.status(200).json({ success: true, runs });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/* -------------------------------------------------------------------------
 * Autopilots - one per company/brand, many per user
 * ------------------------------------------------------------------------- */

autopilotRouter.get('/autopilots/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const list = await Autopilot.find({ userId, archived: false }).sort({ createdAt: 1 });
    const ids = list.map((a) => a.autopilotId);
    const [configs, tasks, memories] = await Promise.all([
      AutopilotConfig.find({ autopilotId: { $in: ids } }).select('autopilotId platform enabled'),
      AutopilotTask.find({ autopilotId: { $in: ids }, kind: { $ne: 'daily_plan' } }).select('autopilotId platform enabled'),
      AutopilotMemory.find({ autopilotId: { $in: ids } }).select('autopilotId brand.companyName brand.oneLiner website.url'),
    ]);
    const autopilots = list.map((a) => {
      const mem = memories.find((m) => m.autopilotId === a.autopilotId);
      return {
        ...a.toObject(),
        companyName: mem?.brand?.companyName || null,
        oneLiner: mem?.brand?.oneLiner || null,
        websiteUrl: a.websiteUrl || mem?.website?.url || '',
        platformsOn: configs.filter((c) => c.autopilotId === a.autopilotId && c.enabled).map((c) => c.platform),
        taskCount: tasks.filter((t) => t.autopilotId === a.autopilotId && t.enabled).length,
      };
    });
    return res.status(200).json({ success: true, autopilots });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

autopilotRouter.post('/autopilots/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, websiteUrl, timezone } = req.body || {};
    const count = await Autopilot.countDocuments({ userId, archived: false });
    if (count >= 20) return res.status(409).json({ error: 'Autopilot limit reached (20)' });
    await require('../functions/Plans').assertBrands(userId, count);
    const ap = await Autopilot.create({
      userId,
      name: (name || '').trim() || `Autopilot ${count + 1}`,
      websiteUrl: websiteUrl || '',
      timezone: timezone || 'Asia/Kolkata',
    });
    return res.status(201).json({ success: true, autopilot: ap });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * PATCH /autopilot/autopilots/:autopilotId  { name?, websiteUrl?, timezone?, accounts? }
 * `accounts` picks which connected account each platform posts through.
 */
autopilotRouter.patch('/autopilots/:autopilotId', async (req, res) => {
  try {
    const ap = await Autopilot.findOne({ autopilotId: req.params.autopilotId, archived: false });
    if (!ap) return res.status(404).json({ error: 'Autopilot not found' });
    const { name, websiteUrl, timezone, accounts } = req.body || {};
    if (name !== undefined) ap.name = String(name).trim() || ap.name;
    if (websiteUrl !== undefined) ap.websiteUrl = websiteUrl;
    if (timezone !== undefined) ap.timezone = timezone;
    const removed = [];
    if (accounts && typeof accounts === 'object') {
      for (const p of SUPPORTED_PLATFORMS) {
        if (!(p in accounts)) continue;
        const next = accounts[p] || null;
        if (!next && ap.accounts[p]) removed.push(p);
        ap.accounts[p] = next;
      }
      ap.markModified('accounts');
    }
    await ap.save();
    // Removing an integration from an autopilot switches that platform off:
    // its tasks stop and the daily run stops, but nothing is deleted.
    if (removed.length) {
      await Promise.all([
        AutopilotConfig.updateMany({ autopilotId: ap.autopilotId, platform: { $in: removed } }, { $set: { enabled: false, nextRunAt: null } }),
        AutopilotTask.updateMany({ autopilotId: ap.autopilotId, platform: { $in: removed } }, { $set: { enabled: false, nextRunAt: null } }),
      ]);
    }
    return res.status(200).json({ success: true, autopilot: ap });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE - removes the autopilot, its brand profile, configs and tasks.
 * Run history and already-created posts are kept.
 */
autopilotRouter.delete('/autopilots/:autopilotId', async (req, res) => {
  try {
    const { autopilotId } = req.params;
    const ap = await Autopilot.findOne({ autopilotId });
    if (!ap) return res.status(404).json({ error: 'Autopilot not found' });
    await Promise.all([
      AutopilotTask.deleteMany({ autopilotId }),
      AutopilotConfig.deleteMany({ autopilotId }),
      AutopilotMemory.deleteMany({ autopilotId }),
      Autopilot.deleteOne({ autopilotId }),
    ]);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/trust/:userId?autopilotId=
 * Each platform's place on the trust ladder, and the latest things the autopilot decided about itself.
 */
autopilotRouter.get('/trust/:userId', async (req, res) => {
  try {
    const autopilotId = await resolveAutopilot(req.params.userId, req);
    const configs = await AutopilotConfig.find({ autopilotId });
    const AutopilotEvent = require('../models/autopilotEvent');
    const events = await AutopilotEvent.find({ autopilotId }).sort({ createdAt: -1 }).limit(20).lean();
    return res.status(200).json({
      success: true,
      platforms: await Promise.all(configs.map((c) => TrustLadder.summary(c))),
      events: events.map(({ platform, action, reason, postId, createdAt }) => ({ platform, action, reason, postId, createdAt })),
      rejectReasons: TrustLadder.REJECT_REASONS,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Trust error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/trust/:userId/reset  { platform, autopilotId }
 * Back to supervised by hand.
 */
autopilotRouter.post('/trust/:userId/reset', async (req, res) => {
  try {
    const autopilotId = await resolveAutopilot(req.params.userId, req);
    const config = await AutopilotConfig.findOne({ autopilotId, platform: resolvePlatform(req) });
    if (!config) return res.status(404).json({ error: 'Autopilot not configured for this platform' });
    await TrustLadder.demote(config, 'You switched back to supervised', 'reset');
    return res.status(200).json({ success: true, trust: await TrustLadder.summary(config) });
  } catch (error) {
    console.error('[AUTOPILOT] Trust reset error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/integrations/seovyn/:userId  { autopilotId, rotate? }
 * The webhook URL and secret to paste into Seovyn (Settings > Publishing > Webhook), so each article Seovyn publishes
 * is announced here. `rotate` makes a new secret (the old one stops working).
 */
autopilotRouter.post('/integrations/seovyn/:userId', async (req, res) => {
  try {
    const autopilotId = await resolveAutopilot(req.params.userId, req);
    const ap = await Autopilot.findOne({ autopilotId }).select('+seovynSecret');
    if (!ap.seovynSecret || req.body?.rotate) {
      ap.seovynSecret = require('crypto').randomBytes(24).toString('hex');
      await Autopilot.updateOne({ _id: ap._id }, { $set: { seovynSecret: ap.seovynSecret } });
    }
    const base = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}/api`).replace(/\/+$/, '');
    return res.status(200).json({ success: true, url: `${base}/integrations/seovyn/${autopilotId}`, secret: ap.seovynSecret });
  } catch (error) {
    console.error('[AUTOPILOT] Seovyn connect error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/preview/:userId  { url, autopilotId? }
 * "Your first week": seven posts and a product video from the site, before any account is connected. One a day.
 */
autopilotRouter.post('/preview/:userId', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(url)) return res.status(400).json({ error: 'Enter your website address, like yourcompany.com' });
    const autopilotId = req.body?.autopilotId ? await resolveAutopilot(req.params.userId, req) : null;
    const preview = await require('../functions/Preview').start({ userId: req.params.userId, url, autopilotId });
    return res.status(202).json({ success: true, previewId: preview.previewId });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/** GET /autopilot/preview/:userId - the newest preview (or none). */
autopilotRouter.get('/preview/:userId', async (req, res) => {
  try {
    const latest = await require('../models/preview').findOne({ userId: req.params.userId }).sort({ createdAt: -1 }).select('previewId').lean();
    const preview = latest ? await require('../functions/Preview').view(req.params.userId, latest.previewId) : null;
    return res.status(200).json({ success: true, preview });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/** GET /autopilot/preview/:userId/:previewId */
autopilotRouter.get('/preview/:userId/:previewId', async (req, res) => {
  try {
    const preview = await require('../functions/Preview').view(req.params.userId, req.params.previewId);
    if (!preview) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ success: true, preview });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/** POST /autopilot/preview/:userId/:previewId/use - the week goes into the approval queue for connected platforms. */
autopilotRouter.post('/preview/:userId/:previewId/use', async (req, res) => {
  try {
    const result = await require('../functions/Preview').use(req.params.userId, req.params.previewId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/report/:userId?autopilotId=
 * The weekly report (the last 7 days): what went out, what worked, what was turned down, what changes next week.
 */
autopilotRouter.get('/report/:userId', async (req, res) => {
  try {
    const autopilotId = await resolveAutopilot(req.params.userId, req);
    const report = await require('../functions/WeeklyReport').build(autopilotId);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/replies/:userId - reply drafts waiting for the user (Instagram comments on autopilot posts).
 */
autopilotRouter.get('/replies/:userId', async (req, res) => {
  try {
    const CommentReply = require('../models/commentReply');
    const query = { userId: req.params.userId, status: 'draft' };
    if (req.query.autopilotId) query.autopilotId = await resolveAutopilot(req.params.userId, req);
    const replies = await CommentReply.find(query).sort({ commentedAt: -1 }).limit(50).lean();
    return res.status(200).json({ success: true, replies });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/** POST /autopilot/replies/:userId/:replyId/send { text } - post the reply (edited or as drafted). */
autopilotRouter.post('/replies/:userId/:replyId/send', async (req, res) => {
  try {
    await require('../functions/ReplyDrafts').send(req.params.userId, req.params.replyId, req.body?.text);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

/** POST /autopilot/replies/:userId/:replyId/dismiss - no reply to this comment. */
autopilotRouter.post('/replies/:userId/:replyId/dismiss', async (req, res) => {
  try {
    const CommentReply = require('../models/commentReply');
    const r = await CommentReply.updateOne({ userId: req.params.userId, replyId: req.params.replyId, status: 'draft' }, { $set: { status: 'dismissed' } });
    return r.modifiedCount ? res.status(200).json({ success: true }) : res.status(404).json({ error: 'Not found' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/pauses/:userId
 * Platforms the user's posting is paused on (blocked, flagged, or the login broke), with why and until when.
 */
autopilotRouter.get('/pauses/:userId', async (req, res) => {
  try {
    const { pausesFor } = require('../functions/AccountHealth');
    const pauses = await pausesFor(req.params.userId);
    return res.status(200).json({
      success: true,
      pauses: Object.values(pauses).map(({ platform, kind, reason, until, pausedAt }) => ({ platform, kind, reason, until, pausedAt })),
    });
  } catch (error) {
    console.error('[AUTOPILOT] Pauses error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/pauses/:userId/:platform/resume
 * The user resumes posting by hand (they checked the account and it is fine).
 */
autopilotRouter.post('/pauses/:userId/:platform/resume', async (req, res) => {
  try {
    if (!SUPPORTED_PLATFORMS.includes(req.params.platform)) return res.status(400).json({ error: 'Unknown platform' });
    const { resume } = require('../functions/AccountHealth');
    await resume(req.params.userId, req.params.platform, { any: true });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[AUTOPILOT] Resume error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = autopilotRouter;
