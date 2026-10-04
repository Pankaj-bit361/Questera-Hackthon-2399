// The proposed plans: nothing changes until VELOS_PLANS=v2; then each plan's limits hold, and a Free account earns
// autopilot but stays supervised until it upgrades.
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
let mongo, Plans, Credits, ScheduledPost, AutopilotConfig, AutopilotEvent, TrustLadder;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Plans = require('./functions/Plans');
  Credits = require('./models/credits');
  ScheduledPost = require('./models/scheduledPost');
  AutopilotConfig = require('./models/autopilotConfig');
  AutopilotEvent = require('./models/autopilotEvent');
  TrustLadder = require('./functions/TrustLadder');
});
after(async () => {
  delete process.env.VELOS_PLANS;
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  delete process.env.VELOS_PLANS;
  for (const M of [Credits, ScheduledPost, AutopilotConfig, AutopilotEvent]) await M.deleteMany({});
});

test('off by default: no limits at all', async () => {
  assert.equal(await Plans.allowsAutopilot('u1'), true);
  await Plans.assertBrands('u1', 50);
  await Plans.assertPlatforms('u1', 3);
  assert.equal(await Plans.postsPerDay('u1'), Infinity);
});

test('v2: Free is one brand, one platform, a post a day, a video a month, supervised', async () => {
  process.env.VELOS_PLANS = 'v2';
  assert.equal(await Plans.allowsAutopilot('u1'), false);
  await assert.rejects(Plans.assertBrands('u1', 1), /Free plan includes 1 brand/);
  await assert.rejects(Plans.assertPlatforms('u1', 1), /1 platform/);
  assert.equal(await Plans.postsPerDay('u1'), 1);
  await Plans.assertVideo('u1');
  await ScheduledPost.create({ postId: 'v1', userId: 'u1', platform: 'instagram', postType: 'reel', videoUrl: 'x', scheduledAt: new Date(), source: 'autopilot' });
  await assert.rejects(Plans.assertVideo('u1'), /1 product video is used/);
});

test('v2: Pro allows three platforms, two posts a day and autopilot', async () => {
  process.env.VELOS_PLANS = 'v2';
  await Credits.collection.insertOne({ userId: 'u2', plan: 'pro', subscriptionStatus: 'active', balance: 0, transactions: [] });
  assert.equal(await Plans.allowsAutopilot('u2'), true);
  await Plans.assertPlatforms('u2', 2);
  await assert.rejects(Plans.assertPlatforms('u2', 3), /Pro plan includes 3 platforms/);
  assert.equal(await Plans.postsPerDay('u2'), 2);
});

test('v2: a Free account that earns autopilot is told so, and stays supervised', async () => {
  process.env.VELOS_PLANS = 'v2';
  await AutopilotConfig.create({ userId: 'u3', autopilotId: 'ap3', platform: 'linkedin', enabled: true, 'trust.mode': 'supervised' });
  for (let i = 0; i < 5; i++) {
    await ScheduledPost.create({ postId: `p${i}`, userId: 'u3', autopilotId: 'ap3', platform: 'linkedin', postType: 'text', caption: 'c', scheduledAt: new Date(Date.now() + 3600e3), status: 'pending_approval', source: 'autopilot', review: { score: 90 } });
    await TrustLadder.approve(`p${i}`, { by: 'user' });
  }
  assert.equal((await AutopilotConfig.findOne({ autopilotId: 'ap3' })).trust.mode, 'supervised');
  assert.match((await AutopilotEvent.findOne({ action: 'held' })).reason, /switches on with a paid plan/);
});
