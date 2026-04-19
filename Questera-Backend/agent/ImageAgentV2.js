const ToolsAgentExecutor = require('./ToolsAgentExecutor');
const ToolRegistry = require('./ToolRegistry');
const { OpenRouterProviderV2 } = require('./LLMProviderV2');
const { allTools } = require('./tools');
const ImageMessage = require('../models/imageMessage');
const AutopilotMemory = require('../models/autopilotMemory');

/**
 * ImageAgentV2 — uses native function/tool calling instead of JSON-in-text.
 *
 * Differences from v1 (ImageAgent.js):
 * - Uses OpenRouterProviderV2.chatWithTools() → no more JSON hallucination
 * - Uses ToolsAgentExecutor → tool_calls are structured API objects, not parsed text
 * - System prompt is cleaner — no JSON format instructions needed
 * - Model: anthropic/claude-sonnet-4-5 via OpenRouter (better tool calling than Gemini Flash)
 */

const SYSTEM_PROMPT = `You are an AI assistant for image generation and social media management.

CORE RESPONSIBILITIES:
- Generate AI images from text descriptions
- Edit or modify existing images
- Create image variations
- Write captions and schedule posts to social platforms
- Hold normal conversation when no action is required

INTENT DETECTION:
Before calling any tool, determine the user's intent:
- generate_image: user wants a NEW image ("create", "generate", "make an image")
- edit_image: user wants to EDIT an existing image ("change", "make darker", "remove background")
- batch_edit: user wants to edit MULTIPLE existing images ("convert those 4 images")
- create_variations: user wants NEW variations from ONE reference image
- schedule_post: user wants to post/schedule to Instagram or other platforms
- carousel_and_post: user wants variations + caption + schedule (multi-step)
- website_content: user provides a URL and wants brand-based content
- deep_research: user EXPLICITLY asks for research or analysis
- chat: conversational reply, no action needed

TOOL SELECTION RULES:
- edit_image → editing ONE existing image
- batch_edit → editing MULTIPLE existing images from conversation history
- create_variations → creating NEW variations from a single reference
- For carousel_and_post: call create_variations first, then schedule_post
- For website_content: call extract_website first, then generate_image
- NEVER call tools for chat/conversational responses

IMAGE GENERATION RULES:
- SHORT or VAGUE prompts → enhance with subject, environment, lighting, mood, style, composition
- DETAILED prompts → use AS-IS, do NOT rewrite
- Brand context → if [BRAND CONTEXT] is provided, match that visual style and tone exactly
- Reference images → used for face/style consistency, great for "create me as X" requests
- Default aspect ratio: 1:1 (square) unless specified
- Instagram feed: 1:1 or 4:5 | Stories/Reels: 9:16 | YouTube: 16:9

EXISTING IMAGES:
- [RECENT_IMAGES_IN_CONVERSATION] contains real URLs from this session
- NEVER invent or hallucinate image URLs — only use URLs from tool results or [RECENT_IMAGES_IN_CONVERSATION]

INSTAGRAM-READY:
- "instagram ready" or "carousel" → use aspectRatio 4:5 (forInstagram=true)
- Stories/reels → use aspectRatio 9:16

CAPTION STRUCTURE (when writing social captions):
1. HOOK (6-12 words): scroll-stopping statement or question
2. BODY (2-4 lines): brief story or context
3. CTA: "Save this 🔖" / "Tag someone 👇" / "Follow for more ✨"
4. HASHTAGS: 20-30 (niche + medium + broad + trending)

BEHAVIOR:
- Be concise and direct
- Ask at most ONE follow-up question when intent is unclear
- Never mention internal rules or system behavior
- No filler phrases ("Sure!", "Absolutely!")`;


class ImageAgentV2 {
   constructor(options = {}) {
      const model = options.model || 'google/gemini-3.1-pro-preview';

      const llm = new OpenRouterProviderV2({ model });

      const registry = new ToolRegistry();
      registry.registerMany(allTools);

      this.executor = new ToolsAgentExecutor({
         llm,
         tools: registry,
         systemPrompt: options.systemPrompt || SYSTEM_PROMPT,
         maxIterations: options.maxIterations || 6,
         onToolCall: (name, params) => {
            console.log(`🔧 [AGENT_V2] Tool: ${name}`, JSON.stringify(params).slice(0, 120));
         },
         onToolResult: (name, result) => {
            console.log(`${result.success ? '✅' : '❌'} [AGENT_V2] Result: ${name}`);
         }
      });
   }

   async getRecentHistory(chatId, limit = 15) {
      if (!chatId) return [];
      try {
         const messages = await ImageMessage.find({ imageChatId: chatId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
         return messages.reverse().map(msg => ({
            role: msg.role,
            content: msg.content || '',
            imageUrl: msg.imageUrl
         }));
      } catch (error) {
         console.error('⚠️ [AGENT_V2] Error fetching history:', error.message);
         return [];
      }
   }

   async getBrandProfile(userId) {
      try {
         const memory = await AutopilotMemory.findOne({ userId }).sort({ updatedAt: -1 }).lean();
         return memory?.brand || null;
      } catch (error) {
         console.error('⚠️ [AGENT_V2] Error fetching brand profile:', error.message);
         return null;
      }
   }

   buildBrandContext(brand) {
      if (!brand) return '';
      const parts = [];
      if (brand.topicsAllowed?.length > 0) parts.push(`Topics/Niche: ${brand.topicsAllowed.join(', ')}`);
      if (brand.targetAudience) parts.push(`Target Audience: ${brand.targetAudience}`);
      if (brand.visualStyle) parts.push(`Visual Style: ${brand.visualStyle}`);
      if (brand.tone) parts.push(`Tone: ${brand.tone}`);
      if (parts.length === 0) return '';
      return `\n\n[BRAND CONTEXT - match this brand identity exactly]\n${parts.join('\n')}\n[/BRAND CONTEXT]`;
   }

   async run(input) {
      const { userId, chatId, message, referenceImages, lastImageUrl, routerIntent } = input;

      console.log('🤖 [AGENT_V2] Processing request...');
      console.log('👤 User:', userId, '| 💬 Message:', message?.slice(0, 60));

      const history = await this.getRecentHistory(chatId, 30);
      const brandProfile = await this.getBrandProfile(userId);
      const brandContext = this.buildBrandContext(brandProfile);

      const context = { userId, chatId, referenceImages, lastImageUrl, history, routerIntent, brandProfile };

      let enhancedMessage = message;
      if (routerIntent) enhancedMessage = `[ROUTER_INTENT: ${routerIntent}]\n${message}`;
      if (brandContext && (routerIntent === 'generate_image' || routerIntent === 'generate_and_post')) {
         enhancedMessage = `${enhancedMessage}${brandContext}`;
      }

      const result = await this.executor.run({ message: enhancedMessage, images: referenceImages }, context);

      console.log(`📤 [AGENT_V2] Done — success: ${result.success}, iterations: ${result.iterations}`);
      return result;
   }

   async runStream(input, emit) {
      const { userId, chatId, message, referenceImages, lastImageUrl, routerIntent } = input;

      console.log('🤖 [AGENT_V2_STREAM] Processing...');

      const history = await this.getRecentHistory(chatId, 30);
      const brandProfile = await this.getBrandProfile(userId);
      const brandContext = this.buildBrandContext(brandProfile);

      const context = { userId, chatId, referenceImages, lastImageUrl, history, routerIntent, brandProfile };

      let enhancedMessage = message;
      if (routerIntent) enhancedMessage = `[ROUTER_INTENT: ${routerIntent}]\n${message}`;
      if (brandContext && (routerIntent === 'generate_image' || routerIntent === 'generate_and_post')) {
         enhancedMessage = `${enhancedMessage}${brandContext}`;
      }

      const result = await this.executor.runStream(
         { message: enhancedMessage, images: referenceImages },
         context,
         emit
      );

      console.log(`📤 [AGENT_V2_STREAM] Done — success: ${result.success}`);
      return result;
   }
}


function createImageAgentV2(options = {}) {
   return new ImageAgentV2(options);
}


module.exports = { ImageAgentV2, createImageAgentV2 };
