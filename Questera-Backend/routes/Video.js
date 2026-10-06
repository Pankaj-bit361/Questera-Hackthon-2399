const express = require('express');
const videoRouter = express.Router();
const { selfParam, ownedParam } = require('../middlewares/auth');
const MediaJob = require('../models/mediaJob');
const VideoModel = require('../models/video');
const VideoMessage = require('../models/videoMessage');
const { VideoController, KieVideoController, SeedanceVideoController, SeedanceFastVideoController, OmniVideoController } = require('../functions/Video');

// The caller's own records only (middlewares/auth.js).
videoRouter.param('userId', selfParam);
videoRouter.param('jobId', ownedParam(MediaJob, 'jobId'));
videoRouter.param('videoChatId', ownedParam(VideoModel, 'videoChatId'));
videoRouter.param('messageId', ownedParam(VideoMessage, 'messageId'));
const videoController = new VideoController();
const kieVideoController = new KieVideoController();
const seedanceVideoController = new SeedanceVideoController();
const seedanceFastVideoController = new SeedanceFastVideoController();
const omniVideoController = new OmniVideoController();

// Poll async video job
videoRouter.get('/job/:jobId', async (req, res) => {
    try {
        const { status, json } = await videoController.getJobStatus(req.params.jobId);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Generate video
videoRouter.post('/generate', async (req, res) => {
    try {
        const { status, json } = await videoController.generate(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get conversation by videoChatId
videoRouter.get('/conversation/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.getConversation(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get all conversations for a user
videoRouter.get('/user/:userId/conversations', async (req, res) => {
    try {
        const { status, json } = await videoController.getUserConversations(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get project settings
videoRouter.get('/settings/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.getSettings(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Update project settings
videoRouter.put('/settings/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.updateSettings(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete a message
videoRouter.delete('/message/:messageId', async (req, res) => {
    try {
        const { status, json } = await videoController.deleteMessage(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete a conversation
videoRouter.delete('/conversation/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.deleteConversation(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// ── KIE Wan 2.7 Image-to-Video ──
videoRouter.post('/generate-wan', async (req, res) => {
    try {
        const { status, json } = await kieVideoController.generate(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// ── Bytedance Seedance 2.0 ──
// Gemini Omni 1.1 Flash - the default model for new video work
videoRouter.post('/generate-omni', async (req, res) => {
    try {
        const { status, json } = await omniVideoController.generate(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

videoRouter.post('/generate-seedance', async (req, res) => {
    try {
        const { status, json } = await seedanceVideoController.generate(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// ── Bytedance Seedance 2.0 Fast ──
videoRouter.post('/generate-seedance-fast', async (req, res) => {
    try {
        const { status, json } = await seedanceFastVideoController.generate(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = videoRouter;

