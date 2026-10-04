// Music composed for one video (the Style step's "Compose a track", or "make some music" in the chat).
//
//   composeTrack(description)   Google Lyria writes an instrumental (about a minute) from the user's words
//   alignTrack(input, output)   measures its tempo, stretches it to exactly 120 bpm and trims it to start on a beat,
//                               so scene cuts (whole beats at 120 bpm, timing.cjs) land on the music like the presets
//
// Runs where ffmpeg is: the worker (Fargate), or this process for local Studio. The result is a 48 kHz WAV in the job's
// capture folder, so the live preview and the export play the same file.

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const MODEL = process.env.STUDIO_MUSIC_MODEL || 'lyria-3.5';
const BPM = 120;
const RATE = 22050;
const HOP = 128;

/** What Lyria is asked for. Musical words only: brand and product names trip its filters and add nothing. */
function musicPrompt(description) {
  const words = String(description || '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'Upbeat modern electronic with punchy drums, warm synth pads and a bright plucked melody';
  return `Instrumental only, no vocals. ${words}. Steady 120 BPM in 4/4 from start to finish with a clear pulse on every beat, a short soft intro, then a full groove, polished and confident.`;
}

const FALLBACK = 'An upbeat electronic instrumental with punchy drums, warm synth pads and a bright plucked melody. 120 BPM.';

/** One Lyria request; returns the audio bytes. A prompt its filter blocks is retried once with a plain one. */
async function composeTrack(description, { fetchImpl = fetch } = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) throw Object.assign(new Error('Music generation is not set up (no Google AI key).'), { status: 503 });
  for (const input of [musicPrompt(description), FALLBACK]) {
    const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input }),
      signal: AbortSignal.timeout(240000),
    });
    const body = await res.json().catch(() => ({}));
    const error = (Array.isArray(body) ? body[0] : body)?.error;
    if (error) {
      if (/blocked|policy|safety/i.test(error.message || '')) continue;
      throw new Error(`Music generation failed: ${error.message || res.status}`);
    }
    const audio = (body.steps || []).flatMap((s) => s.content || []).find((c) => c.type === 'audio') || body.output_audio;
    if (audio?.data) return Buffer.from(audio.data, 'base64');
    throw new Error('Music generation returned no audio.');
  }
  throw new Error('The music service declined that description. Try describing the sound differently.');
}

/** Mono PCM; `low` keeps only the kick and bass, where the beat is (hi-hats on the off-beat would pull it half a beat). */
// Bands for the analysis: all of it for the tempo, the kick (40-100 Hz) for where the beat falls (hi-hats and
// syncopated bass would pull it off by half a beat).
const BANDS = { full: [], kick: ['-af', 'highpass=f=40,lowpass=f=100,lowpass=f=100'] };
const KEEP_SECONDS = 75; // videos are under a minute; the track loops in the rare longer one

async function decode(file, band = 'full') {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, ...BANDS[band], '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));
}

/** The onset strength per hop: rises in log energy, centred. */
function onsets(x) {
  const n = Math.floor(x.length / HOP);
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) e += x[j] * x[j];
    const v = Math.log1p(e * 1000);
    out[i] = Math.max(0, v - prev);
    prev = v;
  }
  const mean = out.reduce((a, b) => a + b, 0) / n;
  return out.map((v) => v - mean);
}

const FPS = RATE / HOP;

/** Onset strength at a time in seconds, interpolated between hops. */
function at(on, t) {
  const p = t * FPS;
  const i = Math.floor(p);
  if (i < 0 || i + 1 >= on.length) return 0;
  return on[i] + (on[i + 1] - on[i]) * (p - i);
}

/** How strongly the onsets fall on a beat grid (bpm, first beat at `offset` s). */
function gridScore(on, bpm, offset) {
  const beat = 60 / bpm;
  const end = on.length / FPS;
  let s = 0;
  let n = 0;
  for (let t = offset; t < end; t += beat) {
    s += at(on, t);
    n++;
  }
  return n ? s / n : -Infinity;
}

/** A first guess at the tempo between 90 and 160 bpm: the beat, half-bar and bar periods that repeat most. */
function tempoOf(on) {
  let best = { bpm: BPM, score: -Infinity };
  for (let bpm = 90; bpm <= 160; bpm += 0.5) {
    const beat = 60 / bpm;
    let score = 0;
    for (const k of [1, 2, 4]) {
      const lag = beat * k * FPS;
      let s = 0;
      let n = 0;
      for (let i = 0; i + lag + 1 < on.length; i++) {
        s += on[i] * at(on, (i + lag) / FPS);
        n++;
      }
      score += n ? s / n : 0;
    }
    if (score > best.score) best = { bpm, score };
  }
  return best.bpm;
}

/** The exact tempo near `guess` and where its first beat falls, together: the grid the kicks fit best. */
function gridOf(on, guess, span = 2) {
  let best = { bpm: guess, offset: 0, score: -Infinity };
  for (let bpm = guess - span; bpm <= guess + span; bpm += 0.02) {
    const beat = 60 / bpm;
    for (let offset = 0; offset < beat; offset += 0.005) {
      const score = gridScore(on, bpm, offset);
      if (score > best.score) best = { bpm, offset, score };
    }
  }
  return best;
}

/** Seconds into the audio of the first beat at 120 bpm (kept for checks). */
const phaseOf = (on) => gridOf(on, BPM, 0).offset;

/**
 * Stretch `input` to exactly 120 bpm (pitch kept), trim it to its first kick and to 75 s. Tempos outside ±12% of 120
 * (or of its half or double) are left as they are. Returns { bpm, stretch, offset, duration }.
 */
async function alignTrack(input, output) {
  const full = onsets(await decode(input));
  const kick = onsets(await decode(input, 'kick'));
  const guess = tempoOf(full);
  const candidates = [guess, guess * 2, guess / 2].filter((b) => Math.abs(b / BPM - 1) <= 0.12);
  const near = candidates.sort((a, b) => Math.abs(a - BPM) - Math.abs(b - BPM))[0];
  const grid = near ? gridOf(kick, near) : null;
  const stretch = grid ? BPM / grid.bpm : 1;
  const tmp = `${output}.stretch.wav`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', `atempo=${stretch.toFixed(6)}`, '-ar', '48000', '-ac', '2', tmp]);
  // Measured again after the stretch (atempo shifts a little), on the 120 bpm grid.
  const offset = gridOf(onsets(await decode(tmp, 'kick')), BPM, 0).offset;
  // Start a few milliseconds before the beat, with a tiny fade in, so the first transient is kept whole. Levelled to
  // the preset scores (about -19 LUFS) so the sound effects sit the same way over it; the export is mastered to
  // -14 LUFS afterwards. FLAC: lossless, smaller than WAV, and no encoder delay to shift the beat.
  const start = Math.max(0, offset - 0.01);
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', start.toFixed(3), '-t', String(KEEP_SECONDS), '-i', tmp, '-af', `afade=t=in:d=0.01,afade=t=out:st=${KEEP_SECONDS - 2}:d=2,loudnorm=I=-19:TP=-2:LRA=11`, '-ar', '48000', '-ac', '2', '-c:a', 'flac', output]);
  await fs.rm(tmp, { force: true });
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]);
  return { bpm: Number((grid?.bpm || guess).toFixed(2)), stretch: Number(stretch.toFixed(5)), offset: Number(start.toFixed(3)), duration: Number(Number(stdout).toFixed(2)) };
}

/** Report track `n` of a job in parts/music.json, which the API folds into the job (jobs.cjs mergeMusic). */
const report = (store, id, n, part) => store.writeFile(id, 'parts/music.json', Buffer.from(JSON.stringify({ n, ...part, reportedAt: new Date().toISOString() })));

/** A failure the user can act on keeps its words; anything else gets a plain retry message. */
const musicError = (error) => (error.status === 503 || /declined|music service/i.test(error.message) ? error.message : 'We couldn’t compose that track. Try again, or describe it differently.');

/**
 * Align the composed audio (`raw`) for track `n` and store it as capture/music/gen-<n>.flac, then report it. Runs where
 * ffmpeg is (the worker, or local Studio). Never writes job.json, so it can't overwrite the user's edits.
 */
async function alignInto({ store, id, n, raw, dir }) {
  try {
    await fs.mkdir(dir, { recursive: true });
    const src = path.join(dir, `gen-${n}.src`);
    const out = path.join(dir, `gen-${n}.flac`);
    await fs.writeFile(src, raw);
    const stats = await alignTrack(src, out);
    const file = `music/gen-${n}.flac`;
    await store.writeFile(id, `capture/${file}`, await fs.readFile(out));
    await Promise.all([fs.rm(src, { force: true }), fs.rm(out, { force: true })]);
    await report(store, id, n, { status: 'done', file, ...stats });
  } catch (error) {
    console.error('[studio] aligning music failed', id, error.message);
    await report(store, id, n, { status: 'failed', error: musicError(error) });
  }
}

module.exports = { musicPrompt, composeTrack, alignTrack, alignInto, report, musicError, tempoOf, phaseOf, onsets };
