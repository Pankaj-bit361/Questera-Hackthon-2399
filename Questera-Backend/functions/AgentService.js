const { GoogleGenAI } = require('@google/genai');
const Instagram = require('../models/instagram');
const ImageOrchestrator = require('./ImageOrchestrator');
const MemoryService = require('./Memory');
const ContentEngine = require('./ContentEngine');
const {
  CREDIT_COSTS, ensureCredits, deductCreditsSafe,
  saveImageTurn, recordUsage, sseWrite, initSse,
} = require('./sharedHelpers');

const MAX_TOOL_ITERATIONS = 4;
const TOOL_MODEL = 'gemini-2.5-flash';

const TOOLS = [
  { name: 'generate_image', description: 'Generate a brand new image from a text description.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, aspectRatio: { type: 'string' } }, required: ['prompt'] } },
  { name: 'edit_image', description: 'Edit or modify the previously generated image.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, aspectRatio: { type: 'string' } }, required: ['prompt'] } },
  { name: 'create_variations', description: 'Generate multiple image variations in parallel. Max 4.', parameters: { type: 'object', properties: { prompts: { type: 'array', items: { type: 'string' } }, count: { type: 'integer' } }, required: ['prompts'] } },
  { name: 'generate_video', description: 'Generate a video with Veo 3.1. Returns a job that completes asynchronously.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, resolution: { type: 'string' }, aspectRatio: { type: 'string' }, durationSeconds: { type: 'integer' } }, required: ['prompt'] } },
  { name: 'schedule_post', description: 'Schedule the last generated image to Instagram.', parameters: { type: 'object', properties: { caption: { type: 'string' }, scheduledAt: { type: 'string' }, hashtags: { type: 'string' } }, required: ['caption', 'scheduledAt'] } },
  { name: 'list_accounts', description: 'List connected Instagram accounts.', parameters: { type: 'object', properties: {} } },
  { name: 'viral_content', description: 'Find viral ideas, trends, or analyze a competitor @handle.', parameters: { type: 'object', properties: { query: { type: 'string' }, handle: { type: 'string' } }, required: ['query'] } },
  { name: 'live_generation', description: 'Start continuous recurring image generation + auto-post.', parameters: { type: 'object', properties: { description: { type: 'string' }, intervalMinutes: { type: 'integer' } }, required: ['description'] } },
  { name: 'reply', description: 'Send a plain text reply when no generation is needed.', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
];

const SYSTEM = `You are Questera, an AI creative director for visual content and social posting.
Call tools to generate/edit images, generate videos, schedule Instagram posts, find viral ideas, or start live generation.
Use reply for greetings/questions. You may call multiple tools in sequence when the user asks (e.g. generate then schedule).
Enhance image/video prompts with lighting, mood, composition, and style. Never invent Instagram account names.`;

class AgentService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.imageOrch = new ImageOrchestrator();
    this.memory = new MemoryService();
    this.contentEngine = new ContentEngine();
  }

  async getConnectedAccounts(userId) {
    const doc = await Instagram.findOne({ userId }).lean();
    if (!doc) return [];
    if (doc.accounts?.length) {
      return doc.accounts.filter((a) => a.isConnected).map((a) => ({
        id: a.instagramBusinessAccountId, username: a.instagramUsername,
        profilePictureUrl: a.profilePictureUrl || null,
      }));
    }
    if (doc.instagramBusinessAccountId && doc.isConnected) {
      return [{ id: doc.instagramBusinessAccountId, username: doc.instagramUsername, profilePictureUrl: doc.profilePictureUrl || null }];
    }
    return [];
  }

  emit(res, event, data) {
    if (res) sseWrite(res, event, data);
  }

  async handleChat(req, res) {
    const stream = req.body?.stream !== false && !!res;
    const {
      userId, message, imageChatId, videoChatId, lastImageUrl, lastVideoUrl,
      referenceImages = [], agentHistory = [],
    } = req.body || {};

    if (!message) {
      const err = { error: 'message is required' };
      if (stream) { initSse(res); this.emit(res, 'error', err); res.end(); return; }
      return { status: 400, json: err };
    }

    if (stream) {
      initSse(res);
      this.emit(res, 'status', { state: 'started' });
    }
    const startedAt = Date.now();
    let chatId = imageChatId;
    let currentLastImageUrl = lastImageUrl;
    let currentLastVideoUrl = lastVideoUrl;
    let currentVideoChatId = videoChatId;

    try {
      if (userId) {
        const saved = await saveImageTurn(chatId, userId, 'user', message, { referenceImages });
        chatId = saved.imageChatId;
      }

      const accounts = userId ? await this.getConnectedAccounts(userId) : [];
      const accountsCtx = accounts.length
        ? `\nConnected Instagram accounts:\n${accounts.map((a, i) => `  ${i + 1}. @${a.username}`).join('\n')}`
        : '\nNo Instagram accounts connected.';
      const contextString = userId ? await this.memory.buildContextForLLM(userId, { imageChatId: chatId }) : '';

      const contents = [
        ...agentHistory,
        { role: 'user', parts: [{ text: message }] },
      ];

      const toolResults = [];
      let lastText = '';
      let lastIntent = 'reply';

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const response = await this.ai.models.generateContent({
          model: TOOL_MODEL,
          contents,
          config: {
            systemInstruction: `${SYSTEM}\n\nUser context:\n${contextString}${accountsCtx}\nToday: ${new Date().toISOString()}`,
            tools: [{ functionDeclarations: TOOLS }],
            temperature: 0.3,
          },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const functionCalls = parts.filter((p) => p.functionCall);
        const textParts = parts.filter((p) => p.text).map((p) => p.text).join('');

        if (!functionCalls.length) {
          lastText = textParts || lastText || 'How can I help you create something?';
          this.emit(res, 'text', { text: lastText });
          break;
        }

        contents.push({ role: 'model', parts });
        const fnResponseParts = [];

        for (const part of functionCalls) {
          const { name, args } = part.functionCall;
          lastIntent = name;
          this.emit(res, 'tool_call', { name, args, status: 'started' });
          const result = await this.executeTool(name, args || {}, {
            userId, chatId, videoChatId: currentVideoChatId,
            lastImageUrl: currentLastImageUrl, lastVideoUrl: currentLastVideoUrl,
            referenceImages, accounts, message,
          });
          toolResults.push({ name, result });
          this.emit(res, 'tool_result', { name, status: result.ok ? 'done' : 'error', result });
          if (result.imageUrl || result.videoUrl) {
            this.emit(res, 'media', {
              type: result.videoUrl ? 'video' : 'image',
              url: result.videoUrl || result.imageUrl,
              jobId: result.jobId || null,
              status: result.status || 'completed',
            });
          }
          if (result.imageChatId) chatId = result.imageChatId;
          if (result.imageUrl) currentLastImageUrl = result.imageUrl;
          if (result.videoUrl) currentLastVideoUrl = result.videoUrl;
          if (result.videoChatId) currentVideoChatId = result.videoChatId;
          fnResponseParts.push({
            functionResponse: { name, response: result },
          });
          if (name === 'reply' && result.text) lastText = result.text;
        }

        contents.push({ role: 'user', parts: fnResponseParts });

        const onlyReply = functionCalls.every((p) => p.functionCall.name === 'reply');
        if (onlyReply) break;
      }

      if (!lastText) {
        lastText = toolResults.map((t) => t.result?.text).filter(Boolean).join('\n') || 'Done.';
        this.emit(res, 'text', { text: lastText });
      }

      if (userId && chatId) {
        const videoResult = toolResults.find((t) => t.result?.jobId || t.result?.videoUrl)?.result;
        await saveImageTurn(chatId, userId, 'assistant', lastText, {
          imageUrl: toolResults.find((t) => t.result?.imageUrl)?.result?.imageUrl,
          videoUrl: videoResult?.videoUrl,
          videoJobId: videoResult?.jobId,
        });
      }

      await recordUsage({
        userId, tool: lastIntent, provider: 'gemini', model: TOOL_MODEL,
        success: true, chatId, latencyMs: Date.now() - startedAt,
      });

      const payload = {
        success: true, intent: lastIntent, text: lastText, imageChatId: chatId,
        tools: toolResults, agentTurn: { role: 'model', parts: [{ text: lastText }] },
      };
      this.emit(res, 'done', payload);
      if (stream) { res.end(); return; }
      return { status: 200, json: payload };
    } catch (error) {
      console.error('❌ [AGENT] Error:', error.message);
      const status = error.statusCode || 500;
      const json = { error: error.message, creditsRequired: error.creditsRequired, balance: error.balance };
      this.emit(res, 'error', json);
      if (stream) { res.end(); return; }
      return { status, json };
    }
  }

  async executeTool(name, args, ctx) {
    try {
      switch (name) {
        case 'generate_image':
        case 'edit_image':
          return await this.runImageTool(name, args, ctx);
        case 'create_variations':
          return await this.runVariations(args, ctx);
        case 'generate_video':
          return await this.runVideoTool(args, ctx);
        case 'schedule_post':
          return await this.runSchedule(args, ctx);
        case 'list_accounts':
          return await this.runListAccounts(ctx);
        case 'viral_content':
          return await this.runViral(args, ctx);
        case 'live_generation':
          return await this.runLiveGen(args, ctx);
        case 'reply':
        default:
          return { ok: true, text: args.message || 'How can I help you?' };
      }
    } catch (error) {
      return { ok: false, text: error.message, error: error.message };
    }
  }

  async runImageTool(name, args, ctx) {
    const cost = CREDIT_COSTS.generate_image;
    if (ctx.userId) await ensureCredits(ctx.userId, cost);
    const refs = [...(ctx.referenceImages || [])];
    if (!refs.length && name === 'edit_image' && ctx.lastImageUrl) {
      refs.push({ data: ctx.lastImageUrl, mimeType: 'image/jpeg' });
    }
    const startedAt = Date.now();
    const result = await this.imageOrch.generateSingleImage(args.prompt, refs, {
      aspectRatio: args.aspectRatio,
    });
    if (ctx.userId && result.imageUrl) {
      await deductCreditsSafe(ctx.userId, cost, ctx.chatId, `${name} — ${String(args.prompt || '').slice(0, 60)}`);
    }
    await recordUsage({
      userId: ctx.userId, tool: name, provider: 'gemini', model: this.imageOrch.imageModel,
      creditsCost: result.imageUrl ? cost : 0, success: !!result.imageUrl,
      chatId: ctx.chatId, resultUrl: result.imageUrl, latencyMs: Date.now() - startedAt,
    });
    return {
      ok: !!result.imageUrl,
      imageUrl: result.imageUrl,
      text: result.textResponse || (name === 'edit_image' ? 'Here is your edited image!' : 'Here is your image!'),
      imageChatId: ctx.chatId,
    };
  }

  async runVariations(args, ctx) {
    const prompts = (args.prompts || []).slice(0, 4);
    while (prompts.length < Math.min(args.count || prompts.length || 1, 4)) {
      prompts.push(prompts[0] || args.prompt || 'A creative variation');
    }
    if (ctx.userId) await ensureCredits(ctx.userId, prompts.length);
    const startedAt = Date.now();
    const results = await Promise.all(prompts.map(async (prompt) => {
      try {
        return await this.imageOrch.generateSingleImage(prompt, ctx.referenceImages || []);
      } catch (err) {
        return { imageUrl: null, textResponse: err.message, prompt };
      }
    }));
    const ok = results.filter((r) => r.imageUrl);
    if (ctx.userId && ok.length) {
      await deductCreditsSafe(ctx.userId, ok.length, ctx.chatId, `create_variations — ${ok.length} images`);
    }
    await recordUsage({
      userId: ctx.userId, tool: 'create_variations', provider: 'gemini',
      creditsCost: ok.length, success: ok.length > 0, chatId: ctx.chatId,
      resultUrl: ok[0]?.imageUrl, latencyMs: Date.now() - startedAt,
    });
    return {
      ok: ok.length > 0,
      imageUrl: ok[0]?.imageUrl || null,
      images: ok.map((r) => r.imageUrl),
      text: `Here are ${ok.length} variations!`,
      imageChatId: ctx.chatId,
    };
  }

  async runVideoTool(args, ctx) {
    if (ctx.userId) await ensureCredits(ctx.userId, CREDIT_COSTS.generate_video);
    const { VideoController } = require('./Video');
    const controller = new VideoController();
    const result = await controller.generate({
      body: {
        userId: ctx.userId,
        prompt: args.prompt,
        videoChatId: ctx.videoChatId,
        lastVideoUrl: ctx.lastVideoUrl,
        resolution: args.resolution || '720p',
        aspectRatio: args.aspectRatio || '16:9',
        durationSeconds: args.durationSeconds || 8,
        referenceImages: ctx.referenceImages || [],
      },
    });
    const json = result.json || {};
    return {
      ok: result.status < 400,
      jobId: json.jobId,
      videoChatId: json.videoChatId,
      status: json.status || 'processing',
      text: json.jobId
        ? `Video generation started. Job ${json.jobId} is processing — poll GET /api/video/job/${json.jobId}.`
        : (json.error || 'Video generation failed'),
      videoUrl: json.message?.videoUrl || null,
    };
  }

  async runSchedule(args, ctx) {
    if (!ctx.lastImageUrl) {
      return { ok: false, text: 'I need an image to schedule. Generate one first.' };
    }
    if (!ctx.accounts?.length) {
      return { ok: false, text: "You don't have any Instagram accounts connected." };
    }
    const SchedulerController = require('./Scheduler');
    const scheduler = new SchedulerController();
    const scheduledAt = args.scheduledAt && !Number.isNaN(Date.parse(args.scheduledAt))
      ? args.scheduledAt
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await scheduler.createScheduledPost({
      body: {
        userId: ctx.userId,
        imageUrl: ctx.lastImageUrl,
        caption: args.caption || '',
        hashtags: args.hashtags || '',
        platform: 'instagram',
        accountId: ctx.accounts[0].id,
        scheduledAt,
        imageChatId: ctx.chatId,
      },
    });
    return {
      ok: result.status === 200,
      text: result.status === 200
        ? `Scheduled to @${ctx.accounts[0].username} at ${scheduledAt}.`
        : (result.json?.error || 'Could not schedule post'),
      post: result.json?.post,
    };
  }

  async runListAccounts(ctx) {
    const accounts = ctx.accounts || [];
    if (!accounts.length) {
      return { ok: true, accounts: [], text: "You don't have any Instagram accounts connected." };
    }
    return {
      ok: true,
      accounts,
      text: `You have ${accounts.length} connected account${accounts.length > 1 ? 's' : ''}:\n${accounts.map((a, i) => `${i + 1}. @${a.username}`).join('\n')}`,
    };
  }

  async runViral(args, ctx) {
    const ViralContentService = require('./ViralContentService');
    const viral = new ViralContentService();
    const handle = args.handle || (args.query || '').match(/@(\w+)/)?.[1];
    if (handle) {
      const analysis = await viral.analyzeCompetitor(handle, 'instagram');
      return { ok: true, analysis, text: `Analysis of @${handle} is ready.` };
    }
    const profile = ctx.userId ? await this.memory.getActiveProfile(ctx.userId) : {};
    const ideas = await viral.generateViralIdeas(ctx.userId, {
      niche: profile?.niche || 'general',
      platform: 'instagram',
      brandDescription: profile?.description || '',
      targetAudience: profile?.targetAudience || '',
      count: 5,
    });
    return { ok: true, ideas: ideas.ideas, trends: ideas.trends, text: 'Here are viral content ideas tailored to your brand.' };
  }

  async runLiveGen(args, ctx) {
    const LiveGenerationService = require('./LiveGenerationService');
    const live = new LiveGenerationService();
    const instagram = await Instagram.findOne({ userId: ctx.userId, isConnected: true });
    if (!instagram) {
      return { ok: false, text: 'Connect Instagram first to start live generation.' };
    }
    const job = await live.createJob(ctx.userId, {
      name: `Live Content - ${new Date().toLocaleDateString()}`,
      description: args.description,
      basePrompt: args.description,
      socialAccountId: instagram.instagramBusinessAccountId,
      platform: 'instagram',
      intervalMinutes: args.intervalMinutes || 60,
      autoPost: true,
    });
    return {
      ok: true,
      job: { jobId: job.jobId, nextRunAt: job.schedule?.nextRunAt, intervalMinutes: job.schedule?.intervalMinutes },
      text: `Live generation started. Next run at ${job.schedule?.nextRunAt}.`,
    };
  }
}

module.exports = AgentService;
module.exports.TOOLS = TOOLS;
module.exports.SYSTEM = SYSTEM;
module.exports.MAX_TOOL_ITERATIONS = MAX_TOOL_ITERATIONS;
module.exports.TOOL_MODEL = TOOL_MODEL;
