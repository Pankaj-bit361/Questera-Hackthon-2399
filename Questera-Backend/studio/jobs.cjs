// Studio jobs: one website in, one or more finished videos out.
//
//   capture → script → for each video: visual check → render → master → thumbnail
//
// A job is a folder (capture/, videos/, job.json; see store.cjs). job.json is the record the API returns and the UI
// polls. Two ways to run:
//   local   — jobs run in this process, one at a time (rendering uses every core); the store is a local folder.
//   remote  — the store is S3 and every run starts its own worker (a Fargate task, see worker.cjs); this process only
//             creates, lists, edits and deletes jobs.
// Login credentials are never written to job.json or logs. Locally they stay in memory for the capture step; remotely
// they travel sealed (store.cjs) and the worker deletes them on read.

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { captureSite } = require('./capture.cjs');
const { planVideos, FORMATS, Scene } = require('./planner.cjs');
const { reviewPlan } = require('./review.cjs');
const { renderVideo, renderStills, renderPostImage, makeGif } = require('./render.cjs');
const { timeline } = require('../../studio/remotion/timing.cjs');
const { DiskStore, seal } = require('./store.cjs');
const { pickShot } = require('./shots.cjs');
const { SIZES, briefFor, planStoryboard, checkScenes, editStoryboard } = require('./guided.cjs');
const { defaultKit, cleanKit, applyKit } = require('../../studio/remotion/brandkit.cjs');
const { buildPalette } = require('./color.cjs');
const { checkUpload } = require('./upload.cjs');
const music = require('./music.cjs');
const voice = require('./voice.cjs');

const MAX_TRACKS = 6;
// A composition that hasn't reported in this long has stopped (Lyria takes about 30-60 s, a worker ~45 s to start).
const MUSIC_STALE_MS = 8 * 60000;

// A remote job that has not reported for this long has stopped (the worker writes at every step and every 5% of a render).
const STALE_MS = Number(process.env.STUDIO_STALE_MINUTES || 20) * 60000;

const STEPS = [
  { id: 'capture', label: 'Reading your site' },
  { id: 'script', label: 'Writing the scripts' },
  { id: 'render', label: 'Rendering your videos' },
];

// Guided jobs (the Studio page) stop for the user between steps:
//   reading → style (brand kit) → brief (what to make, sizes) → screens → storyboard → editor (chat, live preview) → export
// job.stage is how far the user has got; job.status is 'waiting' whenever it is the user's turn.
const GUIDED_STEPS = [
  { id: 'capture', label: 'Reading your site' },
  { id: 'script', label: 'Writing the storyboard' },
  { id: 'render', label: 'Exporting your video' },
];
const SIZE_LABEL = { '16:9': 'Landscape 16:9', '9:16': 'Vertical 9:16', '1:1': 'Square 1:1', '4:5': 'Portrait 4:5' };
const httpError = (status, message) => Object.assign(new Error(message), { status });

class StudioJobs {
  /**
   * @param root      local folder for jobs (local runs and the worker's scratch space)
   * @param store     where job records and files live; defaults to a DiskStore at root
   * @param launcher  starts a worker for each run ({ start({ id, task, videoId, secretKey }) }); none = run in-process
   */
  constructor({ root, store, launcher = null, onChange = () => {} }) {
    this.root = root;
    this.store = store || new DiskStore(root);
    this.launcher = launcher;
    this.queue = [];
    this.running = null;
    this.secrets = new Map();
    this.onChange = onChange;
    this.waiting = []; // worker starts refused for lack of capacity, retried in order (see launch)
    this.timer = null;
  }

  /**
   * Start a worker. When the account is out of Fargate capacity, the start waits in a queue and is retried every 15 s
   * for up to 15 minutes (the job says it is waiting); anything else fails at once. Returns the worker, or null if
   * queued.
   */
  async launch(args) {
    try {
      return await this.launcher.start(args);
    } catch (error) {
      if (!error.capacity) throw error;
      console.warn('[studio] no Fargate capacity, queued', args.id, args.task, args.videoId || '');
      this.waiting.push({ ...args, since: Date.now() });
      await this.queued(args).catch(() => {});
      this.drainSoon();
      return null;
    }
  }

  drainSoon() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.drain().catch((e) => console.error('[studio] queue', e.message)), 15000);
    this.timer.unref?.();
  }

  async drain() {
    this.timer = null;
    while (this.waiting.length) {
      const next = this.waiting[0];
      if (Date.now() - next.since > 15 * 60000) {
        this.waiting.shift();
        await this.gaveUp(next, 'Studio is busy right now and couldn’t start in time. Try again in a few minutes.').catch(() => {});
        continue;
      }
      try {
        const worker = await this.launcher.start(next);
        this.waiting.shift();
        const job = await this.read(next.id);
        if (next.task !== 'video' && next.task !== 'music') {
          job.worker = worker;
          job.activity = 'Starting';
          await this.write(job);
        }
      } catch (error) {
        if (error.capacity) break;
        this.waiting.shift();
        await this.gaveUp(next, 'We could not start the video maker. Try again in a minute.').catch(() => {});
      }
    }
    if (this.waiting.length) this.drainSoon();
  }

  /** Tell the job its run is waiting for capacity. Parts and music report in their own files. */
  async queued(args) {
    if (args.task === 'music') return;
    const job = await this.read(args.id);
    if (args.task === 'video') {
      const v = job.videos.find((x) => x.id === args.videoId);
      if (v && !v.reportedAt) v.waiting = true;
    }
    job.activity = 'Waiting for a free renderer';
    await this.write(job);
  }

  async gaveUp(args, message) {
    if (args.task === 'music') return music.report(this.store, args.id, Number(args.videoId), { status: 'failed', error: message });
    if (args.task === 'video') {
      return this.store.writeFile(args.id, `parts/${args.videoId}.json`, Buffer.from(JSON.stringify({ ...(await this.read(args.id)).videos.find((v) => v.id === args.videoId), status: 'failed', error: message, reportedAt: new Date().toISOString() })));
    }
    const job = await this.read(args.id);
    Object.assign(job, { status: 'failed', error: message });
    job.steps.forEach((st) => {
      if (st.status === 'active' || st.status === 'pending') st.status = st.status === 'active' ? 'failed' : st.status;
    });
    await this.write(job);
  }

  dir(id) {
    return new DiskStore(this.root).dir(id);
  }

  read(id) {
    return this.store.read(id);
  }

  async write(job) {
    job.updatedAt = new Date().toISOString();
    await this.store.write(job);
    this.onChange(job);
    return job;
  }

  /** Local runs that were mid-way when the process stopped are marked failed (their credentials are gone); they can be retried. */
  async recover() {
    await this.store.init();
    if (this.launcher) return;
    for (const job of await this.store.all()) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'failed';
        job.error = 'The server restarted while this was running. Retry to continue from where it stopped.';
        await this.write(job);
      }
    }
  }

  /** A remote worker that stopped reporting (crashed, ran out of memory, was stopped) leaves its job failed, not stuck. */
  async fresh(job) {
    if (job.composing) job = await this.mergeMusic(job);
    if (job.parallel) return this.merge(job);
    if (!this.launcher || (job.status !== 'queued' && job.status !== 'running')) return job;
    if (Date.now() - Date.parse(job.updatedAt || job.createdAt) < STALE_MS) return job;
    job.status = 'failed';
    job.error = 'This stopped unexpectedly. Retry to continue from where it stopped.';
    job.steps.forEach((s) => {
      if (s.status === 'active') s.status = 'failed';
    });
    return this.write(job);
  }

  /**
   * A parallel export (one worker per size): each worker reports its video in parts/<videoId>.json and never writes
   * job.json. The newest part of each video is folded in here; once none is still working, the job is finished and
   * saved. A part that stops reporting for STALE_MS has stopped.
   */
  async merge(job) {
    let changed = false;
    for (const [i, video] of job.videos.entries()) {
      const raw = await this.store.readFile(job.id, `parts/${video.id}.json`).catch(() => null);
      const part = raw ? JSON.parse(raw.toString('utf8')) : null;
      if (part && (!video.reportedAt || part.reportedAt > video.reportedAt)) {
        job.videos[i] = part;
        changed = true;
      }
      const v = job.videos[i];
      const last = Date.parse(v.reportedAt || job.updatedAt || job.createdAt);
      if (!['done', 'failed'].includes(v.status) && Date.now() - last > STALE_MS) {
        Object.assign(v, { status: 'failed', error: 'This stopped unexpectedly. Export again to retry.' });
        changed = true;
      }
    }
    const open = job.videos.filter((v) => !['done', 'failed'].includes(v.status));
    const rendering = job.videos.find((v) => v.status === 'rendering');
    job.activity = open.length ? (rendering ? `Rendering the ${rendering.label.toLowerCase()} · ${rendering.progress || 0}%` : 'Checking every scene frame by frame') : job.activity;
    if (!open.length) {
      const failed = job.videos.find((v) => v.status === 'failed');
      job.parallel = false;
      job.status = failed ? 'failed' : 'done';
      job.error = failed ? failed.error || 'A video didn’t render. Export again to retry.' : null;
      job.activity = failed ? 'Stopped' : 'Ready';
      job.steps.forEach((s) => {
        if (s.id === 'render') s.status = failed ? 'failed' : 'done';
      });
      return this.write(job);
    }
    if (changed && job.status === 'queued') job.status = 'running';
    return job;
  }

  /**
   * A composed track reports in parts/music.json; once it has, it joins the job's tracks (or its error is shown). A track
   * the chat asked for starts playing in the video straight away, and the chat says so.
   */
  async mergeMusic(job) {
    const raw = await this.store.readFile(job.id, 'parts/music.json').catch(() => null);
    const part = raw ? JSON.parse(raw.toString('utf8')) : null;
    const { n, from, description } = job.composing;
    const say = (text) => from === 'chat' && (job.messages = [...(job.messages || []), { role: 'studio', text, at: new Date().toISOString() }].slice(-40));
    if (part?.n === n && part.status === 'done') {
      const track = { id: `gen-${n}`, n, file: part.file, description, bpm: part.bpm, duration: part.duration };
      job.tracks = [...(job.tracks || []), track];
      job.composing = null;
      job.musicError = null;
      if (from === 'chat' && job.kit && job.storyboard) {
        job.kit = { ...job.kit, music: track.id };
        Object.assign(job.storyboard, { music: track.id, track: track.file });
        for (const v of job.videos || []) if (v.status === 'done') v.outdated = true;
      }
      say('Your new track is ready and now plays in the video. Press play to hear it.');
    } else if (part?.n === n && part.status === 'failed') {
      job.composing = null;
      job.musicError = part.error;
      say(part.error);
    } else if (Date.now() - Date.parse(job.composing.startedAt) > MUSIC_STALE_MS) {
      job.composing = null;
      job.musicError = 'Composing took too long and was stopped. Try again.';
      say(job.musicError);
    } else return job;
    return this.write(job);
  }

  /** Compose a track for this video from the user's words (Style → Music, or the chat). Returns at once. */
  async requestMusic(userId, id, { description, from = 'style' }) {
    const { job } = await this.guidedJob(userId, id);
    if (job.composing) throw httpError(409, 'A track is already being composed.');
    if ((job.tracks || []).length >= MAX_TRACKS) throw httpError(400, `You can compose up to ${MAX_TRACKS} tracks for one video.`);
    // Every request gets a new number (failed ones too), and any earlier report is cleared, so an old result can't
    // be mistaken for this one.
    const n = (job.musicRequests || 0) + 1;
    job.musicRequests = n;
    await this.store.removeFile(id, 'parts/music.json').catch(() => {});
    job.composing = { n, from, description: String(description || '').trim().slice(0, 300), startedAt: new Date().toISOString() };
    job.musicError = null;
    await this.write(job);
    this.compose(id, n, job.composing.description).catch((error) => console.error('[studio] compose failed', id, error.message));
    return job;
  }

  /**
   * Lyria writes the track here (this process has the Google key); lining it up on the beat needs ffmpeg, so with
   * workers that happens in one (task 'music'), and locally right here.
   */
  async compose(id, n, description, { composeTrack = music.composeTrack } = {}) {
    let raw;
    try {
      raw = await composeTrack(description);
    } catch (error) {
      return music.report(this.store, id, n, { status: 'failed', error: music.musicError(error) });
    }
    if (!this.launcher) return music.alignInto({ store: this.store, id, n, raw, dir: path.join(this.root, '.music', id) });
    await this.store.writeFile(id, `music-src/gen-${n}`, raw);
    await this.launch({ id, task: 'music', videoId: String(n) }).catch((error) => music.report(this.store, id, n, { status: 'failed', error: `We could not start the composer. Try again in a minute. (${error.message})` }));
  }

  /** In a worker of a parallel export: check and render one video of the job. */
  async renderPart(id, videoId) {
    const job = await this.read(id);
    const video = job.videos.find((v) => v.id === videoId);
    if (!video) throw new Error(`Unknown video ${videoId}.`);
    try {
      await this.renderOne(job, video, { review: true });
    } catch (error) {
      Object.assign(video, { status: 'failed', error: friendly(error) });
      await this.write(job);
    }
    return video;
  }

  async list(userId, limit = 30) {
    return Promise.all((await this.store.list(userId, limit)).map((j) => this.fresh(j)));
  }

  async get(userId, id) {
    const job = await this.read(id);
    if (job.userId !== userId) throw Object.assign(new Error('Unknown job.'), { status: 404 });
    return this.fresh(job);
  }

  /**
   * @param reuseCapture  id of an earlier job of this user whose site capture this one starts from (no new capture)
   * @param compareWith   headings of an earlier capture: a fresh capture reports what's new on the site since then
   * @param source        'studio' (made in Studio) or 'autopilot'; autopilotId, angle and platform describe the latter
   */
  async create({ userId, url, formats, notes, login, reuseCapture, compareWith, source = 'studio', autopilotId = null, angle = null, platform = null }) {
    const id = crypto.randomUUID();
    const job = {
      id,
      userId,
      url,
      formats,
      notes: notes || '',
      source,
      autopilotId,
      angle,
      platform,
      compareWith: compareWith?.length ? compareWith.slice(0, 200) : undefined,
      withLogin: Boolean(login),
      status: 'queued',
      step: 'capture',
      steps: STEPS.map((s) => ({ ...s, status: 'pending' })),
      activity: 'Waiting to start',
      videos: [],
      createdAt: new Date().toISOString(),
    };
    job.updatedAt = job.createdAt;
    await this.store.create(job);
    if (reuseCapture) {
      await this.store.copyCapture(reuseCapture, id);
      job.reusedCapture = reuseCapture;
      job.steps[0].status = 'done';
      await this.write(job);
    }
    return this.enqueue(job, 'full', { login });
  }

  /**
   * Post images (no video): each slide rendered as a still in the brand captured from the site
   * (studio/remotion/post.jsx). Starts from an earlier capture when given one, else captures the site first.
   * slides: [{ kind: 'shot'|'cover'|'point'|'end', headline, body, shotId?, focus?, kicker?, index?, total? }]
   */
  async createImages({ userId, url, slides, size = 'square', reuseCapture, source = 'autopilot', autopilotId = null, platform = null, angle = null }) {
    const id = crypto.randomUUID();
    const job = {
      id,
      userId,
      url,
      kind: 'images',
      formats: [],
      notes: '',
      source,
      autopilotId,
      angle,
      platform,
      size,
      status: 'queued',
      step: 'capture',
      steps: [{ id: 'capture', label: 'Reading your site', status: 'pending' }, { id: 'render', label: 'Making the images', status: 'pending' }],
      activity: 'Waiting to start',
      videos: [],
      images: slides.slice(0, 16).map((slide, i) => ({ id: `img-${i + 1}`, slide, status: 'pending' })),
      createdAt: new Date().toISOString(),
    };
    job.updatedAt = job.createdAt;
    await this.store.create(job);
    if (reuseCapture) {
      await this.store.copyCapture(reuseCapture, id);
      job.reusedCapture = reuseCapture;
      job.steps[0].status = 'done';
      await this.write(job);
    }
    return this.enqueue(job, 'images');
  }

  async runImages(id) {
    const job = await this.read(id);
    const dir = this.dir(id);
    const captureDir = path.join(dir, 'capture');
    job.status = 'running';
    job.error = null;
    try {
      let capture = await fs.readFile(path.join(captureDir, 'capture.json'), 'utf8').then(JSON.parse).catch(() => null);
      if (!capture) {
        await this.step(job, 'capture', 'active', 'Opening your site');
        capture = await captureSite({ url: job.url, dir: captureDir, onStep: (s) => this.step(job, 'capture', 'active', s) });
      }
      job.brand = summary(capture);
      await this.step(job, 'capture', 'done');
      await this.step(job, 'render', 'active', 'Making the images');
      await fs.mkdir(path.join(dir, 'images'), { recursive: true });
      // Product-shot slides name what they are about (match, source); the screen is chosen now that the capture is
      // here, a different one for each slide while there are screens left.
      const used = new Set(job.images.map((i) => i.slide.shotId).filter(Boolean));
      for (const image of job.images) {
        if (image.slide.kind !== 'shot' || image.slide.shotId) continue;
        const shot = pickShot(capture, { text: image.slide.match || image.slide.headline, sourceUrl: image.slide.source }, used);
        if (shot) Object.assign(image.slide, shot);
        // No screen shows this: a carousel goes without its screen slide; a single image becomes a text card.
        else if (image.slide.optional) image.status = 'skipped';
        else Object.assign(image.slide, { kind: 'card', body: image.slide.fact || '' });
      }
      for (const image of job.images.filter((i) => i.status !== 'done' && i.status !== 'skipped')) {
        const outFile = path.join(dir, 'images', `${image.id}.png`);
        // A slide may carry its own size, so one job can make a week of posts for several platforms.
        const r = await renderPostImage({ jobsRoot: this.root, jobId: id, capture, slide: image.slide, size: image.slide.size || job.size, outFile });
        Object.assign(image, { status: 'done', file: `images/${image.id}.png`, width: r.width, height: r.height });
        await this.write(job);
      }
      await this.step(job, 'render', 'done', 'Ready');
      job.status = 'done';
      await this.write(job);
    } catch (error) {
      job.status = 'failed';
      job.error = friendly(error);
      job.steps.forEach((s) => {
        if (s.status === 'active') s.status = 'failed';
      });
      await this.write(job);
    }
  }

  /**
   * The newest finished job of this user for the same site, with its capture headings, or null. Used to reuse a
   * capture that is recent enough and to tell what changed on the site since an older one.
   */
  async latestCapture(userId, url) {
    const origin = originOf(url);
    for (const job of await this.list(userId, 30)) {
      if (job.status !== 'done' || !job.brand || originOf(job.url) !== origin) continue;
      const capture = await this.store.readCapture(job.id);
      if (!capture) continue;
      return { jobId: job.id, capturedAt: capture.capturedAt, withLogin: Boolean(capture.login?.ok), headings: headingsOf(capture) };
    }
    return null;
  }

  /** Wait for a job to finish (done or failed). Resolves with the job. */
  async waitFor(userId, id, { timeoutMs = 25 * 60000, everyMs = 5000 } = {}) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.get(userId, id);
      if (job.status === 'done' || job.status === 'failed') return job;
      if (Date.now() > until) throw new Error('The video took too long.');
      await new Promise((r) => setTimeout(r, everyMs));
    }
  }

  /** Start a run: in this process (local), or in a new worker (remote). Returns the job as saved. */
  async enqueue(job, task, { login, videoId } = {}) {
    if (!this.launcher) {
      if (login) this.secrets.set(job.id, login);
      this.queue.push({ id: job.id, task, args: { videoId } });
      this.pump();
      return job;
    }
    let secretKey;
    if (login) {
      const sealed = seal(login);
      await this.store.putSecret(job.id, sealed.sealed);
      secretKey = sealed.key;
    }
    try {
      job.worker = (await this.launch({ id: job.id, task, videoId, secretKey })) || job.worker;
      const latest = await this.read(job.id);
      if (latest.activity === 'Waiting for a free renderer') job.activity = latest.activity;
      return await this.write(job);
    } catch (error) {
      console.error('[studio] could not start a worker', job.id, error.message);
      if (login) await this.store.takeSecret(job.id).catch(() => {});
      job.status = 'failed';
      job.error = 'We could not start the video maker. Try again in a minute.';
      return this.write(job);
    }
  }

  async pump() {
    if (this.running || !this.queue.length) return;
    const next = this.queue.shift();
    this.running = next.id;
    try {
      if (next.task === 'full') await this.runJob(next.id);
      else if (next.task === 'capture') await this.runCapture(next.id);
      else if (next.task === 'images') await this.runImages(next.id);
      else if (next.task === 'rerender') await this.rerender(next.id, next.args.videoId);
    } catch (error) {
      console.error('[studio] job failed', next.id, error.message);
    } finally {
      this.running = null;
      setImmediate(() => this.pump());
    }
  }

  async step(job, id, status, activity) {
    const s = job.steps.find((x) => x.id === id);
    if (s) s.status = status;
    if (status === 'active') job.step = id;
    if (activity) job.activity = activity;
    await this.write(job);
  }

  async runJob(id) {
    const job = await this.read(id);
    const dir = this.dir(id);
    const captureDir = path.join(dir, 'capture');
    job.status = 'running';
    job.error = null;
    try {
      // 1. capture (skipped on retry when it already exists)
      let capture = await fs.readFile(path.join(captureDir, 'capture.json'), 'utf8').then(JSON.parse).catch(() => null);
      if (!capture) {
        await this.step(job, 'capture', 'active', 'Opening your site');
        const login = this.secrets.get(id);
        try {
          capture = await captureSite({ url: job.url, login, dir: captureDir, onStep: (s) => this.step(job, 'capture', 'active', s) });
        } finally {
          this.secrets.delete(id);
        }
      }
      job.brand = summary(capture);
      if (job.compareWith && !job.whatsNew) {
        const before = new Set(job.compareWith);
        job.whatsNew = headingsOf(capture).filter((h) => !before.has(h)).slice(0, 6);
      }
      if (capture.login && !capture.login.ok) job.warning = `We couldn't sign in, so these videos use your public pages only. ${capture.login.error || ''}`.trim();
      await this.step(job, 'capture', 'done');

      // 2. script
      let plans = await fs.readFile(path.join(dir, 'plans.json'), 'utf8').then(JSON.parse).catch(() => null);
      // A guided export arrives with its videos (the user's storyboard at each size) already set.
      if (!plans && !job.videos.length) {
        await this.step(job, 'script', 'active', 'Writing the scripts');
        const result = await planVideos({ capture, dir: captureDir, formats: job.formats, notes: notesFor(job) });
        plans = result.videos;
        await fs.writeFile(path.join(dir, 'plans.json'), JSON.stringify(plans, null, 2));
        job.usage = [...(job.usage || []), ...result.usage];
      }
      if (!job.videos.length) {
        job.videos = plans.map((plan) => ({ id: crypto.randomUUID(), format: plan.format, label: FORMATS[plan.format].label, title: plan.title, plan, status: 'pending', version: 0 }));
      }
      await this.step(job, 'script', 'done');

      // 3. check every video at once (mostly waiting on the model), then render them one by one (each uses every core)
      const todo = job.videos.filter((v) => v.status !== 'done');
      await this.step(job, 'render', 'active', 'Checking every scene frame by frame');
      const kitted = applyKit(capture, job.kit, buildPalette);
      await Promise.all(todo.filter((v) => !v.checked).map((v) => this.check(job, v, kitted)));
      await this.write(job);
      for (const video of todo) await this.renderOne(job, video, { review: true });
      await this.step(job, 'render', 'done', 'Ready');
      job.status = 'done';
      await this.write(job);
    } catch (error) {
      job.status = 'failed';
      job.error = friendly(error);
      job.steps.forEach((s) => {
        if (s.status === 'active') s.status = 'failed';
      });
      await this.write(job);
    }
  }


  // ─── guided Studio ─────────────────────────────────────────────────────

  /** A guided job: read the site, then wait for the user at each step (see GUIDED_STEPS). */
  async createGuided({ userId, url, login }) {
    const id = crypto.randomUUID();
    const job = {
      id,
      userId,
      url,
      guided: true,
      formats: [],
      notes: '',
      source: 'studio',
      withLogin: Boolean(login),
      status: 'queued',
      stage: 'reading',
      step: 'capture',
      steps: GUIDED_STEPS.map((s) => ({ ...s, status: 'pending' })),
      activity: 'Waiting to start',
      videos: [],
      messages: [],
      createdAt: new Date().toISOString(),
    };
    job.updatedAt = job.createdAt;
    await this.store.create(job);
    return this.enqueue(job, 'capture', { login });
  }

  /** Read the site (unless already read), set the brand kit Studio found and the video types it can make. */
  async runCapture(id) {
    const job = await this.read(id);
    const captureDir = path.join(this.dir(id), 'capture');
    job.status = 'running';
    job.error = null;
    try {
      let capture = await fs.readFile(path.join(captureDir, 'capture.json'), 'utf8').then(JSON.parse).catch(() => null);
      if (!capture) {
        await this.step(job, 'capture', 'active', 'Opening your site');
        const login = this.secrets.get(id);
        try {
          capture = await captureSite({ url: job.url, login, dir: captureDir, onStep: (s) => this.step(job, 'capture', 'active', s) });
        } finally {
          this.secrets.delete(id);
        }
      }
      job.brand = summary(capture);
      job.warning = capture.login && !capture.login.ok ? `We couldn't sign in, so only your public pages are here. ${capture.login.error || ''}`.trim() : null;
      if (!job.kit) job.kit = defaultKit(capture);
      if (!job.options?.length) {
        job.activity = 'Thinking about what to make';
        await this.write(job);
        const { options, usage } = await briefFor(capture);
        job.options = options;
        if (usage) job.usage = [...(job.usage || []), usage];
      }
      await this.step(job, 'capture', 'done', 'Read your site');
      job.stage = job.stage === 'reading' ? 'style' : job.stage;
      job.status = 'waiting';
      await this.write(job);
    } catch (error) {
      job.status = 'failed';
      job.error = friendly(error);
      job.steps.forEach((s) => {
        if (s.status === 'active') s.status = 'failed';
      });
      await this.write(job);
    }
  }

  async guidedJob(userId, id, { idle = true } = {}) {
    const job = await this.get(userId, id);
    if (!job.guided) throw httpError(400, 'This job is not a guided video.');
    if (idle && (job.status === 'running' || job.status === 'queued')) throw httpError(409, 'Wait for Studio to finish what it is doing.');
    const capture = await this.store.readCapture(id);
    if (!capture) throw httpError(409, 'Studio is still reading your site.');
    return { job, capture };
  }

  /** The brand, screens and elements the browser needs to play the storyboard live (assets are signed separately). */
  async preview(userId, id) {
    const job = await this.get(userId, id);
    const capture = await this.store.readCapture(id);
    if (!capture) throw httpError(409, 'Studio is still reading your site.');
    const { brandFrom } = require('./render.cjs');
    return { brand: brandFrom(capture, null), kit: job.kit || defaultKit(capture) };
  }

  /** Sign in to the product and read the site again, adding the screens behind the login. */
  async signin(userId, id, login) {
    const { job } = await this.guidedJob(userId, id);
    await this.store.removeFile(id, 'capture/capture.json');
    job.withLogin = true;
    job.status = 'queued';
    job.error = null;
    job.steps[0].status = 'pending';
    job.activity = 'Signing in to your product';
    await this.write(job);
    return this.enqueue(job, 'capture', { login });
  }

  /** A screenshot the user uploads: added to the capture as a product screen (shown whole, no elements to zoom into). */
  async addScreen(userId, id, body, name) {
    const { job, capture } = await this.guidedJob(userId, id);
    const uploads = (capture.appShots || []).filter((s) => s.kind === 'upload');
    const info = checkUpload(body, uploads.length);
    const n = Math.max(0, ...uploads.map((s) => Number(s.id.split('-')[1]) || 0)) + 1;
    const file = `uploads/upload-${n}.${info.ext}`;
    await this.store.writeFile(id, `capture/${file}`, body);
    const title = String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim().slice(0, 60) || `Your screenshot ${n}`;
    // Captured screens are measured in CSS pixels at 1600 wide; a Retina screenshot is laid out on the same scale.
    const scale = info.width > 1600 ? 1600 / info.width : 1;
    const shot = { id: `upload-${n}`, file, thumb: file, width: Math.round(info.width * scale), height: Math.round(info.height * scale), kind: 'upload', page: 'upload', title, elements: [] };
    capture.appShots = [shot, ...(capture.appShots || [])];
    await this.store.writeFile(id, 'capture/capture.json', Buffer.from(JSON.stringify(capture, null, 2)));
    job.brand = summary(capture);
    if (job.screens) job.screens = [shot.id, ...job.screens];
    return this.write(job);
  }

  /** The user's answers (kit, brief, screens): write the storyboard. Planning runs here, not in a worker. */
  async storyboard(userId, id, { kit, brief, screens }) {
    const { job, capture } = await this.guidedJob(userId, id);
    job.kit = cleanKit(kit, capture, trackIds(job));
    const option = (job.options || []).find((o) => o.id === brief?.option) || null;
    const custom = String(brief?.custom || '').trim().slice(0, 500);
    if (!option && !custom) throw httpError(400, 'Pick what kind of video to make.');
    const sizes = SIZES.filter((s) => (brief?.sizes || []).includes(s));
    if (!sizes.length) throw httpError(400, 'Pick at least one size.');
    const all = new Set([...(capture.appShots || []), ...capture.shots].map((s) => s.id));
    const picked = [...new Set((screens || []).filter((s) => all.has(s)))];
    if (!picked.length) throw httpError(400, 'Pick at least one screen to show.');
    job.brief = { option: option?.id || 'other', custom, sizes, length: brief?.length === 'short' ? 'short' : 'standard' };
    job.screens = picked;
    job.storyboard = null;
    job.stage = 'storyboard';
    job.status = 'running';
    job.error = null;
    await this.step(job, 'script', 'active', 'Writing the storyboard');
    this.planning(id, capture, option).catch((error) => console.error('[studio] storyboard failed', id, error.message));
    return job;
  }

  async planning(id, capture, option) {
    const job = await this.read(id);
    try {
      const { plan, usage } = await planStoryboard({
        capture: { ...capture, siteName: job.kit.name || capture.siteName },
        read: (rel) => this.store.readFile(id, `capture/${rel}`),
        brief: job.brief,
        option,
        screens: job.screens,
      });
      job.storyboard = { ...plan, pace: job.kit.rhythm, music: job.kit.music, motion: job.kit.motion };
      job.usage = [...(job.usage || []), ...usage];
      job.status = 'waiting';
      await this.step(job, 'script', 'done', 'Storyboard ready');
    } catch (error) {
      job.status = 'waiting';
      job.error = `We couldn't write the storyboard. ${friendly(error)}`;
      await this.step(job, 'script', 'failed');
    }
  }

  /** Apply the browser's storyboard and kit (checked like a planned one). */
  apply(job, capture, { scenes, kit }) {
    if (!job.storyboard) throw httpError(409, 'There is no storyboard yet.');
    if (kit) job.kit = cleanKit(kit, capture, trackIds(job));
    if (scenes) {
      const checked = checkScenes(scenes, job.storyboard.format, job.storyboard.title, capture);
      if (checked.problems) throw httpError(400, checked.problems[0]);
      job.storyboard = { ...job.storyboard, scenes: checked.scenes };
    }
    job.storyboard.pace = job.kit.rhythm;
    job.storyboard.music = job.kit.music;
    job.storyboard.motion = job.kit.motion;
    job.storyboard.track = (job.tracks || []).find((t) => t.id === job.kit.music)?.file;
    this.voiceUp(job);
    const sig = JSON.stringify([job.storyboard, job.kit]);
    for (const v of job.videos) v.outdated = v.status === 'done' && v.made !== sig;
  }

  /**
   * The storyboard's voiceover from what has been recorded: each scene line with its file and length. A line that
   * changed (or a scene without one) leaves the voice out of date until it is recorded again.
   */
  voiceUp(job) {
    const name = job.kit?.voice;
    if (!name || name === 'off' || !job.storyboard) {
      if (job.storyboard) job.storyboard.voice = null;
      job.voiceStale = false;
      return;
    }
    const recorded = job.voiceLines || {};
    const lines = job.storyboard.scenes.filter((s) => s.say).map((s) => ({ text: s.say, file: voice.fileFor(name, s.say), frames: recorded[voice.fileFor(name, s.say)] }));
    job.storyboard.voice = { name, lines: lines.filter((l) => l.frames) };
    job.voiceStale = job.storyboard.scenes.some((s) => !s.say) || lines.some((l) => !l.frames);
  }

  /** Write any missing lines and voice every line not recorded yet (in this voice), in parallel. Takes ~10 s. */
  async recordVoice(userId, id, { voice: name, kit, scenes } = {}) {
    const { job, capture } = await this.guidedJob(userId, id);
    this.apply(job, capture, { scenes, kit: kit || (name ? { ...job.kit, voice: name } : undefined) });
    if (name) job.kit = cleanKit({ ...job.kit, voice: name }, capture, trackIds(job));
    if (job.kit.voice === 'off') {
      this.voiceUp(job);
      return this.write(job);
    }
    const lined = await voice.writeLines({ capture, plan: job.storyboard, name: job.kit.name || capture.siteName });
    const checked = checkScenes(lined, job.storyboard.format, job.storyboard.title, capture);
    if (checked.problems) throw httpError(400, checked.problems[0]);
    job.storyboard.scenes = checked.scenes;
    const recorded = { ...(job.voiceLines || {}) };
    const todo = [...new Set(job.storyboard.scenes.filter((s) => s.say).map((s) => s.say))].filter((text) => !recorded[voice.fileFor(job.kit.voice, text)]);
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(
        todo.slice(i, i + 4).map(async (text) => {
          const file = voice.fileFor(job.kit.voice, text);
          const { audio, seconds } = await voice.speak(text, job.kit.voice);
          await this.store.writeFile(id, `capture/${file}`, audio);
          recorded[file] = Math.ceil(seconds * 30);
        }),
      );
    }
    job.voiceLines = recorded;
    this.apply(job, capture, {});
    return this.write(job);
  }

  /** Save the storyboard and open the editor ("Create video"), or save edits made in the editor. */
  async saveStoryboard(userId, id, body) {
    const { job, capture } = await this.guidedJob(userId, id);
    this.apply(job, capture, body);
    job.stage = 'editor';
    job.error = null;
    return this.write(job);
  }

  /** A chat message: the storyboard (and kit) change and the preview updates; exports are marked out of date. */
  async chat(userId, id, { message, scenes, kit }) {
    const { job, capture } = await this.guidedJob(userId, id);
    const text = String(message || '').trim().slice(0, 600);
    if (!text) throw httpError(400, 'Say what to change.');
    this.apply(job, capture, { scenes, kit });
    const history = job.messages || [];
    const result = await editStoryboard({ capture, plan: job.storyboard, kit: job.kit, message: text, history, tracks: job.tracks || [] });
    job.kit = cleanKit({ ...result.kit, rhythm: result.plan.pace || job.kit.rhythm }, capture, trackIds(job));
    // Never let the reply claim music that isn't there (a track not composed yet is refused by cleanKit).
    if (result.kit?.music && result.kit.music !== job.kit.music) result.reply = `${result.reply} Note: the music is unchanged, because that track doesn't exist yet. Ask me to compose one.`;
    job.storyboard = { ...result.plan, pace: job.kit.rhythm, music: job.kit.music, motion: job.kit.motion };
    job.usage = [...(job.usage || []), ...result.usage];
    const at = new Date().toISOString();
    job.messages = [...history, { role: 'user', text, at }, { role: 'studio', text: result.reply, at }].slice(-40);
    this.apply(job, capture, {});
    await this.write(job);
    // With a voice on, changed lines are voiced again straight away, so the preview speaks the new script.
    if (job.kit.voice !== 'off' && job.voiceStale) {
      try {
        await this.recordVoice(userId, id, {});
      } catch (error) {
        const latest = await this.read(id);
        latest.messages.push({ role: 'studio', text: `The voiceover couldn't be updated: ${error.message}`, at });
        await this.write(latest);
      }
    }
    // "Make some music": the chat asks for a new track instead of a preset.
    if (result.compose && !(await this.read(id)).composing) {
      try {
        return await this.requestMusic(userId, id, { description: result.compose, from: 'chat' });
      } catch (error) {
        const latest = await this.read(id);
        latest.messages.push({ role: 'studio', text: error.message, at });
        return this.write(latest);
      }
    }
    return this.read(id);
  }

  /** Render the storyboard at every size the user picked. A size rendered before keeps its video. */
  async exportVideos(userId, id, body = {}) {
    const { job, capture } = await this.guidedJob(userId, id);
    this.apply(job, capture, body);
    const sig = JSON.stringify([job.storyboard, job.kit]);
    job.videos = job.brief.sizes.map((size) => {
      const plan = { ...job.storyboard, size };
      const old = job.videos.find((v) => v.size === size);
      if (old) return { ...old, plan, status: 'pending', checked: false, progress: 0, fixes: [], outdated: false, made: sig, error: undefined, reportedAt: undefined };
      return { id: crypto.randomUUID(), format: plan.format, size, label: SIZE_LABEL[size], title: plan.title, plan, status: 'pending', version: 0, made: sig };
    });
    job.stage = 'editor';
    job.status = 'queued';
    job.error = null;
    job.steps.forEach((s) => {
      if (s.id === 'render') s.status = 'pending';
    });
    job.activity = 'Starting the export';
    // With workers, each size renders on its own machine at the same time (see merge); locally they render in turn.
    if (this.launcher && job.videos.length > 1) {
      job.parallel = true;
      job.status = 'running';
      job.steps.forEach((s) => {
        if (s.id === 'render') s.status = 'active';
      });
      for (const v of job.videos) await this.store.removeFile(id, `parts/${v.id}.json`).catch(() => {});
      await this.write(job);
      try {
        const workers = [];
        for (const v of job.videos) workers.push(await this.launch({ id, task: 'video', videoId: v.id }));
        job.worker = workers.find(Boolean) || null;
        if (workers.some((w) => !w)) job.activity = 'Waiting for a free renderer';
      } catch (error) {
        console.error('[studio] could not start export workers', id, error.message);
        Object.assign(job, { parallel: false, status: 'failed', error: 'We could not start the video maker. Try again in a minute.' });
      }
      return this.write(job);
    }
    await this.write(job);
    return this.enqueue(job, 'full');
  }

  /** Render one still per scene and let the model fix cut-off text or weak close-ups. Never blocks the render. */
  async check(job, video, capture) {
    video.status = 'checking';
    try {
      const checked = await reviewPlan({ jobsRoot: this.root, jobId: job.id, capture, plan: video.plan, dir: path.join(this.dir(job.id), 'review', video.id) });
      video.plan = checked.plan;
      video.fixes = checked.applied;
    } catch (error) {
      video.fixes = [];
      console.warn('[studio] visual check skipped:', error.message);
    }
    video.checked = true;
    video.status = 'pending';
  }

  async renderOne(job, video, { review }) {
    const dir = this.dir(job.id);
    const capture = applyKit(JSON.parse(await fs.readFile(path.join(dir, 'capture/capture.json'), 'utf8')), job.kit, buildPalette);
    if (review && !video.checked) {
      job.activity = `Checking the ${video.label.toLowerCase()} frame by frame`;
      await this.write(job);
      await this.check(job, video, capture);
    }
    video.status = 'rendering';
    video.progress = 0;
    job.activity = `Rendering the ${video.label.toLowerCase()}`;
    await this.write(job);
    const version = (video.version || 0) + 1;
    const file = path.join(dir, 'videos', `${video.id}-v${version}.mp4`);
    let last = 0;
    const result = await renderVideo({
      jobsRoot: this.root,
      jobId: job.id,
      capture,
      plan: video.plan,
      outFile: file,
      onProgress: (p) => {
        if (p - last >= 0.05 || p === 1) {
          last = p;
          video.progress = Math.round(p * 100);
          this.write(job).catch(() => {});
        }
      },
    });
    // Thumbnail: the reveal or first focus scene once settled, else the title.
    const t = timeline(video.plan);
    const pick = t.items.find((i) => i.scene.type === 'reveal') || t.items.find((i) => i.scene.type === 'focus') || t.items[0];
    const stills = await renderStills({ jobsRoot: this.root, jobId: job.id, capture, plan: video.plan, frames: [pick.from + Math.min(pick.dur - 10, 120)], dir: path.join(dir, 'videos'), scale: 0.5 });
    const thumb = `${video.id}-v${version}.jpg`;
    await fs.rename(stills[0].file, path.join(dir, 'videos', thumb));
    // Guided videos also come as a GIF, about 640 px on the long side of a landscape video.
    let gif = null;
    if (job.guided) {
      gif = `${video.id}-v${version}.gif`;
      const width = result.width > result.height ? 640 : result.width === result.height ? 480 : result.height / result.width > 1.5 ? 360 : 432;
      await makeGif(file, path.join(dir, 'videos', gif), width).catch((error) => {
        console.warn('[studio] GIF skipped:', error.message);
        gif = null;
      });
    }
    for (const old of [video.file, video.gif]) if (old) await fs.rm(path.join(dir, 'videos', old), { force: true }).catch(() => {});
    Object.assign(video, { status: 'done', progress: 100, version, file: path.basename(file), thumb, gif, duration: result.duration, width: result.width, height: result.height, renderedAt: new Date().toISOString() });
    await this.write(job);
  }

  /** Apply edited scene text to one video and render it again (no new capture or script). */
  async edit(userId, id, videoId, scenes) {
    const job = await this.get(userId, id);
    const video = job.videos.find((v) => v.id === videoId);
    if (!video) throw Object.assign(new Error('Unknown video.'), { status: 404 });
    if (job.status === 'running' || job.status === 'queued') throw Object.assign(new Error('This job is still running.'), { status: 409 });
    if (!Array.isArray(scenes) || scenes.length !== video.plan.scenes.length) throw Object.assign(new Error('Send every scene.'), { status: 400 });
    const next = scenes.map((s, i) => {
      const merged = { ...video.plan.scenes[i], ...s, type: video.plan.scenes[i].type };
      const parsed = Scene.safeParse(merged);
      if (!parsed.success) throw Object.assign(new Error(`Scene ${i + 1}: ${parsed.error.issues[0].message}`), { status: 400 });
      return { ...parsed.data, progress: video.plan.scenes[i].progress, step: video.plan.scenes[i].step };
    });
    video.plan = { ...video.plan, scenes: next };
    video.status = 'pending';
    job.status = 'queued';
    job.error = null;
    job.activity = `Re-rendering the ${video.label.toLowerCase()}`;
    await this.write(job);
    return this.enqueue(job, 'rerender', { videoId });
  }

  async rerender(id, videoId) {
    const job = await this.read(id);
    const video = job.videos.find((v) => v.id === videoId);
    job.status = 'running';
    try {
      await this.renderOne(job, video, { review: false });
      job.status = 'done';
      job.activity = 'Ready';
    } catch (error) {
      job.status = 'failed';
      video.status = 'failed';
      job.error = friendly(error);
    }
    await this.write(job);
  }

  async retry(userId, id, login) {
    const job = await this.get(userId, id);
    if (job.status === 'running' || job.status === 'queued') return job;
    job.status = 'queued';
    job.error = null;
    job.steps.forEach((s) => {
      if (s.status !== 'done') s.status = 'pending';
    });
    await this.write(job);
    const task = job.kind === 'images' ? 'images' : job.guided && !job.videos.length ? 'capture' : 'full';
    return this.enqueue(job, task, { login });
  }

  async remove(userId, id) {
    const job = await this.get(userId, id);
    const busy = this.launcher ? job.status === 'running' || job.status === 'queued' : this.running === id;
    if (busy) throw Object.assign(new Error('Wait for this job to finish first.'), { status: 409 });
    this.queue = this.queue.filter((q) => q.id !== id);
    await this.store.remove(job);
  }
}

const trackIds = (job) => (job.tracks || []).map((t) => t.id);

const originOf = (url) => {
  try {
    return new URL(url).origin.replace('://www.', '://');
  } catch {
    return '';
  }
};

/** What a page says it is about: its main headline and section titles (normalised), across the captured pages. */
function headingsOf(capture) {
  const out = new Set();
  for (const page of capture.pages || []) {
    for (const text of [page.copy?.h1, ...(page.copy?.sections || []).map((s) => s.title)]) {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (clean.length >= 8 && clean.length <= 140) out.add(clean.toLowerCase());
    }
  }
  return [...out];
}

/** The planner's notes: the user's (or the autopilot's angle), and what's new on the site since the last capture. */
function notesFor(job) {
  const parts = [job.notes].filter(Boolean);
  if (job.whatsNew?.length) parts.push(`New on the site since the last video: ${job.whatsNew.map((h) => `"${h}"`).join('; ')}. If one of these is a real product change, make it the subject.`);
  return parts.join('\n').slice(0, 1200);
}

const title = (name) => (name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : null);

/** What the UI shows as the brand kit. */
function summary(capture) {
  return {
    name: capture.siteName,
    url: capture.finalUrl || capture.url,
    palette: capture.palette,
    fonts: { display: title(capture.fonts?.display?.family), body: title(capture.fonts?.body?.family) },
    logo: capture.logo?.file ? `capture/${capture.logo.file}` : null,
    logoText: capture.logo?.kind === 'text' ? capture.logo.text : null,
    icon: capture.icon?.file ? `capture/${capture.icon.file}` : null,
    screens: [...(capture.appShots || []), ...capture.shots].slice(0, 24).map((s) => ({ id: s.id, kind: s.kind, page: s.page, title: s.title, width: s.width, height: s.height, thumb: `capture/${s.thumb || s.file}` })),
    signedIn: Boolean(capture.login?.ok),
  };
}

function friendly(error) {
  const m = error.message || String(error);
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/.test(m)) return "We couldn't reach that website. Check the address and try again.";
  if (/Timeout|timed out/i.test(m)) return 'The website took too long to load. Try again, or try a different page of the site.';
  if (/OPENROUTER|Model request failed|401|402/.test(m)) return 'The AI service is unavailable right now. Try again in a minute.';
  return m.length > 240 ? `${m.slice(0, 240)}…` : m;
}

module.exports = { StudioJobs, FORMATS, headingsOf, notesFor };
