// Phase 4: engagement comes back from the platforms, becomes per-platform stats the planners read, the weekly
// report says what changes, and comments get reply drafts the user approves.
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
let mongo, M;
const AP = 'ap-learn';
let n = 0;
const published = (extra = {}) =>
  M.ScheduledPost.create({
    postId: `lp${++n}`, userId: 'u1', autopilotId: AP, platform: 'instagram', postType: 'image', imageUrl: 'x', caption: `Post ${n}`,
    scheduledAt: new Date(), status: 'published', source: 'autopilot', publishedAt: new Date(Date.now() - 86400e3), publishedMediaId: `m${n}`, ...extra,
  });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  M = {
    ScheduledPost: require('./models/scheduledPost'),
    AutopilotMemory: require('./models/autopilotMemory'),
    AutopilotConfig: require('./models/autopilotConfig'),
    Autopilot: require('./models/autopilot'),
    Instagram: require('./models/instagram'),
    CommentReply: require('./models/commentReply'),
  };
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  for (const Model of Object.values(M)) await Model.deleteMany({});
  await M.Instagram.collection.insertOne({ userId: 'u1', accounts: [{ instagramBusinessAccountId: 'ig1', accessToken: 'tok', instagramUsername: 'acme', isConnected: true }] });
});

test('Instagram engagement comes back onto each post (likes, comments, reach, saves)', async () => {
  const p = await published({ accountId: 'ig1' });
  const EngagementSync = require('./functions/EngagementSync');
  const fetchJson = async (url) => {
    if (url.includes('/insights?metric=reach')) return { data: [{ values: [{ value: 400 }] }] };
    if (url.includes('/insights?metric=saved')) return { data: [{ values: [{ value: 12 }] }] };
    if (url.includes('/insights')) return { error: { message: 'metric not supported for this media' } };
    return { like_count: 30, comments_count: 4 };
  };
  const r = await new EngagementSync({}).syncInstagram('u1', { fetchJson });
  assert.equal(r.updated, 1);
  const e = (await M.ScheduledPost.findOne({ postId: p.postId })).engagement;
  assert.deepEqual([e.likes, e.comments, e.reach, e.saves], [30, 4, 400, 12]);
});

test('stats: each theme, format and time against the account average, and the planner is told to explore', async () => {
  await M.AutopilotMemory.create({ userId: 'u1', autopilotId: AP });
  const eng = (likes) => ({ likes, comments: 0, shares: 0, saves: 0, reach: 1000, lastUpdated: new Date() });
  for (let i = 0; i < 3; i++) await published({ theme: 'product', engagement: eng(60) });
  for (let i = 0; i < 3; i++) await published({ theme: 'tips', engagement: eng(20) });
  const Performance = require('./functions/Performance');
  await Performance.refreshForUser('u1');
  const memory = await M.AutopilotMemory.findOne({ autopilotId: AP });
  const s = memory.stats.instagram;
  assert.equal(s.posts, 6);
  assert.deepEqual(s.byTheme.map((g) => [g.key, g.lift]), [['product', 1.5], ['tips', 0.5]]);
  const words = Performance.describe(memory.stats, 'instagram');
  assert.match(words, /product 1.5x \(3 posts\)/);
  assert.match(words, /at least one post in five must try/);
  assert.match(Performance.describe({}, 'linkedin'), /Not enough results/);
});

test('the weekly report counts the week and says what changes next week', async () => {
  await M.Autopilot.create({ autopilotId: AP, userId: 'u1', name: 'Acme' });
  await M.AutopilotConfig.create({ userId: 'u1', autopilotId: AP, platform: 'instagram', enabled: true, 'trust.mode': 'supervised', 'trust.approvalStreak': 3 });
  await M.AutopilotMemory.create({
    userId: 'u1', autopilotId: AP,
    stats: { instagram: { posts: 6, byTheme: [{ key: 'product', lift: 1.5, posts: 3 }, { key: 'tips', lift: 0.5, posts: 3 }], byFormat: [], byTime: [] } },
  });
  await published({ engagement: { likes: 50, comments: 3, lastUpdated: new Date() } });
  await published({ status: 'cancelled', rejectedAt: new Date(), rejectReason: 'generic', publishedAt: null });
  const WeeklyReport = require('./functions/WeeklyReport');
  const r = await WeeklyReport.build(AP);
  assert.deepEqual([r.platforms[0].published, r.platforms[0].rejected], [1, 1]);
  assert.equal(r.platforms[0].best.interactions, 53);
  const next = r.nextWeek.join(' | ');
  assert.match(next, /More "product" posts on Instagram: they got 1.5x/);
  assert.match(next, /Fewer "tips" posts/);
  assert.match(next, /2 more clean approvals and Instagram goes on autopilot/);
  assert.match(next, /"too generic" 1 time/);
  assert.match(WeeklyReport.html(r), /Your week on Acme/);
});

test('the report goes out Monday morning in the autopilot timezone, once', async () => {
  await M.Autopilot.create({ autopilotId: AP, userId: 'u1', name: 'Acme', timezone: 'Asia/Kolkata' });
  await M.AutopilotConfig.create({ userId: 'u1', autopilotId: AP, platform: 'instagram', enabled: true });
  await require('./models/user').deleteMany({});
  await require('./models/user').create({ userId: 'u1', email: 'a@example.com', authProvider: 'email' });
  const EmailService = require('./functions/EmailService');
  const sent = [];
  EmailService.prototype.sendEmail = async (to, subject) => sent.push([to, subject]);
  const WeeklyReport = require('./functions/WeeklyReport');
  const mondayIst = new Date('2026-10-05T04:00:00Z'); // 09:30 in India
  const sundayIst = new Date('2026-10-04T04:00:00Z');
  assert.equal(await WeeklyReport.sendDue(sundayIst), 0);
  assert.equal(await WeeklyReport.sendDue(mondayIst), 1);
  assert.equal(await WeeklyReport.sendDue(new Date(mondayIst.getTime() + 3600e3)), 0, 'not twice');
  assert.deepEqual(sent, [['a@example.com', 'Your week on Acme']]);
});

test('comment replies: drafted once, spam and our own comments skipped, sent only when approved', async () => {
  await M.AutopilotMemory.create({ userId: 'u1', autopilotId: AP, brand: { companyName: 'Acme' }, facts: [{ text: 'Acme posts to Instagram, LinkedIn and X.' }] });
  const post = await published({ accountId: 'ig1' });
  const comments = { data: [
    { id: 'c1', text: 'Does it post to LinkedIn?', username: 'sam' },
    { id: 'c2', text: 'follow me for free followers', username: 'bot99' },
    { id: 'c3', text: 'Thanks all!', username: 'acme' },
    { id: 'c4', text: 'Love it', username: 'jo', replies: { data: [{ username: 'acme' }] } },
  ] };
  const llm = { chatJSON: async (msgs) => (/free followers/.test(msgs[1].content) ? { kind: 'spam', reply: '' } : { kind: 'question', reply: 'Yes - Acme posts to Instagram, LinkedIn and X.', note: '' }) };
  const ReplyDrafts = require('./functions/ReplyDrafts');
  const fetchJson = async () => comments;
  assert.equal(await ReplyDrafts.collectInstagram('u1', { llm, fetchJson }), 1);
  assert.equal(await ReplyDrafts.collectInstagram('u1', { llm, fetchJson }), 0, 'never drafted twice');
  const drafts = await M.CommentReply.find({ status: 'draft' });
  assert.deepEqual(drafts.map((d) => d.commentId), ['c1']);
  assert.equal(await M.CommentReply.countDocuments({ commentId: 'c2', status: 'dismissed' }), 1);

  const calls = [];
  await assert.rejects(ReplyDrafts.send('u1', drafts[0].replyId, 'Yes!', { fetchJson: async () => ({ error: { message: 'Token expired' } }) }), /Token expired/);
  assert.equal((await M.CommentReply.findOne({ commentId: 'c1' })).status, 'draft', 'a failed send can be tried again');
  await ReplyDrafts.send('u1', drafts[0].replyId, 'Yes, it does.', { fetchJson: async (url, init) => (calls.push([url, JSON.parse(init.body).message]), { id: 'r1' }) });
  assert.deepEqual(calls, [['https://graph.facebook.com/v22.0/c1/replies', 'Yes, it does.']]);
  assert.equal((await M.CommentReply.findOne({ commentId: 'c1' })).status, 'sent');
  assert.ok(post);
});
