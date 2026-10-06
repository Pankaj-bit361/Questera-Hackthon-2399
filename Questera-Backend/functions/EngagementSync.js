const ScheduledPost = require('../models/scheduledPost');
const SocialAccount = require('../models/socialAccount');

const API_BASE = 'https://api.x.com/2';

const defaultFetchJson = async (url, init) => {
  const res = await fetch(url, init);
  return res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
};

// X allows 100 ids per lookup.
const BATCH = 100;

// Engagement keeps moving for a few days, then effectively stops. Re-reading a
// month-old post every cycle just burns rate limit.
const FRESH_WINDOW_DAYS = 14;

/**
 * Pulls engagement back from the platforms into ScheduledPost.engagement, so
 * the autopilot's "what performed" signal has something to read.
 *
 * Coverage is uneven and that is a platform limitation, not an oversight:
 *   - X        : public_metrics, readable with the tweet.read scope we hold.
 *   - Instagram: handled separately by AnalyticsService.refreshEngagement.
 *   - LinkedIn : member posts need r_member_social, a restricted scope, so
 *                personal-profile engagement cannot be read at all. Company
 *                pages can, via organizationalEntityShareStatistics.
 */
class EngagementSync {
  constructor(twitterController) {
    const TwitterController = require('./Twitter');
    this.twitter = twitterController || new TwitterController();
  }

  /**
   * Refresh X metrics for one user's recently published posts.
   */
  async syncTwitter(userId) {
    const since = new Date(Date.now() - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const posts = await ScheduledPost.find({
      userId,
      platform: 'twitter',
      status: 'published',
      publishedMediaId: { $ne: null },
      publishedAt: { $gte: since },
    });

    if (posts.length === 0) return { updated: 0, skipped: 'no recent posts' };

    let account;
    try {
      account = await this.twitter.resolveAccount(userId);
      account = await this.twitter.ensureFreshToken(account);
    } catch (err) {
      return { updated: 0, error: err.message };
    }

    let updated = 0;

    for (let i = 0; i < posts.length; i += BATCH) {
      const chunk = posts.slice(i, i + BATCH);
      const ids = chunk.map((p) => p.publishedMediaId).join(',');

      const res = await fetch(
        `${API_BASE}/tweets?ids=${ids}&tweet.fields=public_metrics,created_at`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // 429 is routine on the free tier - back off rather than treat it as
        // a failure worth surfacing.
        if (res.status === 429) {
          console.log('⏳ [ENGAGEMENT] X rate limited, will retry next cycle');
          return { updated, rateLimited: true };
        }
        console.warn('⚠️ [ENGAGEMENT] X lookup failed:', res.status, body?.detail || '');
        return { updated, error: body?.detail || `HTTP ${res.status}` };
      }

      const body = await res.json();
      const byId = Object.fromEntries((body.data || []).map((t) => [t.id, t.public_metrics]));

      for (const post of chunk) {
        const m = byId[post.publishedMediaId];
        // A deleted tweet returns no data; leave the last known numbers alone.
        if (!m) continue;

        post.engagement = {
          likes: m.like_count ?? 0,
          comments: m.reply_count ?? 0,
          // Reposts and quotes are both amplification.
          shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
          saves: m.bookmark_count ?? 0,
          impressions: m.impression_count ?? 0,
          // X reports impressions, not unique reach. Using it as reach keeps
          // the engagement-rate maths comparable across platforms.
          reach: m.impression_count ?? 0,
          lastUpdated: new Date(),
        };
        await post.save();
        updated += 1;
      }
    }

    if (updated) console.log(`📊 [ENGAGEMENT] Refreshed ${updated} X post(s) for ${userId}`);
    return { updated };
  }

  /**
   * Refresh Instagram metrics for one user's recent posts: likes and comments from the media itself, reach, saves,
   * shares and views from its insights (the metrics on offer differ by media type, so each is asked for alone and a
   * refused one is skipped).
   */
  async syncInstagram(userId, { fetchJson = defaultFetchJson } = {}) {
    const { instagramToken } = require('./PlatformTokens');
    const since = new Date(Date.now() - FRESH_WINDOW_DAYS * 86400e3);
    const posts = await ScheduledPost.find({
      userId, platform: 'instagram', status: 'published', publishedMediaId: { $ne: null }, publishedAt: { $gte: since }, postType: { $ne: 'story' },
    });
    if (!posts.length) return { updated: 0, skipped: 'no recent posts' };
    let updated = 0;
    for (const post of posts) {
      const auth = await instagramToken(userId, post.accountId || null);
      if (!auth) return { updated, error: 'Instagram not connected' };
      const base = `https://graph.facebook.com/v22.0/${post.publishedMediaId}`;
      const media = await fetchJson(`${base}?fields=like_count,comments_count&access_token=${auth.accessToken}`);
      if (media?.error) {
        if (/limit|rate/i.test(media.error.message || '')) return { updated, rateLimited: true };
        continue; // deleted or not ours any more
      }
      const insight = {};
      for (const metric of ['reach', 'saved', 'shares', 'views']) {
        const r = await fetchJson(`${base}/insights?metric=${metric}&access_token=${auth.accessToken}`);
        const value = r?.data?.[0]?.values?.[0]?.value ?? r?.data?.[0]?.total_value?.value;
        if (typeof value === 'number') insight[metric] = value;
      }
      post.engagement = {
        likes: media.like_count ?? 0,
        comments: media.comments_count ?? 0,
        shares: insight.shares ?? 0,
        saves: insight.saved ?? 0,
        reach: insight.reach ?? 0,
        impressions: insight.views ?? insight.reach ?? 0,
        lastUpdated: new Date(),
      };
      await post.save();
      updated += 1;
    }
    if (updated) console.log(`📊 [ENGAGEMENT] Refreshed ${updated} Instagram post(s) for ${userId}`);
    return { updated };
  }

  /**
   * LinkedIn company-page posts only: member (personal) posts cannot be read without a restricted scope. Needs the
   * Community Management API product (LINKEDIN_ENABLE_ORG=true, r_organization_social).
   */
  async syncLinkedIn(userId, { fetchJson = defaultFetchJson } = {}) {
    if (process.env.LINKEDIN_ENABLE_ORG !== 'true') return { updated: 0, skipped: 'company pages not enabled' };
    const since = new Date(Date.now() - FRESH_WINDOW_DAYS * 86400e3);
    const accounts = await SocialAccount.find({ userId, platform: 'linkedin', isActive: true, authorType: 'organization' });
    let updated = 0;
    for (const account of accounts) {
      const posts = await ScheduledPost.find({
        userId, platform: 'linkedin', status: 'published', accountId: account.accountId, publishedMediaId: { $ne: null }, publishedAt: { $gte: since },
      });
      if (!posts.length) continue;
      const shares = posts.filter((p) => p.publishedMediaId.startsWith('urn:li:share:'));
      const ugc = posts.filter((p) => p.publishedMediaId.startsWith('urn:li:ugcPost:'));
      const list = (urns) => `List(${urns.map((u) => encodeURIComponent(u)).join(',')})`;
      const q = [
        `q=organizationalEntity&organizationalEntity=${encodeURIComponent(account.authorUrn)}`,
        shares.length ? `shares=${list(shares.map((p) => p.publishedMediaId))}` : '',
        ugc.length ? `ugcPosts=${list(ugc.map((p) => p.publishedMediaId))}` : '',
      ].filter(Boolean).join('&');
      const body = await fetchJson(`https://api.linkedin.com/rest/organizationalEntityShareStatistics?${q}`, {
        headers: { Authorization: `Bearer ${account.accessToken}`, 'LinkedIn-Version': process.env.LINKEDIN_API_VERSION || '202509', 'X-Restli-Protocol-Version': '2.0.0' },
      });
      for (const el of body?.elements || []) {
        const urn = el.share || el.ugcPost;
        const post = posts.find((p) => p.publishedMediaId === urn);
        const t = el.totalShareStatistics;
        if (!post || !t) continue;
        post.engagement = {
          likes: t.likeCount ?? 0,
          comments: t.commentCount ?? 0,
          shares: t.shareCount ?? 0,
          saves: 0,
          impressions: t.impressionCount ?? 0,
          reach: t.uniqueImpressionsCount ?? t.impressionCount ?? 0,
          lastUpdated: new Date(),
        };
        await post.save();
        updated += 1;
      }
    }
    if (updated) console.log(`📊 [ENGAGEMENT] Refreshed ${updated} LinkedIn post(s) for ${userId}`);
    return { updated };
  }

  /** Every user who published in the last two weeks, on every platform that can be read. */
  async syncAll() {
    const since = new Date(Date.now() - FRESH_WINDOW_DAYS * 86400e3);
    const userIds = await ScheduledPost.distinct('userId', { status: 'published', publishedAt: { $gte: since } });
    const totals = { instagram: 0, linkedin: 0 };
    for (const userId of userIds) {
      for (const platform of ['instagram', 'linkedin']) {
        try {
          const r = platform === 'instagram' ? await this.syncInstagram(userId) : await this.syncLinkedIn(userId);
          totals[platform] += r.updated || 0;
        } catch (err) {
          console.warn(`⚠️ [ENGAGEMENT] ${platform} ${userId}:`, err.message);
        }
      }
      // What the planner learns from (functions/Performance.js).
      await require('./Performance').refreshForUser(userId).catch((err) => console.warn(`⚠️ [PERFORMANCE] ${userId}:`, err.message));
    }
    const x = await this.syncAllTwitter();
    return { users: userIds.length, ...totals, twitter: x.updated };
  }

  /**
   * Every user with a connected X account and recent posts.
   */
  async syncAllTwitter() {
    const accounts = await SocialAccount.find({ platform: 'twitter', isActive: true }).select('userId');
    const userIds = [...new Set(accounts.map((a) => a.userId))];

    let total = 0;
    for (const userId of userIds) {
      try {
        const r = await this.syncTwitter(userId);
        total += r.updated || 0;
        if (r.rateLimited) break; // shared app-level limit; stop the sweep
      } catch (err) {
        console.warn(`⚠️ [ENGAGEMENT] ${userId}:`, err.message);
      }
    }
    return { users: userIds.length, updated: total };
  }
}

module.exports = EngagementSync;
