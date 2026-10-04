import { API_BASE_URL } from '../config';
import { getAuthToken } from './velosStorage';

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`
});

export const imageAPI = {
  // Generate Image
  generate: async (payload) => {
    console.log('📤 [API] Sending to /image/generate:', {
      prompt: payload.prompt?.slice(0, 50) + '...',
      userId: payload.userId,
      imageChatId: payload.imageChatId,
      isEdit: payload.isEdit,
      hasImages: !!payload.images,
      imagesCount: payload.images?.length || 0,
      allKeys: Object.keys(payload),
    });
    const response = await fetch(`${API_BASE_URL}/image/generate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Get Conversation History
  getConversation: async (imageChatId) => {
    const response = await fetch(`${API_BASE_URL}/image/conversation/${imageChatId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get User Conversations
  getUserConversations: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/image/user/${userId}/conversations`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get Project Settings
  getProjectSettings: async (imageChatId) => {
    const response = await fetch(`${API_BASE_URL}/image/project-settings/${imageChatId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Update Project Settings
  updateProjectSettings: async (imageChatId, settings) => {
    const response = await fetch(`${API_BASE_URL}/image/project-settings/${imageChatId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(settings),
    });
    return response.json();
  },

  // Delete a specific message
  deleteMessage: async (messageId) => {
    const response = await fetch(`${API_BASE_URL}/image/message/${messageId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return response.json();
  },

  // Delete entire conversation
  deleteConversation: async (imageChatId) => {
    const response = await fetch(`${API_BASE_URL}/image/conversation/${imageChatId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return response.json();
  }
};

/**
 * Gemini Direct API - Full-featured direct image generation/editing.
 *
 * generate(payload) — all fields optional except prompt:
 *   prompt          {string}    required
 *   userId          {string}
 *   imageChatId     {string}    existing chat (creates new if omitted)
 *   history         {Array}     multi-turn history turns
 *   images          {Array}     reference images [{data, mimeType}] up to 14
 *   model           {string}    'flash'|'pro'|'flash2'  (default: 'flash')
 *   aspectRatio     {string}    '1:1','4:5','16:9','9:16','3:2','2:3','4:3','3:4',
 *                               '1:4','4:1','1:8','8:1'
 *   imageSize       {string}    '512'(flash only),'1K','2K','4K'  (default: '2K')
 *   thinkingLevel   {string}    'minimal'|'High'  (default: 'minimal')
 *   includeThoughts {boolean}   return thought summaries in response
 *   useGoogleSearch {boolean}   enable Google Search grounding
 *   useImageSearch  {boolean}   enable Google Image Search (flash only)
 *   useWebSearch    {boolean}   enable Web Search alongside image search
 *   textOnly        {boolean}   TEXT-only response (no image generation)
 */
export const geminiAPI = {
  generate: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/gemini/generate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },
  agent: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/chat/agent`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...payload, stream: false }),
    });
    const data = await response.json();
    if (response.status === 402) {
      throw Object.assign(new Error(data.message || 'Insufficient credits'), { code: 'INSUFFICIENT_CREDITS' });
    }
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    // Normalize unified AgentService payload ({ intent, text, tools: [{name,result}] })
    // into the flat shape the chat UI expects (imageUrl, videoUrl, images, variations, accounts...).
    const toolResults = (data.tools || []).map((t) => t.result || {});
    const imageTool = toolResults.find((r) => r.imageUrl);
    const videoTool = toolResults.find((r) => r.jobId || r.videoUrl);
    const variationsTool = toolResults.find((r) => r.images);
    const scheduleTool = toolResults.find((r) => r.post !== undefined);
    const accountsTool = toolResults.find((r) => r.accounts);

    return {
      ...data,
      imageUrl: imageTool?.imageUrl || null,
      images: variationsTool?.images || null,
      variations: variationsTool?.images
        ? variationsTool.images.map((url) => ({ imageUrl: url }))
        : null,
      videoUrl: videoTool?.videoUrl || null,
      jobId: videoTool?.jobId || null,
      videoChatId: videoTool?.videoChatId || null,
      accounts: accountsTool?.accounts || data.accounts || null,
      isScheduled: data.intent === 'schedule_post' && !!scheduleTool,
      geminiTurn: data.geminiTurn || null,
    };
  },
};

/**
 * Video API - Video generation with Veo, Wan 2.7, Seedance 2.0
 */
export const videoAPI = {
  // Generate with Wan 2.7 Image-to-Video (KIE.ai)
  generateWan: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/video/generate-wan`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Generate with Bytedance Seedance 2.0 (KIE.ai)
  // Gemini Omni 1.1 Flash
  generateOmni: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/video/generate-omni`, {
      method: 'POST', headers: headers(), body: JSON.stringify(payload),
    });
    return response.json();
  },

  generateSeedance: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/video/generate-seedance`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Generate with Bytedance Seedance 2.0 Fast (KIE.ai)
  generateSeedanceFast: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/video/generate-seedance-fast`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Get User Video Conversations
  getUserConversations: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/video/user/${userId}/conversations`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Poll async video job status: { jobId, status, progress, resultUrl, error }
  getJobStatus: async (jobId) => {
    const response = await fetch(`${API_BASE_URL}/video/job/${jobId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get Video Conversation
  getConversation: async (videoChatId) => {
    const response = await fetch(`${API_BASE_URL}/video/conversation/${videoChatId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Schedule video with auto-generated viral caption
  schedule: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/video`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Generate caption preview (without scheduling)
  generateCaption: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/video/caption`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },
};

/**
 * Instagram API - Account management and posting
 */
export const instagramAPI = {
  // Get connected Instagram accounts for a user
  getSocialAccounts: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/instagram/info/${userId}`, {
      method: 'GET',
      headers: headers(),
    });
    const data = await response.json();
    // Transform to match expected format
    if (data.success && data.accounts) {
      return {
        success: true,
        accounts: data.accounts.map(acc => ({
          accountId: acc.id,
          instagramUsername: acc.username,
          pageName: acc.facebookPageName || acc.name,
          profilePictureUrl: acc.profilePictureUrl,
        })),
      };
    }
    return { success: false, accounts: [] };
  },

  // Get Facebook Pages for a user
  getFacebookPages: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/instagram/facebook-pages/${userId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Get Facebook Page content and engagement (for pages_read_engagement demo)
  getPageContent: async (userId, pageId) => {
    const response = await fetch(`${API_BASE_URL}/instagram/page-content/${userId}/${pageId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Publish image directly to Instagram (immediate, no scheduling)
  publishImage: async (userId, imageUrl, caption, accountId) => {
    const response = await fetch(`${API_BASE_URL}/instagram/publish`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId, imageUrl, caption, accountId }),
    });
    return response.json();
  },

  // Publish story directly to Instagram (immediate)
  publishStory: async (userId, imageUrl, accountId) => {
    const response = await fetch(`${API_BASE_URL}/instagram/publish-story`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId, imageUrl, accountId }),
    });
    return response.json();
  },
};

/**
 * Agent API - LLM-powered agent that decides which tools to use
 */
export const agentAPI = {
  chat: async (payload) => {
    console.log('🤖 [AGENT API] Sending to /agent:', {
      message: payload.message?.slice(0, 50) + '...',
      userId: payload.userId,
      imageChatId: payload.imageChatId,
      hasReferenceImages: !!payload.referenceImages?.length,
      hasLastImageUrl: !!payload.lastImageUrl,
    });
    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  /**
   * Stream chat with SSE for real-time updates
   * @param {Object} payload - Chat payload
   * @param {Object} callbacks - Event callbacks
   * @param {Function} callbacks.onThinking - Called when agent is thinking
   * @param {Function} callbacks.onIntent - Called when intent is classified
   * @param {Function} callbacks.onToolCall - Called when a tool is invoked
   * @param {Function} callbacks.onToolResult - Called when tool completes
   * @param {Function} callbacks.onToken - Called for each streamed token
   * @param {Function} callbacks.onImage - Called when image is generated
   * @param {Function} callbacks.onDone - Called when stream completes
   * @param {Function} callbacks.onError - Called on error
   * @returns {Promise<void>}
   */
  chatStream: async (payload, callbacks = {}) => {
    console.log('🌊 [AGENT API] Starting stream to /agent/stream:', {
      message: payload.message?.slice(0, 50) + '...',
      userId: payload.userId,
    });

    const response = await fetch(`${API_BASE_URL}/agent/stream`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      callbacks.onError?.({ message: error });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));

            switch (event.type) {
              case 'init':
                callbacks.onInit?.(event.data);
                break;
              case 'thinking':
                callbacks.onThinking?.(event.data);
                break;
              case 'intent':
                callbacks.onIntent?.(event.data);
                break;
              case 'tool_call':
                callbacks.onToolCall?.(event.data);
                break;
              case 'tool_result':
                callbacks.onToolResult?.(event.data);
                break;
              case 'answer_start':
                callbacks.onAnswerStart?.(event.data);
                break;
              case 'token':
                callbacks.onToken?.(event.data);
                break;
              case 'answer_end':
                callbacks.onAnswerEnd?.(event.data);
                break;
              case 'image':
                callbacks.onImage?.(event.data);
                break;
              case 'scheduled':
                callbacks.onScheduled?.(event.data);
                break;
              case 'accounts':
                callbacks.onAccounts?.(event.data);
                break;
              case 'clarification':
                callbacks.onClarification?.(event.data);
                break;
              case 'message':
                callbacks.onMessage?.(event.data);
                break;
              case 'progress':
                callbacks.onProgress?.(event.data);
                break;
              case 'done':
                callbacks.onDone?.(event.data);
                break;
              case 'error':
                callbacks.onError?.(event.data);
                break;
              default:
                console.log('🌊 [STREAM] Unknown event:', event);
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};


/**
 * Smart Chat API - AI-powered content generation with memory & profiles
 */
export const chatAPI = {
  // Main smart chat endpoint - understands intent and routes accordingly
  chat: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  // Execute image generation for a content job
  executeJob: async (jobId, referenceImages = []) => {
    const response = await fetch(`${API_BASE_URL}/chat/generate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ jobId, referenceImages }),
    });
    return response.json();
  },

  // Get content job status and results
  getJobStatus: async (jobId) => {
    const response = await fetch(`${API_BASE_URL}/chat/job/${jobId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get user profile
  getProfile: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/chat/profile/${userId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Update user profile
  updateProfile: async (userId, profileData) => {
    const response = await fetch(`${API_BASE_URL}/chat/profile/${userId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(profileData),
    });
    return response.json();
  },

  // Get user memories
  getMemories: async (userId, options = {}) => {
    const params = new URLSearchParams(options);
    const response = await fetch(`${API_BASE_URL}/chat/memory/${userId}?${params}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Add a memory
  addMemory: async (userId, memoryData) => {
    const response = await fetch(`${API_BASE_URL}/chat/memory/${userId}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(memoryData),
    });
    return response.json();
  },

  // Upload reference images (face, product, etc.)
  uploadReferenceImages: async (userId, images, type = 'face', tags = []) => {
    const response = await fetch(`${API_BASE_URL}/chat/reference/${userId}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ images, type, tags }),
    });
    return response.json();
  },

  // Get reference assets
  getReferenceAssets: async (userId, options = {}) => {
    const params = new URLSearchParams(options);
    const response = await fetch(`${API_BASE_URL}/chat/reference/${userId}?${params}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },
};

// Credits API
export const creditsAPI = {
  // Get user's credits
  getCredits: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/credits/${userId}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get transaction history
  getTransactions: async (userId, options = {}) => {
    const params = new URLSearchParams(options);
    const response = await fetch(`${API_BASE_URL}/credits/${userId}/transactions?${params}`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Get available plans
  getPlans: async () => {
    const response = await fetch(`${API_BASE_URL}/credits/plans/all`, {
      method: 'GET',
      headers: headers(),
    });
    return response.json();
  },

  // Create subscription
  createSubscription: async (userId, planKey, email, name) => {
    const response = await fetch(`${API_BASE_URL}/credits/subscribe`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId, planKey, email, name }),
    });
    return response.json();
  },

  // Verify payment
  verifyPayment: async (paymentData) => {
    const response = await fetch(`${API_BASE_URL}/credits/verify-payment`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(paymentData),
    });
    return response.json();
  },

  // Cancel subscription
  cancelSubscription: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/credits/cancel-subscription`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ userId }),
    });
    return response.json();
  },
};

/**
 * Scheduler API - Post scheduling and calendar
 */
export const schedulerAPI = {
  // Create a scheduled post
  createPost: async (postData) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/posts`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(postData),
    });
    return response.json();
  },

  // Get scheduled posts for a user
  getPosts: async (userId, options = {}) => {
    const params = new URLSearchParams();
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.status) params.append('status', options.status);

    const url = `${API_BASE_URL}/scheduler/posts/${userId}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, { headers: headers() });
    return response.json();
  },

  // Update a scheduled post
  updatePost: async (postId, updates) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/posts/${postId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(updates),
    });
    return response.json();
  },

  // Cancel a scheduled post
  cancelPost: async (postId) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/posts/${postId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return response.json();
  },

  // Get scheduler stats
  getStats: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/stats/${userId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Create a manual post (user-uploaded content, Buffer-style)
  createManualPost: async (postData) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/manual-post`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(postData),
    });
    return response.json();
  },

  // Upload media for preview (returns S3 URL)
  uploadMedia: async (media, type = 'image') => {
    const response = await fetch(`${API_BASE_URL}/scheduler/upload-media`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ media, type }),
    });
    return response.json();
  },

  // Publish immediately (no scheduling, direct to Instagram)
  publishNow: async (postData) => {
    const response = await fetch(`${API_BASE_URL}/scheduler/publish-now`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(postData),
    });
    return response.json();
  },
};

/**
 * Analytics API - Track performance, engagement, and growth
 */
export const analyticsAPI = {
  // Get full dashboard
  getDashboard: async (userId, days = 30, limit = 20) => {
    const response = await fetch(`${API_BASE_URL}/analytics/dashboard/${userId}?days=${days}&limit=${limit}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Get best posting times
  getBestTimes: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/analytics/best-times/${userId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Get content analysis (hashtags, post types)
  getContentAnalysis: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/analytics/content/${userId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Get growth metrics
  getGrowthMetrics: async (userId, days = 30) => {
    const response = await fetch(`${API_BASE_URL}/analytics/growth/${userId}?days=${days}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Refresh engagement data from Instagram
  refreshEngagement: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/analytics/refresh/${userId}`, {
      method: 'POST',
      headers: headers(),
    });
    return response.json();
  },

  // Get all connected Instagram accounts
  getAccounts: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/analytics/accounts/${userId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Get analytics directly from Instagram API (real-time)
  // Set fetchAll=true to get ALL posts (up to 2000)
  getInstagramDirect: async (userId, accountId = null, limit = 100, fetchAll = false) => {
    let url = `${API_BASE_URL}/analytics/instagram-direct/${userId}?limit=${limit}&fetchAll=${fetchAll}`;
    if (accountId) url += `&account=${accountId}`;
    const response = await fetch(url, {
      headers: headers(),
    });
    return response.json();
  },

  // Get comments for all recent posts
  getComments: async (userId, accountId = null, limit = 50) => {
    let url = `${API_BASE_URL}/analytics/comments/${userId}?limit=${limit}`;
    if (accountId) url += `&account=${accountId}`;
    const response = await fetch(url, {
      headers: headers(),
    });
    return response.json();
  },

  // Reply to a comment
  replyToComment: async (userId, commentId, message, accountId = null) => {
    const response = await fetch(`${API_BASE_URL}/analytics/comments/${userId}/reply`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ commentId, message, account: accountId }),
    });
    return response.json();
  },

  // Delete a comment
  deleteComment: async (userId, commentId, accountId = null) => {
    let url = `${API_BASE_URL}/analytics/comments/${userId}/${commentId}`;
    if (accountId) url += `?account=${accountId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: headers(),
    });
    return response.json();
  },

  // Hide or unhide a comment
  hideComment: async (userId, commentId, hide, accountId = null) => {
    const response = await fetch(`${API_BASE_URL}/analytics/comments/${userId}/${commentId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ hide, account: accountId }),
    });
    return response.json();
  },
};

/**
 * Autopilot API - Autonomous social media management
 */
// Query string that scopes a call to one autopilot (a user can have many).
const apq = (autopilotId, extra = {}) => {
  const params = new URLSearchParams();
  if (autopilotId) params.set('autopilotId', autopilotId);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const autopilotAPI = {
  // --- Autopilots: one per company, many per user --------------------------

  list: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/autopilots/${userId}`, { headers: headers() });
    return response.json();
  },

  create: async (userId, { name, websiteUrl, timezone } = {}) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/autopilots/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ name, websiteUrl, timezone }),
    });
    return response.json();
  },

  // name, websiteUrl, timezone, accounts: { instagram, linkedin, twitter }
  update: async (autopilotId, updates) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/autopilots/${autopilotId}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify(updates),
    });
    return response.json();
  },

  remove: async (autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/autopilots/${autopilotId}`, { method: 'DELETE', headers: headers() });
    return response.json();
  },

  // --- Per-autopilot ---------------------------------------------------------

  // Every platform's config for this autopilot plus its brand profile
  getConfigs: async (userId, autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/configs/${userId}${apq(autopilotId)}`, { headers: headers() });
    return response.json();
  },

  getConfig: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/config/${userId}${apq(autopilotId, { platform })}`, { headers: headers() });
    return response.json();
  },

  updateConfig: async (userId, autopilotId, platform, config) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/config/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ ...config, autopilotId, platform }),
    });
    return response.json();
  },

  // Read the company website and build this autopilot's brand profile
  crawlWebsite: async (userId, autopilotId, url) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/crawl/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, url }),
    });
    return response.json();
  },

  getMemory: async (userId, autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/memory/${userId}${apq(autopilotId)}`, { headers: headers() });
    return response.json();
  },

  updateMemory: async (userId, autopilotId, brandInfo) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/memory/${userId}`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ autopilotId, brand: brandInfo }),
    });
    return response.json();
  },

  toggle: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/toggle/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform }),
    });
    return response.json();
  },

  getStatus: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/status/${userId}${apq(autopilotId, { platform })}`, { headers: headers() });
    return response.json();
  },

  run: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/run/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform }),
    });
    return response.json();
  },

  pause: async (userId, autopilotId, platform, hours = 24) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/pause/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform, hours }),
    });
    return response.json();
  },

  resume: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/resume/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform }),
    });
    return response.json();
  },

  getImages: async (userId, autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/images/${userId}${apq(autopilotId)}`, { headers: headers() });
    return response.json();
  },

  uploadImages: async (userId, autopilotId, images, type = 'product') => {
    const response = await fetch(`${API_BASE_URL}/autopilot/images/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, images, type }),
    });
    return response.json();
  },

  deleteImage: async (userId, autopilotId, type, url) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/images/${userId}`, {
      method: 'DELETE', headers: headers(), body: JSON.stringify({ autopilotId, type, url }),
    });
    return response.json();
  },

  // --- Tasks ---------------------------------------------------------------
  // A task is one recurring content job: its own angle, format and cadence.

  generateTasks: async (userId, autopilotId, platform, { timezone, replace = true } = {}) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${userId}/generate`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform, timezone, replace }),
    });
    return response.json();
  },

  // Publish a real test post through this autopilot's account right now
  testPost: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/test/${userId}`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform }),
    });
    return response.json();
  },

  // Run the weekly agent self-review now and apply its safe changes
  selfReview: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${userId}/self-review`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform }),
    });
    return response.json();
  },

  // The platform agent's review: summary, insights and applyable suggestions
  getInsights: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${userId}/insights${apq(autopilotId, { platform })}`, { headers: headers() });
    return response.json();
  },

  getTasks: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${userId}${apq(autopilotId, { platform })}`, { headers: headers() });
    return response.json();
  },

  updateTask: async (taskId, updates) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${taskId}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify(updates),
    });
    return response.json();
  },

  deleteTask: async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${taskId}`, { method: 'DELETE', headers: headers() });
    return response.json();
  },

  // Fire a task once right now, ignoring its schedule
  runTask: async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${taskId}/run`, { method: 'POST', headers: headers() });
    return response.json();
  },

  getTaskRuns: async (taskId, limit = 20) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/tasks/${taskId}/runs?limit=${limit}`, { headers: headers() });
    return response.json();
  },

  // --- Approval queue -------------------------------------------------------

  // status: 'pending_approval' (default) or 'scheduled' (approved, waiting for its slot)
  getQueue: async (userId, { autopilotId, platform, status } = {}) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${userId}${apq(autopilotId, { platform, status })}`, { headers: headers() });
    return response.json();
  },

  // Publish this post right now, whatever its current state
  publishNow: async (postId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${postId}/publish-now`, { method: 'POST', headers: headers() });
    return response.json();
  },

  updateQueuedPost: async (postId, updates) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${postId}`, {
      method: 'PUT', headers: headers(), body: JSON.stringify(updates),
    });
    return response.json();
  },

  approvePost: async (postId, scheduledAt) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${postId}/approve`, {
      method: 'POST', headers: headers(), body: JSON.stringify(scheduledAt ? { scheduledAt } : {}),
    });
    return response.json();
  },

  // reason: one of the queue's REJECT_REASONS keys; note: optional words for the writer
  rejectPost: async (postId, reason, note) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${postId}/reject`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ reason, note }),
    });
    return response.json();
  },

  // --- Your first week (preview before connecting accounts) ---------------------

  startPreview: async (userId, url) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/preview/${userId}`, { method: 'POST', headers: headers(), body: JSON.stringify({ url }) });
    return response.json();
  },

  latestPreview: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/preview/${userId}`, { headers: headers() });
    return response.json();
  },

  getPreview: async (userId, previewId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/preview/${userId}/${previewId}`, { headers: headers() });
    return response.json();
  },

  usePreview: async (userId, previewId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/preview/${userId}/${previewId}/use`, { method: 'POST', headers: headers() });
    return response.json();
  },

  // --- Weekly report, comment replies -----------------------------------------

  getReport: async (userId, autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/report/${userId}${apq(autopilotId)}`, { headers: headers() });
    return response.json();
  },

  getReplies: async (userId, autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/replies/${userId}${apq(autopilotId)}`, { headers: headers() });
    return response.json();
  },

  sendReply: async (userId, replyId, text) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/replies/${userId}/${replyId}/send`, { method: 'POST', headers: headers(), body: JSON.stringify({ text }) });
    return response.json();
  },

  dismissReply: async (userId, replyId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/replies/${userId}/${replyId}/dismiss`, { method: 'POST', headers: headers() });
    return response.json();
  },

  // --- Trust ladder, pauses ---------------------------------------------------

  getTrust: async (userId, autopilotId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/trust/${userId}${apq(autopilotId)}`, { headers: headers() });
    return response.json();
  },

  resetTrust: async (userId, autopilotId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/trust/${userId}/reset`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ autopilotId, platform }),
    });
    return response.json();
  },

  getPauses: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/pauses/${userId}`, { headers: headers() });
    return response.json();
  },

  resumePlatform: async (userId, platform) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/pauses/${userId}/${platform}/resume`, { method: 'POST', headers: headers() });
    return response.json();
  },

  // Let the agent fix a held post itself (rewrites copy or re-renders the image, re-reviews)
  fixPost: async (postId, instructions) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${postId}/fix`, {
      method: 'POST', headers: headers(), body: JSON.stringify(instructions ? { instructions } : {}),
    });
    return response.json();
  },

  regeneratePost: async (postId, prompt) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/queue/${postId}/regenerate`, {
      method: 'POST', headers: headers(), body: JSON.stringify(prompt ? { prompt } : {}),
    });
    return response.json();
  },
};

/**
 * LinkedIn API - connection and publishing.
 *
 * Unlike the Instagram routes, every /linkedin endpoint is authenticated and
 * takes the userId from the JWT, so these calls must go through `headers()`.
 */
export const linkedinAPI = {
  // Start the OAuth flow - returns { oauthUrl, state }
  getOAuthUrl: async () => {
    const response = await fetch(`${API_BASE_URL}/linkedin/oauth-url`, {
      headers: headers(),
    });
    return response.json();
  },

  // Finish the OAuth flow from the callback page
  completeCallback: async (code, state) => {
    const response = await fetch(`${API_BASE_URL}/linkedin/callback`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code, state }),
    });
    return response.json();
  },

  // Connected LinkedIn account(s)
  getInfo: async () => {
    const response = await fetch(`${API_BASE_URL}/linkedin/info`, {
      headers: headers(),
    });
    return response.json();
  },

  // Company pages the member administers (needs Community Management API)
  getOrganizations: async () => {
    const response = await fetch(`${API_BASE_URL}/linkedin/organizations`, {
      headers: headers(),
    });
    return response.json();
  },

  // Post as the member profile (organizationId omitted) or as a company page
  setAuthor: async (accountId, organizationId) => {
    const response = await fetch(`${API_BASE_URL}/linkedin/author`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ accountId, organizationId }),
    });
    return response.json();
  },

  disconnect: async (accountId) => {
    const response = await fetch(`${API_BASE_URL}/linkedin/disconnect`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(accountId ? { accountId } : {}),
    });
    return response.json();
  },

  refreshToken: async (accountId) => {
    const response = await fetch(`${API_BASE_URL}/linkedin/refresh-token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(accountId ? { accountId } : {}),
    });
    return response.json();
  },

  // Direct publish - used by the "post a test" button
  publish: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/linkedin/publish`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },
};

/**
 * X (Twitter) API - connection and publishing.
 * Authenticated like the LinkedIn routes; userId comes from the JWT.
 */
export const twitterAPI = {
  // Start the OAuth 2.0 + PKCE flow - returns { oauthUrl, state }
  getOAuthUrl: async () => {
    const response = await fetch(`${API_BASE_URL}/twitter/oauth-url`, {
      headers: headers(),
    });
    return response.json();
  },

  // Finish the flow from the callback page
  completeCallback: async (code, state) => {
    const response = await fetch(`${API_BASE_URL}/twitter/callback`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code, state }),
    });
    return response.json();
  },

  getInfo: async () => {
    const response = await fetch(`${API_BASE_URL}/twitter/info`, {
      headers: headers(),
    });
    return response.json();
  },

  disconnect: async (accountId) => {
    const response = await fetch(`${API_BASE_URL}/twitter/disconnect`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(accountId ? { accountId } : {}),
    });
    return response.json();
  },

  refreshToken: async (accountId) => {
    const response = await fetch(`${API_BASE_URL}/twitter/refresh-token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(accountId ? { accountId } : {}),
    });
    return response.json();
  },

  // Direct publish - used by the "post a test" button
  publish: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/twitter/publish`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },
};