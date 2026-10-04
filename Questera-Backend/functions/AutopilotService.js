const AutopilotConfig = require('../models/autopilotConfig');
const BLOG_FORMAT = { linkedin: 'text', twitter: 'thread', instagram: 'carousel' };
const TrustLadder = require('./TrustLadder');
const { COSTS, assertCanSpend, charge } = require('./AutopilotBilling');
const { activePause } = require('./AccountHealth');
const AutopilotMemory = require('../models/autopilotMemory');
const ScheduledPost = require('../models/scheduledPost');
const ContentJob = require('../models/contentJob');
const SocialGrowthAgent = require('./SocialGrowthAgent');
const AnalyticsService = require('./AnalyticsService');
const ContentEngine = require('./ContentEngine');
const ImageOrchestrator = require('./ImageOrchestrator');
const MediaJob = require('../models/mediaJob');
const { OpenRouterProvider } = require('../agent/LLMProvider');
const { PlatformDefaults } = require('../agent/PlatformDefaults');
const { scheduleSlot } = require('./timeHelpers');
const { v4: uuidv4 } = require('uuid');

// Platforms whose engagement metrics we can actually read back.
// LinkedIn member accounts cannot: reading post stats needs r_member_social,
// which is a restricted scope. Planning there runs on content history alone.
const PLATFORMS_WITH_METRICS = ['instagram'];

// Only Instagram has stories.
const PLATFORMS_WITH_STORIES = ['instagram'];

// How long to wait for an autopilot video generation before giving up.
// This runs inside a cron, not an HTTP request, so blocking is safe.
const VIDEO_WAIT_ATTEMPTS = 60;
// Studio product video format per platform, and how long one site capture is reused before the site is read again.
const STUDIO_FORMAT = { instagram: 'teaser', tiktok: 'teaser', linkedin: 'square', twitter: 'square' };
const STUDIO_CAPTURE_DAYS = Number(process.env.STUDIO_CAPTURE_DAYS || 7);
const VIDEO_WAIT_INTERVAL_MS = 10000;

class AutopilotService {
  constructor() {
    this.growthAgent = new SocialGrowthAgent();
    this.analyticsService = new AnalyticsService();
    this.contentEngine = new ContentEngine();
    this.imageOrchestrator = new ImageOrchestrator();
    this.openRouterProvider = new OpenRouterProvider();
  }

  /**
   * Main autopilot loop - called by cron
   * Runs for all enabled autopilot configs
   */
  async runDailyAutopilot() {
    console.log('[AUTOPILOT] Starting daily autopilot run...');

    const activeConfigs = await AutopilotConfig.find({
      enabled: true,
      $or: [
        { pausedUntil: null },
        { pausedUntil: { $lt: new Date() } },
      ],
    });

    console.log(`[AUTOPILOT] Found ${activeConfigs.length} active autopilot configs`);

    const results = [];
    for (const config of activeConfigs) {
      try {
        const result = await this.runForChat(config);
        results.push({ chatId: config.chatId, success: true, ...result });
      } catch (error) {
        console.error(`[AUTOPILOT] Error for chat ${config.chatId}:`, error.message);
        results.push({ chatId: config.chatId, success: false, error: error.message });

        // Update config with failure
        config.lastRunAt = new Date();
        config.lastRunResult = 'failed';
        config.lastRunSummary = error.message;
        await config.save();
      }
    }

    console.log(`[AUTOPILOT] Daily run complete. Results:`, results.length);
    return results;
  }

  /**
   * Run autopilot for a specific chat
   */
  async runForChat(config, options = {}) {
    console.log(`[AUTOPILOT] Running for chat: ${config.chatId}`);

    // Check quiet hours (a manual run may override them - the user asked)
    if (!options.force && config.isQuietHours()) {
      console.log(`[AUTOPILOT] Skipping - quiet hours active`);
      // Push the next run out so a due config does not re-trigger every tick.
      config.lastRunAt = new Date();
      config.lastRunResult = 'skipped';
      config.lastRunSummary = 'Quiet hours';
      config.scheduleNextRun();
      await config.save();
      return { skipped: true, reason: 'quiet_hours' };
    }

    // The platform blocked or flagged the account, or its login broke (AccountHealth): make nothing for it.
    const pause = await activePause(config.userId, config.platform);
    if (pause) {
      config.lastRunAt = new Date();
      config.lastRunResult = 'skipped';
      config.lastRunSummary = `Posting to ${config.platform} is paused: ${pause.reason}`;
      config.scheduleNextRun();
      await config.save();
      return { skipped: true, reason: 'account_paused' };
    }

    // Load or create memory
    const scope = config.autopilotId ? { autopilotId: config.autopilotId } : { userId: config.userId };
    let memory = await AutopilotMemory.findOne(scope);

    if (!memory) {
      memory = new AutopilotMemory({ userId: config.userId, autopilotId: config.autopilotId || null });
      await memory.save();
    }

    // Step 1: Observe - Gather current account state
    const observations = await this.observeAccount(config, memory);
    console.log(`[AUTOPILOT] Observations:`, observations);

    // Step 2: Decide - Use SocialGrowthAgent to create plan
    const plan = await this.growthAgent.decideDailyPlan(observations, memory, config);
    console.log(`[AUTOPILOT] Plan:`, plan);

    // Step 3: Execute - Create and schedule posts
    const executionResult = await this.executePlan(plan, config, memory);

    // Step 4: Update memory
    memory.lastDecisionSummary = plan.reasoning;
    memory.lastDecisionAt = new Date();
    await memory.save();

    // Update config
    config.lastRunAt = new Date();
    config.lastRunResult = plan.failed ? 'failed' : executionResult.success ? 'success' : 'partial';
    config.lastRunSummary = plan.reasoning;
    config.scheduleNextRun();
    await config.save();

    return {
      plan,
      execution: executionResult,
    };
  }

  /**
   * Observe account - gather analytics and performance data.
   *
   * Only Instagram exposes engagement metrics we can read back. For LinkedIn
   * member accounts there is no read scope at all, so rather than calling the
   * Instagram analytics service and quietly falling into its catch block on
   * every run, we derive what we can from our own content history and tell the
   * planner explicitly that no metrics exist.
   */
  async observeAccount(config, memory) {
    const userId = typeof config === 'string' ? config : config.userId;
    const platform = (typeof config === 'string' ? 'instagram' : config.platform) || 'instagram';
    const defaults = PlatformDefaults.get(platform);

    if (!PLATFORMS_WITH_METRICS.includes(platform)) {
      return this.observeWithoutMetrics(userId, memory, defaults, platform);
    }

    try {
      // FIRST: Refresh engagement data from Instagram API
      // This ensures we have the latest likes, comments, saves, reach
      console.log('[AUTOPILOT] Refreshing analytics from Instagram...');
      try {
        const refreshResult = await this.analyticsService.refreshEngagement(userId);
        console.log(`[AUTOPILOT] Refreshed ${refreshResult.updated} posts with latest Instagram data`);
      } catch (refreshError) {
        console.log('[AUTOPILOT] Analytics refresh failed (will use cached data):', refreshError.message);
      }

      // Get analytics data (now with fresh data)
      const dashboard = await this.analyticsService.getDashboard(userId, 7);

      // Get recent posts performance
      const recentPosts = await ScheduledPost.find({
        userId,
        status: 'published',
        publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }).sort({ publishedAt: -1 }).limit(10);

      // Calculate trends
      const engagementTrend = this.calculateTrend(recentPosts, 'engagement');
      const reachTrend = this.calculateTrend(recentPosts, 'reach');

      // Find best performing format and theme
      const formatPerformance = this.analyzeByField(recentPosts, 'format');
      const themePerformance = this.analyzeByField(memory.contentHistory || [], 'theme');

      return {
        metricsAvailable: true,
        freshProofPoints: memory.freshProofPoints?.(14, platform) || [],
        topPosts: await this.getTopPosts(userId, platform),
        engagementTrend,
        reachTrend,
        avgEngagementRate: dashboard?.overview?.avgEngagementRate || 0,
        bestFormat: formatPerformance.best || 'image',
        bestTheme: themePerformance.best || 'educational',
        commentRate: this.getRate(dashboard?.overview?.totalComments, recentPosts.length),
        saveRate: this.getRate(dashboard?.overview?.totalSaves, recentPosts.length),
        totalPosts: dashboard?.overview?.totalPosts || 0,
        totalReach: dashboard?.overview?.totalReach || 0,
      };
    } catch (error) {
      console.error('[AUTOPILOT] Observation error:', error.message);
      return {
        metricsAvailable: true,
        freshProofPoints: memory.freshProofPoints?.(14, platform) || [],
        topPosts: null,
        engagementTrend: 'unknown',
        reachTrend: 'unknown',
        avgEngagementRate: 0,
        bestFormat: 'image',
        bestTheme: 'educational',
      };
    }
  }

  /**
   * Observation for platforms with no readable metrics.
   * Surfaces what was posted recently so the planner can rotate themes and
   * formats instead of repeating itself.
   */
  async observeWithoutMetrics(userId, memory, defaults, platform = 'instagram') {
    const history = memory.contentHistory || [];
    const recent = history.slice(0, 7);

    const recentThemes = [...new Set(recent.map((h) => h.theme).filter(Boolean))];
    const recentFormats = [...new Set(recent.map((h) => h.format).filter(Boolean))];

    let publishedLast7 = 0;
    try {
      publishedLast7 = await ScheduledPost.countDocuments({
        userId,
        status: 'published',
        publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      });
    } catch (error) {
      console.warn('[AUTOPILOT] Could not count recent posts:', error.message);
    }

    return {
      metricsAvailable: false,
      recentThemes,
      recentFormats,
      postsLast7Days: publishedLast7,
      bestTimes: defaults.bestTimes,
      // Material from the crawled website, minus anything posted recently.
      freshProofPoints: memory.freshProofPoints?.(14, platform) || [],
      // null (not []) means "cannot be measured here", which the planner
      // reports differently from "measured and empty".
      topPosts: await this.getTopPosts(userId, platform),
    };
  }

  /**
   * Best performing published posts for this platform.
   *
   * Returns null when engagement cannot be read at all - LinkedIn personal
   * profiles need r_member_social, which is a restricted scope - so the
   * planner can say so rather than treating silence as poor performance.
   */
  async getTopPosts(userId, platform, limit = 3) {
    try {
      const posts = await ScheduledPost.find({
        userId,
        platform,
        status: 'published',
        'engagement.lastUpdated': { $ne: null },
      })
        .sort({ 'engagement.likes': -1 })
        .limit(limit);

      if (posts.length === 0) return null;

      return posts.map((p) => {
        const e = p.engagement || {};
        const reach = e.reach || 0;
        return {
          postType: p.postType,
          caption: p.caption,
          likes: e.likes || 0,
          comments: e.comments || 0,
          engagementRate: reach ? Number((((e.likes || 0) + (e.comments || 0)) / reach * 100).toFixed(1)) : 0,
        };
      });
    } catch (error) {
      console.warn('[AUTOPILOT] Could not read top posts:', error.message);
      return null;
    }
  }

  calculateTrend(posts, metric) {
    if (posts.length < 4) return 'unknown';

    const recent = posts.slice(0, Math.floor(posts.length / 2));
    const older = posts.slice(Math.floor(posts.length / 2));

    const getMetricValue = (post) => {
      if (metric === 'engagement') {
        return (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
      }
      return post.engagement?.reach || 0;
    };

    const recentAvg = recent.reduce((sum, p) => sum + getMetricValue(p), 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + getMetricValue(p), 0) / older.length;

    if (recentAvg > olderAvg * 1.1) return 'up';
    if (recentAvg < olderAvg * 0.9) return 'down';
    return 'flat';
  }

  analyzeByField(items, field) {
    const performance = {};
    items.forEach(item => {
      const key = item[field] || 'unknown';
      if (!performance[key]) {
        performance[key] = { total: 0, count: 0 };
      }
      performance[key].total += item.performance?.engagementRate ||
        ((item.engagement?.likes || 0) + (item.engagement?.comments || 0));
      performance[key].count++;
    });

    let best = null;
    let bestAvg = 0;
    Object.entries(performance).forEach(([key, data]) => {
      const avg = data.total / data.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = key;
      }
    });

    return { best, performance };
  }

  getRate(value, count) {
    if (!count) return 'low';
    const avg = (value || 0) / count;
    if (avg > 5) return 'high';
    if (avg > 2) return 'normal';
    return 'low';
  }

  /**
   * Execute the plan - create and schedule posts
   */
  async executePlan(plan, config, memory) {
    const results = {
      feedPosts: [],
      stories: [],
      success: true,
    };

    // Execute feed posts
    if (plan.feedPosts && config.permissions?.autoPost) {
      for (const postPlan of plan.feedPosts) {
        try {
          const result = await this.createFeedPost(postPlan, config, memory);
          results.feedPosts.push(result);

          // Add to memory
          memory.addContentHistory({
            date: new Date(),
            postId: result.postId,
            // Per platform, with the words, so "don't repeat yourself" compares like with like.
            platform: config.platform || 'instagram',
            caption: result.caption || '',
            type: 'feed',
            // Record what was actually produced, not what was planned - the
            // planner's format can be coerced during execution.
            format: result.postType || postPlan.format,
            theme: postPlan.theme,
            hookStyle: postPlan.hookStyle,
            performance: {},
          });
          memory.totalPostsGenerated++;
        } catch (error) {
          if (error.skip) {
            // Over the platform's cap or the queue is full: the rest of today's plan would be too.
            console.log(`[AUTOPILOT] ${error.message}`);
            results.feedPosts.push({ error: error.message, skip: error.skip });
            break;
          }
          console.error('[AUTOPILOT] Feed post error:', error.message);
          results.feedPosts.push({ error: error.message });
          results.success = false;
        }
      }
    }

    // Execute stories - Instagram only; LinkedIn and others have no equivalent
    const platform = config.platform || 'instagram';
    if (plan.stories?.length && !PLATFORMS_WITH_STORIES.includes(platform)) {
      console.log(`[AUTOPILOT] Ignoring ${plan.stories.length} planned stories - ${platform} has no stories`);
    } else if (plan.stories && config.permissions?.autoStory) {
      for (const storyPlan of plan.stories) {
        try {
          const result = await this.createStory(storyPlan, config);
          results.stories.push(result);
          memory.totalStoriesGenerated++;
        } catch (error) {
          console.error('[AUTOPILOT] Story error:', error.message);
          results.stories.push({ error: error.message });
        }
      }
    }

    await memory.save();
    return results;
  }

  /**
   * Turn this post into the announcement of the oldest unannounced news on the site, if there is any. The caller
   * marks it announced once the post exists.
   */
  withAnnouncement(postPlan, memory, platform) {
    const news = memory?.nextAnnouncement?.(platform);
    if (!news || postPlan.announcementKey) return postPlan;
    const what = news.kind === 'blog' ? 'a new article on the blog' : news.kind === 'feature' ? 'something new in the product' : 'a new page on the site';
    console.log(`[AUTOPILOT] Announcing ${what}: ${news.title}`);
    return {
      ...postPlan,
      theme: 'announcement',
      hookStyle: 'news',
      promptSuggestion: `Announce ${what}: ${news.title}. ${news.summary || ''}`.slice(0, 500),
      proofPoint: news.fact || news.summary || news.title,
      linkUrl: news.url || postPlan.linkUrl,
      cta: news.kind === 'blog' ? 'Read it' : postPlan.cta || 'See what is new',
      // Blog to social: an article becomes a LinkedIn post, an X thread and an Instagram carousel.
      ...(news.kind === 'blog' ? { format: BLOG_FORMAT[platform] || postPlan.format } : {}),
      announcementKey: news.key,
    };
  }

  /**
   * Throws (err.skip = 'skipped_budget') when this platform already has its posts for the day, counted across the
   * daily plan and every task, or when MAX_WAITING posts are waiting for the user: making more would only bury them.
   */
  async assertPlatformBudget(config, { story = false } = {}) {
    const platform = config.platform || 'instagram';
    const scope = config.autopilotId ? { autopilotId: config.autopilotId } : { userId: config.userId };
    const base = { ...scope, platform, source: 'autopilot' };
    const since = new Date(Date.now() - 24 * 3600e3);
    const planCap = story ? Infinity : await require('./Plans').postsPerDay(config.userId);
    const cap = story ? (config.limits?.maxStoriesPerDay ?? 0) : Math.min(config.limits?.maxFeedPostsPerDay ?? 1, planCap);
    const [made, waiting] = await Promise.all([
      ScheduledPost.countDocuments({
        ...base,
        createdAt: { $gte: since },
        postType: story ? 'story' : { $ne: 'story' },
        status: { $ne: 'failed' },
      }),
      ScheduledPost.countDocuments({ ...base, status: 'pending_approval' }),
    ]);
    let why = null;
    const name = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X' }[platform] || platform;
    if (made >= cap) why = `${name} already has ${made} ${story ? 'stories' : 'posts'} from the last 24 hours (limit ${cap})`;
    else if (waiting >= AutopilotService.MAX_WAITING) why = `${waiting} posts are waiting for approval; approve or reject them first`;
    if (why) {
      const err = new Error(why);
      err.skip = 'skipped_budget';
      throw err;
    }
  }

  /**
   * Map a planner format to a ScheduledPost postType the publisher understands.
   */
  resolvePostType(format, platform, imageCount) {
    const isLinkedIn = platform === 'linkedin';
    const isTwitter = platform === 'twitter';

    if (format === 'text') return 'text';
    if (format === 'thread') return isTwitter ? 'thread' : 'text';
    if (format === 'video' || format === 'reel') {
      return isLinkedIn || isTwitter ? 'video' : 'reel';
    }
    if (format === 'multi_image' || format === 'carousel') {
      if (imageCount < 2) return 'image';
      return isLinkedIn || isTwitter ? 'multi_image' : 'carousel';
    }
    return 'image';
  }

  /**
   * How many images to generate for a planned format.
   * X caps a post at 4 images; Instagram and LinkedIn allow more.
   */
  imageCountFor(format, platform) {
    if (format !== 'multi_image' && format !== 'carousel') return 1;
    // X allows at most 4 images on a post; the others allow more but 3 is a
    // sensible default that keeps generation cost down.
    return platform === 'twitter' ? Math.min(3, 4) : 3;
  }

  /**
   * Whether a new post waits for the user or publishes on its own after a hold: the trust ladder decides
   * (functions/TrustLadder.js). Returns { status, autoApproveAt }.
   */
  async resolveStatus(config, review = null) {
    const { status, autoApproveAt, why } = await TrustLadder.decide(config, review);
    console.log(`[AUTOPILOT] ${status}${autoApproveAt ? ` until ${autoApproveAt.toISOString()}` : ''}: ${why}`);
    return { status, autoApproveAt };
  }

  /**
   * Review a post; if it claims something the site does not back, breaks a rule or scores under REVISE_BELOW,
   * revise it once against exactly those findings (`rewrite({ draft, problems })` returns new copy) and review
   * again, keeping whichever version is better: fewer unsupported claims first, then the higher score.
   * Returns { post, review } with the link attached.
   */
  async reviewAndRevise({ config, memory, platform, linkUrl, cta, post, media = {}, rewrite }) {
    let review = await this.reviewPost(config, memory, { ...post, linkUrl }, media);
    let current = post;
    const weak = (r) => r && (r.unsupportedClaims?.length || r.ruleFailed || (typeof r.score === 'number' && r.score < AutopilotService.REVISE_BELOW));
    // Up to two rounds; the second only for claims the site does not back (a score is a judgement, a false claim is not).
    for (let round = 0; round < 2 && rewrite && weak(review); round++) {
      if (round === 1 && !review.unsupportedClaims?.length) break;
      const problems = [
        ...(review.unsupportedClaims || []).map((c) => `Unsupported claim: "${c}"`),
        ...(review.ruleIssues || []),
        ...(review.score < AutopilotService.REVISE_BELOW ? review.issues || [] : []),
      ].slice(0, 8);
      const draft = current.threadParts?.length > 1 ? current.threadParts.join('\n---\n') : [current.caption, current.hashtags].filter(Boolean).join('\n\n');
      try {
        const copy = await rewrite({ draft, problems });
        const next = { ...current, ...this.attachLink(copy, platform, linkUrl, cta) };
        const again = await this.reviewPost(config, memory, { ...next, linkUrl }, media);
        const fewer = (again?.unsupportedClaims?.length || 0) - (review.unsupportedClaims?.length || 0);
        const better = again && (fewer < 0 || (fewer === 0 && (again.score ?? 0) > (review.score ?? 0)) || (review.ruleFailed && !again.ruleFailed));
        console.log(`[AUTOPILOT] Revision ${round + 1}: ${review.score} -> ${again?.score}${better ? ' (kept)' : ' (previous kept)'}`);
        if (!better) break;
        current = next;
        review = { ...again, revised: true };
      } catch (err) {
        console.warn('[AUTOPILOT] Revision failed, keeping the previous version:', err.message);
        break;
      }
    }
    return { post: current, review };
  }

  /**
   * Run the review agent over a finished post. Never throws: a reviewer
   * outage returns null, and resolveStatus treats null as "needs a human".
   */
  async reviewPost(config, memory, post, media = {}) {
    const platform = config.platform || 'instagram';
    const recent = (memory?.contentHistory || [])
      .filter((c) => (c.platform || 'instagram') === platform)
      .slice(0, 10)
      .map((c) => c.caption || '')
      .filter(Boolean);
    // Free checks first (functions/PostRules.js); a failure holds the post whatever the score.
    const rules = require('./PostRules').check({ platform, post, recentCaptions: recent });
    const ruleFields = { ruleIssues: rules.issues, ruleFailed: rules.failed };
    try {
      const PostReviewer = require('./PostReviewer');
      // The reviewer checks claims against everything read from the site, not just the brand summary.
      const brand = { ...(memory?.brand?.toObject?.() || memory?.brand || {}) };
      if (memory?.facts?.length) brand.proofPoints = memory.facts.slice(0, 60).map((f) => f.text);
      const review = await new PostReviewer().review({
        platform, brand, post, recentCaptions: recent.slice(0, 5),
        imageUrls: media.imageUrls || [], videoUrl: media.videoUrl || null, ruleIssues: rules.issues, textOnly: Boolean(media.textOnly),
      });
      console.log(`[AUTOPILOT] Review score ${review.score}/100 by ${review.model} - ${review.verdict}${rules.failed ? ` | rules: ${rules.issues.join('; ')}` : ''}`);
      return { ...review, ...ruleFields };
    } catch (err) {
      console.warn('[AUTOPILOT] Post review unavailable, holding for approval:', err.message);
      // No score means the trust ladder holds it for the user; the rule findings still show with it.
      return rules.failed ? { score: null, verdict: 'Review unavailable', issues: [], strengths: [], reviewedAt: new Date(), ...ruleFields } : null;
    }
  }


  /**
   * Resolve which connected account this post should publish through.
   * Instagram keeps using its own model; everything else uses SocialAccount.
   */
  async resolveAccountId(config) {
    const platform = config.platform || 'instagram';

    try {
      // The autopilot may have picked a specific account for this platform.
      let chosen = null;
      if (config.autopilotId) {
        const Autopilot = require('../models/autopilot');
        const ap = await Autopilot.findOne({ autopilotId: config.autopilotId }).select('accounts');
        chosen = ap?.accounts?.[platform] || null;
        // An autopilot only posts through integrations explicitly added to it.
        if (ap && !chosen) throw new Error(`No ${platform} account added to this autopilot. Add one on the autopilot page.`);
      }

      if (platform === 'instagram') {
        const Instagram = require('../models/instagram');
        const doc = await Instagram.findOne({ userId: config.userId });
        const list = doc?.accounts?.length ? doc.accounts : doc ? [doc] : [];
        const account = (chosen && list.find((a) => a.instagramBusinessAccountId === chosen)) || list[0];
        return account?.instagramBusinessAccountId || null;
      }

      const SocialAccount = require('../models/socialAccount');
      const account = await SocialAccount.findOne({
        userId: config.userId,
        platform,
        isActive: true,
        ...(chosen ? { accountId: chosen } : {}),
      }).sort({ createdAt: 1 });

      if (!account) {
        throw new Error(`No ${platform} account connected. Connect one in Settings first.`);
      }
      return account.accountId;
    } catch (error) {
      if (error.message.includes('No ')) throw error;
      console.warn('[AUTOPILOT] Account lookup failed:', error.message);
      return null;
    }
  }

  /**
   * Write the caption/hashtags for a planned post, respecting the platform's
   * caption spec (length, hashtag count, tone).
   */
  /**
   * Put the task's product link on the post. X and LinkedIn render URLs in
   * the body; Instagram captions are not clickable, so the URL still goes in
   * (people copy it) with a nudge to the bio. Trims the caption, never the
   * link, to stay inside the platform limit.
   */
  attachLink({ caption = '', hashtags = '', threadParts = [] }, platform, linkUrl, cta) {
    if (!linkUrl) return { caption, hashtags, threadParts };
    const spec = PlatformDefaults.getCaptionSettings(platform);
    const line = platform === 'instagram'
      ? `${cta ? `${cta} - ` : ''}${linkUrl} (link in bio)`
      : `${cta ? `${cta}: ` : ''}${linkUrl}`;

    if (platform === 'twitter' && threadParts?.length > 1) {
      // Links belong on the last post of a thread; X counts any URL as 23 chars.
      const last = threadParts[threadParts.length - 1];
      const room = spec.maxLength - 23 - 2 - (cta ? cta.length + 2 : 0);
      const parts = [...threadParts];
      parts[parts.length - 1] = `${[...last].slice(0, Math.max(0, room)).join('')}\n\n${line}`;
      return { caption, hashtags, threadParts: parts };
    }

    const linkCost = platform === 'twitter' ? 23 + (cta ? cta.length + 2 : 0) : [...line].length;
    const budget = spec.maxLength - linkCost - 2 - (hashtags ? [...hashtags].length + 2 : 0);
    let body = caption;
    if ([...body].length > budget) body = `${[...body].slice(0, Math.max(0, budget - 1)).join('')}\u2026`;
    return { caption: `${body}\n\n${line}`, hashtags, threadParts };
  }

  async generatePostCopy(postPlan, config, brief, prompts, memory = null, { slideCount = 0, revise = null } = {}) {
    const platform = config.platform || 'instagram';
    const PostWriter = require('./PostWriter');
    const recent = (memory?.contentHistory || [])
      .filter((c) => (c.platform || 'instagram') === platform)
      .slice(0, 5)
      .map((c) => c.caption || '')
      .filter(Boolean);

    // Split "idea. Visual: concept" back out if the run planner joined them.
    const raw = String(postPlan.promptSuggestion || postPlan.theme || '');
    const [idea, visual] = raw.split(/\s*Visual:\s*/i);

    const { caption, hashtags, threadParts, headline, slides, cover, end } = await new PostWriter().write({
      platform,
      format: postPlan.format || 'image',
      brand: memory?.brand || brief?.brand || {},
      idea: idea || raw,
      proofPoint: postPlan.proofPoint || '',
      proofSource: memory?.factSource?.(postPlan.proofPoint)?.url || (postPlan.announcementKey ? postPlan.linkUrl : ''),
      visualConcept: visual || (prompts?.[0] && prompts[0] !== raw ? prompts[0] : ''),
      cta: postPlan.cta || '',
      hasLink: Boolean(postPlan.linkUrl),
      recentCaptions: recent,
      rejections: memory?.rejections || [],
      goal: postPlan.goal || 'reach',
      slideCount,
      facts: memory?.freshProofPoints?.(14, platform) || [],
      revise,
    });

    return { caption, hashtags, threadParts: threadParts.length > 1 ? threadParts : [], viralContent: null, headline, slides, cover, end };
  }

  /**
   * Create a feed post based on plan.
   * Generates the media (if any), writes the copy, and puts it on the calendar
   * or into the approval queue.
   */
  async createFeedPost(postPlan, config, memory) {
    const platform = config.platform || 'instagram';
    // Something new on the site (SiteFacts) is announced before anything else, once per platform.
    postPlan = this.withAnnouncement(postPlan, memory, platform);
    const format = postPlan.format || 'image';
    const scheduledAt = this.parseTime(postPlan.time, config);

    console.log(`[AUTOPILOT] Creating ${platform} ${format} post for ${config.userId}, scheduled at ${scheduledAt}`);

    // One daily cap per platform, whichever task or plan makes the post, and nothing more while the queue is full.
    await this.assertPlatformBudget(config);

    // Video takes a different, asynchronous generation path.
    if (format === 'video' || format === 'reel') {
      const made = await this.createVideoPost(postPlan, config, memory, scheduledAt);
      if (postPlan.announcementKey) memory.markAnnounced(postPlan.announcementKey, platform, made.postId);
      return made;
    }

    const imageSpec = PlatformDefaults.getImageSettings(platform);
    const wantsMultiple = format === 'multi_image' || format === 'carousel';
    const imageCount = this.imageCountFor(format, platform);
    // Text and thread posts carry no generated media.
    const needsMedia = format !== 'text' && format !== 'thread';

    let prompt = null;
    let contentJob = null;
    let imageUrls = [];
    let reviewImageUrls = null;
    let copy = null;

    // Images from the company's own site (PostImages): a real product screen for a single image, a designed story
    // for a carousel. The copy comes first, since the images carry its headline and points.
    if (needsMedia && memory?.website?.url && process.env.STUDIO_ENABLED === 'true') {
      const slideCount = wantsMultiple ? (platform === 'twitter' ? 2 : 4) : 0;
      await assertCanSpend(config.userId, COSTS.image * (wantsMultiple ? slideCount + 3 : 1));
      try {
        copy = await this.generatePostCopy(postPlan, config, { concept: postPlan.promptSuggestion || postPlan.theme, targetPlatform: platform }, [postPlan.promptSuggestion || postPlan.theme], memory, { slideCount });
        const made = await require('./PostImages').make({
          config, memory, platform, multi: wantsMultiple,
          copy: { ...copy, fact: postPlan.proofPoint },
          factSource: memory.factSource?.(postPlan.proofPoint)?.url || postPlan.linkUrl || null,
        });
        if (made) {
          imageUrls = made.imageUrls;
          reviewImageUrls = made.reviewUrls.length ? made.reviewUrls : null;
          prompt = `Product images from the site: ${made.slides.map((x) => x.kind === 'shot' ? `real screen (${x.shotId})` : `${x.kind} "${x.headline}"`).join(', ')}`;
          await charge(config.userId, COSTS.image * imageUrls.length, made.jobId, `Autopilot ${platform} product image${imageUrls.length > 1 ? 's' : ''}`);
          console.log(`[AUTOPILOT] Made ${imageUrls.length} image(s) from the site (Studio job ${made.jobId})`);
        }
      } catch (err) {
        console.warn(`[AUTOPILOT] Site images failed, generating images instead: ${err.message}`);
        imageUrls = [];
      }
    }

    if (needsMedia && !imageUrls.length) {
      // Can the user afford these images today? (Charged below, once they exist.)
      await assertCanSpend(config.userId, COSTS.image * imageCount);

      // Step 1: Generate a prompt based on the plan
      prompt = await this.generateImagePrompt(postPlan, memory, config);
      console.log(`[AUTOPILOT] Generated prompt: ${prompt.slice(0, 100)}...`);

      // Step 2: Collect reference images from memory
      const referenceImages = this.collectReferenceImages(memory);
      console.log(`[AUTOPILOT] Using ${referenceImages.length} reference image(s)`);

      // Step 3: Create a content job, one prompt per image we need
      contentJob = await ContentJob.create({
        userId: config.userId,
        type: wantsMultiple ? 'batch' : 'single',
        status: 'pending',
        userRequest: `Autopilot: ${postPlan.theme} post`,
        inputBrief: {
          concept: postPlan.promptSuggestion || postPlan.theme,
          targetPlatform: platform,
          // LinkedIn wants 1.91:1 landscape, Instagram 1:1 - this is what
          // stops the autopilot rendering square images for a LinkedIn feed.
          targetAspectRatio: imageSpec.aspectRatio,
          styleDirection: memory.brand?.visualStyle || 'modern',
        },
        prompts: Array.from({ length: imageCount }, () => prompt),
        progress: { total: imageCount, completed: 0, failed: 0 },
      });

      console.log(`[AUTOPILOT] Created content job: ${contentJob.jobId}`);

      // Step 4: Generate the image(s) with reference images
      const { results } = await this.imageOrchestrator.executeJob(contentJob.jobId, referenceImages);

      imageUrls = (results || []).map((r) => r.url).filter(Boolean);
      if (imageUrls.length === 0) {
        throw new Error('Image generation failed - no results');
      }
      console.log(`[AUTOPILOT] Generated ${imageUrls.length} image(s)`);
      await charge(config.userId, COSTS.image * imageUrls.length, contentJob.jobId, `Autopilot ${platform} image${imageUrls.length > 1 ? 's' : ''}`);
    }

    // Step 5: Write the copy
    const brief = contentJob?.inputBrief || {
      concept: postPlan.promptSuggestion || postPlan.theme,
      targetPlatform: platform,
    };
    if (postPlan.proofPoint) {
      // ContentEngine writes the caption from the brief, so the fact has to be
      // in the brief or the copy drifts back to generic marketing language.
      brief.referenceNotes = `Ground this post in the following fact from the company's website, and do not contradict or embellish it: "${postPlan.proofPoint}"`;
    }
    if (!copy) {
      copy = await this.generatePostCopy(
        postPlan,
        config,
        brief,
        prompt ? [prompt] : [postPlan.promptSuggestion || postPlan.theme],
        memory
      );
    }
    let { caption, hashtags, threadParts } = this.attachLink(copy, platform, postPlan.linkUrl, postPlan.cta);

    // Record which website fact this post used, so the next run reaches for a
    // different one instead of repeating the same claim every day.
    if (postPlan.proofPoint && memory.markProofPointUsed) {
      memory.markProofPointUsed(postPlan.proofPoint, platform);
    }

    if (!needsMedia && !caption) {
      throw new Error(`${format} post generation failed - no copy produced`);
    }

    // Step 6: Put it on the calendar (or in the approval queue)
    let postType = this.resolvePostType(format, platform, imageUrls.length);
    // The copy may have needed more room than one X post allows, in which case
    // generatePostCopy turned it into a thread - reflect that in the type.
    if (platform === 'twitter' && threadParts?.length > 1) {
      postType = 'thread';
    }

    const accountId = await this.resolveAccountId(config);
    const checked = await this.reviewAndRevise({
      config, memory, platform, linkUrl: postPlan.linkUrl, cta: postPlan.cta,
      post: { postType, caption, hashtags, threadParts, imagePrompt: prompt, proofPoint: postPlan.proofPoint },
      media: { imageUrls: reviewImageUrls || imageUrls },
      rewrite: (revise) => this.generatePostCopy(postPlan, config, brief, prompt ? [prompt] : [postPlan.promptSuggestion || postPlan.theme], memory, { revise }),
    });
    ({ caption, hashtags, threadParts } = checked.post);
    const review = checked.review;
    const { status, autoApproveAt } = await this.resolveStatus(config, review);

    const postId = `post-${uuidv4()}`;
    const post = await ScheduledPost.create({
      postId,
      userId: config.userId,
      accountId,
      platform,
      review: review || undefined,
      imageUrl: imageUrls[0] || undefined,
      imageUrls: postType === 'multi_image' || postType === 'carousel' ? imageUrls : [],
      caption,
      hashtags,
      threadParts: threadParts?.length > 1 ? threadParts : [],
      postType,
      scheduledAt,
      status,
      autoApproveAt,
      source: 'autopilot',
      theme: postPlan.theme || null,
      hookStyle: postPlan.hookStyle || null,
      contentJobId: contentJob?.jobId,
      imageChatId: config.chatId,
      autopilotId: config.autopilotId || null,
    });

    console.log(`[AUTOPILOT] Created ${status} post ${postId} (${postType}) for ${scheduledAt}`);
    if (postPlan.announcementKey) memory.markAnnounced(postPlan.announcementKey, platform, postId);

    return {
      postId,
      review,
      scheduledAt,
      status,
      postType,
      imageUrl: imageUrls[0] || null,
      imageUrls,
      threadParts: post.threadParts,
      caption: post.caption,
      plan: postPlan,
    };
  }

  /**
   * Create a video post.
   *
   * Video generation is asynchronous - VideoController returns a 202 and
   * finishes in the background - so we start the job and wait on the MediaJob
   * record. This runs inside the cron, not an HTTP request, so a few minutes of
   * waiting costs nothing and saves building a separate completion callback.
   */
  async createVideoPost(postPlan, config, memory, scheduledAt) {
    const platform = config.platform || 'instagram';
    // Before minutes of rendering: is there an account to post it to?
    const accountId = await this.resolveAccountId(config);
    // Both kinds of video cost the same; check before minutes of rendering.
    await assertCanSpend(config.userId, COSTS.video);
    await require('./Plans').assertVideo(config.userId);

    // A real product video (Studio: the brand's own site and screens) when the brand has a website; a generated clip
    // when it doesn't, or when Studio is off or fails.
    const product = await this.makeProductVideo(postPlan, config, memory).catch((error) => {
      console.warn(`[AUTOPILOT] Product video failed, using a generated clip instead: ${error.message}`);
      return null;
    });

    let prompt;
    let videoUrl;
    let videoChatId = null;
    if (product) {
      prompt = product.angle;
      videoUrl = product.videoUrl;
      await charge(config.userId, COSTS.product_video, product.jobId, `Autopilot ${platform} product video`);
    } else {
      const imageSpec = PlatformDefaults.getImageSettings(platform);
      prompt = await this.generateImagePrompt(postPlan, memory, config);
      console.log(`[AUTOPILOT] Video prompt: ${prompt.slice(0, 100)}...`);

      // Gemini Omni 1.1 Flash. Reference product images, when the user has
      // uploaded any, anchor the clip to the real product rather than a guess.
      const { OmniVideoController } = require('./Video');
      const videoController = new OmniVideoController();
      const referenceImageUrls = (memory?.referenceImages?.products || [])
        .map((img) => (typeof img === 'string' ? img : img?.url))
        .filter(Boolean)
        .slice(0, 2);

      const response = await videoController.generate({
        body: {
          userId: config.userId,
          prompt,
          referenceImageUrls,
          aspectRatio: imageSpec.aspectRatio === '9:16' ? '9:16' : '16:9',
          resolution: '720p',
          billing: 'autopilot', // charged by the video job when the clip is ready
        },
      });

      if (!response.json?.jobId) {
        throw new Error(response.json?.error || 'Video generation could not be started');
      }

      videoUrl = await this.waitForVideo(response.json.jobId);
      videoChatId = response.json.videoChatId;
    }

    const videoCopy = await this.generatePostCopy(
      postPlan,
      config,
      { concept: postPlan.promptSuggestion || postPlan.theme, targetPlatform: platform },
      [prompt],
      memory
    );
    const videoBrief = { concept: postPlan.promptSuggestion || postPlan.theme, targetPlatform: platform };
    const checked = await this.reviewAndRevise({
      config, memory, platform, linkUrl: postPlan.linkUrl, cta: postPlan.cta,
      post: { postType: 'video', ...this.attachLink(videoCopy, platform, postPlan.linkUrl, postPlan.cta), imagePrompt: prompt, proofPoint: postPlan.proofPoint },
      media: { videoUrl: product?.reviewUrl || videoUrl },
      rewrite: (revise) => this.generatePostCopy(postPlan, config, videoBrief, [prompt], memory, { revise }),
    });
    const { caption, hashtags } = checked.post;
    const review = checked.review;
    const { status, autoApproveAt } = await this.resolveStatus(config, review);
    const postId = `post-${uuidv4()}`;

    const post = await ScheduledPost.create({
      postId,
      userId: config.userId,
      accountId,
      platform,
      review: review || undefined,
      videoUrl,
      videoChatId,
      studioJobId: product?.jobId || null,
      caption,
      hashtags,
      postType: platform === 'linkedin' || platform === 'twitter' ? 'video' : 'reel',
      scheduledAt,
      status,
      autoApproveAt,
      source: 'autopilot',
      theme: postPlan.theme || null,
      hookStyle: postPlan.hookStyle || null,
      imageChatId: config.chatId,
      autopilotId: config.autopilotId || null,
    });

    console.log(`[AUTOPILOT] Created ${status} video post ${postId} for ${scheduledAt}`);

    return {
      postId,
      scheduledAt,
      status,
      review,
      postType: post.postType,
      videoUrl,
      caption: post.caption,
      plan: postPlan,
    };
  }

  /**
   * Make a product video with Studio for this post: the brand's real site and screens, about the post's angle.
   * Returns { videoUrl, jobId, angle }, or null when Studio is off or the brand has no website.
   *
   * A site capture is reused for a week, so daily videos skip straight to the script. After that the site is read
   * again and compared with the last capture; anything new (a new feature, page or headline) becomes the subject.
   */
  async makeProductVideo(postPlan, config, memory) {
    const { studioJobs, mediaUrl } = require('../studio/service.cjs');
    const studio = studioJobs();
    if (!studio) return null;
    const Autopilot = require('../models/autopilot');
    const autopilot = config.autopilotId ? await Autopilot.findOne({ autopilotId: config.autopilotId }).lean() : null;
    const website = autopilot?.websiteUrl || memory?.website?.url;
    if (!website) return null;
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    await studio.ready;

    const platform = config.platform || 'instagram';
    const format = STUDIO_FORMAT[platform] || 'square';
    const angle = [postPlan.promptSuggestion || postPlan.theme, postPlan.proofPoint].filter(Boolean).join(' — ').slice(0, 300);
    const notes = [
      angle && `Make this video about: ${angle}.`,
      postPlan.cta && `End card call to action: "${String(postPlan.cta).slice(0, 40)}" (shorten to 4 words if needed).`,
      'It will be posted on ' + platform + '.',
    ].filter(Boolean).join(' ');

    const latest = await studio.latestCapture(config.userId, url);
    const fresh = latest && Date.now() - Date.parse(latest.capturedAt) < STUDIO_CAPTURE_DAYS * 86400000;
    const job = await studio.create({
      userId: config.userId,
      url,
      formats: [format],
      notes,
      reuseCapture: fresh ? latest.jobId : null,
      compareWith: !fresh && latest ? latest.headings : null,
      source: 'autopilot',
      autopilotId: config.autopilotId || null,
      angle: angle || null,
      platform,
    });
    console.log(`[AUTOPILOT] Product video ${job.id} (${format}) for ${platform}${fresh ? ', reusing the site capture' : ''}`);

    const done = await studio.waitFor(config.userId, job.id);
    const video = done.videos?.find((v) => v.status === 'done' && v.file);
    if (done.status !== 'done' || !video) throw new Error(done.error || 'Studio did not finish the video');
    const link = mediaUrl(job.id, `videos/${video.file}`) || (studio.store.signedUrl ? await studio.store.signedUrl(job.id, `videos/${video.file}`) : null);
    if (!link) throw new Error('No public link for the video: set STUDIO_PUBLIC_API_URL');
    const subject = done.whatsNew?.length ? `New on the site: ${done.whatsNew[0]}` : video.title || angle;
    // The reviewer's model fetches the video itself, so it gets a direct link it can reach.
    const reviewUrl = studio.store.signedUrl ? await studio.store.signedUrl(job.id, `videos/${video.file}`) : link;
    return { videoUrl: link, reviewUrl, jobId: job.id, angle: subject || angle || 'Product video' };
  }

  /**
   * Poll a MediaJob until the video is ready.
   */
  async waitForVideo(jobId) {
    for (let attempt = 1; attempt <= VIDEO_WAIT_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_WAIT_INTERVAL_MS));

      const job = await MediaJob.findOne({ jobId });
      if (!job) throw new Error(`Video job ${jobId} disappeared`);

      if (job.status === 'completed' && job.resultUrl) return job.resultUrl;
      if (job.status === 'failed') throw new Error(`Video generation failed: ${job.error || 'unknown error'}`);

      console.log(`[AUTOPILOT] Video ${jobId} ${job.status} ${job.progress || 0}% (${attempt}/${VIDEO_WAIT_ATTEMPTS})`);
    }

    throw new Error(`Video generation timed out for job ${jobId}`);
  }

  /**
   * Generate an image prompt based on the autopilot plan using LLM
   */
  async generateImagePrompt(postPlan, memory, config = {}) {
    const platform = config.platform || 'instagram';
    const platformSpec = PlatformDefaults.get(platform);
    const platformName = platformSpec.name;
    const aspectRatio = platformSpec.image.aspectRatio;
    const brandInfo = memory.brand || {};
    const refImages = memory.referenceImages || {};
    const topics = brandInfo.topicsAllowed?.join(', ') || 'lifestyle content';
    const theme = postPlan.theme || 'lifestyle';
    const format = postPlan.format || 'image';
    const hookStyle = postPlan.hookStyle || 'value';
    const goal = postPlan.goal || 'engagement';

    // Check what reference images are available
    const hasPersonal = !!refImages.personalReference?.url;
    const hasProducts = refImages.productImages?.length > 0;
    const hasStyleRefs = refImages.styleReferences?.length > 0;

    // Build reference context for the prompt
    let referenceContext = '';
    if (hasPersonal || hasProducts || hasStyleRefs) {
      referenceContext = '\nREFERENCE IMAGES AVAILABLE:';
      if (hasPersonal) referenceContext += '\n- Personal photo of the creator (incorporate this person into the scene)';
      if (hasProducts) referenceContext += `\n- ${refImages.productImages.length} product image(s) (feature the products naturally)`;
      if (hasStyleRefs) referenceContext += '\n- Style reference images (match this aesthetic)';
      referenceContext += '\n\nIMPORTANT: The AI will receive these reference images. Design the prompt to naturally incorporate them.';
    }

    // Use LLM to generate a creative, specific prompt
    const systemPrompt = `You are an expert social media content creator and AI image prompt engineer.
Your job is to create SPECIFIC, DETAILED image generation prompts that will result in high-performing ${platformName} content.

IMPORTANT RULES:
1. Be SPECIFIC - describe exact scenes, compositions, colors, lighting
2. Include the brand's niche/topics naturally in the image concept
3. Make it visually striking and scroll-stopping
4. Consider the theme and hook style for maximum impact
5. If personal/product references are available, design the scene to feature them naturally
6. Output ONLY the image prompt, nothing else`;

    const userPrompt = `Create a detailed AI image generation prompt for this social media post:

BRAND CONTEXT:
- Niche/Topics: ${topics}
- Target Audience: ${brandInfo.targetAudience || 'general audience'}
- Visual Style: ${brandInfo.visualStyle || 'modern and clean'}
- Brand Tone: ${brandInfo.tone || 'friendly'}
${referenceContext}

POST REQUIREMENTS:
- Theme: ${theme}
- Format: ${format}
- Hook Style: ${hookStyle} (${hookStyle === 'value' ? 'provide value/tips' : hookStyle === 'curiosity' ? 'create intrigue' : hookStyle === 'bold' ? 'make a bold statement' : 'engage the viewer'})
- Goal: ${goal}

${postPlan.promptSuggestion ? `Agent suggestion: ${postPlan.promptSuggestion}` : ''}
${postPlan.proofPoint ? `This post is about: "${postPlan.proofPoint}" - the visual should support that specific claim, not a generic scene.` : ''}

Generate a detailed, specific image prompt that will create a visually stunning, on-brand image for ${platformName}.
- Target aspect ratio: ${aspectRatio}
- Visual register: ${platformSpec.caption.tone}
${platform === 'linkedin' ? '- This is a professional feed. Favour clean, credible, editorial visuals: real settings, charts, workspaces, considered typography. Avoid stock-photo cliches, hype, and heavy filters.' : ''}
${hasPersonal ? 'The image should feature the person from the reference photo in a natural, on-brand setting.' : ''}
${hasProducts ? 'Feature the products naturally in the scene.' : ''}
The prompt should be 2-3 sentences describing the exact visual scene, style, lighting, and mood.`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const response = await this.openRouterProvider.chat(messages, {
        temperature: 0.8,
        maxTokens: 300
      });

      // Response is already the content string from OpenRouterProvider
      const generatedPrompt = typeof response === 'string' ? response.trim() : response;

      if (generatedPrompt) {
        console.log(`[AUTOPILOT] LLM generated prompt: ${generatedPrompt.substring(0, 100)}...`);
        return generatedPrompt;
      }
    } catch (error) {
      console.error('[AUTOPILOT] LLM prompt generation failed:', error.message);
    }

    // Fallback to basic prompt if LLM fails
    return `A ${theme} themed ${platformName} post about ${topics}. Style: ${brandInfo.visualStyle || 'modern'}. `
      + `Aspect ratio ${aspectRatio}. High quality and visually striking, appropriate for ${platformName}.`;
  }

  /**
   * Create a story based on plan - generates image and schedules for publishing
   */
  async createStory(storyPlan, config) {
    const scheduledAt = this.parseTime(storyPlan.time, config);
    await this.assertPlatformBudget(config, { story: true });

    console.log(`[AUTOPILOT] Creating story for ${config.userId}, scheduled at ${scheduledAt}`);

    // Get brand info for story context
    const memory = await AutopilotMemory.findOne(config.autopilotId ? { autopilotId: config.autopilotId } : { userId: config.userId });
    // The schema field is `brand`; reading `brandInfo` always yielded {} and
    // silently stripped the brand context out of every story prompt.
    const brandInfo = memory?.brand || {};

    // Generate a story-appropriate prompt (9:16 aspect ratio, bold text overlay style)
    const storyPrompt = await this.generateStoryPrompt(storyPlan, brandInfo);

    // Step 1: Create a content job for story
    const ContentJob = require('../models/contentJob');
    const contentJob = await ContentJob.create({
      userId: config.userId,
      type: 'single',
      status: 'pending',
      userRequest: `Autopilot Story: ${storyPlan.type}`,
      inputBrief: {
        concept: storyPlan.content || storyPlan.type,
        style: 'instagram story',
        tone: brandInfo.tone || 'engaging',
        aspectRatio: '9:16', // Story aspect ratio
      },
      prompts: [storyPrompt],
      progress: { total: 1, completed: 0, failed: 0 },
    });

    // Step 2: Generate the story image
    await assertCanSpend(config.userId, COSTS.image);
    const { results } = await this.imageOrchestrator.executeJob(contentJob.jobId);

    if (!results || results.length === 0) {
      throw new Error('Story image generation failed');
    }
    await charge(config.userId, COSTS.image, contentJob.jobId, 'Autopilot story image');

    // ImageOrchestrator returns outputAssets keyed on `url`, not `imageUrl`.
    const imageUrl = results[0].url;
    if (!imageUrl) {
      throw new Error('Story image generation returned no URL');
    }
    console.log(`[AUTOPILOT] Story image generated: ${imageUrl}`);

    // Step 3: Get Instagram account
    const Instagram = require('../models/instagram');
    const instagramData = await Instagram.findOne({ userId: config.userId });

    if (!instagramData) {
      throw new Error('No Instagram account connected');
    }

    const account = instagramData.accounts?.[0] || instagramData;
    const accountId = account.instagramBusinessAccountId;

    // Step 4: Schedule the story post
    const ScheduledPost = require('../models/scheduledPost');
    const storyPost = await ScheduledPost.create({
      userId: config.userId,
      accountId: accountId,
      platform: 'instagram',
      postType: 'story',
      imageUrl: imageUrl,
      caption: '', // Stories don't have captions
      scheduledAt: scheduledAt,
      ...(await this.resolveStatus(config)),
      // `metadata` is not on the schema and was being dropped silently.
      // `source` + `imageChatId` are real fields and survive the write.
      source: 'autopilot',
      imageChatId: config.chatId,
      autopilotId: config.autopilotId || null,
    });

    console.log(`[AUTOPILOT] Story scheduled: ${storyPost.postId} at ${scheduledAt}`);

    return {
      type: storyPlan.type,
      postId: storyPost.postId,
      imageUrl: imageUrl,
      scheduledAt,
      status: storyPost.status,
    };
  }

  /**
   * Generate a story-specific prompt
   */
  async generateStoryPrompt(storyPlan, brandInfo) {
    const storyType = storyPlan.type || 'engagement';
    const content = storyPlan.content || '';
    const visualStyle = brandInfo.visualStyle || 'modern, bold';

    const systemPrompt = `You are a creative director for Instagram Stories.
Generate a prompt for an AI image generator to create a vertical (9:16) Instagram Story image.
Stories should be eye-catching, bold, and designed to drive quick engagement.`;

    const userPrompt = `Create a story image prompt for:
Story Type: ${storyType}
Content: ${content}
Brand Style: ${visualStyle}

The image should:
- Be designed for vertical 9:16 format
- Be bold and attention-grabbing
- Work well with text overlays
- Match the brand style

Return ONLY the image generation prompt, nothing else.`;

    try {
      // OpenRouterProvider exposes chat/chatJSON/chatWithStream - there is no
      // generateChatCompletion, so this previously threw into the fallback
      // on every single call.
      const response = await this.openRouterProvider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.8, maxTokens: 200 }
      );

      const text = typeof response === 'string' ? response.trim() : response?.content;
      if (text) return text;
      throw new Error('Empty story prompt');
    } catch (error) {
      console.error('[AUTOPILOT] Story prompt generation error:', error.message);
      return `An eye-catching Instagram Story image, vertical 9:16 format, ${storyType} style, ${visualStyle}, bold colors, perfect for social media story.`;
    }
  }

  /**
   * Turn a planned "HH:MM" into a real instant.
   *
   * The time the planner picks is wall-clock time in the user's timezone, so
   * resolving it against the server's local clock (as this used to) shifted
   * every scheduled post by the server's UTC offset.
   */
  parseTime(timeStr, config) {
    const timezone = typeof config?.timezone === 'function' ? config.timezone() : 'UTC';
    return scheduleSlot(timeStr || '10:00', timezone);
  }

  /**
   * Collect reference images from memory for image generation
   * Returns array of { data: base64 or url, mimeType: string }
   */
  collectReferenceImages(memory) {
    const images = [];
    const refImages = memory.referenceImages;

    if (!refImages) return images;

    // Add personal reference (highest priority for personalized content)
    if (refImages.personalReference?.url) {
      images.push({
        url: refImages.personalReference.url,
        mimeType: 'image/png',
        type: 'personal',
      });
    }

    // Add product images (pick 1-2 random ones to avoid overloading)
    if (refImages.productImages?.length > 0) {
      const shuffled = [...refImages.productImages].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 2);
      selected.forEach(img => {
        images.push({
          url: img.url,
          mimeType: 'image/png',
          type: 'product',
        });
      });
    }

    // Add style references (pick 1 random one for style guidance)
    if (refImages.styleReferences?.length > 0) {
      const randomStyle = refImages.styleReferences[Math.floor(Math.random() * refImages.styleReferences.length)];
      images.push({
        url: randomStyle.url,
        mimeType: 'image/png',
        type: 'style',
      });
    }

    return images;
  }
}

/** A post scoring under this is revised once before it goes to the trust ladder. */
AutopilotService.REVISE_BELOW = 70;

/** Posts waiting for the user's approval before the autopilot makes no more for that platform. */
AutopilotService.MAX_WAITING = 10;

module.exports = AutopilotService;

