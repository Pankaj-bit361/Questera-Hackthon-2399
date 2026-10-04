/**
 * LinkedIn publishing test harness.
 *
 * Walks the publish ladder from cheapest to most involved, against a real
 * connected account. Each rung exercises a different part of the pipeline:
 *
 *   text        -> POST /rest/posts and the x-restli-id header
 *   image       -> Images API initializeUpload + byte PUT
 *   multi-image -> repeated upload + the MultiImage content shape
 *   video       -> Videos API multi-part upload, ETag ordering, finalize, poll
 *
 * Usage:
 *   node test-linkedin-publish.js status
 *   node test-linkedin-publish.js text
 *   node test-linkedin-publish.js image [imageUrl]
 *   node test-linkedin-publish.js multi [url1] [url2] [url3]
 *   node test-linkedin-publish.js video [videoUrl]
 *   node test-linkedin-publish.js scheduler   (inserts a due ScheduledPost)
 *
 * These publish to a REAL LinkedIn feed. There is no sandbox.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;

// Public test assets
const TEST_IMAGE = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200';
const TEST_IMAGES = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200',
];

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

async function main() {
  const mode = process.argv[2] || 'status';

  if (!MONGO_URL) {
    console.error('MONGO_URL is not set');
    process.exit(1);
  }

  for (const key of ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI']) {
    if (!process.env[key]) {
      console.error(`❌ ${key} is not set. See .env.example.`);
      process.exit(1);
    }
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URL);
  console.log('✅ Connected\n');

  const SocialAccount = require('./models/socialAccount');
  const LinkedInController = require('./functions/LinkedIn');
  const LinkedInPublisher = require('./functions/LinkedInPublisher');

  const linkedin = new LinkedInController();
  const publisher = new LinkedInPublisher(linkedin);

  const account = await SocialAccount.findOne({ platform: 'linkedin', isActive: true }).sort({ updatedAt: -1 });

  if (!account) {
    console.error('❌ No LinkedIn account connected.');
    console.error('   Connect one at Settings > Integrations first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const userId = account.userId;

  console.log('👤 Account');
  console.log(`   user:      ${userId}`);
  console.log(`   name:      ${account.platformUsername}`);
  console.log(`   authorUrn: ${account.authorUrn}`);
  console.log(`   authorAs:  ${account.authorType}`);
  console.log(`   scopes:    ${(account.scopes || []).join(' ') || '(none recorded)'}`);
  console.log(`   expires:   ${account.tokenExpiresAt?.toISOString() || 'unknown'}`);
  console.log(`   refresh:   ${account.refreshToken ? 'available' : 'NOT available - manual reconnect needed'}`);
  console.log(`   version:   ${linkedin.apiVersion}\n`);

  const report = (label, result) => {
    if (result.json.success) {
      console.log(`✅ ${label} published`);
      console.log(`   urn:  ${result.json.postUrn}`);
      console.log(`   link: ${result.json.permalink}\n`);
    } else {
      console.log(`❌ ${label} failed`);
      console.log(`   ${result.json.error}`);
      console.log(`   code: ${result.json.code} | retryable: ${!result.json.nonRetryable}\n`);
    }
  };

  try {
    switch (mode) {
      case 'status': {
        console.log('🔎 Verifying the token still works...');
        const fresh = await linkedin.ensureFreshToken(account);
        const res = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${fresh.accessToken}` },
        });
        const info = await res.json();
        console.log(res.ok ? `✅ Token valid for ${info.name}` : `❌ Token rejected: ${JSON.stringify(info)}`);
        break;
      }

      case 'text': {
        const result = await publisher.publishText({
          body: { userId, caption: `Velos LinkedIn pipeline test - text post (${stamp()}).` },
        });
        report('Text post', result);
        break;
      }

      case 'image': {
        const imageUrl = process.argv[3] || TEST_IMAGE;
        console.log(`🖼️  Using ${imageUrl}\n`);
        const result = await publisher.publishImage({
          body: {
            userId,
            imageUrl,
            caption: `Velos LinkedIn pipeline test - single image (${stamp()}).`,
            altText: 'Test image',
          },
        });
        report('Image post', result);
        break;
      }

      case 'multi': {
        const imageUrls = process.argv.slice(3).length ? process.argv.slice(3) : TEST_IMAGES;
        console.log(`🖼️  Using ${imageUrls.length} images\n`);
        const result = await publisher.publishMultiImage({
          body: {
            userId,
            imageUrls,
            caption: `Velos LinkedIn pipeline test - multi-image (${stamp()}).`,
          },
        });
        report('MultiImage post', result);
        break;
      }

      case 'video': {
        const videoUrl = process.argv[3];
        if (!videoUrl) {
          console.error('❌ Pass a video URL: node test-linkedin-publish.js video <mp4 url>');
          console.error('   Test both a <4MB clip (single part) and a >8MB one (multi-part ETag ordering).');
          break;
        }
        console.log(`🎬 Using ${videoUrl}`);
        console.log('   This uploads in 4MB parts and then waits for LinkedIn to transcode.\n');
        const result = await publisher.publishVideo({
          body: {
            userId,
            videoUrl,
            caption: `Velos LinkedIn pipeline test - video (${stamp()}).`,
            title: 'Pipeline test',
          },
        });
        report('Video post', result);
        break;
      }

      case 'scheduler': {
        // Exercises the path the cron actually takes, not the publisher directly.
        const ScheduledPost = require('./models/scheduledPost');
        const post = await ScheduledPost.create({
          userId,
          accountId: account.accountId,
          platform: 'linkedin',
          postType: 'text',
          caption: `Velos scheduler test - due now (${stamp()}).`,
          scheduledAt: new Date(Date.now() - 1000),
          status: 'scheduled',
          source: 'manual',
        });
        console.log(`📅 Created due post ${post.postId}`);
        console.log('   Running processDuePosts() the way the cron does...\n');

        const SchedulerController = require('./functions/Scheduler');
        const result = await new SchedulerController().processDuePosts();
        console.log(`   processed: ${result.processed}`);

        const after = await ScheduledPost.findOne({ postId: post.postId });
        console.log(`   status:    ${after.status}`);
        console.log(`   urn:       ${after.publishedMediaId || '-'}`);
        console.log(`   link:      ${after.platformPostUrl || '-'}`);
        console.log(`   error:     ${after.publishError || '-'}\n`);
        break;
      }

      default:
        console.error(`Unknown mode "${mode}". Use: status | text | image | multi | video | scheduler`);
    }
  } catch (error) {
    console.error('❌ Unhandled error:', error.message);
    console.error(error.stack);
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected');
}

main();
