// Every Velos API route: no token → 401; another user's :userId → 403; another user's records → 404; admin tools →
// admins only. Routes are read from the router files, so a route added later is covered without editing this test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'Questera-Backend');
const require = createRequire(path.join(backend, 'index.js'));

Object.assign(process.env, {
  VELOS_NO_START: 'true',
  DISABLE_CRONS: 'true',
  JWT_SECRET: 'test-secret',
  ADMIN_EMAILS: 'admin@example.com',
  EMAIL_SERVICE_KEY: 'service-key',
  RAZORPAY_KEY_ID: 'rzp_test_dummy',
  RAZORPAY_KEY_SECRET: 'dummy',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'dummy',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'dummy',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'dummy',
});
delete process.env.STUDIO_ENABLED;

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
let mongo, server, base;
const A = { userId: 'u-alice', email: 'alice@example.com' };
const B = { userId: 'u-bob', email: 'bob@example.com' };
const ADMIN = { userId: 'u-admin', email: 'admin@example.com' };
const ids = {};

const token = (u) => jwt.sign({ id: new mongoose.Types.ObjectId(), ...u }, process.env.JWT_SECRET);
const call = async (method, url, { as, body, headers = {} } = {}) => {
  const res = await fetch(base + url, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${token(as)}` } : {}), ...headers },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  return res.status;
};

/** [method, path] for every route, from `app.use('/api/x', xRouter)` in index.js and `xRouter.get('/p', …)` in each file. */
function routes() {
  const index = fs.readFileSync(path.join(backend, 'index.js'), 'utf8');
  const files = Object.fromEntries(
    [...index.matchAll(/const (\w+) = require\('\.\/routes\/(\w+)'\)/g)].map((m) => [m[1], m[2]]),
  );
  const out = [];
  for (const [, mount, router] of index.matchAll(/app\.use\('(\/api\/[^']+)', (\w+)\)/g)) {
    const src = fs.readFileSync(path.join(backend, 'routes', `${files[router]}.js`), 'utf8');
    for (const [, method, p] of src.matchAll(/^\s*\w+\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gm)) {
      out.push([method.toUpperCase(), mount + (p === '/' ? '' : p)]);
    }
  }
  return out;
}

const fill = (p, userId) =>
  p.replace(/:(\w+)/g, (_, name) => (name === 'userId' ? userId : ids[name] ?? 'missing-id'));

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const app = require('./index.js');
  const ScheduledPost = require('./models/scheduledPost');
  const AutopilotTask = require('./models/autopilotTask');
  const Autopilot = require('./models/autopilot');
  const Campaign = require('./models/campaign');
  const Image = require('./models/image');
  const ImageMessage = require('./models/imageMessage');
  const Video = require('./models/video');
  const VideoMessage = require('./models/videoMessage');
  const MediaJob = require('./models/mediaJob');
  const ContentJob = require('./models/contentJob');
  const GenerationJob = require('./models/generationJob');

  // One record of each kind, all Alice's, inserted raw so schema defaults and hooks do not matter.
  const put = async (Model, idField, extra = {}) => {
    const id = `${idField}-alice`;
    await Model.collection.insertOne({ [idField]: id, userId: A.userId, ...extra });
    ids[idField] = id;
  };
  await put(ScheduledPost, 'postId');
  await put(AutopilotTask, 'taskId');
  await put(Autopilot, 'autopilotId', { archived: false });
  await put(Campaign, 'campaignId');
  await put(Image, 'imageChatId');
  await put(Video, 'videoChatId');
  await put(MediaJob, 'jobId');
  await ContentJob.collection.insertOne({ jobId: 'jobId-alice', userId: A.userId });
  await GenerationJob.collection.insertOne({ jobId: 'jobId-alice', userId: A.userId });
  await ImageMessage.collection.insertOne({ messageId: 'messageId-alice', imageChatId: 'imageChatId-alice', userId: A.userId });
  await VideoMessage.collection.insertOne({ messageId: 'messageId-alice', videoChatId: 'videoChatId-alice', userId: A.userId });
  ids.messageId = 'messageId-alice';

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

const PUBLIC = [
  ['POST', '/api/auth/google'],
  ['POST', '/api/auth/send-otp'],
  ['POST', '/api/auth/verify-otp'],
  ['GET', '/api/credits/plans/all'],
  ['POST', '/api/credits/webhook/razorpay'],
  ['GET', '/api/email-campaign/track/open/:trackingId'],
  ['GET', '/api/email-campaign/track/click/:trackingId'],
  ['GET', '/api/email-campaign/unsubscribe'],
  ['POST', '/api/email/send'],
  ['POST', '/api/integrations/seovyn/:autopilotId'],
];
const isPublic = (m, p) => PUBLIC.some(([pm, pp]) => pm === m && pp === p);

test('the route list is complete enough to mean something', () => {
  assert.ok(routes().length > 180, `only ${routes().length} routes found`);
});

test('every non-public route needs a login', async () => {
  const open = [];
  for (const [m, p] of routes()) {
    if (isPublic(m, p)) continue;
    const status = await call(m, fill(p, A.userId), { body: {} });
    if (status !== 401) open.push(`${m} ${p} → ${status}`);
  }
  assert.deepEqual(open, []);
});

test("another user's :userId is refused", async () => {
  const leaks = [];
  for (const [m, p] of routes()) {
    if (!p.includes(':userId') || isPublic(m, p)) continue;
    const status = await call(m, fill(p, A.userId), { as: B, body: {} });
    if (status !== 403 && status !== 404) leaks.push(`${m} ${p} → ${status}`);
  }
  assert.deepEqual(leaks, []);
});

test("another user's records are not found", async () => {
  const leaks = [];
  const owned = /:(postId|taskId|autopilotId|campaignId|imageChatId|videoChatId|jobId|messageId)\b/;
  for (const [m, p] of routes()) {
    if (!owned.test(p) || p.includes(':userId') || isPublic(m, p) || /draft-template|email-campaign/.test(p)) continue;
    const status = await call(m, fill(p, B.userId), { as: B, body: {} });
    if (status !== 404) leaks.push(`${m} ${p} → ${status}`);
  }
  assert.deepEqual(leaks, []);
});

test('a body naming someone else is refused, and the owner gets through', async () => {
  assert.equal(await call('POST', '/api/scheduler/posts', { as: B, body: { userId: A.userId } }), 403);
  assert.equal(await call('GET', `/api/scheduler/posts/${B.userId}?userId=${A.userId}`, { as: B }), 403);
  assert.equal(await call('POST', '/api/image/generate', { as: B, body: { imageChatId: 'imageChatId-alice' } }), 404);
  assert.equal(await call('POST', '/api/scheduler/posts', { as: B, body: { accountId: 'nope', autopilotId: 'autopilotId-alice' } }), 404);
  assert.equal(await call('GET', '/api/autopilot/tasks/taskId-alice/runs', { as: A }), 200);
  assert.equal(await call('GET', `/api/autopilot/autopilots/${A.userId}`, { as: A }), 200);
});

test('admin tools are for admins only', async () => {
  const admin = [
    ['GET', '/api/email-campaign/overview'],
    ['GET', '/api/draft-template'],
    ['DELETE', '/api/draft-template/admin/clear-all-templates'],
    ['POST', '/api/template/create'],
    ['DELETE', '/api/template/some-id'],
    ['POST', '/api/scheduler/process'],
    ['POST', '/api/live-generation/process'],
    ['GET', `/api/analytics/debug/${A.userId}`],
  ];
  for (const [m, p] of admin) assert.equal(await call(m, p, { as: A, body: {} }), 403, `${m} ${p}`);
  assert.notEqual(await call('GET', '/api/email-campaign/overview', { as: ADMIN }), 403);
});

test('the email endpoint needs the service key or an admin', async () => {
  const mail = { to: 'x@example.com', subject: 's', body: 'b' };
  assert.equal(await call('POST', '/api/email/send', { body: mail }), 401);
  assert.equal(await call('POST', '/api/email/send', { body: mail, as: A }), 403);
  assert.equal(await call('POST', '/api/email/send', { body: {}, headers: { 'X-Service-Key': 'service-key' } }), 400);
});

test('public routes stay public, and click tracking only redirects to our site', async () => {
  assert.notEqual(await call('GET', '/api/credits/plans/all'), 401);
  const res = await fetch(`${base}/api/email-campaign/track/click/eA?url=${encodeURIComponent('https://evil.example/x')}`, { redirect: 'manual' });
  assert.equal(res.headers.get('location'), 'https://www.velosapps.com');
  const ok = await fetch(`${base}/api/email-campaign/track/click/eA?url=${encodeURIComponent('https://www.velosapps.com/pricing')}`, { redirect: 'manual' });
  assert.equal(ok.headers.get('location'), 'https://www.velosapps.com/pricing');
});

test("Seovyn's webhook: only a delivery signed with the autopilot's secret gets in", async () => {
  const crypto = await import('node:crypto');
  const AutopilotMemory = require('./models/autopilotMemory');
  await AutopilotMemory.collection.insertOne({ userId: A.userId, autopilotId: 'autopilotId-alice', website: { url: 'https://alice.example' }, whatsNew: [] });
  const token = jwt.sign({ id: new mongoose.Types.ObjectId(), ...A }, process.env.JWT_SECRET);
  const conn = await fetch(`${base}/api/autopilot/integrations/seovyn/${A.userId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ autopilotId: 'autopilotId-alice' }),
  }).then((r) => r.json());
  assert.match(conn.url, /\/integrations\/seovyn\/autopilotId-alice$/);

  const body = JSON.stringify({ event: 'article.approved', data: { itemId: 'i1', title: 'How to rank in ChatGPT', slug: 'rank-chatgpt', pageType: 'blog', summary: 'S' } });
  const post = (sig) => fetch(`${base}/api/integrations/seovyn/autopilotId-alice`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-contentautopilot-signature': sig }, body });
  assert.equal((await post('0'.repeat(64))).status, 401);
  assert.equal((await post(crypto.createHmac('sha256', conn.secret).update(body).digest('hex'))).status, 200);
  const memory = await AutopilotMemory.findOne({ autopilotId: 'autopilotId-alice' });
  assert.equal(memory.whatsNew[0].url, 'https://alice.example/blog/rank-chatgpt');
  assert.equal(memory.whatsNew[0].source, 'seovyn');
});
