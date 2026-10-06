const express = require('express');
const router = express.Router();
// DEPRECATED: use POST /api/chat/agent (functions/AgentService.js). Kept for existing clients.
const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const ImageChat = require('../models/image');
const ImageMessage = require('../models/imageMessage');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Supported models
const MODELS = {
    flash: 'gemini-3.1-flash-image-preview',   // High-speed, high-volume (default)
    pro: 'gemini-3-pro-image-preview',          // Professional asset production
    flash2: 'gemini-2.5-flash-image',           // Speed + efficiency
};

async function uploadToS3(buffer, mimeType) {
    const ext = mimeType?.split('/')[1] || 'jpeg';
    const key = `images/${uuidv4()}.${ext}`;
    await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
    }));
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * POST /api/gemini/generate
 *
 * Full-featured direct Gemini image generation/editing endpoint.
 *
 * Body:
 *   prompt          {string}    — text instruction (required)
 *   userId          {string}    — user ID for DB persistence
 *   imageChatId     {string}    — existing chat ID (creates new if omitted)
 *   history         {Array}     — multi-turn history turns
 *                                 Each: { role: 'user'|'model', parts: [...] }
 *   images          {Array}     — reference images for this turn (up to 14)
 *                                 Each: { data: base64|url, mimeType: string }
 *
 * Generation options:
 *   model           {string}    — 'flash' | 'pro' | 'flash2' (default: 'flash')
 *   aspectRatio     {string}    — '1:1','4:5','16:9','9:16','3:2','2:3','4:3','3:4',
 *                                 '1:4','4:1','1:8','8:1' (flash-only: 1:4,4:1,1:8,8:1)
 *   imageSize       {string}    — '512','1K','2K','4K' ('512' is flash-only)
 *   thinkingLevel   {string}    — 'minimal' | 'High' (default: 'minimal')
 *   includeThoughts {boolean}   — return thought parts in response (default: false)
 *
 * Grounding:
 *   useGoogleSearch {boolean}   — enable Google Search grounding (default: false)
 *   useImageSearch  {boolean}   — enable Google Image Search grounding (flash-only)
 *   useWebSearch    {boolean}   — enable Google Web Search (default: true when useGoogleSearch)
 *
 * Response modalities:
 *   textOnly        {boolean}   — return TEXT only, no IMAGE (for pure-text turns)
 */
router.post('/generate', async (req, res) => {
    try {
        const {
            prompt,
            userId,
            imageChatId: existingChatId,
            history = [],
            images = [],
            // Generation options
            model: modelKey = 'flash',
            aspectRatio,
            imageSize = '2K',
            thinkingLevel = 'minimal',
            includeThoughts = false,
            // Grounding
            useGoogleSearch = false,
            useImageSearch = false,
            useWebSearch = true,
            // Modalities
            textOnly = false,
        } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        const model = MODELS[modelKey] || MODELS.flash;
        const isFlash = model === MODELS.flash;

        // Create or find chat in DB
        let imageChatId = existingChatId;
        if (userId) {
            if (!imageChatId) {
                const newChat = await ImageChat.create({
                    userId,
                    imageChatId: uuidv4(),
                    name: prompt.slice(0, 60),
                });
                imageChatId = newChat.imageChatId;
            }

            // Save user message
            const userMsg = await ImageMessage.create({
                role: 'user',
                userId,
                content: prompt,
                imageChatId,
                messageId: uuidv4(),
            });
            await ImageChat.updateOne({ imageChatId }, { $push: { messages: userMsg._id } });
        }

        // Build image config
        const imageConfig = {};
        if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
        if (imageSize) imageConfig.imageSize = imageSize;

        // Build response modalities
        const responseModalities = textOnly ? ['TEXT'] : ['IMAGE', 'TEXT'];

        // Build thinking config
        const thinkingConfig = {
            thinkingLevel,
            ...(includeThoughts && { includeThoughts: true }),
        };

        // Build tools array (Google Search grounding)
        const tools = [];
        if (useGoogleSearch) {
            const googleSearch = {};
            if (useImageSearch || !useWebSearch) {
                googleSearch.searchTypes = {};
                if (useWebSearch) googleSearch.searchTypes.webSearch = {};
                if (useImageSearch && isFlash) googleSearch.searchTypes.imageSearch = {};
            }
            tools.push({ googleSearch });
        }

        const config = {
            responseModalities,
            imageConfig,
            thinkingConfig,
            ...(tools.length > 0 && { tools }),
        };

        // Build current user parts
        const currentParts = [{ text: prompt }];

        for (const img of images) {
            let { data, mimeType = 'image/jpeg' } = img;
            if (!data) continue;

            // Fetch URL server-side if given instead of base64
            if (typeof data === 'string' && data.startsWith('http')) {
                const resp = await fetch(data);
                const buf = Buffer.from(await resp.arrayBuffer());
                data = buf.toString('base64');
            }

            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
                mimeType = 'image/jpeg';
            }

            currentParts.push({ inlineData: { mimeType, data } });
        }

        // Full contents = history + current user turn
        const contents = [
            ...history,
            { role: 'user', parts: currentParts },
        ];

        console.log(`🤖 [GEMINI-DIRECT] Sending request:`);
        console.log(JSON.stringify({
            model,
            config,
            turns: contents.length,
            imagesInCurrentTurn: currentParts.length - 1,
            historyTurns: history.length,
        }, null, 2));

        const response = await ai.models.generateContentStream({
            model,
            config,
            contents,
        });

        const generatedImages = [];
        let textResponse = '';
        let capturedThoughtSignature = null;
        let groundingMetadata = null;
        const responseParts = [];
        const thoughtParts = [];

        for await (const chunk of response) {
            const candidate = chunk.candidates?.[0];

            // Capture grounding metadata from any chunk
            if (candidate?.groundingMetadata) {
                groundingMetadata = candidate.groundingMetadata;
            }

            const parts = candidate?.content?.parts || [];
            for (const part of parts) {
                // Collect thought parts separately if requested
                if (part.thought) {
                    if (includeThoughts) {
                        if (part.text) thoughtParts.push({ type: 'text', text: part.text });
                        else if (part.inlineData) thoughtParts.push({ type: 'image', mimeType: part.inlineData.mimeType });
                    }
                    continue;
                }

                if (part.inlineData) {
                    const sig = part.thoughtSignature || part.thought_signature || null;
                    if (sig && !capturedThoughtSignature) {
                        capturedThoughtSignature = sig;
                        console.log(`🔑 [GEMINI-DIRECT] Captured thought_signature (${sig.length} chars)`);
                    }

                    const buffer = Buffer.from(part.inlineData.data || '', 'base64');
                    const url = await uploadToS3(buffer, part.inlineData.mimeType);
                    console.log(`✅ [GEMINI-DIRECT] Image uploaded: ${url}`);

                    generatedImages.push({ url, mimeType: part.inlineData.mimeType });

                    responseParts.push({
                        inlineData: { mimeType: part.inlineData.mimeType, data: part.inlineData.data },
                        ...(sig && { thoughtSignature: sig }),
                    });
                }

                if (part.text) {
                    textResponse += part.text;
                    const sigOnText = part.thoughtSignature || part.thought_signature || null;
                    if (sigOnText && !capturedThoughtSignature) {
                        capturedThoughtSignature = sigOnText;
                    }
                    responseParts.push({
                        text: part.text,
                        ...(sigOnText && { thoughtSignature: sigOnText }),
                    });
                }
            }
        }

        console.log(`✅ [GEMINI-DIRECT] Done — images: ${generatedImages.length}, text: ${textResponse.length} chars`);

        // Save assistant message to DB
        if (userId && imageChatId) {
            const asstMsg = await ImageMessage.create({
                role: 'assistant',
                userId,
                content: textResponse || 'Here is your image!',
                imageUrl: generatedImages[0]?.url || null,
                imageMimeType: generatedImages[0]?.mimeType || 'image/jpeg',
                thoughtSignature: capturedThoughtSignature || null,
                imageChatId,
                messageId: uuidv4(),
            });
            await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
        }

        return res.status(200).json({
            success: true,
            imageChatId: imageChatId || null,
            // Generated content
            images: generatedImages,
            imageUrl: generatedImages[0]?.url || null,
            text: textResponse,
            // Multi-turn history support
            modelTurn: { role: 'model', parts: responseParts },
            thoughtSignature: capturedThoughtSignature,
            // Thought process (only present if includeThoughts: true)
            ...(includeThoughts && thoughtParts.length > 0 && { thoughts: thoughtParts }),
            // Google Search grounding metadata (only present when grounding was used)
            ...(groundingMetadata && { groundingMetadata }),
        });

    } catch (error) {
        console.error('❌ [GEMINI-DIRECT] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
