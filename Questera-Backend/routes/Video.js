const express = require('express');
const videoRouter = express.Router();
const { VideoController, KieVideoController, SeedanceVideoController, SeedanceFastVideoController } = require('../functions/Video');
const videoController = new VideoController();
const kieVideoController = new KieVideoController();
const seedanceVideoController = new SeedanceVideoController();
const seedanceFastVideoController = new SeedanceFastVideoController();

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

