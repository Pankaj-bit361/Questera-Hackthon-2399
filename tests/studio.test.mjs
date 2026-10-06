import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPalette, contrast } = require('../Questera-Backend/studio/color.cjs');
const { privateIp } = require('../Questera-Backend/studio/router.cjs');
const { timeline } = require('../studio/remotion/timing.cjs');
const { Scene } = require('../Questera-Backend/studio/planner.cjs');

test('palette: dark site keeps its colours and a readable accent label', () => {
  const p = buildPalette({ heroBg: 'rgb(11, 26, 3)', pageBg: 'rgb(255,255,255)', ink: 'rgb(255,255,255)', muted: 'rgb(166,185,154)', buttons: [{ bg: 'rgb(159, 232, 112)', color: 'rgb(22, 51, 0)', area: 9000 }], links: [] });
  assert.equal(p.theme, 'dark');
  assert.equal(p.bg, '#0b1a03');
  assert.equal(p.accent, '#9fe870');
  assert.ok(contrast(p.accentInk, p.accent) >= 3);
  assert.ok(contrast(p.glow, p.stage) >= 4.5);
});

test('palette: unreadable text and missing accents are corrected', () => {
  const p = buildPalette({ heroBg: 'rgb(255,255,255)', ink: 'rgb(240,240,240)', muted: 'rgb(250,250,250)', buttons: [], links: [] });
  assert.equal(p.theme, 'light');
  assert.ok(contrast(p.ink, p.bg) >= 4.5);
  assert.ok(contrast(p.muted, p.bg) >= 3);
  assert.ok(p.accent);
});

test('capture refuses private networks', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.4.4', '169.254.169.254', '::1', 'fd00::1']) assert.ok(privateIp(ip), ip);
  for (const ip of ['8.8.8.8', '104.21.3.4', '172.32.0.1']) assert.ok(!privateIp(ip), ip);
});

test('timeline: scenes land on the beat and the music drops after the title', () => {
  const t = timeline({ scenes: [{ type: 'hook', lines: ['a', 'b', 'c'] }, { type: 'title', headline: 'x' }, { type: 'focus', title: 'y', body: 'z' }, { type: 'end', cta: 'Go' }] });
  for (const item of t.items) assert.equal(item.from % 15, 0);
  assert.equal(t.drop, t.items[2].from);
  assert.equal(t.endFrom, t.items[3].from);
  assert.equal(t.total, t.items[3].from + 150);
});

test('scene schema keeps copy short', () => {
  assert.ok(Scene.safeParse({ type: 'end', cta: 'Start free' }).success);
  assert.ok(!Scene.safeParse({ type: 'end', cta: 'one two three four five' }).success);
  assert.ok(!Scene.safeParse({ type: 'checks', items: ['only one'] }).success);
});

const { seal, unseal, safeRel, DiskStore } = require('../Questera-Backend/studio/store.cjs');
const { publicAddress, startEgressProxy, safeFetch } = require('../Questera-Backend/studio/egress.cjs');
const { Mirror } = require('../Questera-Backend/studio/worker.cjs');
const { StudioJobs } = require('../Questera-Backend/studio/jobs.cjs');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const fsp = require('node:fs/promises');
const nodePath = require('node:path');

test('logins travel sealed: the blob alone reveals nothing, a wrong key fails', () => {
  const { key, sealed } = seal({ email: 'a@b.co', password: 'hunter2-secret' });
  assert.ok(!Buffer.from(sealed, 'base64').toString('latin1').includes('hunter2'));
  assert.deepEqual(unseal(sealed, key), { email: 'a@b.co', password: 'hunter2-secret' });
  assert.throws(() => unseal(sealed, seal({}).key));
});

test('job files: no escapes, never the job record or scripts', () => {
  assert.equal(safeRel('videos/a-v1.mp4'), 'videos/a-v1.mp4');
  for (const bad of ['../x', 'videos/../../x', 'job.json', 'plans.json', 'capture/../job.json', '', '/']) assert.throws(() => safeRel(bad), bad);
});

test('egress: names that resolve to private or metadata addresses are refused', async () => {
  const fake = (map) => async (name) => map[name] || [];
  const lookup = fake({ 'ok.example': [{ address: '93.184.216.34' }], 'rebind.example': [{ address: '169.254.170.2' }], 'mixed.example': [{ address: '93.184.216.34' }, { address: '10.0.0.5' }] });
  assert.equal(await publicAddress('ok.example', lookup), '93.184.216.34');
  for (const host of ['rebind.example', 'mixed.example', '127.0.0.1', '169.254.169.254', '[::1]', '::ffff:127.0.0.1', 'missing.example']) await assert.rejects(publicAddress(host, lookup), host);
});

test('egress proxy refuses CONNECT and plain requests to private hosts', async () => {
  const target = http.createServer((req, res) => res.end('secret')).listen(0, '127.0.0.1');
  await new Promise((r) => target.once('listening', r));
  const port = target.address().port;
  const proxy = await startEgressProxy({ lookup: async () => [{ address: '127.0.0.1' }] });
  const proxyPort = Number(new URL(proxy.url).port);
  const reply = await new Promise((resolve) => {
    const s = net.connect(proxyPort, '127.0.0.1', () => s.write(`CONNECT rebind.example:${port} HTTP/1.1\r\nHost: rebind.example:${port}\r\n\r\n`));
    let buf = '';
    s.on('data', (d) => (buf += d));
    s.on('close', () => resolve(buf));
  });
  assert.match(reply, /403/);
  const plain = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: proxyPort, path: `http://rebind.example:${port}/` }, (res) => resolve(res.statusCode)));
  assert.equal(plain, 403);
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/`));
  await assert.rejects(safeFetch(`http://localhost:${port}/`));
  await proxy.close();
  target.close();
});

test('worker mirror: files before the record, old video versions removed, scratch files never uploaded', async () => {
  const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'mirror-'));
  const id = '00000000-0000-4000-8000-000000000000';
  const calls = [];
  const store = { keys: async () => [{ key: `jobs/${id}/videos/v-v1.mp4` }], upload: async (k) => calls.push(`up ${k.split('/').slice(2).join('/')}`), write: async () => calls.push('job.json'), del: async (k) => calls.push(`del ${k.map((x) => x.split('/').slice(2).join('/'))}`), download: async () => {} };
  const m = new Mirror(store, id, dir);
  await m.pull();
  for (const f of ['capture/capture.json', 'videos/v-v2.mp4', 'videos/v-v2.raw.mp4', 'videos/still-1.jpg', 'review/v/s.jpg', 'plans.json']) {
    await fsp.mkdir(nodePath.join(dir, nodePath.dirname(f)), { recursive: true });
    await fsp.writeFile(nodePath.join(dir, f), 'x');
  }
  m.schedule({ videos: [{ file: 'v-v2.mp4' }] });
  await m.flush();
  assert.deepEqual([...calls].sort(), ['del videos/v-v1.mp4', 'job.json', 'up capture/capture.json', 'up plans.json', 'up videos/v-v2.mp4'].sort());
  assert.ok(calls.indexOf('job.json') > calls.indexOf('up videos/v-v2.mp4'));
  calls.length = 0;
  m.schedule({ videos: [{ file: 'v-v2.mp4' }] });
  await m.flush();
  assert.deepEqual(calls, ['job.json']);
});

test('remote jobs: login is sealed for the worker, a silent worker becomes retryable', async () => {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'jobs-'));
  const disk = new DiskStore(root);
  const secrets = {};
  const store = Object.assign(disk, { putSecret: async (id, s) => (secrets[id] = s), takeSecret: async () => null });
  const started = [];
  const jobs = new StudioJobs({ root, store, launcher: { start: async (a) => (started.push(a), { kind: 'test', task: 't1' }) } });
  const job = await jobs.create({ userId: 'u1', url: 'https://example.com', formats: ['launch'], notes: '', login: { email: 'a@b.co', password: 'pw-123456' } });
  assert.equal(started.length, 1);
  assert.equal(job.worker.task, 't1');
  assert.deepEqual(unseal(secrets[job.id], started[0].secretKey), { email: 'a@b.co', password: 'pw-123456' });
  assert.ok(!JSON.stringify(await disk.read(job.id)).includes('pw-123456'));
  const saved = await disk.read(job.id);
  saved.updatedAt = new Date(Date.now() - 60 * 60000).toISOString();
  await disk.write(saved);
  const later = await jobs.get('u1', job.id);
  assert.equal(later.status, 'failed');
  await assert.rejects(jobs.get('u2', job.id));
});

test('planner trims over-long text only at a sentence or clause', () => {
  const { shorten, trimLong } = require('../Questera-Backend/studio/planner.cjs');
  assert.equal(shorten('Finds what people search for. Then writes drafts from real sources every week.', 40), 'Finds what people search for.');
  assert.equal(shorten('Connect Search Console to track positions, and refresh posts near page one.', 60), 'Connect Search Console to track positions.');
  assert.equal(shorten('Onewordafteranotherwithoutanyplacetocutatallreally', 20), null);
  assert.equal(shorten('Short already', 40), 'Short already');
  const { z } = require('zod');
  const schema = z.object({ items: z.array(z.object({ body: z.string().max(80) })) });
  const data = { items: [{ body: 'Builds every article from source material and scores it for depth, then waits for your review.' }, { body: 'Reads your site and your niche, and follows real competitor sources to find gaps worth writing about.' }] };
  assert.ok(trimLong(data, schema.safeParse(data).error.issues));
  assert.equal(data.items[0].body, 'Builds every article from source material and scores it for depth.');
  assert.ok(data.items[1].body.length > 80, 'no clean cut: left for the model to rewrite');
});

test('autopilot: reuses a recent capture, and a fresh one reports what is new on the site', async () => {
  const { headingsOf, notesFor } = require('../Questera-Backend/studio/jobs.cjs');
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'reuse-'));
  const jobs = new StudioJobs({ root, launcher: { start: async () => ({ kind: 'test' }) } });
  const first = await jobs.create({ userId: 'u1', url: 'https://www.acme.com/', formats: ['square'] });
  const capture = { capturedAt: new Date().toISOString(), login: null, pages: [{ copy: { h1: 'Dashboards for busy teams', sections: [{ title: 'Live sync with Sheets' }, { title: 'x' }] } }] };
  await fsp.mkdir(nodePath.join(root, first.id, 'capture'), { recursive: true });
  await fsp.writeFile(nodePath.join(root, first.id, 'capture', 'capture.json'), JSON.stringify(capture));
  Object.assign(first, { status: 'done', brand: { name: 'Acme' } });
  await jobs.write(first);

  const latest = await jobs.latestCapture('u1', 'https://acme.com/pricing');
  assert.equal(latest.jobId, first.id);
  assert.deepEqual(latest.headings, ['dashboards for busy teams', 'live sync with sheets']);
  assert.equal(await jobs.latestCapture('u2', 'https://acme.com'), null);
  assert.equal(await jobs.latestCapture('u1', 'https://other.com'), null);

  const second = await jobs.create({ userId: 'u1', url: 'https://acme.com', formats: ['teaser'], reuseCapture: first.id, source: 'autopilot', platform: 'instagram', angle: 'Live sync' });
  assert.equal(second.steps[0].status, 'done');
  assert.equal(second.reusedCapture, first.id);
  assert.ok(await fsp.stat(nodePath.join(root, second.id, 'capture', 'capture.json')));

  const now = { ...capture, pages: [{ copy: { h1: 'Dashboards for busy teams', sections: [{ title: 'Live sync with Sheets' }, { title: 'New: AI weekly summaries' }] } }] };
  const news = headingsOf(now).filter((h) => !new Set(latest.headings).has(h));
  assert.deepEqual(news, ['new: ai weekly summaries']);
  assert.match(notesFor({ notes: 'Make this video about: sync.', whatsNew: news }), /New on the site since the last video: "new: ai weekly summaries"/);
});

test('post video links: permanent and signed, refreshed to a direct link at publish time', async () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.STUDIO_PUBLIC_API_URL = 'https://api.velos.test/api/studio/';
  const { mediaUrl, verifyMedia } = require('../Questera-Backend/studio/service.cjs');
  const id = '11111111-2222-4333-8444-555555555555';
  const url = mediaUrl(id, 'videos/a-v1.mp4');
  assert.match(url, /^https:\/\/api\.velos\.test\/api\/studio\/media\/11111111-2222-4333-8444-555555555555\/videos\/a-v1\.mp4\?sig=[\w-]{32}$/);
  const sig = new URL(url).searchParams.get('sig');
  assert.ok(verifyMedia(id, 'videos/a-v1.mp4', sig));
  assert.equal(verifyMedia(id, 'videos/b-v1.mp4', sig), null);
  assert.equal(verifyMedia(id, 'job.json', sig), null);
  assert.equal(verifyMedia(id, 'videos/a-v1.mp4', `${sig.slice(0, -1)}x`), null);
});

// ─── guided Studio ───────────────────────────────────────────────────────

const guidedCapture = () => ({
  url: 'https://acme.com',
  siteName: 'Acme',
  palette: buildPalette({ heroBg: 'rgb(255,255,255)', ink: 'rgb(20,20,20)', buttons: [{ bg: 'rgb(59, 91, 219)', color: 'rgb(255,255,255)', area: 9000 }], links: [] }),
  logo: { file: 'logo.svg', kind: 'img', w: 90, h: 30 },
  icon: { file: 'icon.svg' },
  fonts: { display: { family: 'Sora', files: [{ file: 'fonts/display-0.woff2' }] }, body: { family: 'Inter', files: [{ file: 'fonts/body-0.woff2' }] } },
  pages: [{ label: 'home', copy: { title: 'Acme', h1: 'Dashboards for busy teams', sub: 'Live sync with Sheets', sections: [{ title: 'Live sync with Sheets', body: 'Every 5 minutes' }], ctas: ['Start free'], bullets: [], numbers: ['5 minutes'], prices: [] } }],
  shots: [
    { id: 'home-hero', file: 'home-hero.jpg', width: 1600, height: 1000, kind: 'hero', page: 'home', elements: [{ id: 'home-hero-e1', role: 'card', text: 'Revenue', x: 100, y: 100, w: 400, h: 300 }] },
    { id: 'home-s1', file: 'home-s1.jpg', width: 1600, height: 1000, kind: 'section', page: 'home', elements: [] },
  ],
  appShots: [],
});

test('brand kit: the site’s own by default, edits checked, colours rebuild the palette only when changed', () => {
  const { defaultKit, cleanKit, applyKit } = require('../studio/remotion/brandkit.cjs');
  const capture = guidedCapture();
  const kit = defaultKit(capture);
  assert.deepEqual([kit.name, kit.logo, kit.heading, kit.rhythm, kit.music], ['Acme', 'logo', 'display', 'fluid', 'pulse']);
  assert.equal(applyKit(capture, kit, buildPalette).palette, capture.palette, 'unchanged colours keep the derived palette');

  const clean = cleanKit({ name: '  Acme Labs ', logo: 'banner', colors: { bg: '#0a0a0a', ink: 'red', accent: '#22CC88' }, heading: 'body', rhythm: 'snappy', music: 'drive' }, capture);
  assert.deepEqual(clean, { name: 'Acme Labs', logo: 'logo', colors: { bg: '#0a0a0a', ink: capture.palette.ink, accent: '#22cc88' }, heading: 'body', rhythm: 'snappy', music: 'drive', motion: 'smooth', voice: 'off' });
  assert.equal(cleanKit({ music: 'dubstep' }, capture).music, 'pulse');
  assert.equal(cleanKit({ music: 'gen-2' }, capture, ['gen-1']).music, 'pulse', 'only tracks composed for this job');
  assert.equal(cleanKit({ music: 'gen-1', motion: 'dynamic' }, capture, ['gen-1']).music, 'gen-1');
  assert.equal(cleanKit({ motion: 'spin' }, capture).motion, 'smooth');
  const branded = applyKit(capture, { ...clean, logo: 'icon' }, buildPalette);
  assert.equal(branded.siteName, 'Acme Labs');
  assert.equal(branded.palette.theme, 'dark');
  assert.equal(branded.palette.accent, '#22cc88');
  assert.deepEqual(branded.logo, { file: 'icon.svg', w: 1, h: 1, text: 'Acme Labs' });
  assert.equal(branded.fonts.display.family, 'Inter', 'the body font now sets headlines');
  assert.deepEqual(applyKit(capture, { ...clean, logo: 'text' }, buildPalette).logo, { kind: 'text', text: 'Acme Labs' });
  assert.equal(cleanKit({ logo: 'icon' }, { ...capture, icon: null }).logo, 'logo', 'no icon on the site: back to the logo');
});

test('timeline: a snappy storyboard holds each long scene one beat less', () => {
  const scenes = [{ type: 'title', headline: 'x' }, { type: 'reveal', shot: 's' }, { type: 'end', cta: 'Go' }];
  const fluid = timeline({ scenes });
  const snappy = timeline({ scenes, pace: 'snappy' });
  assert.deepEqual(fluid.items.map((i) => i.dur), [105, 180, 150]);
  assert.deepEqual(snappy.items.map((i) => i.dur), [105, 165, 135]);
  for (const item of snappy.items) assert.equal(item.from % 15, 0);
});

test('guided job: reads the site, asks, writes one storyboard, checks edits, exports it at each size', async () => {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'guided-'));
  const started = [];
  const jobs = new StudioJobs({ root, launcher: { start: async (a) => (started.push(a.task), { kind: 'test' }) } });
  const job = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  assert.deepEqual([job.stage, job.guided, started[0]], ['reading', true, 'capture']);
  await assert.rejects(jobs.storyboard('u1', job.id, {}), /still|Wait/);

  // What the capture run leaves behind.
  const capture = guidedCapture();
  await fsp.mkdir(nodePath.join(root, job.id, 'capture'), { recursive: true });
  await fsp.writeFile(nodePath.join(root, job.id, 'capture', 'capture.json'), JSON.stringify(capture));
  const { defaultKit } = require('../studio/remotion/brandkit.cjs');
  await jobs.write({ ...(await jobs.read(job.id)), status: 'waiting', stage: 'style', kit: defaultKit(capture), options: [{ id: 'product', kind: 'launch', title: 'Product launch', detail: 'Introduce Acme.' }] });

  const answers = { kit: defaultKit(capture), brief: { option: 'product', sizes: ['16:9', '9:16'], length: 'short' }, screens: ['home-hero'] };
  await assert.rejects(jobs.storyboard('u1', job.id, { ...answers, brief: { ...answers.brief, option: 'nope' } }), /what kind of video/);
  await assert.rejects(jobs.storyboard('u1', job.id, { ...answers, brief: { ...answers.brief, sizes: ['4:3'] } }), /at least one size/);
  await assert.rejects(jobs.storyboard('u1', job.id, { ...answers, screens: ['made-up'] }), /at least one screen/);
  await assert.rejects(jobs.storyboard('u2', job.id, answers), /Unknown job/);

  let planned;
  jobs.planning = async (id, cap, option) => (planned = { id, option: option.id });
  const writing = await jobs.storyboard('u1', job.id, answers);
  assert.deepEqual([writing.stage, writing.status, writing.brief.length, writing.screens], ['storyboard', 'running', 'short', ['home-hero']]);
  assert.deepEqual(planned, { id: job.id, option: 'product' });

  const scenes = [
    { type: 'title', headline: 'Dashboards for busy teams' },
    { type: 'focus', shot: 'home-hero', element: 'home-hero-e1', title: 'Live sync with Sheets', click: true },
    { type: 'end', cta: 'Start free' },
  ];
  await jobs.write({ ...(await jobs.read(job.id)), status: 'waiting', storyboard: { format: 'teaser', title: 'Acme', scenes, pace: 'fluid' } });
  await assert.rejects(jobs.saveStoryboard('u1', job.id, { scenes: scenes.slice(0, 2) }), /between 3 and 9 scenes/);
  await assert.rejects(jobs.saveStoryboard('u1', job.id, { scenes: [scenes[0], { ...scenes[1], shot: 'nowhere' }, scenes[2]] }), /unknown shot/);
  await assert.rejects(jobs.saveStoryboard('u1', job.id, { scenes: [scenes[0], { type: 'stat', value: '99%', label: 'uptime' }, scenes[2]] }), /does not appear/);
  const editing = await jobs.saveStoryboard('u1', job.id, { scenes, kit: { ...defaultKit(capture), rhythm: 'snappy' } });
  assert.deepEqual([editing.stage, editing.storyboard.pace], ['editor', 'snappy']);

  const exporting = await jobs.exportVideos('u1', job.id);
  assert.deepEqual(exporting.videos.map((v) => [v.size, v.label, v.plan.size, v.plan.pace]), [['16:9', 'Landscape 16:9', '16:9', 'snappy'], ['9:16', 'Vertical 9:16', '9:16', 'snappy']]);
  assert.equal(started.at(-1), 'video', 'with workers, each size renders on its own');
  await assert.rejects(jobs.chat('u1', job.id, { message: 'shorter' }), /Wait/);

  // Rendered; then an edit makes the export out of date, and exporting again keeps each size's video.
  const done = await jobs.read(job.id);
  done.status = 'done';
  done.videos.forEach((v) => Object.assign(v, { status: 'done', file: `${v.id}-v1.mp4` }));
  await jobs.write(done);
  const edited = await jobs.saveStoryboard('u1', job.id, { scenes: [{ ...scenes[0], headline: 'Dashboards for teams' }, scenes[1], scenes[2]] });
  assert.ok(edited.videos.every((v) => v.outdated));
  const again = await jobs.exportVideos('u1', job.id);
  assert.deepEqual(again.videos.map((v) => v.id), done.videos.map((v) => v.id));
  assert.ok(again.videos.every((v) => !v.outdated && v.status === 'pending'));
});

test('uploaded screenshots: type read from the bytes, size limits, added as a product screen on the capture scale', async () => {
  const { imageInfo, checkUpload } = require('../Questera-Backend/studio/upload.cjs');
  const png = (w, h) => {
    const b = Buffer.alloc(64);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };
  assert.deepEqual(imageInfo(png(2880, 1800)), { type: 'image/png', ext: 'png', width: 2880, height: 1800 });
  assert.equal(imageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(64))), null);
  assert.throws(() => checkUpload(Buffer.from('<html>'.padEnd(64)), 0), /PNG, JPEG or WebP/);
  assert.throws(() => checkUpload(png(200, 100), 0), /too small/);
  assert.throws(() => checkUpload(png(1600, 900), 8), /up to 8/);

  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'upload-'));
  const jobs = new StudioJobs({ root, launcher: { start: async () => ({ kind: 'test' }) } });
  const job = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  await fsp.mkdir(nodePath.join(root, job.id, 'capture'), { recursive: true });
  await fsp.writeFile(nodePath.join(root, job.id, 'capture', 'capture.json'), JSON.stringify(guidedCapture()));
  await jobs.write({ ...(await jobs.read(job.id)), status: 'waiting', stage: 'style' });
  const after = await jobs.addScreen('u1', job.id, png(2880, 1800), 'Billing page.png');
  assert.deepEqual(after.brand.screens[0], { id: 'upload-1', kind: 'upload', page: 'upload', title: 'Billing page', width: 1600, height: 1000, thumb: 'capture/uploads/upload-1.png' });
  const capture = JSON.parse(await fsp.readFile(nodePath.join(root, job.id, 'capture', 'capture.json'), 'utf8'));
  assert.equal(capture.appShots[0].elements.length, 0);
  assert.ok(await fsp.stat(nodePath.join(root, job.id, 'capture', 'uploads', 'upload-1.png')));
  assert.equal((await jobs.addScreen('u1', job.id, png(1600, 900), '')).brand.screens[0].id, 'upload-2');
});

test('parallel export: one worker per size, each reports its own part, the job finishes when every part has', async () => {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'parallel-'));
  const started = [];
  const jobs = new StudioJobs({ root, launcher: { start: async (a) => (started.push([a.task, a.videoId]), { kind: 'test' }) } });
  const job = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  await fsp.mkdir(nodePath.join(root, job.id, 'capture'), { recursive: true });
  await fsp.writeFile(nodePath.join(root, job.id, 'capture', 'capture.json'), JSON.stringify(guidedCapture()));
  const { defaultKit } = require('../studio/remotion/brandkit.cjs');
  const scenes = [{ type: 'title', headline: 'Dashboards for busy teams' }, { type: 'focus', shot: 'home-hero', title: 'Live sync with Sheets', click: false }, { type: 'end', cta: 'Start free' }];
  await jobs.write({ ...(await jobs.read(job.id)), status: 'waiting', stage: 'editor', kit: defaultKit(capture()), brief: { sizes: ['16:9', '9:16', '4:5'] }, storyboard: { format: 'launch', title: 'Acme', scenes } });
  function capture() {
    return guidedCapture();
  }

  const exporting = await jobs.exportVideos('u1', job.id);
  assert.equal(exporting.parallel, true);
  assert.deepEqual(started.slice(1), exporting.videos.map((v) => ['video', v.id]));
  const [a, b, c] = exporting.videos;
  const part = async (v, extra) => jobs.store.writeFile(job.id, `parts/${v.id}.json`, Buffer.from(JSON.stringify({ ...v, ...extra, reportedAt: new Date().toISOString() })));
  await part(a, { status: 'done', file: `${a.id}-v1.mp4` });
  await part(b, { status: 'rendering', progress: 40 });
  let now = await jobs.get('u1', job.id);
  assert.deepEqual([now.status, now.videos[0].status, now.videos[1].progress], ['running', 'done', 40]);
  assert.match(now.activity, /Rendering the vertical 9:16 · 40%/);
  await assert.rejects(jobs.chat('u1', job.id, { message: 'shorter' }), /Wait/);

  await part(b, { status: 'done', file: `${b.id}-v1.mp4` });
  await part(c, { status: 'done', file: `${c.id}-v1.mp4` });
  now = await jobs.get('u1', job.id);
  assert.deepEqual([now.status, now.parallel, now.activity], ['done', false, 'Ready']);
  assert.ok(now.videos.every((v) => v.status === 'done' && v.file));
  assert.deepEqual((await jobs.read(job.id)).status, 'done', 'saved once finished');

  // A part that stops reporting fails that size, and the job, without hanging.
  await jobs.exportVideos('u1', job.id);
  const stuck = await jobs.read(job.id);
  await part(stuck.videos[0], { status: 'done', file: 'x.mp4' });
  await part(stuck.videos[1], { status: 'done', file: 'y.mp4' });
  await jobs.store.writeFile(job.id, `parts/${stuck.videos[2].id}.json`, Buffer.from(JSON.stringify({ ...stuck.videos[2], status: 'rendering', reportedAt: new Date(Date.now() - 3600e3).toISOString() })));
  now = await jobs.get('u1', job.id);
  assert.deepEqual([now.status, now.videos[2].status], ['failed', 'failed']);
  assert.match(now.error, /stopped unexpectedly/);
});

test('worker mirror, one video of a parallel export: uploads only its own files and reports a part, never job.json', async () => {
  const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'part-'));
  const id = '00000000-0000-4000-8000-000000000001';
  const calls = [];
  const store = {
    keys: async () => [{ key: `jobs/${id}/videos/a-v1.mp4` }, { key: `jobs/${id}/videos/b-v1.mp4` }],
    upload: async (k) => calls.push(`up ${k.split('/').slice(2).join('/')}`),
    write: async () => calls.push('job.json'),
    writeFile: async (_, rel, body) => calls.push(`${rel} ${JSON.parse(body).status}`),
    del: async (k) => calls.push(`del ${k.map((x) => x.split('/').slice(2).join('/'))}`),
    download: async () => {},
  };
  const m = new Mirror(store, id, dir, { part: 'a' });
  await m.pull();
  for (const f of ['capture/capture.json', 'videos/a-v2.mp4', 'videos/a-v2.gif', 'videos/b-v2.mp4']) {
    await fsp.mkdir(nodePath.join(dir, nodePath.dirname(f)), { recursive: true });
    await fsp.writeFile(nodePath.join(dir, f), 'x');
  }
  m.schedule({ videos: [{ id: 'a', status: 'done', file: 'a-v2.mp4', gif: 'a-v2.gif' }, { id: 'b', status: 'rendering', file: 'b-v2.mp4' }] });
  await m.flush();
  assert.deepEqual([...calls].sort(), ['del videos/a-v1.mp4', 'parts/a.json done', 'up videos/a-v2.gif', 'up videos/a-v2.mp4'].sort());
});


/** A WAV of kicks at `bpm`, the first one `offset` seconds in, with hats on the off-beats (to tempt the aligner off). */
async function kickTrack(file, { bpm, offset, seconds = 20 }) {
  const rate = 44100;
  const n = Math.round(seconds * rate);
  const pcm = new Int16Array(n * 2);
  const add = (at, make, len) => {
    for (let i = 0; i < len && at + i < n; i++) {
      const v = make(i / rate);
      pcm[(at + i) * 2] += v;
      pcm[(at + i) * 2 + 1] += v;
    }
  };
  const beat = 60 / bpm;
  for (let t = offset; t < seconds; t += beat) {
    add(Math.round(t * rate), (x) => Math.round(20000 * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-x / 0.03)) * x) * Math.exp(-x / 0.15)), Math.round(0.3 * rate));
    add(Math.round((t + beat / 2) * rate), () => Math.round((Math.random() * 2 - 1) * 9000), Math.round(0.02 * rate));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  await fsp.writeFile(file, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

test('composed music is stretched to 120 bpm and trimmed to start on the kick, not the hi-hat', async () => {
  const { alignTrack } = require('../Questera-Backend/studio/music.cjs');
  const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'music-'));
  await kickTrack(nodePath.join(dir, 'in.wav'), { bpm: 124, offset: 0.31 });
  const r = await alignTrack(nodePath.join(dir, 'in.wav'), nodePath.join(dir, 'out.flac'));
  assert.ok(Math.abs(r.bpm - 124) <= 0.5, `measured ${r.bpm}`);
  assert.ok(Math.abs(r.stretch - 120 / 124) < 0.003, `stretch ${r.stretch}`);
  // 0.31 s at 124 bpm becomes 0.32 s at 120 bpm: the trim lands just before it (10 ms of lead-in).
  assert.ok(Math.abs(r.offset - 0.31) <= 0.03, `offset ${r.offset}`);
  assert.ok(r.duration > 19 && r.duration < 21);
});

test('compose a track: one at a time, it reports in a part, joins the job, and the storyboard plays it', async () => {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'compose-'));
  const started = [];
  const jobs = new StudioJobs({ root, launcher: { start: async (a) => (started.push([a.task, a.videoId]), { kind: 'test' }) } });
  const job = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  await fsp.mkdir(nodePath.join(root, job.id, 'capture'), { recursive: true });
  await fsp.writeFile(nodePath.join(root, job.id, 'capture', 'capture.json'), JSON.stringify(guidedCapture()));
  const { defaultKit } = require('../studio/remotion/brandkit.cjs');
  const scenes = [{ type: 'title', headline: 'Dashboards for busy teams' }, { type: 'focus', shot: 'home-hero', title: 'Live sync with Sheets', click: false }, { type: 'end', cta: 'Start free' }];
  await jobs.write({ ...(await jobs.read(job.id)), status: 'waiting', stage: 'editor', kit: defaultKit(guidedCapture()), brief: { sizes: ['16:9'] }, storyboard: { format: 'launch', title: 'Acme', scenes } });

  // Requests only record the ask here; composing is driven step by step below (no real Lyria call).
  const realCompose = (...a) => StudioJobs.prototype.compose.apply(jobs, a);
  jobs.compose = async () => {};
  const asked = await jobs.requestMusic('u1', job.id, { description: 'warm lo-fi with soft piano' });
  assert.deepEqual([asked.composing.n, asked.composing.description], [1, 'warm lo-fi with soft piano']);
  await assert.rejects(jobs.requestMusic('u1', job.id, {}), /already being composed/);

  // Lyria (a stand-in here) writes the audio in the API; a worker lines it up on the beat.
  const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'lyria-'));
  await kickTrack(nodePath.join(dir, 'lyria.wav'), { bpm: 120, offset: 0.2, seconds: 12 });
  await realCompose(job.id, 1, 'warm lo-fi with soft piano', { composeTrack: async () => fsp.readFile(nodePath.join(dir, 'lyria.wav')) });
  assert.deepEqual(started.at(-1), ['music', '1']);
  const { alignInto } = require('../Questera-Backend/studio/music.cjs');
  await alignInto({ store: jobs.store, id: job.id, n: 1, raw: await jobs.store.readFile(job.id, 'music-src/gen-1'), dir });
  let now = await jobs.get('u1', job.id);
  assert.equal(now.composing, null);
  assert.deepEqual(now.tracks.map((t) => [t.id, t.file, t.description]), [['gen-1', 'music/gen-1.flac', 'warm lo-fi with soft piano']]);
  assert.ok(await fsp.stat(nodePath.join(root, job.id, 'capture', 'music', 'gen-1.flac')));
  assert.equal(now.kit.music, 'pulse', 'asked for in Style: the browser picks it, the saved kit is not touched');

  now = await jobs.saveStoryboard('u1', job.id, { kit: { ...now.kit, music: 'gen-1', motion: 'dynamic' } });
  assert.deepEqual([now.storyboard.music, now.storyboard.track, now.storyboard.motion], ['gen-1', 'music/gen-1.flac', 'dynamic']);

  // Asked for in the chat, a track starts playing as soon as it's ready and the chat says so; a failure is told too.
  await jobs.requestMusic('u1', job.id, { description: 'bright synthwave', from: 'chat' });
  await alignInto({ store: jobs.store, id: job.id, n: 2, raw: await fsp.readFile(nodePath.join(dir, 'lyria.wav')), dir });
  now = await jobs.get('u1', job.id);
  assert.deepEqual([now.kit.music, now.storyboard.track], ['gen-2', 'music/gen-2.flac']);
  assert.match(now.messages.at(-1).text, /new track is ready/);
  await jobs.requestMusic('u1', job.id, { description: 'x', from: 'chat' });
  await realCompose(job.id, 3, 'x', { composeTrack: async () => { throw new Error('boom'); } });
  now = await jobs.get('u1', job.id);
  assert.deepEqual([now.composing, now.tracks.length], [null, 2]);
  assert.match(now.messages.at(-1).text, /couldn’t compose/);
  assert.match(now.musicError, /couldn’t compose/);
});

test('new scenes: numbers and quotes only as the site states them', () => {
  const { check } = require('../Questera-Backend/studio/planner.cjs');
  const capture = { pages: [{ copy: { h1: 'x', sections: [{ title: 'What users say', body: '“Seovyn saved us 10 hours a week.” — Ana Ruiz, Head of Content' }], numbers: ['26 of 28', '$29'] } }], shots: [], appShots: [] };
  const ok = (scene) => !check({ videos: [{ format: 'launch', title: 't', scenes: [scene, { type: 'end', cta: 'Go' }] }] }, capture, ['launch']).length;
  assert.ok(ok({ type: 'quote', text: '"Seovyn saved us 10 hours a week."', name: 'Ana Ruiz', role: 'Head of Content' }));
  assert.ok(!ok({ type: 'quote', text: 'Seovyn saved us 20 hours a week.', name: 'Ana Ruiz' }), 'a changed number');
  assert.ok(!ok({ type: 'quote', text: 'Seovyn saved us 10 hours a week.', name: 'Bob Smith' }), 'a made-up name');
  assert.ok(ok({ type: 'metrics', items: [{ value: '26 of 28', label: 'a' }, { value: '$29', label: 'b' }] }));
  assert.ok(!ok({ type: 'metrics', items: [{ value: '26 of 28', label: 'a' }, { value: '99%', label: 'b' }] }));
  const t = timeline({ scenes: [{ type: 'compare', before: { label: 'a', items: ['x', 'y', 'z'] }, after: { label: 'b', items: ['x', 'y'] } }, { type: 'quote', text: 'one two three four five six', name: 'n' }, { type: 'metrics', items: [{}, {}, {}] }] });
  for (const item of t.items) assert.equal(item.dur % 15, 0, `${item.scene.type} on the beat`);
});

test('voiceover: a scene grows by whole beats to fit its line; only new lines are voiced', async () => {
  const plan = { scenes: [{ type: 'title', headline: 'x', say: 'A short line.' }, { type: 'end', cta: 'Go', say: 'A much longer closing line.' }] };
  const silent = timeline(plan);
  const voiced = timeline({ ...plan, voice: { lines: [{ text: 'A short line.', file: 'voice/a.wav', frames: 40 }, { text: 'A much longer closing line.', file: 'voice/b.wav', frames: 200 }] } });
  assert.deepEqual(silent.items.map((i) => i.dur), [105, 150]);
  assert.deepEqual(voiced.items.map((i) => i.dur), [105, 225], 'the end card stretches to 9 + 200 + 15 frames, rounded up to a beat');
  assert.equal(voiced.items[1].voice.file, 'voice/b.wav');

  const voice = require('../Questera-Backend/studio/voice.cjs');
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'voice-'));
  const jobs = new StudioJobs({ root, launcher: { start: async () => ({ kind: 'test' }) } });
  const job = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  await fsp.mkdir(nodePath.join(root, job.id, 'capture'), { recursive: true });
  await fsp.writeFile(nodePath.join(root, job.id, 'capture', 'capture.json'), JSON.stringify(guidedCapture()));
  const { defaultKit } = require('../studio/remotion/brandkit.cjs');
  const scenes = [{ type: 'title', headline: 'Dashboards for busy teams' }, { type: 'focus', shot: 'home-hero', title: 'Live sync with Sheets', click: false }, { type: 'end', cta: 'Start free' }];
  await jobs.write({ ...(await jobs.read(job.id)), status: 'waiting', stage: 'editor', kit: defaultKit(guidedCapture()), brief: { sizes: ['16:9'] }, storyboard: { format: 'launch', title: 'Acme', scenes } });

  const spoken = [];
  const wav = (seconds) => {
    const b = Buffer.alloc(44 + seconds * 48000);
    b.write('RIFF', 0); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(seconds * 48000, 40);
    return b;
  };
  const real = { speak: voice.speak, writeLines: voice.writeLines };
  voice.speak = async (text, name) => (spoken.push(`${name}: ${text}`), { audio: wav(2), seconds: 2 });
  voice.writeLines = async ({ plan }) => plan.scenes.map((s, i) => ({ ...s, say: s.say || `Line ${i + 1} from the site.` }));
  try {
    let now = await jobs.recordVoice('u1', job.id, { voice: 'Sulafat' });
    assert.deepEqual(spoken, ['Sulafat: Line 1 from the site.', 'Sulafat: Line 2 from the site.', 'Sulafat: Line 3 from the site.']);
    assert.deepEqual([now.kit.voice, now.voiceStale, now.storyboard.voice.lines.length, now.storyboard.voice.lines[0].frames], ['Sulafat', false, 3, 60]);
    assert.ok(await fsp.stat(nodePath.join(root, job.id, 'capture', now.storyboard.voice.lines[0].file)));

    const edited = now.storyboard.scenes.map((s, i) => (i === 1 ? { ...s, say: 'A new second line.' } : s));
    now = await jobs.saveStoryboard('u1', job.id, { scenes: edited });
    assert.equal(now.voiceStale, true, 'an edited line is out of date until recorded');
    spoken.length = 0;
    now = await jobs.recordVoice('u1', job.id, {});
    assert.deepEqual(spoken, ['Sulafat: A new second line.'], 'only the changed line is voiced again');
    now = await jobs.recordVoice('u1', job.id, { voice: 'off' });
    assert.deepEqual([now.kit.voice, now.storyboard.voice], ['off', null]);
  } finally {
    Object.assign(voice, real);
  }
});

test('no Fargate capacity: the start waits in a queue, the job says so, and it starts once capacity frees', async () => {
  const root = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'capacity-'));
  let full = true;
  const started = [];
  const launcher = { start: async (a) => { if (full) throw Object.assign(new Error('Fargate: You’ve reached the limit on the number of vCPUs'), { capacity: true }); started.push(a.task); return { kind: 'test', task: 't9' }; } };
  const jobs = new StudioJobs({ root, launcher });
  const job = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  clearTimeout(jobs.timer);
  jobs.timer = null;
  let now = await jobs.get('u1', job.id);
  assert.deepEqual([now.status, now.activity, jobs.waiting.length], ['queued', 'Waiting for a free renderer', 1]);
  await jobs.drain();
  clearTimeout(jobs.timer);
  jobs.timer = null;
  assert.equal(jobs.waiting.length, 1, 'still full: stays queued');
  full = false;
  await jobs.drain();
  now = await jobs.get('u1', job.id);
  assert.deepEqual([started, jobs.waiting.length, now.worker.task, now.activity], [['capture'], 0, 't9', 'Starting']);
  // Waited too long: the run is given up with a message.
  full = true;
  const late = await jobs.createGuided({ userId: 'u1', url: 'https://acme.com' });
  clearTimeout(jobs.timer);
  jobs.timer = null;
  jobs.waiting[0].since = Date.now() - 16 * 60000;
  await jobs.drain();
  now = await jobs.get('u1', late.id);
  assert.equal(now.status, 'failed');
  assert.match(now.error, /busy right now/);
});
