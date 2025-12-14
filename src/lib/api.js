import { API_BASE_URL } from '../config';

const getAuthToken = () => localStorage.getItem('authToken');

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
};

/**
 * Analytics API - Track performance, engagement, and growth
 */
export const analyticsAPI = {
  // Get full dashboard
  getDashboard: async (userId, days = 30) => {
    const response = await fetch(`${API_BASE_URL}/analytics/dashboard/${userId}?days=${days}`, {
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
};