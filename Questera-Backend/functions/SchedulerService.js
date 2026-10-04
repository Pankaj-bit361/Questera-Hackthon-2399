const ScheduledPost = require('../models/scheduledPost');
const Campaign = require('../models/campaign');
const SocialAccount = require('../models/socialAccount');
const Instagram = require('../models/instagram');
const InstagramService = require('./InstagramService');
const { v4: uuidv4 } = require('uuid');

/**
 * Scheduler Service
 * Manages post scheduling, queue processing, and campaign automation
 */
class SchedulerService {
  constructor() {
    this.instagramService = new InstagramService();
    this.isProcessing = false;
  }

  /**
   * Schedule a single post
   */
  async schedulePost(userId, postData) {
    const {
      socialAccountId,
      imageUrl,
      imageUrls,
      caption,
      hashtags,
      scheduledAt,
      timezone = 'UTC',
      postType = 'image',
      campaignId,
      contentJobId,
      // Buffer-like features
      music = '',
      tagProducts = '',
      firstComment = '',
      videoUrl,
      platform: requestedPlatform,
      source = 'manual',
      threadParts,
      // 'pending_approval' puts it in the approval queue instead of publishing it at scheduledAt.
      status = 'scheduled',
      autopilotId,
    } = postData;
    if (!['scheduled', 'pending_approval'].includes(status)) throw new Error(`Cannot create a post as ${status}`);

    // Resolve the account this post publishes through.
    // A concrete socialAccountId wins; otherwise fall back to the user's
    // default account on the requested platform.
    let account = socialAccountId
      ? await SocialAccount.findOne({ accountId: socialAccountId, userId })
      : null;

    let platform = account?.platform || requestedPlatform || 'instagram';
    let accountIdToStore = account?.accountId || socialAccountId;

    if (!account) {
      if (platform === 'instagram') {
        // Instagram accounts live in their own legacy collection.
        const igDoc = await Instagram.findOne({ userId });
        const igAccounts = igDoc?.accounts || [];
        const igAccount = socialAccountId
          ? igAccounts.find(a => a.instagramBusinessAccountId === socialAccountId)
          : igAccounts.find(a => a.isConnected) || igAccounts[0];

        if (!igAccount) {
          throw new Error('Social account not found');
        }

        console.log('📅 [SCHEDULER] Found account in Instagram collection:', igAccount.instagramUsername);
        accountIdToStore = igAccount.instagramBusinessAccountId;
      } else {
        // Any other platform (LinkedIn today) uses the generic model.
        const fallback = await SocialAccount.findOne({ userId, platform, isActive: true }).sort({ createdAt: 1 });
        if (!fallback) {
          throw new Error(`No ${platform} account connected. Connect one in Settings first.`);
        }
        accountIdToStore = fallback.accountId;
      }
    }

    const post = await ScheduledPost.create({
      userId,
      accountId: accountIdToStore,
      platform,
      imageUrl,
      imageUrls: imageUrls || [],
      videoUrl: videoUrl || null,
      caption,
      hashtags: hashtags || '',
      scheduledAt: new Date(scheduledAt),
      timezone,
      postType,
      campaignId,
      contentJobId,
      status,
      source,
      autopilotId: autopilotId || null,
      threadParts: threadParts || [],
      // Buffer-like features
      music: music || '',
      tagProducts: tagProducts || '',
      firstComment: firstComment || '',
    });

    console.log('📅 [SCHEDULER] Post scheduled for:', post.scheduledAt);
    return post;
  }

  /**
   * Schedule multiple posts at intervals
   */
  async scheduleBulkPosts(userId, socialAccountId, posts, options = {}) {
    const {
      startTime = new Date(),
      intervalMinutes = 60,
      timezone = 'UTC',
      campaignId,
    } = options;

    const scheduledPosts = [];
    let currentTime = new Date(startTime);

    for (const post of posts) {
      const scheduled = await this.schedulePost(userId, {
        socialAccountId,
        imageUrl: post.imageUrl,
        imageUrls: post.imageUrls,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduledAt: currentTime,
        timezone,
        postType: post.postType || 'image',
        campaignId,
        contentJobId: post.contentJobId,
      });

      scheduledPosts.push(scheduled);
      currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000);
    }

    console.log('📅 [SCHEDULER] Bulk scheduled', scheduledPosts.length, 'posts');
    return scheduledPosts;
  }

  /**
   * Create and schedule a campaign
   */
  async createCampaign(userId, campaignData) {
    const {
      name,
      description,
      type = 'custom',
      platforms = ['instagram'],
      schedule,
      content,
      viralSettings,
      socialAccountId,
    } = campaignData;

    // Create campaign
    const campaign = await Campaign.create({
      userId,
      name,
      description,
      type,
      platforms,
      schedule: {
        startDate: new Date(schedule.startDate),
        endDate: schedule.endDate ? new Date(schedule.endDate) : null,
        postsPerDay: schedule.postsPerDay || 1,
        postingTimes: schedule.postingTimes || ['12:00'],
        interval: schedule.interval || 'daily',
        intervalMinutes: schedule.intervalMinutes,
        timezone: schedule.timezone || 'UTC',
      },
      content,
      viralSettings,
      status: 'draft',
    });

    console.log('🎯 [SCHEDULER] Campaign created:', campaign.campaignId);
    return campaign;
  }

  /**
   * Generate posting schedule from campaign settings
   */
  generatePostingTimes(campaign, postCount) {
    const times = [];
    const { startDate, postingTimes, interval, intervalMinutes, timezone } = campaign.schedule;

    let currentDate = new Date(startDate);
    let postsScheduled = 0;

    while (postsScheduled < postCount) {
      for (const time of postingTimes) {
        if (postsScheduled >= postCount) break;

        const [hours, minutes] = time.split(':').map(Number);
        const postTime = new Date(currentDate);
        postTime.setHours(hours, minutes, 0, 0);

        // Only schedule future posts
        if (postTime > new Date()) {
          times.push(postTime);
          postsScheduled++;
        }
      }

      // Move to next day or interval
      if (interval === 'hourly') {
        currentDate = new Date(currentDate.getTime() + (intervalMinutes || 60) * 60 * 1000);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return times;
  }

  /**
   * Process scheduled posts that are due (called by cron job)
   */
  async processScheduledPosts() {
    // One publish loop for everything: the claim-based one in Scheduler.js.
    const SchedulerController = require('./Scheduler');
    return new SchedulerController().processDuePosts();
  }

  /**
   * Get scheduled posts for a user
   */
  async getScheduledPosts(userId, options = {}) {
    const { status, platform, startDate, endDate, limit = 50 } = options;

    const query = { userId };

    if (status) query.status = status;
    if (platform) query.platform = platform;
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    return ScheduledPost.find(query)
      .sort({ scheduledAt: 1 })
      .limit(limit);
  }

  /**
   * Get calendar view of scheduled posts
   */
  async getCalendarView(userId, startDate, endDate) {
    const posts = await ScheduledPost.getCalendarPosts(userId, new Date(startDate), new Date(endDate));

    // Group by date
    const calendar = {};
    for (const post of posts) {
      const dateKey = post.scheduledAt.toISOString().split('T')[0];
      if (!calendar[dateKey]) {
        calendar[dateKey] = [];
      }
      calendar[dateKey].push(post);
    }

    return calendar;
  }

  /**
   * Cancel a scheduled post
   */
  async cancelPost(userId, postId) {
    const post = await ScheduledPost.findOneAndUpdate(
      { userId, postId, status: 'scheduled' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!post) {
      throw new Error('Post not found or already published');
    }

    return post;
  }

  /**
   * Reschedule a post
   */
  async reschedulePost(userId, postId, newScheduledAt) {
    const post = await ScheduledPost.findOneAndUpdate(
      { userId, postId, status: { $in: ['scheduled', 'failed'] } },
      {
        scheduledAt: new Date(newScheduledAt),
        status: 'scheduled',
        retryCount: 0,
        publishError: null,
      },
      { new: true }
    );

    if (!post) {
      throw new Error('Post not found or already published');
    }

    return post;
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(userId, campaignId) {
    const campaign = await Campaign.findOneAndUpdate(
      { userId, campaignId, status: { $in: ['scheduled', 'running'] } },
      { status: 'paused' },
      { new: true }
    );

    if (!campaign) {
      throw new Error('Campaign not found or cannot be paused');
    }

    // Cancel all pending posts for this campaign
    await ScheduledPost.updateMany(
      { campaignId, status: 'scheduled' },
      { status: 'cancelled' }
    );

    return campaign;
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(userId, campaignId) {
    const campaign = await Campaign.findOneAndUpdate(
      { userId, campaignId, status: 'paused' },
      { status: 'running' },
      { new: true }
    );

    if (!campaign) {
      throw new Error('Campaign not found or not paused');
    }

    // Reschedule cancelled posts
    await ScheduledPost.updateMany(
      { campaignId, status: 'cancelled' },
      { status: 'scheduled' }
    );

    return campaign;
  }

  /**
   * Get campaign with all its posts
   */
  async getCampaignDetails(userId, campaignId) {
    const campaign = await Campaign.findOne({ userId, campaignId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const posts = await ScheduledPost.find({ campaignId })
      .sort({ scheduledAt: 1 });

    return { campaign, posts };
  }

  /**
   * Update engagement metrics for published posts
   */
  async updatePostEngagement(postId) {
    const post = await ScheduledPost.findOne({ postId, status: 'published' });

    if (!post || !post.publishedMediaId) {
      return null;
    }

    const account = await SocialAccount.findOne({ accountId: post.accountId });
    if (!account) return null;

    const insights = await this.instagramService.getPostInsights(
      post.publishedMediaId,
      account.facebookPageAccessToken || account.accessToken
    );

    if (insights) {
      post.engagement = {
        likes: insights.engagement || 0,
        impressions: insights.impressions || 0,
        reach: insights.reach || 0,
        saves: insights.saved || 0,
        lastUpdated: new Date(),
      };
      await post.save();
    }

    return post;
  }

  /**
   * Start the scheduler cron (call this on server start)
   */
  startCron(intervalSeconds = 60) {
    console.log(`⏰ [SCHEDULER] Starting cron, checking every ${intervalSeconds}s`);

    setInterval(async () => {
      try {
        await this.processScheduledPosts();
      } catch (error) {
        console.error('❌ [SCHEDULER] Cron error:', error);
      }
    }, intervalSeconds * 1000);
  }
}

module.exports = SchedulerService;

