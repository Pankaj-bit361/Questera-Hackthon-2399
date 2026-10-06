// /api/studio — website in, product videos out.
//
//   POST   /jobs                         { url, formats[], notes?, login?: { loginUrl?, email, password } }
//                                        or { url, guided: true, login? }: the guided flow below
//   GET    /jobs/:id/preview             brand, screens and elements for the live preview in the browser
//   POST   /jobs/:id/signin              { login }  read the site again from inside the product
//   POST   /jobs/:id/screens             raw PNG/JPEG/WebP body (X-File-Name)  add an uploaded screenshot
//   POST   /jobs/:id/storyboard          { kit, brief: { option, custom?, sizes[], length }, screens[] }  write it
//   PUT    /jobs/:id/storyboard          { scenes?, kit? }  save edits; opens the editor
//   POST   /jobs/:id/voice               { voice?, kit?, scenes? }  write and record the voiceover (~10 s)
//   POST   /jobs/:id/music               { description }  compose a track for this video (about a minute)
//   POST   /jobs/:id/chat                { message, scenes?, kit? }  change the storyboard by saying what to change
//   POST   /jobs/:id/export              { scenes?, kit? }  render the storyboard at every size picked
//   GET    /audio/*                      the music and sound effects, for the live preview (public)
//   GET    /jobs                         the user's jobs, newest first
//   GET    /jobs/:id                     one job (polled by the UI while it runs)
//   POST   /jobs/:id/retry               { login? }  continue a failed job from where it stopped
//   POST   /jobs/:id/videos/:vid/edit    { scenes }  change a video's words and render it again
//   DELETE /jobs/:id
//   GET    /files/:id/*?t=<ticket>       captured screens, logo, videos (signed, short-lived); &download=<name> saves it
//                                        (S3 storage: redirects to a one-hour S3 link)
//   GET    /media/:id/*?sig=<sig>        a finished video for a scheduled post: a permanent signed link (service.cjs)
//
// Auth: the Velos login JWT (Authorization: Bearer). Files use a separate signed ticket so <video> and <img> can load them.

const dns = require('node:dns/promises');
const express = require('express');
const jwt = require('jsonwebtoken');
const { StudioJobs, FORMATS } = require('./jobs.cjs');
const { privateIp } = require('./egress.cjs');
const { verifyMedia } = require('./service.cjs');
const { ROOT } = require('./chrome.cjs');

const DAILY_LIMIT = Number(process.env.STUDIO_DAILY_LIMIT || 10);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function publicUrl(raw, field = 'url') {
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(String(raw || '').trim()) ? String(raw).trim() : `https://${String(raw || '').trim()}`);
  } catch {
    throw httpError(400, `Enter a valid website address for ${field}.`);
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\.(local|internal|localhost)$/i.test(u.hostname)) throw httpError(400, `Enter a public website address for ${field}.`);
  if (process.env.STUDIO_ALLOW_PRIVATE !== 'true') {
    const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw httpError(400, "We couldn't find that website. Check the address.");
    if (addrs.some((a) => privateIp(a.address))) throw httpError(400, 'That address points to a private network.');
  }
  return u.href;
}

function createStudioRouter({ root, secret, store, launcher, jobs: shared }) {
  if (!secret) throw new Error('Studio needs JWT_SECRET.');
  const jobs = shared || new StudioJobs({ root, store, launcher });
  const ready = shared?.ready || jobs.recover();
  const router = express.Router();
  const fileKey = `${secret}:studio-files`;

  const auth = (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) throw new Error();
      const decoded = jwt.verify(header.slice(7), secret, { algorithms: ['HS256'] });
      const userId = decoded.userId || decoded.id;
      if (!userId) throw new Error();
      req.userId = String(userId);
      next();
    } catch {
      res.status(401).json({ error: 'Sign in again to use Studio.' });
    }
  };

  /** The job as the UI sees it: no owner id, plus a file ticket for its media. */
  const view = (job) => {
    const { userId, usage, compareWith, ...rest } = job;
    return { ...rest, fileToken: jwt.sign({ job: job.id, user: userId }, fileKey, { expiresIn: '6h', audience: 'studio-file' }) };
  };

  const wrap = (fn) => async (req, res) => {
    try {
      await ready;
      await fn(req, res);
    } catch (error) {
      if (!error.status) console.error('[studio]', error);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Try again.' });
    }
  };

  router.use('/audio', express.static(require('node:path').join(ROOT, 'studio/remotion/public/studio-audio'), { maxAge: '7d', index: false, fallthrough: false }));

  router.get('/files/:id/*rest', async (req, res) => {
    try {
      const t = jwt.verify(String(req.query.t || ''), fileKey, { audience: 'studio-file' });
      if (t.job !== req.params.id) throw new Error();
      const rel = [].concat(req.params.rest).join('/');
      const download = req.query.download ? String(req.query.download).slice(0, 120) : null;
      // Fonts load through the API rather than a redirect to S3: the preview's FontFace fetch needs CORS.
      const font = /\.(woff2?|ttf|otf)$/i.exec(rel);
      if (jobs.store.signedUrl && font) {
        const body = await jobs.store.readFile(req.params.id, require('./store.cjs').safeRel(rel));
        if (!body) return res.status(404).end();
        res.set('Cache-Control', 'private, max-age=3600');
        return res.type(font[1].toLowerCase()).send(body);
      }
      if (jobs.store.signedUrl) {
        res.set('Cache-Control', 'private, max-age=600');
        return res.redirect(302, await jobs.store.signedUrl(req.params.id, rel, { download }));
      }
      if (download) res.attachment(download.replace(/[^\w.-]+/g, '-'));
      res.sendFile(jobs.store.file(req.params.id, rel), { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=3600' } }, (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    } catch {
      if (!res.headersSent) res.status(404).end();
    }
  });

  router.get('/media/:id/*rest', async (req, res) => {
    try {
      const rel = [].concat(req.params.rest).join('/');
      const ok = /^(videos|images)\//.test(rel) && verifyMedia(req.params.id, rel, req.query.sig);
      if (!ok) throw new Error();
      if (jobs.store.signedUrl) return res.redirect(302, await jobs.store.signedUrl(ok.id, ok.rel));
      res.sendFile(jobs.store.file(ok.id, ok.rel), { dotfiles: 'allow' }, (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    } catch {
      if (!res.headersSent) res.status(404).end();
    }
  });

  router.use(auth);

  router.get('/formats', (req, res) => res.json({ formats: Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label, size: f.size })) }));

  router.get(
    '/jobs',
    wrap(async (req, res) => {
      // Post images the autopilot made are not Studio videos; they show with their posts instead.
      res.json({ jobs: (await jobs.list(req.userId)).filter((j) => j.kind !== 'images').map(view) });
    }),
  );

  /** A product login from the request, checked; null when none was given. Never stored or logged. */
  const loginFrom = async (login) => {
    if (!login || !(login.email || login.password)) return null;
    if (!login.email || !login.password || String(login.email).length > 200 || String(login.password).length > 200) throw httpError(400, 'Enter the email and password for the product login.');
    return { email: String(login.email), password: String(login.password), loginUrl: login.loginUrl ? await publicUrl(login.loginUrl, 'the login page') : null };
  };

  router.post(
    '/jobs',
    wrap(async (req, res) => {
      const { url, formats, notes, login, guided } = req.body || {};
      const target = await publicUrl(url);
      const picked = [...new Set((Array.isArray(formats) ? formats : []).filter((f) => FORMATS[f]))];
      if (!guided && !picked.length) throw httpError(400, 'Pick at least one video.');
      const creds = await loginFrom(login);
      // The user's own Studio runs; what the autopilot makes for them has its own limits.
      const mine = (await jobs.list(req.userId, Math.max(30, DAILY_LIMIT + 5) + 20)).filter((j) => j.kind !== 'images' && j.source !== 'autopilot');
      if (mine.some((j) => j.status === 'running' || j.status === 'queued')) throw httpError(409, 'One of your videos is still being made. Wait for it to finish first.');
      const today = mine.filter((j) => Date.now() - Date.parse(j.createdAt) < 86400000).length;
      if (today >= DAILY_LIMIT) throw httpError(429, `You've made ${DAILY_LIMIT} sets of videos today. Come back tomorrow.`);
      const job = guided
        ? await jobs.createGuided({ userId: req.userId, url: target, login: creds })
        : await jobs.create({ userId: req.userId, url: target, formats: picked, notes: String(notes || '').slice(0, 500), login: creds });
      res.status(201).json({ job: view(job) });
    }),
  );

  router.get(
    '/jobs/:id/preview',
    wrap(async (req, res) => {
      res.json(await jobs.preview(req.userId, req.params.id));
    }),
  );

  router.post(
    '/jobs/:id/signin',
    wrap(async (req, res) => {
      const creds = await loginFrom(req.body?.login);
      if (!creds) throw httpError(400, 'Enter the email and password for the product login.');
      res.json({ job: view(await jobs.signin(req.userId, req.params.id, creds)) });
    }),
  );

  router.post(
    '/jobs/:id/screens',
    express.raw({ type: () => true, limit: '8mb' }),
    wrap(async (req, res) => {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 120);
      res.json({ job: view(await jobs.addScreen(req.userId, req.params.id, Buffer.isBuffer(req.body) ? req.body : null, name)) });
    }),
  );

  router.post(
    '/jobs/:id/storyboard',
    wrap(async (req, res) => {
      const { kit, brief, screens } = req.body || {};
      res.json({ job: view(await jobs.storyboard(req.userId, req.params.id, { kit, brief, screens })) });
    }),
  );

  router.put(
    '/jobs/:id/storyboard',
    wrap(async (req, res) => {
      res.json({ job: view(await jobs.saveStoryboard(req.userId, req.params.id, { scenes: req.body?.scenes, kit: req.body?.kit })) });
    }),
  );

  router.post(
    '/jobs/:id/voice',
    wrap(async (req, res) => {
      const { voice: name, kit, scenes } = req.body || {};
      res.json({ job: view(await jobs.recordVoice(req.userId, req.params.id, { voice: name, kit, scenes })) });
    }),
  );

  router.post(
    '/jobs/:id/music',
    wrap(async (req, res) => {
      res.json({ job: view(await jobs.requestMusic(req.userId, req.params.id, { description: req.body?.description })) });
    }),
  );

  router.post(
    '/jobs/:id/chat',
    wrap(async (req, res) => {
      const { message, scenes, kit } = req.body || {};
      res.json({ job: view(await jobs.chat(req.userId, req.params.id, { message, scenes, kit })) });
    }),
  );

  router.post(
    '/jobs/:id/export',
    wrap(async (req, res) => {
      res.json({ job: view(await jobs.exportVideos(req.userId, req.params.id, { scenes: req.body?.scenes, kit: req.body?.kit })) });
    }),
  );

  router.get(
    '/jobs/:id',
    wrap(async (req, res) => {
      res.json({ job: view(await jobs.get(req.userId, req.params.id)) });
    }),
  );

  router.post(
    '/jobs/:id/retry',
    wrap(async (req, res) => {
      const login = req.body?.login?.email && req.body?.login?.password ? { email: String(req.body.login.email), password: String(req.body.login.password), loginUrl: req.body.login.loginUrl ? await publicUrl(req.body.login.loginUrl, 'the login page') : null } : null;
      res.json({ job: view(await jobs.retry(req.userId, req.params.id, login)) });
    }),
  );

  router.post(
    '/jobs/:id/videos/:vid/edit',
    wrap(async (req, res) => {
      res.json({ job: view(await jobs.edit(req.userId, req.params.id, req.params.vid, req.body?.scenes)) });
    }),
  );

  router.delete(
    '/jobs/:id',
    wrap(async (req, res) => {
      await jobs.remove(req.userId, req.params.id);
      res.status(204).end();
    }),
  );

  return { router, jobs };
}

module.exports = { createStudioRouter, publicUrl, privateIp };
