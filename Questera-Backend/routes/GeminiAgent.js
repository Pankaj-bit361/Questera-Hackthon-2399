const express = require('express');
const router = express.Router();
// DEPRECATED: use POST /api/chat/agent (functions/AgentService.js). Kept for existing clients.
const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const ImageChat = require('../models/image');
const ImageMessage = require('../models/imageMessage');
const ScheduledPost = require('../models/scheduledPost');
const Instagram = require('../models/instagram');
const CreditsController = require('../functions/Credits');

const creditsController = new CreditsController();

// Image generation — Google direct (OpenRouter doesn't support image output)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Routing agent — OpenRouter (higher limits, no 429s)
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_AGENT_MODEL = process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash';

async function agentRoute(contents, config) {
    const messages = contents.map(turn => ({
        role: turn.role === 'model' ? 'assistant' : 'user',
        content: turn.parts.map(p => p.text || '').join(''),
    }));

    const tools = config.tools?.[0]?.functionDeclarations?.map(fn => ({
        type: 'function',
        function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
        },
    }));

    const body = {
        model: OPENROUTER_AGENT_MODEL,
        messages: [
            { role: 'system', content: config.systemInstruction },
            ...messages,
        ],
        tools,
        tool_choice: 'required',
    };

    const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://velosapps.com',
            'X-Title': 'Greta',
        },
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const err = await resp.json();
        throw new Error(JSON.stringify(err));
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];

    if (!toolCall) return { functionCall: null };

    return {
        functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}'),
        },
    };
}

// Extract normalized accounts array from Instagram document (handles sub-accounts + legacy)
async function getConnectedAccounts(userId) {
    const doc = await Instagram.findOne({ userId }).lean();
    if (!doc) return [];

    if (doc.accounts && doc.accounts.length > 0) {
        return doc.accounts
            .filter(a => a.isConnected)
            .map(a => ({
                id: a.instagramBusinessAccountId,
                username: a.instagramUsername,
                profilePictureUrl: a.profilePictureUrl || null,
            }));
    }

    // Legacy single-account
    if (doc.instagramBusinessAccountId && doc.isConnected) {
        return [{
            id: doc.instagramBusinessAccountId,
            username: doc.instagramUsername,
            profilePictureUrl: doc.profilePictureUrl || null,
        }];
    }

    return [];
}

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const IMAGE_MODELS = {
    flash: 'gemini-3.1-flash-image-preview',
    pro: 'gemini-3-pro-image-preview',
    flash2: 'gemini-2.5-flash-image',
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

const TOOL_DECLARATIONS = [
    {
        name: 'generate_image',
        description: 'Generate a brand new image from a text description. Use when the user wants to create something new.',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: "Detailed, descriptive image generation prompt. Enhance and expand the user's request." },
                aspectRatio: { type: 'string', description: 'Aspect ratio if mentioned by user. E.g. "1:1", "16:9", "9:16", "4:5", "3:2", "2:3", "4:3", "3:4", "1:4", "4:1". Omit if not mentioned.' },
                imageSize: { type: 'string', description: 'Resolution if mentioned by user. One of: "512", "1K", "2K", "4K". Omit if not mentioned.' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'edit_image',
        description: 'Edit or modify the previously generated image. Use when user refers to "it", "this", "the image", or asks to change/add/remove/modify something in the existing image.',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Edit instruction describing what to change in the existing image.' },
                aspectRatio: { type: 'string', description: 'New aspect ratio if user wants to change it. Omit if not mentioned.' },
                imageSize: { type: 'string', description: 'New resolution if user wants to change it. One of: "512", "1K", "2K", "4K". Omit if not mentioned.' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'create_variations',
        description: 'Generate multiple variations of an image in parallel. Use when user asks for "variations", "options", "versions", "4 different", "multiple versions", or any request implying more than one image.',
        parameters: {
            type: 'object',
            properties: {
                prompts: {
                    type: 'array',
                    description: 'Array of prompts — one per variation. Each should be distinct. Max 4.',
                    items: { type: 'string' },
                },
                count: { type: 'integer', description: 'Number of variations to generate (default 4, max 4).' },
                aspectRatio: { type: 'string', description: 'Aspect ratio for all variations if mentioned. Omit if not mentioned.' },
                imageSize: { type: 'string', description: 'Resolution for all variations if mentioned. Omit if not mentioned.' },
            },
            required: ['prompts'],
        },
    },
    {
        name: 'schedule_post',
        description: 'Schedule the last generated image to be posted on Instagram at a specific time. Use when user says "post this", "schedule this", "share to Instagram", "post at [time]", or similar.',
        parameters: {
            type: 'object',
            properties: {
                caption: { type: 'string', description: 'Instagram caption for the post. Make it engaging.' },
                scheduledAt: { type: 'string', description: 'ISO 8601 datetime string for when to post. If user says "tomorrow 9am" convert it. If no time given, default to 1 hour from now.' },
                hashtags: { type: 'string', description: 'Relevant hashtags as a single string e.g. "#ai #art #design"' },
            },
            required: ['caption', 'scheduledAt'],
        },
    },
    {
        name: 'list_accounts',
        description: 'Show the user their connected Instagram accounts. Use when user asks "which accounts", "what accounts are linked", "show my accounts", or similar.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'reply',
        description: 'Send a plain text reply. Use for questions, greetings, explanations, or anything that does not require image generation.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The reply message.' },
            },
            required: ['message'],
        },
    },
];

const AGENT_SYSTEM = `You are Velos, the most powerful AI creative agent built for visual storytelling and social media domination. You combine world-class image generation with intelligent intent detection to help creators bring ideas to life — fast, beautifully, and at scale.

<IDENTITY>
- Name: Velos
- Role: AI Creative Director & Visual Content Agent
- Personality: Confident, precise, creative. You speak like a senior creative professional — direct, inspiring, never verbose.
- You do NOT say "I'm just an AI" or give disclaimers. You execute.
</IDENTITY>

<CORE CAPABILITY>
You generate, edit, and schedule stunning images for Instagram using Gemini's image generation models. You route every user message to exactly ONE tool — never respond with plain text unless using the reply or list_accounts tool.
</CORE CAPABILITY>

<TOOL ROUTING — STRICT RULES>
Analyze the user's intent and call exactly ONE tool per message. No exceptions.

| Tool               | When to use |
|--------------------|-------------|
| generate_image     | User wants a NEW image created from scratch. Any original creation request. |
| edit_image         | User refers to "it", "this", "the image", "make it X", "change the Y", "add Z to it" — any modification of the PREVIOUS image. |
| create_variations  | User wants multiple versions, options, or styles. Keywords: "variations", "4 versions", "different options", "show me alternatives", "multiple", "3 of these". |
| schedule_post      | User wants to post or schedule the last generated image to Instagram. Keywords: "post this", "schedule", "share to Instagram", "post at [time]". |
| list_accounts      | User asks about connected accounts. Keywords: "which account", "what accounts", "linked accounts", "show my Instagram", "which one". |
| reply              | User is asking a question, greeting you, requesting information, or anything that does NOT require image work. |

NEVER skip tool calling. NEVER return raw text. ALWAYS call a tool.
</TOOL ROUTING>

<PROMPT ENGINEERING — IMAGE TOOLS>
When calling generate_image, edit_image, or create_variations — ALWAYS enhance the user's prompt:
- Add rich visual detail: lighting, mood, color palette, composition, art style, camera angle
- Infer the best style if not specified (photorealistic, cinematic, illustrative, etc.)
- Keep the core creative intent intact — enhance, never override
- For create_variations: each prompt MUST be meaningfully distinct — different angle, style, mood, or interpretation. Never generate near-identical prompts.
</PROMPT ENGINEERING>

<SCHEDULING RULES>
- Today's date is injected at request time in the system context.
- Convert relative time expressions to ISO 8601 (e.g. "tomorrow 9am" → "2025-04-20T09:00:00Z")
- If no time is given, default to 1 hour from now.
- Always write captions that are engaging, human, and platform-native for Instagram.
- Add relevant hashtags unless the user asks you not to.
</SCHEDULING RULES>

<REPLY QUALITY>
When using the reply tool:
- Be concise and direct. No fluff, no over-explanation.
- Match the user's energy — casual if they're casual, precise if they're technical.
- If asked about accounts, reference the Connected Instagram accounts list provided in your context.
- If asked what you can do, describe your core capabilities: generate, edit, create variations, and schedule to Instagram.
</REPLY QUALITY>

<WHAT YOU NEVER DO>
- Never respond without calling a tool
- Never make up Instagram account names — always use the accounts list provided in context
- Never generate offensive, harmful, or explicit imagery
- Never ignore the user's creative intent when enhancing prompts
</WHAT YOU NEVER DO>`;

/**
 * POST /api/gemini/agent
 *
 * Two completely separate histories:
 *   agentHistory  — text-only turns for the routing agent (grows every turn)
 *   geminiHistory — full image turns with inlineData + thoughtSignature (grows on image turns only)
 *
 * Body:
 *   message         {string}   required
 *   userId          {string}
 *   imageChatId     {string}   creates new if omitted
 *   agentHistory    {Array}    [{role:'user'|'model', parts:[{text}]}]
 *   geminiHistory   {Array}    [{role:'user'|'model', parts:[...]}]  with thoughtSignature
 *   images          {Array}    [{data, mimeType}]  reference images for this turn
 *   lastImageUrl    {string}   S3 URL of last generated image (edit fallback)
 *   model           {string}   'flash'|'pro'|'flash2'
 *   aspectRatio     {string}
 *   imageSize       {string}
 *   thinkingLevel   {string}   'minimal'|'High'
 *   useGoogleSearch {boolean}
 *   useImageSearch  {boolean}
 *
 * Response:
 *   intent     — 'generate_image'|'edit_image'|'reply'
 *   imageUrl   — S3 URL (null for reply)
 *   text       — text response
 *   imageChatId
 *   agentTurn  — {role:'model', parts:[{text}]}  append to agentHistory
 *   geminiTurn — {role:'model', parts:[...]}      append to geminiHistory (null for reply)
 */
router.post('/agent', async (req, res) => {
    try {
        const {
            message,
            userId,
            imageChatId: existingChatId,
            agentHistory = [],
            geminiHistory = [],
            images = [],
            lastImageUrl = null,
            model: modelKey = 'flash',
            aspectRatio,
            imageSize = '2K',
            thinkingLevel = 'minimal',
            useGoogleSearch = false,
            useImageSearch = false,
        } = req.body;

        if (!message) return res.status(400).json({ error: 'message is required' });

        const imageModel = IMAGE_MODELS[modelKey] || IMAGE_MODELS.flash;
        const isFlash = imageModel === IMAGE_MODELS.flash;

        // Create or find chat in DB
        let imageChatId = existingChatId;
        if (userId && !imageChatId) {
            const newChat = await ImageChat.create({
                userId,
                imageChatId: `chat-${uuidv4()}`,
                name: message.slice(0, 60),
            });
            imageChatId = newChat.imageChatId;
        }

        // Save user message to DB
        if (userId && imageChatId) {
            const userMsg = await ImageMessage.create({
                role: 'user', userId, content: message,
                imageChatId, messageId: uuidv4(),
            });
            await ImageChat.updateOne({ imageChatId }, { $push: { messages: userMsg._id } });
        }

        // ── Step 1: Fetch context needed by agent ─────────────────────────────
        const connectedAccounts = userId ? await getConnectedAccounts(userId) : [];
        const accountsContext = connectedAccounts.length > 0
            ? `\n\nConnected Instagram accounts (${connectedAccounts.length}):\n` +
              connectedAccounts.map((a, i) => `  ${i + 1}. @${a.username}`).join('\n')
            : '\n\nNo Instagram accounts connected.';

        // ── Step 2: Call routing agent to decide tool ─────────────────────────
        const agentContents = [
            ...agentHistory,
            { role: 'user', parts: [{ text: message }] },
        ];

        console.log(`🤖 [AGENT] Routing — model=${OPENROUTER_AGENT_MODEL} agentTurns=${agentContents.length} geminiTurns=${geminiHistory.length}`);

        const fnCallPart = await agentRoute(agentContents, {
            systemInstruction: AGENT_SYSTEM + accountsContext,
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        });

        // Fallback if no tool call returned
        if (!fnCallPart?.functionCall) {
            const fallbackText = 'How can I help you create something?';
            if (userId && imageChatId) {
                const asstMsg = await ImageMessage.create({
                    role: 'assistant', userId, content: fallbackText,
                    imageChatId, messageId: uuidv4(),
                });
                await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
            }
            return res.json({
                success: true, intent: 'reply', text: fallbackText, imageChatId,
                agentTurn: { role: 'model', parts: [{ text: fallbackText }] },
                geminiTurn: null,
            });
        }

        const { name: toolName, args: toolArgs } = fnCallPart.functionCall;
        console.log(`🔧 [AGENT] Tool selected: ${toolName}`, JSON.stringify(toolArgs));

        // ── Step 2a: reply ────────────────────────────────────────────────────
        if (toolName === 'reply') {
            const replyText = toolArgs.message || 'How can I help you?';
            if (userId && imageChatId) {
                const asstMsg = await ImageMessage.create({
                    role: 'assistant', userId, content: replyText,
                    imageChatId, messageId: uuidv4(),
                });
                await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
            }
            return res.json({
                success: true, intent: 'reply', text: replyText, imageChatId,
                agentTurn: { role: 'model', parts: [{ text: replyText }] },
                geminiTurn: null,
            });
        }

        // ── Step 2d: list_accounts ────────────────────────────────────────────
        if (toolName === 'list_accounts') {
            const accounts = await getConnectedAccounts(userId);
            let replyText;
            if (!accounts || accounts.length === 0) {
                replyText = "You don't have any Instagram accounts connected. Go to Settings to connect one.";
            } else {
                const list = accounts.map((a, i) => `${i + 1}. @${a.username}`).join('\n');
                replyText = `You have ${accounts.length} connected Instagram account${accounts.length > 1 ? 's' : ''}:\n\n${list}`;
            }
            if (userId && imageChatId) {
                const asstMsg = await ImageMessage.create({
                    role: 'assistant', userId, content: replyText,
                    imageChatId, messageId: uuidv4(),
                });
                await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
            }
            return res.json({
                success: true, intent: 'list_accounts', text: replyText,
                accounts: accounts.map(a => ({ id: a.id, username: a.username, profilePictureUrl: a.profilePictureUrl || null })),
                imageChatId,
                agentTurn: { role: 'model', parts: [{ text: replyText }] },
                geminiTurn: null,
            });
        }

        // ── Credit check (image tools only) ──────────────────────────────────
        const creditCost = toolName === 'create_variations'
            ? Math.min(toolArgs.count || (toolArgs.prompts?.length) || 4, 4)
            : (toolName === 'generate_image' || toolName === 'edit_image') ? 1 : 0;

        if (creditCost > 0 && userId) {
            const hasEnough = await creditsController.hasCredits(userId, creditCost);
            if (!hasEnough) {
                return res.status(402).json({
                    error: 'Insufficient credits',
                    creditsRequired: creditCost,
                    message: `You need ${creditCost} credit${creditCost > 1 ? 's' : ''} to generate ${toolName === 'create_variations' ? 'these variations' : 'this image'}. Please upgrade your plan.`,
                });
            }
        }

        // ── Step 2b: generate_image / edit_image ──────────────────────────────
        if (toolName === 'generate_image' || toolName === 'edit_image') {
            const prompt = toolArgs.prompt;
            const isEdit = toolName === 'edit_image';

            const resolvedAspectRatio = toolArgs.aspectRatio || aspectRatio;
            const resolvedImageSize = toolArgs.imageSize || imageSize;
            const imageConfig = {};
            if (resolvedAspectRatio) imageConfig.aspectRatio = resolvedAspectRatio;
            if (resolvedImageSize) imageConfig.imageSize = resolvedImageSize;

            const groundingTools = [];
            if (useGoogleSearch) {
                const gs = {};
                if (useImageSearch && isFlash) {
                    gs.searchTypes = { webSearch: {}, imageSearch: {} };
                }
                groundingTools.push({ googleSearch: gs });
            }

            const genConfig = {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig,
                thinkingConfig: { thinkingLevel },
                ...(groundingTools.length > 0 && { tools: groundingTools }),
            };

            // Build current user parts
            const currentParts = [{ text: prompt }];

            // Resolve reference images: user-uploaded > lastImageUrl for edits
            let finalImages = [...images];
            if (finalImages.length === 0 && isEdit && lastImageUrl) {
                finalImages = [{ data: lastImageUrl, mimeType: 'image/jpeg' }];
            }

            for (const img of finalImages) {
                let { data, mimeType = 'image/jpeg' } = img;
                if (!data) continue;
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

            // geminiHistory is completely separate from agentHistory
            const imageContents = [
                ...geminiHistory,
                { role: 'user', parts: currentParts },
            ];

            console.log(`🎨 [AGENT] Image generation config:`);
            console.log(JSON.stringify({
                imageModel,
                genConfig,
                geminiHistoryTurns: geminiHistory.length,
                imagesInTurn: currentParts.length - 1,
                totalTurns: imageContents.length,
            }, null, 2));

            const imageResponse = await ai.models.generateContentStream({
                model: imageModel,
                config: genConfig,
                contents: imageContents,
            });

            const generatedImages = [];
            let textResponse = '';
            let capturedThoughtSignature = null;
            let groundingMetadata = null;
            const responseParts = [];

            for await (const chunk of imageResponse) {
                const candidate = chunk.candidates?.[0];
                if (candidate?.groundingMetadata) groundingMetadata = candidate.groundingMetadata;

                for (const part of candidate?.content?.parts || []) {
                    if (part.thought) continue;

                    if (part.inlineData) {
                        const sig = part.thoughtSignature || null;
                        if (sig && !capturedThoughtSignature) {
                            capturedThoughtSignature = sig;
                            console.log(`🔑 [AGENT] Captured thoughtSignature (${sig.length} chars)`);
                        }
                        const buffer = Buffer.from(part.inlineData.data || '', 'base64');
                        const url = await uploadToS3(buffer, part.inlineData.mimeType);
                        console.log(`✅ [AGENT] Image uploaded: ${url}`);
                        generatedImages.push({ url, mimeType: part.inlineData.mimeType });
                        responseParts.push({
                            inlineData: { mimeType: part.inlineData.mimeType, data: part.inlineData.data },
                            ...(sig && { thoughtSignature: sig }),
                        });
                    }

                    if (part.text) {
                        textResponse += part.text;
                        const sig = part.thoughtSignature || null;
                        if (sig && !capturedThoughtSignature) capturedThoughtSignature = sig;
                        responseParts.push({ text: part.text, ...(sig && { thoughtSignature: sig }) });
                    }
                }
            }

            const imageUrl = generatedImages[0]?.url || null;
            const replyText = textResponse || (isEdit ? 'Here is your edited image!' : 'Here is your image!');

            // Deduct 1 credit after successful generation
            if (userId && imageUrl) {
                await creditsController.deductCredits(userId, 1, imageChatId, `${toolName} — ${message?.slice(0, 60) || 'image generation'}`);
            }

            // Save assistant message to DB
            if (userId && imageChatId) {
                const asstMsg = await ImageMessage.create({
                    role: 'assistant', userId,
                    content: replyText,
                    imageUrl,
                    imageMimeType: generatedImages[0]?.mimeType || 'image/jpeg',
                    thoughtSignature: capturedThoughtSignature || null,
                    imageChatId, messageId: uuidv4(),
                });
                await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
            }

            return res.json({
                success: true,
                intent: toolName,
                imageUrl,
                images: generatedImages,
                text: replyText,
                imageChatId,
                ...(groundingMetadata && { groundingMetadata }),
                // Text summary for agentHistory — no image data
                agentTurn: {
                    role: 'model',
                    parts: [{ text: `[${toolName}] ${replyText}` }],
                },
                // Full image turn for geminiHistory — with thoughtSignature
                geminiTurn: {
                    role: 'model',
                    parts: responseParts,
                },
            });
        }

        // ── Step 2c: schedule_post ────────────────────────────────────────────
        if (toolName === 'schedule_post') {
            const { caption, scheduledAt, hashtags = '' } = toolArgs;

            // Need an image to schedule — use lastImageUrl
            if (!lastImageUrl) {
                return res.json({
                    success: true,
                    intent: 'reply',
                    text: 'I need an image to schedule! Please generate one first.',
                    imageChatId,
                    agentTurn: { role: 'model', parts: [{ text: 'No image available to schedule.' }] },
                    geminiTurn: null,
                });
            }

            // Get user's connected Instagram accounts
            const accounts = await getConnectedAccounts(userId);

            if (!accounts || accounts.length === 0) {
                return res.json({
                    success: true,
                    intent: 'reply',
                    text: "You don't have any Instagram accounts connected. Go to Settings to connect your account first.",
                    imageChatId,
                    agentTurn: { role: 'model', parts: [{ text: 'No Instagram accounts connected.' }] },
                    geminiTurn: null,
                });
            }

            const scheduledDate = new Date(scheduledAt);
            if (isNaN(scheduledDate) || scheduledDate <= new Date()) {
                scheduledDate.setTime(Date.now() + 60 * 60 * 1000);
            }

            // Multiple accounts — return picker, don't schedule yet
            if (accounts.length > 1) {
                const pickerText = 'Which Instagram account would you like to post to?';
                if (userId && imageChatId) {
                    const asstMsg = await ImageMessage.create({
                        role: 'assistant', userId, content: pickerText,
                        imageChatId, messageId: uuidv4(),
                    });
                    await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
                }
                return res.json({
                    success: true,
                    intent: 'select_account',
                    text: pickerText,
                    accounts: accounts.map(a => ({
                        id: a.id,
                        username: a.username,
                        profilePictureUrl: a.profilePictureUrl || null,
                    })),
                    pendingPost: {
                        imageUrl: lastImageUrl,
                        caption,
                        hashtags,
                        scheduledAt: scheduledDate.toISOString(),
                        imageChatId: imageChatId || null,
                        userId,
                    },
                    imageChatId,
                    agentTurn: { role: 'model', parts: [{ text: pickerText }] },
                    geminiTurn: null,
                });
            }

            // Single account — schedule directly
            const account = accounts[0];
            const post = await ScheduledPost.create({
                userId,
                imageUrl: lastImageUrl,
                caption,
                hashtags,
                platform: 'instagram',
                accountId: account.id,
                scheduledAt: scheduledDate,
                imageChatId: imageChatId || null,
                status: 'scheduled',
            });

            const formattedTime = scheduledDate.toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
            });

            const replyText = `Scheduled! Your image will be posted to @${account.username || 'your account'} on ${formattedTime}.`;
            console.log(`📅 [AGENT] Scheduled post ${post._id} for ${formattedTime}`);

            if (userId && imageChatId) {
                const asstMsg = await ImageMessage.create({
                    role: 'assistant', userId, content: replyText,
                    imageChatId, messageId: uuidv4(),
                });
                await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
            }

            return res.json({
                success: true,
                intent: 'schedule_post',
                text: replyText,
                scheduledAt: scheduledDate.toISOString(),
                accountUsername: account.username,
                imageChatId,
                agentTurn: { role: 'model', parts: [{ text: replyText }] },
                geminiTurn: null,
            });
        }

        // ── Step 2e: create_variations ────────────────────────────────────────
        if (toolName === 'create_variations') {
            const rawPrompts = toolArgs.prompts || [];
            const count = Math.min(toolArgs.count || rawPrompts.length || 4, 4);
            // Pad or trim to count
            const prompts = rawPrompts.slice(0, count);
            while (prompts.length < count) prompts.push(rawPrompts[0] || 'A creative variation');

            const resolvedAspectRatio = toolArgs.aspectRatio || aspectRatio;
            const resolvedImageSize = toolArgs.imageSize || imageSize;
            const imageConfig = {};
            if (resolvedAspectRatio) imageConfig.aspectRatio = resolvedAspectRatio;
            if (resolvedImageSize) imageConfig.imageSize = resolvedImageSize;

            const groundingTools = [];
            if (useGoogleSearch) {
                const gs = {};
                if (useImageSearch && isFlash) gs.searchTypes = { webSearch: {}, imageSearch: {} };
                groundingTools.push({ googleSearch: gs });
            }

            const genConfig = {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig,
                thinkingConfig: { thinkingLevel },
                ...(groundingTools.length > 0 && { tools: groundingTools }),
            };

            // Resolve shared reference images (used by all variations)
            const sharedImageParts = [];
            for (const img of images) {
                let { data, mimeType = 'image/jpeg' } = img;
                if (!data) continue;
                if (typeof data === 'string' && data.startsWith('http')) {
                    const resp = await fetch(data);
                    const buf = Buffer.from(await resp.arrayBuffer());
                    data = buf.toString('base64');
                }
                if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) mimeType = 'image/jpeg';
                sharedImageParts.push({ inlineData: { mimeType, data } });
            }

            console.log(`🎨 [AGENT] Generating ${count} variations in parallel`);
            console.log(JSON.stringify({ imageModel, genConfig, count, prompts }, null, 2));

            // Generate all variations in parallel
            const variationResults = await Promise.all(prompts.map(async (prompt, idx) => {
                try {
                    const contents = [
                        ...geminiHistory,
                        { role: 'user', parts: [{ text: prompt }, ...sharedImageParts] },
                    ];

                    const stream = await ai.models.generateContentStream({
                        model: imageModel,
                        config: genConfig,
                        contents,
                    });

                    let imageUrl = null;
                    let text = '';
                    let mimeType = 'image/jpeg';

                    for await (const chunk of stream) {
                        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
                            if (part.thought) continue;
                            if (part.inlineData) {
                                const buffer = Buffer.from(part.inlineData.data || '', 'base64');
                                imageUrl = await uploadToS3(buffer, part.inlineData.mimeType);
                                mimeType = part.inlineData.mimeType;
                            }
                            if (part.text) text += part.text;
                        }
                    }

                    console.log(`✅ [AGENT] Variation ${idx + 1}/${count}: ${imageUrl}`);
                    return { imageUrl, text, prompt, mimeType, error: null };
                } catch (err) {
                    console.error(`❌ [AGENT] Variation ${idx + 1} failed:`, err.message);
                    return { imageUrl: null, text: '', prompt, mimeType: 'image/jpeg', error: err.message };
                }
            }));

            const successfulVariations = variationResults.filter(v => v.imageUrl);

            // Deduct 1 credit per successful variation
            if (userId && successfulVariations.length > 0) {
                await creditsController.deductCredits(userId, successfulVariations.length, imageChatId, `create_variations — ${successfulVariations.length} images`);
            }

            // Save one assistant message per variation
            if (userId && imageChatId) {
                for (const v of successfulVariations) {
                    const asstMsg = await ImageMessage.create({
                        role: 'assistant', userId,
                        content: v.text || 'Here is a variation!',
                        imageUrl: v.imageUrl,
                        imageMimeType: v.mimeType,
                        imageChatId, messageId: uuidv4(),
                    });
                    await ImageChat.updateOne({ imageChatId }, { $push: { messages: asstMsg._id } });
                }
            }

            return res.json({
                success: true,
                intent: 'create_variations',
                variations: variationResults,
                imageUrl: successfulVariations[0]?.imageUrl || null,
                text: `Here are ${successfulVariations.length} variations!`,
                imageChatId,
                agentTurn: {
                    role: 'model',
                    parts: [{ text: `[create_variations] Generated ${successfulVariations.length} variations` }],
                },
                geminiTurn: null, // Variations don't update geminiHistory (no single canonical image)
            });
        }

        return res.status(400).json({ error: `Unknown tool: ${toolName}` });

    } catch (error) {
        console.error('❌ [AGENT] Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
