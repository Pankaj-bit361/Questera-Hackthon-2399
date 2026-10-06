// One Studio run in its own Fargate task (or a local child process with STUDIO_RUNNER=process).
//
// Pulls the job from S3 into scratch space, runs it with the same code as local Studio (capture → script → check →
// render), pushes every change back as it happens so the UI can follow along, then exits.
//
//   STUDIO_JOB_ID, STUDIO_TASK (full | capture | rerender | images), STUDIO_VIDEO_ID (rerender), STUDIO_SECRET_KEY (with a login)
//   STUDIO_BUCKET, STUDIO_AWS_REGION, OPENROUTER_API_KEY, MOTION_LLM_MODEL

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StudioJobs } = require('./jobs.cjs');
const { unseal } = require('./store.cjs');
const { storeFromEnv } = require('./launch.cjs');

const MAX_MINUTES = Number(process.env.STUDIO_MAX_MINUTES || 40);

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Keeps the bucket in step with the local job folder. Each sync uploads new or changed files first and job.json last,
 * so the record never points at a file that isn't there yet. Videos are kept only while job.json refers to them (a
 * re-render replaces the old version); visual-check stills and half-written files never leave the worker.
 */
class Mirror {
  /** part: the video id when this worker renders one video of a parallel export (it reports in parts/, not job.json). */
  constructor(store, id, dir, { part = null } = {}) {
    Object.assign(this, { store, id, dir, part });
    this.sent = new Map();
    this.remote = new Set();
    this.next = null;
    this.running = null;
  }

  async pull() {
    for (const { key } of await this.store.keys(`jobs/${this.id}/`)) {
      const rel = key.slice(`jobs/${this.id}/`.length);
      this.remote.add(rel);
      if (rel.startsWith('videos/')) continue;
      const file = path.join(this.dir, rel);
      await this.store.download(key, file);
      const st = await fs.stat(file);
      this.sent.set(rel, `${st.size}:${st.mtimeMs}`);
    }
    await fs.mkdir(path.join(this.dir, 'videos'), { recursive: true });
  }

  async sync(job) {
    const keep = new Set(job.videos.flatMap((v) => [v.file, v.thumb, v.gif]).filter(Boolean).map((f) => `videos/${f}`));
    // A part worker owns only its own video's files; the other workers own the rest.
    const mine = (rel) => !this.part || !rel.startsWith('videos/') || rel.startsWith(`videos/${this.part}-`);
    for (const rel of await walk(this.dir)) {
      if (rel === 'job.json' || rel.startsWith('review/') || rel.startsWith('parts/') || /\.(tmp|raw\.mp4)$/.test(rel)) continue;
      if (this.part && !rel.startsWith('videos/')) continue;
      if (rel.startsWith('videos/') && (!keep.has(rel) || !mine(rel))) continue;
      const st = await fs.stat(path.join(this.dir, rel)).catch(() => null);
      if (!st) continue;
      const sig = `${st.size}:${st.mtimeMs}`;
      if (this.sent.get(rel) === sig) continue;
      await this.store.upload(`jobs/${this.id}/${rel}`, path.join(this.dir, rel));
      this.sent.set(rel, sig);
      this.remote.add(rel);
    }
    if (this.part) {
      const video = job.videos.find((v) => v.id === this.part);
      await this.store.writeFile(this.id, `parts/${this.part}.json`, Buffer.from(JSON.stringify({ ...video, reportedAt: new Date().toISOString() })));
    } else await this.store.write(job);
    const gone = [...this.remote].filter((rel) => rel.startsWith('videos/') && !keep.has(rel) && mine(rel));
    if (gone.length) {
      await this.store.del(gone.map((rel) => `jobs/${this.id}/${rel}`));
      gone.forEach((rel) => this.remote.delete(rel));
    }
  }

  /** Called on every job change; changes that arrive mid-sync are folded into one more sync. */
  schedule(job) {
    this.next = JSON.stringify(job);
    if (!this.running) this.running = this.loop();
  }

  async loop() {
    while (this.next) {
      const job = JSON.parse(this.next);
      this.next = null;
      try {
        await this.sync(job);
      } catch (error) {
        console.warn('[studio] sync failed, will retry with the next change:', error.message);
        this.next ||= JSON.stringify(job);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    this.running = null;
  }

  async flush() {
    while (this.running) await this.running;
  }
}

async function main() {
  const id = process.env.STUDIO_JOB_ID;
  const task = process.env.STUDIO_TASK || 'full';
  const secretKey = process.env.STUDIO_SECRET_KEY;
  delete process.env.STUDIO_SECRET_KEY;
  if (!id) throw new Error('STUDIO_JOB_ID is required.');

  const store = storeFromEnv();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-'));
  // Lining up a composed track (the API wrote Lyria's audio to music-src/): no job files needed, and it reports in
  // parts/music.json rather than job.json.
  if (task === 'music') {
    const music = require('./music.cjs');
    const n = Number(process.env.STUDIO_VIDEO_ID);
    const raw = await store.readFile(id, `music-src/gen-${n}`);
    if (raw) await music.alignInto({ store, id, n, raw, dir: root });
    else await music.report(store, id, n, { status: 'failed', error: 'We couldn’t compose that track. Try again.' });
    await fs.rm(root, { recursive: true, force: true });
    process.exit(0);
  }
  const mirror = new Mirror(store, id, path.join(root, id), { part: task === 'video' ? process.env.STUDIO_VIDEO_ID : null });
  await mirror.pull();
  const t0 = Date.now();
  let said = '';
  const jobs = new StudioJobs({
    root,
    onChange: (job) => {
      if (job.activity !== said) console.log(`[studio] +${((Date.now() - t0) / 1000).toFixed(1)}s ${(said = job.activity)}`);
      mirror.schedule(job);
    },
  });

  if (secretKey) {
    const sealed = await store.takeSecret(id);
    if (sealed) jobs.secrets.set(id, unseal(sealed, secretKey));
  }

  const stop = setTimeout(async () => {
    console.error(`[studio] ${id} ran longer than ${MAX_MINUTES} minutes; stopping`);
    const job = await jobs.read(id);
    const part = task === 'video' && job.videos.find((v) => v.id === process.env.STUDIO_VIDEO_ID);
    if (part) Object.assign(part, { status: 'failed', error: 'This took too long and was stopped. Export again to retry.' });
    else job.status = 'failed';
    job.error = 'This took too long and was stopped. Retry to continue from where it stopped.';
    job.steps.forEach((s) => {
      if (s.status === 'active') s.status = 'failed';
    });
    await jobs.write(job);
    await mirror.flush();
    process.exit(1);
  }, MAX_MINUTES * 60000);

  console.log(`[studio] ${task} ${id}`);
  if (task === 'rerender') await jobs.rerender(id, process.env.STUDIO_VIDEO_ID);
  else if (task === 'images') await jobs.runImages(id);
  else if (task === 'capture') await jobs.runCapture(id);
  else if (task === 'video') await jobs.renderPart(id, process.env.STUDIO_VIDEO_ID);
  else await jobs.runJob(id);
  await mirror.flush();
  clearTimeout(stop);
  const job = await jobs.read(id);
  if (task === 'video') {
    const video = job.videos.find((v) => v.id === process.env.STUDIO_VIDEO_ID);
    console.log(`[studio] ${id} video ${video?.label} ${video?.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
    await fs.rm(root, { recursive: true, force: true });
    process.exit(video?.status === 'done' ? 0 : 1);
  }
  console.log(`[studio] ${id} ${job.status} in ${Math.round((Date.now() - t0) / 1000)}s${job.error ? `: ${job.error}` : ''}`);
  await fs.rm(root, { recursive: true, force: true });
  process.exit(job.status === 'done' || job.status === 'waiting' ? 0 : 1);
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('[studio] worker failed', error);
    // Leave the job retryable instead of waiting for it to be noticed as stale.
    try {
      const store = storeFromEnv();
      const job = await store.read(process.env.STUDIO_JOB_ID);
      // One video of a parallel export reports only its own part; the job record belongs to the API.
      if (process.env.STUDIO_TASK === 'video') {
        const video = job.videos.find((v) => v.id === process.env.STUDIO_VIDEO_ID);
        if (video) await store.writeFile(job.id, `parts/${video.id}.json`, Buffer.from(JSON.stringify({ ...video, status: 'failed', error: 'Something went wrong while making this video. Export again to retry.', reportedAt: new Date().toISOString() })));
        process.exit(1);
      }
      job.status = 'failed';
      job.error = 'Something went wrong while making these videos. Retry to continue from where it stopped.';
      job.updatedAt = new Date().toISOString();
      await store.write(job);
    } catch {
      /* nothing more to do */
    }
    process.exit(1);
  });
}

module.exports = { Mirror };
