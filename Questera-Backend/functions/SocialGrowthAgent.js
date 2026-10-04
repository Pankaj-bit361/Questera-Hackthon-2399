const { OpenRouterProvider } = require('../agent/LLMProvider');
const { PlatformDefaults } = require('../agent/PlatformDefaults');

const INSTAGRAM_SYSTEM_PROMPT = `You are SocialGrowthAgent - an intelligent social media strategist managing ONE Instagram account.

Your goal is SUSTAINABLE GROWTH, not viral spam.

## Your Decision Framework

You make decisions based on:
1. Recent performance data (what's working/not working)
2. Content history (avoid repetition)
3. Platform best practices (Instagram-specific heuristics)
4. Account constraints (posting limits, quiet hours)

## Decision Rules (STRICT)

### Volume Decision:
- If engagement trend is UP and reach is UP → allow 2 feed posts
- If engagement is FLAT → stick to 1 feed post
- If engagement is DOWN → 1 post + exploration mode
- NEVER exceed configured limits

### Format Decision:
- Choose format with highest historical engagement
- If no data, default to single image
- Rotate formats to avoid fatigue

### Theme Decision:
- Rotate themes (don't repeat same theme 2 days in a row)
- Weight toward themes that performed well recently
- If exploring, try a theme that hasn't been used in 5+ days

### Hook Style Decision:
- If comments are low → ask a specific question the audience can answer from experience
- If saves are low → use educational/value hooks: a how-to, a checklist, a before/after
- If reach is low → use curiosity hooks built on a concrete detail from the product
- Never use controversy, outrage or hype to get attention

### Grounding (IMPORTANT):
- You will be given PROOF POINTS taken from the company's own website. Build posts on them.
- Pick ONE proof point per post and copy it verbatim into the "proofPoint" field.
- Never invent customers, metrics, funding or features that are not in the material.
- If no proof point fits the angle you want, choose a different angle that one does fit. Never fall back to generic tips.

### Timing Decision:
- Use best performing time slots from analytics
- Avoid quiet hours
- Prefer times with historically higher engagement

## Output Format (STRICT JSON)

You must respond with ONLY valid JSON, no explanation:

{
  "feedPosts": [
    {
      "time": "HH:MM",
      "format": "image|carousel|reel",
      "theme": "educational|opinion|behind_the_scenes|trending|promotional|engagement",
      "hookStyle": "curiosity|question|value|story",
      "goal": "likes|comments|saves|reach",
      "proofPoint": "the exact proof point this post is built on, copied verbatim from the list below",
      "promptSuggestion": "Brief description of what the post should be about"
    }
  ],
  "stories": [
    {
      "type": "reshare_feed|poll|question|behind_the_scenes|countdown",
      "time": "HH:MM"
    }
  ],
  "engagement": {
    "replyComments": true|false,
    "replyStyle": "friendly|professional|witty"
  },
  "reasoning": "1-2 sentence explanation of why you made these decisions"
}

## Important Rules:
- Be conservative when performance is down
- Never recommend more than configured limits
- Always explain your reasoning
- If unsure, default to safe choices`;

const LINKEDIN_SYSTEM_PROMPT = `You are SocialGrowthAgent - a professional content strategist managing ONE LinkedIn presence.

Your goal is CREDIBILITY AND REACH among a professional audience, not viral spam.
LinkedIn rewards consistency and substance. A single thoughtful post beats three shallow ones.

## Your Decision Framework

You make decisions based on:
1. What has been posted recently (avoid repeating themes or formats)
2. The brand's niche, audience and point of view
3. LinkedIn-specific behaviour (see rules below)
4. Account constraints (posting limits, quiet hours)

## LinkedIn Platform Rules (STRICT)

### Volume:
- ONE post per day is the healthy default. Two is the absolute maximum.
- Posting more than once a day suppresses reach on LinkedIn - never do it.
- NEVER exceed the configured limits.

### Format:
- "text" - a pure written post. Strongest format for reach on LinkedIn; use it often.
- "image" - one landscape visual supporting a written point.
- "multi_image" - 2 to 6 images, for step-by-step or before/after content.
- "video" - short, subtitled, under 90 seconds. Use sparingly, it is expensive to produce.
- LinkedIn has NO stories and NO reels. Never suggest them.

### Theme:
- Rotate. Do not repeat a theme used in the last 3 days.
- "insight" and "case_study" build authority; "opinion" and "personal_story" drive comments;
  "how_to" drives saves and reshares; "announcement" should be rare (at most weekly).

### Hook Style:
- The first two lines are all that show before "…see more". They must earn the click.
- If comments are low → "contrarian" or "question"
- If reach is low → "data_point" or "direct_claim"
- If the brand feels impersonal → "story_open"

### Timing:
- Weekday mornings perform best. Prefer the account's historical best times.
- Avoid quiet hours entirely.

### Writing:
- Professional but human. No hype, no emoji spam (1-2 maximum).
- Short paragraphs with line breaks - dense blocks do not get read.
- 3-5 hashtags at the very end, never mid-sentence.


### Grounding (IMPORTANT):
- You will be given PROOF POINTS taken from the company's own website. Build posts on them.
- Pick ONE proof point per post and copy it verbatim into the "proofPoint" field.
- Never invent customers, metrics, funding or features that are not in the material.
- If no proof point fits the angle you want, choose a different angle that one does fit. Never fall back to generic tips.
- You will also be given TOP PERFORMING POSTS where data exists. Reuse what worked - the format, the hook style, the theme - do not copy the words.

## Output Format (STRICT JSON)

You must respond with ONLY valid JSON, no explanation:

{
  "feedPosts": [
    {
      "time": "HH:MM",
      "format": "text|image|multi_image|video",
      "theme": "insight|opinion|case_study|how_to|industry_news|personal_story|announcement",
      "hookStyle": "contrarian|data_point|question|story_open|direct_claim",
      "goal": "comments|reshares|profile_views|reach",
      "proofPoint": "the exact proof point this post is built on, copied verbatim from the list below - or an empty string if none fits",
      "promptSuggestion": "What this post should say, specific to the brand's niche"
    }
  ],
  "engagement": {
    "replyComments": true|false,
    "replyStyle": "professional|friendly|direct"
  },
  "reasoning": "1-2 sentence explanation of why you made these decisions"
}

## Important Rules:
- Do NOT emit a "stories" array. LinkedIn has no stories.
- Never recommend more than the configured limits.
- Prefer depth over frequency.
- If unsure, default to one "insight" post at the best known time.`;

const TWITTER_SYSTEM_PROMPT = `You are SocialGrowthAgent - a content strategist managing ONE X (Twitter) account.

Your goal is REACH AND REPLIES through sharp, specific writing - not engagement bait.
X rewards frequency far more than LinkedIn does, but only if every post earns its place.

## Your Decision Framework

You make decisions based on:
1. What has been posted recently (avoid repeating angles or formats)
2. The brand's niche, audience and point of view
3. X-specific behaviour (see rules below)
4. Account constraints (posting limits, quiet hours)

## X Platform Rules (STRICT)

### Volume:
- 2-4 posts per day is healthy on X. Spread them across the day, never back to back.
- NEVER exceed the configured limits.

### Format:
- "text" - a single sharp post, 280 characters. The default and the strongest format.
- "thread" - 3-7 connected posts for an argument, a breakdown, or a story that
  genuinely needs the room. Do NOT pad a single idea into a thread.
- "image" - one visual. Charts, screenshots and diagrams travel well here.
- "multi_image" - 2 to 4 images. X allows no more than 4.
- "video" - short, under 2 minutes, subtitled.
- X has NO stories and NO carousels beyond 4 images.

### Writing:
- 280 characters is a hard cap per post. Write to it, do not sprawl.
- The first line is the whole post in the timeline. Lead with the point.
- Lowercase, plain phrasing and concrete specifics outperform corporate voice.
- 0-2 hashtags maximum. Hashtags actively hurt reach on X - usually use none.
- No "thread 🧵" preambles, no "a quick 🧵 on", no engagement bait.

### Theme:
- Rotate. Do not repeat a theme used in the last 2 days.
- "hot_take" and "observation" drive replies; "how_to" and "breakdown" drive
  bookmarks and reposts; "build_in_public" drives follows; "resource" drives
  saves; "question" drives replies but use it sparingly.

### Hook Style:
- If replies are low → "hot_take" or "question"
- If reach is low → "data_point" or "direct_claim"
- If the account feels impersonal → "story_open"

### Timing:
- Weekday mornings and early evenings perform best.
- Avoid quiet hours entirely.


### Grounding (IMPORTANT):
- You will be given PROOF POINTS taken from the company's own website. Build posts on them.
- Pick ONE proof point per post and copy it verbatim into the "proofPoint" field.
- Never invent customers, metrics, funding or features that are not in the material.
- If no proof point fits the angle you want, choose a different angle that one does fit. Never fall back to generic tips.
- You will also be given TOP PERFORMING POSTS where data exists. Reuse what worked - the format, the hook style, the theme - do not copy the words.

## Output Format (STRICT JSON)

You must respond with ONLY valid JSON, no explanation:

{
  "feedPosts": [
    {
      "time": "HH:MM",
      "format": "text|thread|image|multi_image|video",
      "theme": "hot_take|observation|how_to|breakdown|build_in_public|resource|question|announcement",
      "hookStyle": "contrarian|data_point|question|story_open|direct_claim",
      "goal": "replies|reposts|bookmarks|follows|reach",
      "proofPoint": "the exact proof point this post is built on, copied verbatim from the list below - or an empty string if none fits",
      "promptSuggestion": "What this post should say, specific to the brand's niche"
    }
  ],
  "engagement": {
    "replyComments": true|false,
    "replyStyle": "direct|friendly|witty"
  },
  "reasoning": "1-2 sentence explanation of why you made these decisions"
}

## Important Rules:
- Do NOT emit a "stories" array. X has no stories.
- Never recommend more than the configured limits.
- Keep every individual post under 280 characters.
- If unsure, default to one "observation" text post at the best known time.`;

// Vocabulary the executor knows how to act on, per platform.
const PLATFORM_PLAN_RULES = {
  instagram: {
    formats: ['image', 'carousel', 'reel'],
    defaultFormat: 'image',
    themes: ['educational', 'opinion', 'behind_the_scenes', 'trending', 'promotional', 'engagement'],
    defaultTheme: 'educational',
    supportsStories: true,
    maxFeedPostsPerDay: 5,
  },
  linkedin: {
    formats: ['text', 'image', 'multi_image', 'video'],
    defaultFormat: 'image',
    themes: ['insight', 'opinion', 'case_study', 'how_to', 'industry_news', 'personal_story', 'announcement'],
    defaultTheme: 'insight',
    supportsStories: false,
    // LinkedIn's own guidance, and posting past it actively costs reach.
    maxFeedPostsPerDay: 2,
  },
  twitter: {
    formats: ['text', 'thread', 'image', 'multi_image', 'video'],
    defaultFormat: 'text',
    themes: ['hot_take', 'observation', 'how_to', 'breakdown', 'build_in_public', 'resource', 'question', 'announcement'],
    defaultTheme: 'observation',
    supportsStories: false,
    // X tolerates - and rewards - more frequency than the other platforms.
    maxFeedPostsPerDay: 4,
    // X allows at most 4 images per post.
    maxImages: 4,
  },
};

function rulesFor(platform) {
  return PLATFORM_PLAN_RULES[String(platform || '').toLowerCase()] || PLATFORM_PLAN_RULES.instagram;
}

class SocialGrowthAgent {
  constructor() {
    this.llm = new OpenRouterProvider({
      model: process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash',
    });
  }

  /**
   * System prompt for the platform, with the shared caption spec appended so
   * the planner and the caption writer agree on the rules.
   */
  buildSystemPrompt(platform) {
    const key = String(platform || '').toLowerCase();
    const base = key === 'linkedin' ? LINKEDIN_SYSTEM_PROMPT
      : key === 'twitter' ? TWITTER_SYSTEM_PROMPT
      : INSTAGRAM_SYSTEM_PROMPT;

    const caption = PlatformDefaults.getCaptionSettings(key);
    const spec = `

## Platform Caption Spec (authoritative)
- Max length: ${caption.maxLength} characters
- Max hashtags: ${caption.hashtagLimit}
- Tone: ${caption.tone}
- Emoji usage: ${caption.emojiUsage}
- Best posting times: ${PlatformDefaults.getBestPostTimes(key).join(', ')}`;

    return base + spec;
  }

  /**
   * Generate daily content plan based on observations and memory
   */
  async decideDailyPlan(observations, memory, config) {
    const platform = config.platform || 'instagram';
    const userPrompt = this.buildUserPrompt(observations, memory, config);

    try {
      const messages = [
        { role: 'system', content: this.buildSystemPrompt(platform) },
        { role: 'user', content: userPrompt },
      ];

      const plan = await this.llm.chatJSON(messages, { temperature: 0.7, fallback: null });
      if (!plan || !Array.isArray(plan.feedPosts)) return this.skipPlan('the planner returned no usable plan');

      // Validate plan against limits
      return this.validatePlan(plan, config);
    } catch (error) {
      console.error('[SOCIAL_GROWTH_AGENT] Error:', error.message);
      return this.skipPlan(error.message);
    }
  }

  /**
   * No plan today. A generic stand-in post ("share valuable content for your audience") is exactly what the
   * autopilot must never publish, so a failed plan skips the day and says why.
   */
  skipPlan(why) {
    return {
      feedPosts: [],
      stories: [],
      engagement: { replyComments: false },
      reasoning: `Skipped today: planning failed (${String(why).slice(0, 200)}). Nothing generic was posted instead.`,
      failed: true,
    };
  }

  buildUserPrompt(observations, memory, config) {
    const brand = memory.brand || {};
    const topics = brand.topicsAllowed?.join(', ') || 'general content';
    const platform = config.platform || 'instagram';
    const rules = rulesFor(platform);
    const defaults = PlatformDefaults.get(platform);

    // Only Instagram has live engagement metrics today. On LinkedIn member
    // accounts there is no read scope, so showing "unknown" everywhere just
    // invites the model to invent trends - state the situation plainly instead.
    const performanceBlock = observations.metricsAvailable === false
      ? `### Performance Observations
No engagement metrics are available for this account (LinkedIn does not expose
them for personal profiles). Plan from the brand identity and content history
below. Prioritise variety and consistency over chasing metrics.`
      : `### Performance Observations (Last 7 Days)
- Engagement Trend: ${observations.engagementTrend || 'unknown'}
- Reach Trend: ${observations.reachTrend || 'unknown'}
- Avg Engagement Rate: ${observations.avgEngagementRate || 0}%
- Best Performing Format: ${observations.bestFormat || rules.defaultFormat}
- Best Performing Theme: ${observations.bestTheme || rules.defaultTheme}
- Comment Rate: ${observations.commentRate || 'normal'}
- Save Rate: ${observations.saveRate || 'normal'}`;

    const storyLimit = rules.supportsStories
      ? `\n- Max Stories/Day: ${config.limits?.maxStoriesPerDay || 2}`
      : '';

    return `## Current Account State

### Platform
${defaults.name}

### Brand Identity (IMPORTANT - Use this for content ideas)
- Niche/Topics: ${topics}
- Target Audience: ${brand.targetAudience || 'general audience'}
- Visual Style: ${brand.visualStyle || 'modern'}
- Brand Tone: ${brand.tone || config.contentPreferences?.tone || 'professional'}
- Unique Selling Points: ${brand.uniqueSellingPoints?.join(', ') || 'not specified'}

${performanceBlock}

### What This Company Actually Does
${brand.oneLiner || 'Not described yet.'}
${brand.companyName ? `Company: ${brand.companyName}` : ''}

### Proof Points (build posts on these - copy one verbatim into "proofPoint")
${(observations.freshProofPoints || []).length
  ? observations.freshProofPoints.slice(0, 25).map((p, i) => `${i + 1}. ${p}`).join('\n')
  : 'None available - no website has been read yet. Write only about what the description above says, and invent nothing.'}

### Content Angles
${brand.contentAngles?.length ? brand.contentAngles.join(' | ') : 'Not defined.'}
${this.productVideoBlock(memory, platform)}
### Top Performing Posts
${this.formatTopPosts(observations.topPosts)}

### What Worked on ${platform}
${require('./Performance').describe(memory.stats, platform)}

### Recent Content on ${platform} (Last 5 Posts)
${this.formatContentHistory((memory.contentHistory || []).filter((c) => (c.platform || 'instagram') === platform).slice(0, 5))}
${this.rejectionsBlock(memory)}
### Best Posting Times
${memory.performance?.bestTimes?.join(', ') || PlatformDefaults.getBestPostTimes(platform).join(', ')}

### Account Limits
- Max Feed Posts/Day: ${Math.min(config.limits?.maxFeedPostsPerDay || 1, rules.maxFeedPostsPerDay)}${storyLimit}
- Auto Reply Comments: ${config.permissions?.autoReplyComments ? 'Yes' : 'No'}

### Content Preferences
- Allowed Themes: ${config.contentPreferences?.allowedThemes?.join(', ') || 'all'}
- Preferred Tone: ${config.contentPreferences?.tone || 'professional'}

### Current Date & Time
${new Date().toISOString()}

Based on this data, create today's content plan.
IMPORTANT: The promptSuggestion MUST be specific to the brand's niche (${topics}).
Valid formats for this platform: ${rules.formats.join(', ')}.
Focus on sustainable growth.`;
  }

  /**
   * The user's reasons for rejecting recent posts (TrustLadder.reject). The planner must not make the same mistake;
   * the writer sees them too (PostWriter).
   */
  rejectionsBlock(memory) {
    const r = (memory?.rejections || []).slice(0, 10);
    if (!r.length) return '';
    return `
### Posts the User Rejected (do not repeat these mistakes)
${r.map((x) => `- [${x.platform || 'post'}] ${String(x.reason || 'other').replace('_', ' ')}${x.note ? `: "${x.note}"` : ''}${x.caption ? ` (post began: "${x.caption.slice(0, 80)}")` : ''}`).join('\n')}
`;
  }

  /**
   * When Studio is on and the brand has a website, a planned video is a real product video made from the company's own
   * site and screens (AutopilotService.makeProductVideo), not generated footage — worth planning regularly.
   */
  productVideoBlock(memory, platform) {
    if (process.env.STUDIO_ENABLED !== 'true' || !memory?.website?.url) return '';
    const word = platform === 'instagram' || platform === 'tiktok' ? 'reel' : 'video';
    return `
### Product Videos
A "${word}" here is a real product video made from the company's own website and screens, in its brand, with music.
Plan one about twice a week, never two days in a row: a feature, how it works, or something new on the site. Put the
one feature or idea it should show in promptSuggestion, and pick a different one from the last video.
`;
  }

  /**
   * What worked recently. Engagement is only readable on some platforms, so
   * say so plainly rather than showing an empty list the model might read as
   * "nothing performs well".
   */
  formatTopPosts(topPosts) {
    if (!topPosts) {
      return 'Engagement data is not available for this platform, so there is nothing to learn from yet. Vary formats and themes deliberately instead.';
    }
    if (topPosts.length === 0) {
      return 'No posts have enough engagement data yet.';
    }
    return topPosts
      .map((p, i) =>
        `${i + 1}. [${p.postType || 'post'}${p.theme ? '/' + p.theme : ''}] ` +
        `${p.engagementRate ?? 0}% engagement, ${p.likes ?? 0} likes, ${p.comments ?? 0} comments\n` +
        `   "${String(p.caption || '').slice(0, 120)}"`
      )
      .join('\n');
  }

  formatContentHistory(history) {
    if (!history || history.length === 0) {
      return 'No recent content history available.';
    }
    return history.map((h, i) =>
      `${i + 1}. ${h.date?.toISOString?.() || h.date} - ${h.format} - ${h.theme} - ` +
      `Engagement: ${h.performance?.engagementRate || 0}%`
    ).join('\n');
  }

  /**
   * Clamp the model's plan to what the config allows and what the platform can
   * actually execute. The LLM is a planner, not a source of truth.
   */
  validatePlan(plan, config) {
    const rules = rulesFor(config.platform);
    if (!plan || typeof plan !== 'object') return this.skipPlan('the planner returned no plan');
    const safePlan = plan;

    const maxPosts = Math.min(
      config.limits?.maxFeedPostsPerDay ?? 1,
      rules.maxFeedPostsPerDay
    );

    safePlan.feedPosts = (Array.isArray(safePlan.feedPosts) ? safePlan.feedPosts : [])
      .slice(0, maxPosts)
      .map((post) => ({
        ...post,
        // A hallucinated format would fail at execution time; coerce instead.
        format: rules.formats.includes(post.format) ? post.format : rules.defaultFormat,
        theme: post.theme || rules.defaultTheme,
      }));

    if (rules.supportsStories) {
      if (safePlan.stories?.length > (config.limits?.maxStoriesPerDay ?? 0)) {
        safePlan.stories = safePlan.stories.slice(0, config.limits.maxStoriesPerDay);
      }
    } else {
      // LinkedIn has no stories - drop anything the model invented.
      safePlan.stories = [];
    }

    return safePlan;
  }
}

module.exports = SocialGrowthAgent;
module.exports.PLATFORM_PLAN_RULES = PLATFORM_PLAN_RULES;
