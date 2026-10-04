/**
 * X (Twitter) publishing test harness.
 *
 * Walks the publish ladder from cheapest to most involved, against a real
 * connected account. Each rung exercises a different part of the pipeline:
 *
 *   text   -> POST /2/tweets
 *   thread -> reply chaining through in_reply_to_tweet_id
 *   image  -> media INIT / APPEND / FINALIZE
 *   multi  -> repeated upload + up to 4 media_ids on one post
 *   video  -> multi-chunk upload plus STATUS polling for transcoding
 *
 * Usage:
 *   node test-twitter-publish.js status
 *   node test-twitter-publish.js text
 *   node test-twitter-publish.js thread
 *   node test-twitter-publish.js image [imageUrl]
 *   node test-twitter-publish.js multi [url1] [url2]
 *   node test-twitter-publish.js video [videoUrl]
 *   node test-twitter-publish.js scheduler   (inserts a due ScheduledPost)
 *
 * These publish to a REAL X timeline. There is no sandbox.
 *
 * Watch your quota: on the free tier you get 500 posts a month and only
 * 17 media initialize/finalize calls per 24 hours, so the image, multi and
 * video rungs are the ones that will run you out - not the text ones.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;

// Public test assets
const TEST_IMAGE = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200';
const TEST_IMAGES = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200',
];
const TEST_VIDEO = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

const stamp = () => new Date().toISOString().slice(11, 19);

async function main() {
  const [, , command = 'status', ...args] = process.argv;

  const required = ['TWITTER_CLIENT_ID', 'TWITTER_REDIRECT_URI'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\n❌ Missing env: ${missing.join(', ')}`);
    console.error('   Add them to .env - see .env.example for how to get them.\n');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  console.log('🔌 Connected to MongoDB\n');

  const SocialAccount = require('./models/socialAccount');
  const ScheduledPost = require('./models/scheduledPost');
  const TwitterController = require('./functions/Twitter');
  const TwitterPublisher = require('./functions/TwitterPublisher');

  const controller = new TwitterController();
  const publisher = new TwitterPublisher(controller);

  const account = await SocialAccount.findOne({ platform: 'twitter', isActive: true }).sort({ createdAt: 1 });
  if (!account) {
    console.error('❌ No X account connected.');
    console.error('   Connect one at /settings first, then re-run this.\n');
    await mongoose.disconnect();
    process.exit(1);
  }

  const userId = account.userId;
  console.log(`👤 @${account.platformUsername} (user ${userId})`);
  console.log(`🔑 Token expires ${account.tokenExpiresAt?.toISOString() || 'unknown'}`);
  console.log(`♻️  Auto-refresh: ${account.refreshToken ? 'yes' : 'NO - will need reconnecting'}`);
  console.log(`🔐 Scopes: ${account.scopes?.join(' ') || 'unknown'}\n`);

  const report = (label, result) => {
    if (result.json.success) {
      console.log(`\n✅ ${label} published`);
      console.log(`   ${result.json.permalink}`);
      if (result.json.threadIds?.length > 1) {
        console.log(`   ${result.json.threadIds.length} posts in the thread`);
      }
    } else {
      console.error(`\n❌ ${label} failed: ${result.json.error}`);
      console.error(`   code=${result.json.code} retryable=${!result.json.nonRetryable}`);
    }
  };

  switch (command) {
    case 'status': {
      console.log('Checking token freshness...');
      try {
        const fresh = await controller.ensureFreshToken(account);
        console.log(`✅ Token usable, expires ${fresh.tokenExpiresAt?.toISOString()}`);
      } catch (err) {
        console.error(`❌ ${err.message}`);
      }
      break;
    }

    case 'text': {
      const caption = args.join(' ') || `velos autopilot smoke test ${stamp()}`;
      console.log(`Posting: "${caption}"`);
      report('Text post', await publisher.publishText({ body: { userId, caption } }));
      break;
    }

    case 'thread': {
      const threadParts = args.length
        ? args
        : [
            `thread smoke test ${stamp()}`,
            'second post - this should appear as a reply to the first',
            'third post - and this one replies to the second',
          ];
      console.log(`Posting a ${threadParts.length}-part thread`);
      report('Thread', await publisher.publishThread({ body: { userId, threadParts } }));
      break;
    }

    case 'image': {
      const imageUrl = args[0] || TEST_IMAGE;
      console.log(`Uploading ${imageUrl}`);
      report('Image post', await publisher.publishImage({
        body: { userId, imageUrl, caption: `image smoke test ${stamp()}` },
      }));
      break;
    }

    case 'multi': {
      const imageUrls = args.length >= 2 ? args : TEST_IMAGES;
      console.log(`Uploading ${imageUrls.length} images`);
      report('Multi-image post', await publisher.publishMultiImage({
        body: { userId, imageUrls, caption: `multi-image smoke test ${stamp()}` },
      }));
      break;
    }

    case 'video': {
      const videoUrl = args[0] || TEST_VIDEO;
      console.log(`Uploading ${videoUrl}`);
      console.log('(chunked upload + transcode polling - this takes a minute)');
      report('Video post', await publisher.publishVideo({
        body: { userId, videoUrl, caption: `video smoke test ${stamp()}` },
      }));
      break;
    }

    case 'scheduler': {
      // Exercises the real path: cron -> findDuePosts -> publishPost dispatch.
      const when = new Date(Date.now() + 60 * 1000);
      const post = await ScheduledPost.create({
        userId,
        accountId: account.accountId,
        platform: 'twitter',
        postType: 'text',
        caption: `scheduler dispatch test ${stamp()}`,
        scheduledAt: when,
        status: 'scheduled',
        source: 'manual',
      });
      console.log(`📅 Created ${post.postId}, due ${when.toISOString()}`);
      console.log('   The running server should pick this up within a minute.');
      console.log(`   Watch: db.scheduledposts.findOne({postId: "${post.postId}"})`);
      break;
    }

    default:
      console.error(`Unknown command "${command}".`);
      console.error('Try: status | text | thread | image | multi | video | scheduler');
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected');
}

main().catch((err) => {
  console.error('\n💥', err);
  process.exit(1);
});
