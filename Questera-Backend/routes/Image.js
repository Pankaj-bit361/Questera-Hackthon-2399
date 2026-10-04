const express = require('express');
const imageRouter = express.Router();
const { selfParam, ownedParam } = require('../middlewares/auth');
const ImageModel = require('../models/image');
const ImageMessage = require('../models/imageMessage');
const ImageController = require('../functions/Image');

// The caller's own records only (middlewares/auth.js).
imageRouter.param('userId', selfParam);
imageRouter.param('imageChatId', ownedParam(ImageModel, 'imageChatId', (id, userId) => ImageMessage.exists({ imageChatId: id, userId })));
imageRouter.param('messageId', ownedParam(ImageMessage, 'messageId'));
const imageController = new ImageController();

// Generate image (also supports remix when images array is provided)
imageRouter.post("/generate", async (req, res) => {
    try {
        const { status, json } = await imageController.generateImages(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get conversation by chatId
imageRouter.get("/conversation/:imageChatId", async (req, res) => {
    try {
        const { status, json } = await imageController.getConversation(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get all conversations for a user
imageRouter.get("/user/:userId/conversations", async (req, res) => {
    try {
        const { status, json } = await imageController.getUserConversations(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get project settings for a conversation
imageRouter.get("/project-settings/:imageChatId", async (req, res) => {
    try {
        const { status, json } = await imageController.getProjectSettings(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Update project settings for a conversation
imageRouter.put("/project-settings/:imageChatId", async (req, res) => {
    try {
        const { status, json } = await imageController.updateProjectSettings(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Bulk generate images with one reference image and multiple prompts
imageRouter.post("/bulk-generate", async (req, res) => {
    try {
        const { status, json } = await imageController.bulkGenerateImages(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete a specific message from a conversation
imageRouter.delete("/message/:messageId", async (req, res) => {
    try {
        const { status, json } = await imageController.deleteMessage(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete an entire conversation
imageRouter.delete("/conversation/:imageChatId", async (req, res) => {
    try {
        const { status, json } = await imageController.deleteConversation(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = imageRouter;