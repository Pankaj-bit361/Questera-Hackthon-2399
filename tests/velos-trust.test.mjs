// Phase 2: the trust ladder, the rule check, the supervisor, one daily cap per platform, and one engine for the
// daily plan and the recurring tasks.
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
let mongo, M, TrustLadder, PostRules, Supervisor, TaskRunner, AutopilotService, SocialGrowthAgent;
const AP = 'ap-1';
let n = 0;

const config = (extra = {}) =>
  M.AutopilotConfig.create({ userId: 'u1', autopilotId: AP, platform: 'instagram', enabled: true, ...extra });
const post = (extra = {}) =>
  M.ScheduledPost.create({
    postId: `p${++n}`,
    userId: 'u1',
    autopilotId: AP,
    platform: 'instagram',
    imageUrl: 'https://x/y.png',
    caption: `Post number ${n}`,
    scheduledAt: new Date(Date.now() + 3600e3),
    status: 'pending_approval',
    source: 'autopilot',
    review: { score: 82 },
    ...extra,
  });
const fresh = () => M.AutopilotConfig.findOne({ autopilotId: AP, platform: 'instagram' });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  M = {
    AutopilotConfig: require('./models/autopilotConfig'),
    AutopilotMemory: require('./models/autopilotMemory'),
    AutopilotEvent: require('./models/autopilotEvent'),
    AutopilotTask: require('./models/autopilotTask'),
    ScheduledPost: require('./models/scheduledPost'),
    Credits: require('./models/credits'),
  };
  TrustLadder = require('./functions/TrustLadder');
  PostRules = require('./functions/PostRules');
  Supervisor = require('./functions/Supervisor');
  TaskRunner = require('./functions/TaskRunner');
  AutopilotService = require('./functions/AutopilotService');
  SocialGrowthAgent = require('./functions/SocialGrowthAgent');
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  for (const Model of Object.values(M)) await Model.deleteMany({});
});

test('a config from before the ladder: clean record keeps autopilot, anything else starts supervised', async () => {
  const c = await config();
  for (let i = 0; i < 5; i++) await post({ status: 'published', createdAt: new Date() });
  assert.equal(await TrustLadder.ensure(c), 'autopilot');

  await M.AutopilotConfig.deleteMany({});
  await M.ScheduledPost.deleteMany({});
  const c2 = await config();
  for (let i = 0; i < 5; i++) await post({ status: 'published' });
  await post({ status: 'cancelled' });
  assert.equal(await TrustLadder.ensure(c2), 'supervised');
});

test('supervised: every post waits; five clean approvals earn autopilot', async () => {
  const c = await config({ 'trust.mode': 'supervised' });
  const d = await TrustLadder.decide(c, { score: 95 });
  assert.equal(d.status, 'pending_approval');
  assert.equal(d.autoApproveAt, null);

  const waitingGood = await post({ review: { score: 90 } });
  for (let i = 0; i < 5; i++) {
    const p = await post();
    await TrustLadder.approve(p.postId, { by: 'user' });
  }
  const after = await fresh();
  assert.equal(after.trust.mode, 'autopilot');
  assert.ok(await M.AutopilotEvent.findOne({ action: 'promoted' }));
  // A post already waiting that would have qualified starts its hold.
  assert.ok((await M.ScheduledPost.findOne({ postId: waitingGood.postId })).autoApproveAt);
});

test('a low-scoring approval does not count toward promotion', async () => {
  await config({ 'trust.mode': 'supervised' });
  for (let i = 0; i < 5; i++) {
    const p = await post({ review: { score: i === 2 ? 60 : 90 } });
    await TrustLadder.approve(p.postId, { by: 'user' });
  }
  assert.equal((await fresh()).trust.mode, 'supervised');
});

test('on autopilot: good posts get a 12h hold, anything doubtful waits for the user', async () => {
  const c = await config({ 'trust.mode': 'autopilot' });
  const ok = await TrustLadder.decide(c, { score: 80 });
  assert.equal(ok.status, 'pending_approval');
  const hours = (ok.autoApproveAt - Date.now()) / 3600e3;
  assert.ok(hours > 11.9 && hours <= 12, `hold of ${hours}h`);
  assert.equal((await TrustLadder.decide(c, { score: 70 })).autoApproveAt, null);
  assert.equal((await TrustLadder.decide(c, { score: 95, ruleFailed: true, ruleIssues: ['x'] })).autoApproveAt, null);
  assert.equal((await TrustLadder.decide(c, null)).autoApproveAt, null);
  c.permissions.requireApproval = true;
  assert.equal((await TrustLadder.decide(c, { score: 99 })).autoApproveAt, null);
});

test('when the hold runs out the post is approved by the autopilot, which does not count as a user approval', async () => {
  await config({ 'trust.mode': 'autopilot', 'trust.approvalStreak': 0 });
  const p = await post({ autoApproveAt: new Date(Date.now() - 1000) });
  assert.equal(await TrustLadder.approveHeldPosts(), 1);
  const done = await M.ScheduledPost.findOne({ postId: p.postId });
  assert.equal(done.status, 'scheduled');
  assert.equal(done.approvedBy, 'autopilot');
  assert.equal((await fresh()).trust.approvalStreak, 0);
});

test('one rejection on autopilot: back to supervised, holds stop, and the reason reaches the planner', async () => {
  await config({ 'trust.mode': 'autopilot', 'trust.approvalStreak': 7 });
  await M.AutopilotMemory.create({ userId: 'u1', autopilotId: AP });
  const held = await post({ autoApproveAt: new Date(Date.now() + 3600e3) });
  const bad = await post({ caption: 'We are the best tool in the world' });
  await TrustLadder.reject(bad.postId, { reason: 'inaccurate', note: 'We never said that' });

  const c = await fresh();
  assert.equal(c.trust.mode, 'supervised');
  assert.equal(c.trust.approvalStreak, 0);
  assert.equal((await M.ScheduledPost.findOne({ postId: held.postId })).autoApproveAt, null);
  const r = await M.ScheduledPost.findOne({ postId: bad.postId });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.rejectReason, 'inaccurate');
  const memory = await M.AutopilotMemory.findOne({ autopilotId: AP });
  assert.equal(memory.rejections[0].note, 'We never said that');
  const prompt = new SocialGrowthAgent().rejectionsBlock(memory);
  assert.match(prompt, /inaccurate: "We never said that"/);
  assert.ok(await M.AutopilotEvent.findOne({ action: 'demoted' }));
});

test('the rule check catches what it should, and passes a clean post', () => {
  const clean = PostRules.check({ platform: 'linkedin', post: { postType: 'text', caption: 'Our scheduler now shows the best time to post for each channel. https://x.co/a', hashtags: '#marketing', linkUrl: 'https://x.co/a' } });
  assert.deepEqual(clean, { failed: false, issues: [] });

  const hype = PostRules.check({ platform: 'instagram', post: { caption: 'Dominate the feed with our game-changer', hashtags: Array.from({ length: 12 }, (_, i) => `#t${i}`).join(' ') } });
  assert.ok(hype.issues.some((i) => /dominate/i.test(i)));
  assert.ok(hype.issues.some((i) => /game-changer/i.test(i)));
  assert.ok(hype.issues.some((i) => /12 hashtags/.test(i)));

  assert.ok(PostRules.check({ platform: 'twitter', post: { caption: 'x'.repeat(300) } }).issues.some((i) => /over twitter's 280/.test(i)));
  assert.ok(PostRules.check({ platform: 'linkedin', post: { caption: 'Read more below', linkUrl: 'https://x.co/a' } }).issues.some((i) => /link is missing/.test(i)));
  assert.ok(PostRules.check({ platform: 'linkedin', post: { caption: 'Hello [Company] friends' } }).issues.some((i) => /placeholder/.test(i)));

  const prev = 'Our new calendar view shows every scheduled post across Instagram LinkedIn and X in one place so nothing collides';
  const dup = PostRules.check({ platform: 'linkedin', post: { caption: `${prev}.` }, recentCaptions: [prev] });
  assert.ok(dup.issues.some((i) => /Repeats a recent post/.test(i)));
});

test('the supervisor pauses on repeated publish failures, once', async () => {
  const c = await config({ 'trust.mode': 'supervised' });
  for (let i = 0; i < 3; i++) await post({ status: 'failed' });
  assert.equal(await Supervisor.check(c), 'paused_failures');
  assert.ok((await fresh()).pausedUntil > new Date());
  assert.equal(await Supervisor.check(await fresh()), null);
  assert.equal(await M.AutopilotEvent.countDocuments({ action: 'paused' }), 1);
});

test('the supervisor sends a trusted autopilot back to supervised when scores fall', async () => {
  const c = await config({ 'trust.mode': 'autopilot' });
  for (let i = 0; i < 6; i++) await post({ status: 'published', review: { score: 50 } });
  assert.equal(await Supervisor.check(c), 'demoted_scores');
  assert.equal((await fresh()).trust.mode, 'supervised');
});

test('the supervisor pauses on a spend spike', async () => {
  const c = await config({ 'trust.mode': 'supervised' });
  const day = 86400e3;
  const tx = (daysAgo, amount) => ({ type: 'credit_deduct', amount: -amount, referenceType: 'autopilot', createdAt: new Date(Date.now() - daysAgo * day) });
  await M.Credits.collection.insertOne({ userId: 'u1', balance: 100, transactions: [tx(1, 2), tx(2, 2), tx(3, 2), tx(0, 12)] });
  assert.equal(await Supervisor.check(c), 'paused_spend');
});

test('one daily cap per platform across every task, and nothing more while the queue is full', async () => {
  const c = await config({ 'limits.maxFeedPostsPerDay': 2 });
  const svc = new AutopilotService();
  await post({ status: 'scheduled' });
  await svc.assertPlatformBudget(c);
  await post({ status: 'published' });
  await assert.rejects(svc.assertPlatformBudget(c), (e) => e.skip === 'skipped_budget' && /limit 2/.test(e.message));

  await M.ScheduledPost.deleteMany({});
  for (let i = 0; i < 10; i++) await post({ createdAt: new Date(Date.now() - 3 * 86400e3) });
  await assert.rejects(svc.assertPlatformBudget(c), /10 posts are waiting/);
});

test('the daily plan is a task on the same engine, in step with its config', async () => {
  const c = await config({ dailyRunTime: '07:30', 'trust.mode': 'supervised' });
  const task = await TaskRunner.syncDailyPlan(c);
  assert.equal(task.kind, 'daily_plan');
  assert.deepEqual([...task.schedule.times], ['07:30']);
  assert.ok(task.enabled && task.nextRunAt > new Date());

  c.enabled = false;
  await c.save();
  assert.equal((await TaskRunner.syncDailyPlan(c)).enabled, false);
  assert.equal(await M.AutopilotTask.countDocuments({ kind: 'daily_plan' }), 1, 'one per config, never duplicated');

  // Run it: the engine hands it to the planner and records what came out.
  c.enabled = true;
  await c.save();
  const t = await TaskRunner.syncDailyPlan(c);
  await M.AutopilotTask.updateOne({ _id: t._id }, { $set: { nextRunAt: new Date(Date.now() - 1000) } });
  const runner = new TaskRunner();
  runner.autopilot = { runForChat: async () => ({ plan: {}, execution: { feedPosts: [{ postId: 'p-x', status: 'pending_approval', review: { score: 81 } }] } }) };
  await runner.claimAndRun(t.taskId);
  const done = await M.AutopilotTask.findOne({ _id: t._id });
  assert.equal(done.lastRunResult, 'success');
  assert.match(done.lastRunSummary, /1 post \(waiting for approval\)/);
});

test('a failed plan posts nothing generic', async () => {
  const agent = new SocialGrowthAgent();
  agent.llm = { chatJSON: async () => { throw new Error('model down'); } };
  const plan = await agent.decideDailyPlan({}, { brand: {}, contentHistory: [] }, { platform: 'linkedin', limits: {} });
  assert.equal(plan.failed, true);
  assert.deepEqual(plan.feedPosts, []);
});
