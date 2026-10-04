// Voiceover: one spoken line per scene (scene.say), voiced with Gemini text-to-speech.
//
//   writeLines(...)   lines for the scenes that have none, from the site's own copy, short enough for each scene
//   speak(text, voice) one line as WAV (24 kHz mono); its length is read from the header, so no ffmpeg is needed
//
// Runs in the API (it has the Google key). Each voiced line is stored as capture/voice/<hash>.wav, so the live
// preview and the export play the same file; a scene runs long enough for its line (timing.cjs) and the music dips
// under it (Root.jsx).

const crypto = require('node:crypto');
const { z } = require('zod');
const { complete, HYPE } = require('./planner.cjs');
const { timeline } = require('../../studio/remotion/timing.cjs');

const MODEL = process.env.STUDIO_VOICE_MODEL || 'gemini-3.8-flash-tts';
// A short list that covers the tones product videos need; any Gemini voice name works through the API.
const VOICES = { Charon: 'Informative', Kore: 'Firm', Puck: 'Upbeat', Sulafat: 'Warm', Aoede: 'Breezy', Iapetus: 'Clear' };
const STYLE = 'confident, warm product-video narrator, natural pace, not salesy';
const WORDS_PER_SECOND = 2.6;

const key = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

/** Seconds of audio in a PCM WAV. */
function wavSeconds(buf) {
  let i = 12;
  let rate = 24000;
  let bytes = 2;
  let channels = 1;
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(i + 10);
      rate = buf.readUInt32LE(i + 12);
      bytes = buf.readUInt16LE(i + 22) / 8;
    }
    if (id === 'data') return Math.min(size, buf.length - i - 8) / (rate * bytes * channels);
    i += 8 + size + (size % 2);
  }
  return 0;
}

/** One line, voiced. Returns { audio: Buffer (WAV), seconds }. */
async function speak(text, voice, { fetchImpl = fetch } = {}) {
  if (!key()) throw Object.assign(new Error('Voiceover is not set up (no Google AI key).'), { status: 503 });
  const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  const error = (Array.isArray(body) ? body[0] : body)?.error;
  if (error) throw new Error(`Voiceover failed: ${error.message || res.status}`);
  const audio = (body.steps || []).flatMap((s) => s.content || []).filter((c) => c.type === 'audio').at(-1);
  if (!audio?.data) throw new Error('Voiceover returned no audio.');
  const buf = Buffer.from(audio.data, 'base64');
  return { audio: buf, seconds: wavSeconds(buf) };
}

/** Where a voiced line lives: one file per voice and text, so unchanged lines are never voiced twice. */
const fileFor = (voice, text) => `voice/${crypto.createHash('sha256').update(`${voice}\n${text}`).digest('hex').slice(0, 16)}.wav`;

/** The most words a scene's line may have: what fits in the scene as planned (it may still grow by a beat or two). */
function budget(plan) {
  return timeline({ ...plan, voice: null }).items.map((i) => Math.max(5, Math.floor((i.dur / 30 - 0.8) * WORDS_PER_SECOND)));
}

const Lines = z.object({ lines: z.array(z.object({ scene: z.number().int().min(0), say: z.string().trim().min(2).max(220) })) });

/**
 * Lines for the scenes that have none (or all, with `all`). The narration carries the story the screens show:
 * what the product does, said plainly, only from the site's copy. Returns the scenes with `say` filled in.
 */
async function writeLines({ capture, plan, name, all = false }) {
  const max = budget(plan);
  const todo = plan.scenes.map((s, i) => ({ i, s })).filter(({ s }) => all || !s.say);
  if (!todo.length) return plan.scenes;
  const copy = capture.pages.map((p) => ({ page: p.label, h1: p.copy.h1, sub: p.copy.sub, sections: p.copy.sections.map((s) => (s.body ? `${s.title} — ${s.body}` : s.title)).slice(0, 14) }));
  const { data } = await complete(
    [
      {
        role: 'user',
        content: `Write the voiceover for a short product video about ${name}. One spoken line per scene listed below, heard while that scene is on screen.

WHAT THE SITE SAYS (the only facts you may use):
${JSON.stringify(copy, null, 1)}

THE VIDEO, scene by scene (what is on screen):
${JSON.stringify(plan.scenes.map(({ progress, step, say, ...s }, i) => ({ scene: i, ...s, maxWords: max[i] })), null, 1)}

Write lines for scenes: ${todo.map(({ i }) => i).join(', ')}.
Rules:
- Each line at most its scene's maxWords. Spoken English (or the site's language): short sentences, contractions, no lists, no symbols.
- Say what the viewer is looking at and why it matters; don't read the on-screen text word for word.
- Truth: only what the site says. No hype (never: revolutionize, game-changer, unlock, seamless, supercharge, effortless, world-class).
- The last scene's line invites the viewer to its call to action.
Respond with ONLY JSON: {"lines":[{"scene":0,"say":"..."}]}`,
      },
    ],
    4000,
    { effort: 'low' },
  );
  const parsed = Lines.safeParse(data);
  if (!parsed.success) throw new Error('The voiceover script did not come back right. Try again.');
  const scenes = plan.scenes.map((s) => ({ ...s }));
  for (const { scene, say } of parsed.data.lines) {
    if (!scenes[scene] || (!all && scenes[scene].say)) continue;
    const words = say.split(/\s+/);
    const clean = (words.length > max[scene] + 3 ? `${words.slice(0, max[scene]).join(' ').replace(/[,;:]$/, '')}.` : say).replace(HYPE, '').replace(/\s{2,}/g, ' ').trim();
    scenes[scene].say = clean;
  }
  return scenes;
}

module.exports = { VOICES, speak, fileFor, writeLines, wavSeconds, budget, WORDS_PER_SECOND };
