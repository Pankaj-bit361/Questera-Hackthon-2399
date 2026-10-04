const AutopilotConfig = require('../../models/autopilotConfig');
const AutopilotMemory = require('../../models/autopilotMemory');
const { CognitiveNarrator } = require('../CognitiveNarrator');

const narrator = new CognitiveNarrator();

/**
 * Autopilot Tool - Enables autopilot mode with brand onboarding
 *
 * Flow:
 * 1. User asks to enable autopilot
 * 2. If brand info missing, return questions for agent to ask
 * 3. User provides brand info via saveBrandInfo action
 * 4. Autopilot is enabled with full context
 */
const autopilotTool = {
  name: 'autopilot',
  description: `Manage autopilot mode for fully autonomous social media content creation and posting.

WHAT IS AUTOPILOT?
Autopilot automatically creates and schedules Instagram content without user intervention.
It uses brand context to generate on-brand images and captions, then schedules them optimally.

WHEN TO USE:
- User says "enable autopilot", "turn on autopilot", "auto-post for me"
- User says "disable autopilot", "turn off autopilot", "stop auto-posting"
- User wants to check autopilot status
- User provides brand information for autopilot setup
- User says "run autopilot now", "create today's content"
- User asks "is autopilot on?", "what's my autopilot status?"

WHEN NOT TO USE:
- User wants to manually create ONE image → use generate_image
- User wants to manually schedule ONE post → use schedule_post
- User just wants to chat → use reply
- User hasn't expressed interest in automated posting

ACTIONS AVAILABLE:

1. "check" - Check current autopilot status
   - Shows if enabled/disabled/paused
   - Shows if brand info is complete
   - Returns onboarding questions if brand info missing

2. "enable" - Turn on autopilot
   - Requires brand info to be complete first
   - If brand info missing, returns onboarding questions
   - Once enabled, will auto-create and schedule content

3. "disable" - Turn off autopilot
   - Stops all automatic content creation
   - Preserves brand info for future re-enable

4. "save_brand" - Save brand information
   - Call this with brandInfo object after onboarding
   - Required before enabling autopilot
   - Stores: niche, targetAudience, visualStyle, tone, topics

5. "run_now" - Manually trigger autopilot
   - Creates content immediately (doesn't wait for schedule)
   - Useful for testing or one-time content push
   - Requires autopilot to be set up (brand info complete)

ONBOARDING FLOW:
1. User: "Enable autopilot"
2. You: Call check/enable → get onboarding questions
3. You: Ask user the questions
4. User: Provides brand info
5. You: Call save_brand with brandInfo object
6. You: Call enable to activate autopilot

BRAND INFO OBJECT:
{
  niche: "fitness, wellness",
  targetAudience: "Women 25-40 interested in home workouts",
  visualStyle: "bright, energetic, clean backgrounds",
  tone: "motivational, friendly, encouraging",
  topics: ["workout tips", "healthy recipes", "motivation"],
  referenceImageUrl: "optional URL to user's photo"
}

EXAMPLES:
- "Turn on autopilot" → check status, onboard if needed, then enable
- "What's my autopilot status?" → action: "check"
- "Stop autopilot" → action: "disable"
- "Create today's posts now" → action: "run_now"
- After collecting brand info → action: "save_brand" with brandInfo

IMPORTANT:
- chatId is required for all actions (identifies which account/chat)
- Brand info must be complete before enabling
- Autopilot respects posting limits (max posts per day)
- User can always disable and return to manual mode`,

  parameters: {
    action: {
      type: 'string',
      required: true,
      description: 'Action to perform: "check", "enable", "disable", "save_brand", or "run_now"',
      example: 'enable'
    },
    chatId: {
      type: 'string',
      required: true,
      description: 'The chat/conversation ID. Identifies which account autopilot is for.',
      example: 'chat_abc123'
    },
    brandInfo: {
      type: 'object',
      required: false,
      description: 'Brand context for autopilot. Required for save_brand action. Include: niche, targetAudience, visualStyle, tone, topics, referenceImageUrl (optional)',
      example: { niche: 'fitness', targetAudience: 'Women 25-40', visualStyle: 'bright and energetic', tone: 'motivational', topics: ['workouts', 'nutrition', 'motivation'] }
    }
  },

  execute: async (params, context) => {
    const { action, chatId, brandInfo } = params;
    const { userId } = context;

    if (!userId) {
      return { success: false, error: 'Not logged in', message: 'Please log in first.' };
    }

    if (!chatId) {
      return { success: false, error: 'chatId required', message: 'Please specify which chat/account to configure.' };
    }

    try {
      switch (action) {
        case 'check':
          return await checkAutopilotStatus(userId, chatId);

        case 'enable':
          return await enableAutopilot(userId, chatId);

        case 'disable':
          return await disableAutopilot(userId, chatId);

        case 'save_brand':
          return await saveBrandInfo(userId, chatId, brandInfo);

        case 'run_now':
          return await runAutopilotNow(userId, chatId);

        default:
          return { success: false, error: 'Invalid action', message: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[AUTOPILOT-TOOL] Error:', error.message);
      return { success: false, error: error.message, message: `Autopilot error: ${error.message}` };
    }
  }
};

/**
 * Check autopilot status and brand info completeness
 */
async function checkAutopilotStatus(userId, chatId) {
  const config = await AutopilotConfig.findOne({ userId });
  const memory = await AutopilotMemory.findOne({ userId });

  const brandComplete = memory?.brand &&
    memory.brand.targetAudience &&
    memory.brand.topicsAllowed?.length > 0;

  const onboardingQuestions = !brandComplete ? [
    "What's your niche or industry? (e.g., fitness, tech, fashion, food, travel)",
    "Who is your target audience? (age range, interests, problems they have)",
    "What visual style do you prefer? (minimal, bold colors, dark aesthetic, vibrant, professional)",
    "What tone should your content have? (professional, casual, funny, inspiring, educational)",
    "What topics do you want to post about? (list 3-5 main topics)",
    "Do you have a reference image of yourself for personalized AI images? (optional - provide URL)"
  ] : null;

  return {
    success: true,
    status: {
      enabled: config?.enabled || false,
      paused: config?.paused || false,
      brandInfoComplete: brandComplete,
      lastRun: config?.lastRunAt,
      postsToday: config?.stats?.postsToday || 0
    },
    needsOnboarding: !brandComplete,
    onboardingQuestions,
    message: brandComplete
      ? `Autopilot is ${config?.enabled ? 'enabled ✅' : 'disabled'}. Brand info is complete.`
      : 'I need to learn about your brand before enabling autopilot. Let me ask you a few questions...',
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Checking autopilot configuration and brand completeness'),
      persona: 'growth'
    }
  };
}

/**
 * Enable autopilot (only if brand info is complete)
 */
async function enableAutopilot(userId, chatId) {
  const memory = await AutopilotMemory.findOne({ userId });

  const brandComplete = memory?.brand &&
    memory.brand.targetAudience &&
    memory.brand.topicsAllowed?.length > 0;

  if (!brandComplete) {
    return {
      success: false,
      needsOnboarding: true,
      message: "I can't enable autopilot yet - I need to understand your brand first. Let me ask you a few questions about your content style and audience.",
      onboardingQuestions: [
        "What's your niche or industry?",
        "Who is your target audience?",
        "What visual style do you prefer?",
        "What tone should your content have?",
        "What topics do you want to post about?"
      ]
    };
  }

  // Enable autopilot
  let config = await AutopilotConfig.findOne({ userId });
  if (!config) {
    config = new AutopilotConfig({ userId });
  }

  config.enabled = true;
  // The schema field is `pausedUntil` - setting `paused` wrote nothing.
  config.pausedUntil = null;
  config.scheduleNextRun();
  await config.save();

  return {
    success: true,
    enabled: true,
    message: `🚀 Autopilot is now ENABLED! I'll automatically create and schedule content based on your brand: ${memory.brand.topicsAllowed.join(', ')}. I'll post up to ${config.limits.maxFeedPostsPerDay} times per day during optimal hours.`,
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Enabling autonomous content creation mode'),
      decisions: [
        { type: 'mode', value: 'autopilot enabled', reason: 'Brand info complete, ready for autonomous posting' }
      ],
      persona: 'growth'
    }
  };
}

/**
 * Disable autopilot
 */
async function disableAutopilot(userId, chatId) {
  const config = await AutopilotConfig.findOne({ userId });
  if (config) {
    config.enabled = false;
    await config.save();
  }

  return {
    success: true,
    enabled: false,
    message: '⏸️ Autopilot has been disabled. I will no longer automatically create content. You can re-enable it anytime.',
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Disabling autonomous content mode'),
      persona: 'growth'
    }
  };
}

/**
 * Save brand information from onboarding
 */
async function saveBrandInfo(userId, chatId, brandInfo) {
  if (!brandInfo) {
    return {
      success: false,
      error: 'brandInfo required',
      message: 'Please provide brand information to save.'
    };
  }

  let memory = await AutopilotMemory.findOne({ userId });
  if (!memory) {
    memory = new AutopilotMemory({ userId });
  }

  // Update brand info
  if (brandInfo.niche) {
    memory.brand.topicsAllowed = Array.isArray(brandInfo.niche)
      ? brandInfo.niche
      : [brandInfo.niche];
  }
  if (brandInfo.topics) {
    memory.brand.topicsAllowed = Array.isArray(brandInfo.topics)
      ? brandInfo.topics
      : brandInfo.topics.split(',').map(t => t.trim());
  }
  if (brandInfo.targetAudience) {
    memory.brand.targetAudience = brandInfo.targetAudience;
  }
  if (brandInfo.visualStyle) {
    memory.brand.visualStyle = brandInfo.visualStyle;
  }
  if (brandInfo.tone) {
    memory.brand.tone = brandInfo.tone;
  }
  if (brandInfo.uniqueSellingPoints) {
    memory.brand.uniqueSellingPoints = Array.isArray(brandInfo.uniqueSellingPoints)
      ? brandInfo.uniqueSellingPoints
      : [brandInfo.uniqueSellingPoints];
  }
  if (brandInfo.referenceImageUrl) {
    memory.referenceImageUrl = brandInfo.referenceImageUrl;
  }

  await memory.save();

  const brandComplete = memory.brand.targetAudience && memory.brand.topicsAllowed?.length > 0;

  return {
    success: true,
    brandComplete,
    brandInfo: memory.brand,
    message: brandComplete
      ? `✅ Brand info saved! I now understand your brand:\n• Niche: ${memory.brand.topicsAllowed.join(', ')}\n• Audience: ${memory.brand.targetAudience}\n• Style: ${memory.brand.visualStyle}\n• Tone: ${memory.brand.tone}\n\nYou can now enable autopilot!`
      : 'Brand info partially saved. Please provide target audience and topics to complete setup.',
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Saving brand context for personalized content'),
      decisions: [
        { type: 'brand', value: 'context saved', reason: 'Will use this for all future autopilot content' }
      ],
      persona: 'growth'
    }
  };
}

/**
 * Manually run autopilot now
 */
async function runAutopilotNow(userId, chatId) {
  const AutopilotService = require('../../functions/AutopilotService');
  const autopilotService = new AutopilotService();

  const memory = await AutopilotMemory.findOne({ userId });
  const brandComplete = memory?.brand &&
    memory.brand.targetAudience &&
    memory.brand.topicsAllowed?.length > 0;

  if (!brandComplete) {
    return {
      success: false,
      needsOnboarding: true,
      message: "Can't run autopilot - brand info is incomplete. Let me ask you about your brand first."
    };
  }

  const config = await AutopilotConfig.findOne({ userId });
  if (!config) {
    return {
      success: false,
      message: "Autopilot isn't configured for this chat yet. Enable it first.",
    };
  }

  try {
    // runForChat takes the config document, not (userId, chatId) - calling it
    // with the old signature meant this action could never work.
    const result = await autopilotService.runForChat(config, { force: true });

    return {
      success: true,
      result,
      message: `🎯 Autopilot executed! Created ${result.execution?.feedPosts?.length || 0} posts. ${result.plan?.reasoning || ''}`,
      cognitive: {
        thinkingSteps: narrator.narrateGeneric('Executing autopilot: analyzing performance, deciding content, generating'),
        decisions: result.plan?.feedPosts?.map(p => ({
          type: 'content',
          value: `${p.theme} ${p.format} at ${p.time}`,
          reason: p.goal
        })) || [],
        persona: 'growth'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Autopilot run failed: ${error.message}`
    };
  }
}

module.exports = autopilotTool;

