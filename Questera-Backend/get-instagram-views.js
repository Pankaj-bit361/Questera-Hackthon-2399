/**
 * Get Instagram Views & Reach directly from Instagram API
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Change this to check different account: 'lux.kaira' or 'iammyglow'
const INSTAGRAM_USERNAME = 'iammyglow';

// Try to refresh token if expired
async function tryRefreshToken(igAccount) {
  console.log('🔄 Attempting to refresh token...');

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  const refreshUrl = `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${igAccount.accessToken}`;

  const response = await fetch(refreshUrl);
  const data = await response.json();

  if (data.error) {
    console.log('❌ Token refresh failed:', data.error.message);
    return null;
  }

  // Update token in database
  igAccount.accessToken = data.access_token;
  igAccount.lastTokenRefresh = new Date();
  await igAccount.save();

  console.log('✅ Token refreshed successfully!');
  return data.access_token;
}

async function getInstagramViews() {
  try {
    console.log('\n🔍 FETCHING INSTAGRAM VIEWS & REACH\n');
    console.log('━'.repeat(60));

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./models/user');
    const Instagram = require('./models/instagram');

    // Get Instagram account by username - search in accounts array too
    let igAccount = await Instagram.findOne({ instagramUsername: INSTAGRAM_USERNAME, isConnected: true });
    let accessToken, igBusinessId, foundUsername;

    // Also search in accounts array for the username
    const allDocs = await Instagram.find({ 'accounts.instagramUsername': INSTAGRAM_USERNAME });

    // Find the most recently updated document with this account
    let bestDoc = null;
    let bestAccount = null;

    for (const doc of allDocs) {
      const account = doc.accounts?.find(a => a.instagramUsername === INSTAGRAM_USERNAME);
      if (account) {
        if (!bestDoc || doc.lastTokenRefresh > bestDoc.lastTokenRefresh) {
          bestDoc = doc;
          bestAccount = account;
        }
      }
    }

    if (bestAccount) {
      accessToken = bestAccount.accessToken;
      igBusinessId = bestAccount.instagramBusinessAccountId;
      foundUsername = bestAccount.instagramUsername;
      igAccount = bestDoc;
      console.log(`✅ Found @${INSTAGRAM_USERNAME} in accounts array (newer token)`);
    } else if (igAccount) {
      accessToken = igAccount.accessToken;
      igBusinessId = igAccount.instagramBusinessAccountId;
      foundUsername = igAccount.instagramUsername;
    } else {
      console.log(`❌ Instagram account @${INSTAGRAM_USERNAME} not found`);
      await mongoose.disconnect();
      return;
    }

    // Get user
    const user = await User.findOne({ userId: igAccount.userId });
    console.log(`👤 User: ${user?.name || 'Unknown'} (${user?.email || 'no email'})`);
    console.log(`🆔 User ID: ${igAccount.userId}\n`);
    console.log(`📸 Instagram: @${foundUsername}`);
    console.log(`🔗 Business ID: ${igBusinessId}`);
    console.log(`🕐 Last Token Refresh: ${igAccount.lastTokenRefresh}\n`);

    // Fetch ALL posts from Instagram
    console.log('━'.repeat(60));
    console.log('📊 FETCHING ALL POSTS FROM INSTAGRAM...\n');

    let mediaUrl = `https://graph.facebook.com/v21.0/${igBusinessId}/media?` +
      `fields=id,caption,like_count,comments_count,permalink,timestamp,media_type&limit=100&access_token=${accessToken}`;

    let mediaResponse = await fetch(mediaUrl);
    let mediaData = await mediaResponse.json();

    // If token expired, try to refresh
    if (mediaData.error && mediaData.error.code === 190) {
      console.log('⚠️  Token expired! Trying to refresh...\n');
      const newToken = await tryRefreshToken(igAccount);
      if (newToken) {
        accessToken = newToken;
        mediaUrl = `https://graph.facebook.com/v21.0/${igBusinessId}/media?` +
          `fields=id,caption,like_count,comments_count,permalink,timestamp,media_type&limit=100&access_token=${accessToken}`;
        mediaResponse = await fetch(mediaUrl);
        mediaData = await mediaResponse.json();
      }
    }

    if (mediaData.error) {
      console.log('❌ Error:', mediaData.error.message);
      console.log('\n⚠️  The user needs to re-authenticate their Instagram account.');
      await mongoose.disconnect();
      return;
    }

    const posts = mediaData.data || [];
    console.log(`Found ${posts.length} posts on Instagram\n`);

    // Get insights for each post
    console.log('━'.repeat(60));
    console.log('📈 POST ANALYTICS:\n');

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      console.log(`\n${i + 1}. ${post.caption?.substring(0, 50) || 'No caption'}...`);
      console.log(`   🔗 ${post.permalink}`);
      console.log(`   📅 ${new Date(post.timestamp).toLocaleDateString()}`);
      console.log(`   📷 Type: ${post.media_type}`);
      console.log(`   ❤️  Likes: ${post.like_count || 0}`);
      console.log(`   💬 Comments: ${post.comments_count || 0}`);

      // Get insights (reach, views)
      try {
        // Try v21 for reach/saved
        const insightsUrl = `https://graph.facebook.com/v21.0/${post.id}/insights?` +
          `metric=reach,saved&access_token=${accessToken}`;
        const insightsResponse = await fetch(insightsUrl);
        const insightsData = await insightsResponse.json();

        let reach = 0, saved = 0;
        if (insightsData.data) {
          insightsData.data.forEach(m => {
            if (m.name === 'reach') reach = m.values?.[0]?.value || 0;
            if (m.name === 'saved') saved = m.values?.[0]?.value || 0;
          });
        }

        // Try v22 for views
        const viewsUrl = `https://graph.facebook.com/v22.0/${post.id}/insights?` +
          `metric=views&access_token=${accessToken}`;
        const viewsResponse = await fetch(viewsUrl);
        const viewsData = await viewsResponse.json();

        let views = 0;
        if (viewsData.data) {
          viewsData.data.forEach(m => {
            if (m.name === 'views') views = m.values?.[0]?.value || 0;
          });
        }

        console.log(`   👁️  VIEWS: ${views}`);
        console.log(`   🎯 REACH: ${reach}`);
        console.log(`   🔖 Saves: ${saved}`);

        if (insightsData.error) {
          console.log(`   ⚠️  Insights: ${insightsData.error.message}`);
        }
        if (viewsData.error) {
          console.log(`   ⚠️  Views: ${viewsData.error.message}`);
        }

      } catch (err) {
        console.log(`   ⚠️  Could not fetch insights: ${err.message}`);
      }
    }

    console.log('\n' + '━'.repeat(60));
    console.log('✨ DONE!\n');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

getInstagramViews();

