// The publish loop: two servers never publish the same post, a platform block pauses that platform (and only that
// one) without burning retries, a worker that died mid-publish never causes a second post, and a backlog goes out
// one post per platform per gap.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'Questera-Backend', 'index.js'));
Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_dummy', RAZORPAY_KEY_SECRET: 'dummy' });

const mongoose = require('mongoose');
let mongo, ScheduledPost, AccountPause, AutopilotTask, AutopilotTaskRun, Scheduler, TaskRunner;
const emails = [];
const emailService = {
  sendPostPublishedEmail: async () => {},
  sendPostFailedEmail: async (userId, post, msg) => emails.push(['failed', userId, msg]),
  sendAccountPausedEmail: async (userId, p) => emails.push(['paused', userId, p.platform, p.kind]),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A scheduler whose platforms are fakes: `behave(post)` decides what publishing does. */
function scheduler(calls, behave = async () => {}) {
  const s = new Scheduler();
  s.emailService = emailService;
  s.publishPost = async (post) => {
    calls.push(post.postId);
    await behave(post);
    post.status = 'published';
    post.publishedAt = new Date();
    await post.save();
    return { success: true };
  };
  return s;
}
const due = (postId, userId, platform = 'instagram', extra = {}) =>
  ScheduledPost.create({ postId, userId, platform, imageUrl: 'https://x/y.png', scheduledAt: new Date(Date.now() - 60e3), status: 'scheduled', ...extra });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ScheduledPost = require('./models/scheduledPost');
  AccountPause = require('./models/accountPause');
  AutopilotTask = require('./models/autopilotTask');
  AutopilotTaskRun = require('./models/autopilotTaskRun');
  Scheduler = require('./functions/Scheduler');
  TaskRunner = require('./functions/TaskRunner');
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await ScheduledPost.deleteMany({});
  await AccountPause.deleteMany({});
  emails.length = 0;
});

test('two servers ticking at once publish each post exactly once', async () => {
  for (let i = 0; i < 8; i++) await due(`p${i}`, `u${i}`);
  const calls = [];
  const slow = async () => sleep(30);
  await Promise.all([scheduler(calls, slow).processDuePosts(), scheduler(calls, slow).processDuePosts(), scheduler(calls, slow).processDuePosts()]);
  assert.equal(calls.length, 8);
  assert.equal(new Set(calls).size, 8);
  assert.equal(await ScheduledPost.countDocuments({ status: 'published' }), 8);
});

test('a platform block pauses that platform, keeps the post, and leaves other platforms alone', async () => {
  await due('ig1', 'u1', 'instagram');
  await due('ig2', 'u1', 'instagram', { scheduledAt: new Date(Date.now() - 30e3) });
  await due('li1', 'u1', 'linkedin');
  const calls = [];
  const s = scheduler(calls, async (post) => {
    if (post.platform === 'instagram') throw new Error('Application request limit reached');
  });
  await s.processDuePosts();

  const ig1 = await ScheduledPost.findOne({ postId: 'ig1' });
  assert.equal(ig1.status, 'scheduled');
  assert.equal(ig1.retryCount, 0, 'a block does not use up a retry');
  assert.equal((await ScheduledPost.findOne({ postId: 'li1' })).status, 'published');
  const pause = await AccountPause.findOne({ userId: 'u1', platform: 'instagram' });
  assert.equal(pause.kind, 'blocked');
  assert.ok(pause.until > new Date(Date.now() + 23 * 3600e3));
  assert.deepEqual(emails, [['paused', 'u1', 'instagram', 'blocked']]);

  // Next tick: nothing is tried on Instagram while the pause lasts.
  calls.length = 0;
  await s.processDuePosts();
  assert.deepEqual(calls, []);

  // The pause ends: the posts go out again, one per gap.
  await AccountPause.updateOne({ userId: 'u1' }, { $set: { until: new Date(Date.now() - 1000) } });
  await scheduler(calls).processDuePosts();
  assert.deepEqual(calls, ['ig1']);
});

test('a lost login pauses until the user reconnects', async () => {
  await due('x1', 'u2', 'twitter');
  await scheduler([], async () => {
    throw new Error('revoked_access_token: reconnect the account');
  }).processDuePosts();
  assert.equal((await AccountPause.findOne({ userId: 'u2' })).kind, 'reconnect');

  const { resume } = require('./functions/AccountHealth');
  await resume('u2', 'twitter');
  assert.equal(await AccountPause.countDocuments({ userId: 'u2' }), 0);
});

test('reconnecting does not lift a platform block', async () => {
  const { pause, resume } = require('./functions/AccountHealth');
  await pause({ userId: 'u3', platform: 'instagram', kind: 'blocked', reason: 'spam', hours: 24 });
  await resume('u3', 'instagram');
  assert.equal(await AccountPause.countDocuments({ userId: 'u3' }), 1);
  await resume('u3', 'instagram', { any: true });
  assert.equal(await AccountPause.countDocuments({ userId: 'u3' }), 0);
});

test('a pause never shortens a longer one', async () => {
  const { pause } = require('./functions/AccountHealth');
  await pause({ userId: 'u4', platform: 'linkedin', kind: 'reconnect', reason: 'login', hours: 720 });
  const { isNew } = await pause({ userId: 'u4', platform: 'linkedin', kind: 'blocked', reason: 'limit', hours: 24 });
  assert.equal(isNew, false);
  assert.equal((await AccountPause.findOne({ userId: 'u4' })).kind, 'reconnect');
});

test('ordinary errors retry, then fail with one email', async () => {
  await due('r1', 'u5');
  const s = scheduler([], async () => {
    throw new Error('Media download failed');
  });
  for (let i = 0; i < 3; i++) {
    await s.processDuePosts();
    await ScheduledPost.updateOne({ postId: 'r1' }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
  }
  const post = await ScheduledPost.findOne({ postId: 'r1' });
  assert.equal(post.status, 'failed');
  assert.equal(post.retryCount, 3);
  assert.equal(emails.filter((e) => e[0] === 'failed').length, 1);
  assert.equal(await AccountPause.countDocuments({}), 0);
});

test('a worker that died mid-publish leaves a failed post, never a second publish', async () => {
  await due('s1', 'u6', 'instagram', { status: 'publishing', claimedAt: new Date(Date.now() - 20 * 60e3) });
  const calls = [];
  await scheduler(calls).processDuePosts();
  assert.deepEqual(calls, []);
  const post = await ScheduledPost.findOne({ postId: 's1' });
  assert.equal(post.status, 'failed');
  assert.match(post.publishError, /may already be live/);
});

test('one post per platform per gap, even when several are due', async () => {
  await due('g1', 'u7', 'instagram', { scheduledAt: new Date(Date.now() - 120e3) });
  await due('g2', 'u7', 'instagram');
  const calls = [];
  await scheduler(calls).processDuePosts();
  await scheduler(calls).processDuePosts();
  assert.deepEqual(calls, ['g1']);
  assert.equal((await ScheduledPost.findOne({ postId: 'g2' })).status, 'scheduled');
});

test('autopilot tasks skip a paused platform without counting a failure', async () => {
  const { pause } = require('./functions/AccountHealth');
  await pause({ userId: 'u8', platform: 'instagram', kind: 'blocked', reason: 'spam', hours: 24 });
  await require('./models/autopilotMemory').create({ userId: 'u8' });
  const task = await AutopilotTask.create({ userId: 'u8', platform: 'instagram', name: 'Tips', nextRunAt: new Date(Date.now() - 1000) });
  const runner = new TaskRunner();
  runner.autopilot = { createFeedPost: async () => assert.fail('must not generate while paused') };
  await runner.claimAndRun(task.taskId);
  const after = await AutopilotTask.findOne({ taskId: task.taskId });
  assert.equal(after.consecutiveFailures, 0);
  assert.equal(after.lastRunResult, 'skipped');
  assert.ok(after.nextRunAt > new Date(), 'moves on to the next slot');
  assert.equal((await AutopilotTaskRun.findOne({ taskId: task.taskId })).status, 'skipped_paused');
});
