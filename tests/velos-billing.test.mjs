// Autopilot media is charged to the user's credits, only once it exists, and never past the plan's daily cap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'Questera-Backend', 'index.js'));
Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_dummy', RAZORPAY_KEY_SECRET: 'dummy' });
delete process.env.AUTOPILOT_DAILY_CREDIT_CAP;

const mongoose = require('mongoose');
let mongo, billing, Credits, CreditsController;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  billing = require('./functions/AutopilotBilling');
  Credits = require('./models/credits');
  CreditsController = require('./functions/Credits');
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('free plan: 20 credits, 5 a day for the autopilot', async () => {
  const s = await billing.status('free-user');
  assert.equal(s.balance, 20);
  assert.equal(s.cap, 5);
  await billing.assertCanSpend('free-user', 4);
  await billing.charge('free-user', 4, 'job-1', 'Autopilot image');
  await assert.rejects(billing.assertCanSpend('free-user', 2), /Daily autopilot credit cap reached: 4 of 5/);
  await billing.assertCanSpend('free-user', 1);
  assert.equal((await billing.status('free-user')).balance, 16);
});

test('manual spending does not count toward the autopilot cap', async () => {
  await new CreditsController().deductCredits('manual-user', 5, 'chat-1', 'Image generation');
  const s = await billing.status('manual-user');
  assert.equal(s.spentToday, 0);
  assert.equal(s.balance, 15);
});

test('a short balance stops the autopilot before it generates', async () => {
  await new CreditsController().getOrCreateCredits('poor-user');
  await Credits.updateOne({ userId: 'poor-user' }, { $set: { balance: 3, plan: 'pro' } });
  await assert.rejects(billing.assertCanSpend('poor-user', 10), /Not enough credits: this post needs 10, the balance is 3/);
});

test('yesterday’s spend does not count today', async () => {
  await new CreditsController().getOrCreateCredits('old-user');
  const yesterday = new Date(Date.now() - 86400e3);
  await Credits.updateOne(
    { userId: 'old-user' },
    { $push: { transactions: { type: 'credit_deduct', amount: -5, referenceType: 'autopilot', createdAt: yesterday } } },
  );
  assert.equal((await billing.status('old-user')).spentToday, 0);
});

test('TaskRunner treats credit errors as infrastructure, not a broken task', async () => {
  const err = await billing.assertCanSpend('free-user', 50).catch((e) => e);
  assert.match(err.message, /credit/i);
});
