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
 * Video API - Video generation with Veo
 */
export const videoAPI = {
  // Get User Video Conversations
  getUserConversations: async (userId) => {
    const response = await fetch(`${API_BASE_URL}/video/user/${userId}/conversations`, {
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
export const autopilotAPI = {
  // Get autopilot config
  getConfig: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/config/${userId}/${chatId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Update autopilot config
  updateConfig: async (userId, chatId, config) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/config/${userId}/${chatId}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(config),
    });
    return response.json();
  },

  // Get autopilot memory (brand info)
  getMemory: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/memory/${userId}/${chatId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Update autopilot memory (brand info)
  updateMemory: async (userId, chatId, brandInfo) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/memory/${userId}/${chatId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ brand: brandInfo }),
    });
    return response.json();
  },

  // Toggle autopilot on/off
  toggle: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/toggle/${userId}/${chatId}`, {
      method: 'POST',
      headers: headers(),
    });
    return response.json();
  },

  // Get full status
  getStatus: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/status/${userId}/${chatId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Run autopilot manually
  run: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/run/${userId}/${chatId}`, {
      method: 'POST',
      headers: headers(),
    });
    return response.json();
  },

  // Pause autopilot
  pause: async (userId, chatId, hours = 24) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/pause/${userId}/${chatId}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ hours }),
    });
    return response.json();
  },

  // Resume autopilot
  resume: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/resume/${userId}/${chatId}`, {
      method: 'POST',
      headers: headers(),
    });
    return response.json();
  },

  // Get reference images
  getImages: async (userId, chatId) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/images/${userId}/${chatId}`, {
      headers: headers(),
    });
    return response.json();
  },

  // Upload reference images (products, style, personal)
  uploadImages: async (userId, chatId, images, type = 'product') => {
    const response = await fetch(`${API_BASE_URL}/autopilot/images/${userId}/${chatId}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ images, type }),
    });
    return response.json();
  },

  // Delete a reference image
  deleteImage: async (userId, chatId, type, url) => {
    const response = await fetch(`${API_BASE_URL}/autopilot/images/${userId}/${chatId}`, {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ type, url }),
    });
    return response.json();
  },
};