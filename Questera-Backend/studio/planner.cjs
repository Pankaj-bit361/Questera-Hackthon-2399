// Writes the videos for a captured site: the model sees the real screens (with every element on them) and the site's
// own copy, and fills in the tested scene templates. It never draws anything; it chooses words, screens and elements.
// Every plan is validated against the capture before it is rendered; one corrected retry is allowed.

const fs = require('node:fs/promises');
const path = require('node:path');
const { z } = require('zod');
const { motionModel, providerHeaders, generationOptions } = require('../motion/provider.cjs');

const FORMATS = {
  launch: {
    label: 'Launch film',
    size: '16:9',
    recipe: 'hook (optional, only if the site lists 3-5 concrete jobs the product does) OR compare (optional, only if the site contrasts the old way with the product) → title → reveal → focus → focus → features OR metrics OR stat → quote (optional, only with a customer quote copied from the site) → checks → end',
  },
  walkthrough: { label: 'Product walkthrough', size: '16:9', recipe: 'title → focus (step 1) → focus (step 2) → focus (step 3) → [focus (step 4)] → end' },
  teaser: { label: 'Vertical teaser', size: '9:16', recipe: 'title → reveal → focus → focus OR metrics → end' },
  square: { label: 'Square ad', size: '1:1', recipe: 'title → reveal → checks → end' },
};

const HYPE = /\b(revolutioni[sz]e|game[- ]?changer|unlock|seamless(ly)?|supercharge|leverage|cutting[- ]edge|next[- ]level|effortless(ly)?|world[- ]class|best[- ]in[- ]class|10x your|dominate|skyrocket|crush(ing)?|ultimate|unleash|elevate|transform(ative)?)\b/i;

const words = (n) => z.string().trim().min(1).refine((s) => s.split(/\s+/).length <= n, `at most ${n} words`);
const chars = (n) => z.string().trim().min(1).max(n);

// say: the voiceover line for the scene (optional; written when the video has a voice).
const say = { say: z.string().trim().max(220).optional() };
const Scene = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hook'), lines: z.array(words(3)).min(3).max(5), ...say }),
  z.object({ type: z.literal('title'), kicker: chars(28).optional(), headline: words(9), accent: z.array(z.string()).max(3).optional(), sub: chars(150).optional(), ...say }),
  z.object({ type: z.literal('reveal'), shot: z.string(), caption: chars(70).optional(), chips: z.array(z.object({ title: words(5), sub: chars(44).optional() })).max(3).optional(), ...say }),
  z.object({ type: z.literal('focus'), shot: z.string(), element: z.string().optional(), title: words(7), body: chars(120).optional(), click: z.boolean().optional(), step: z.number().int().min(1).max(6).optional(), accent: z.array(z.string()).max(2).optional(), ...say }),
  z.object({ type: z.literal('features'), title: words(7), accent: z.array(z.string()).max(2).optional(), items: z.array(z.object({ title: words(5), body: chars(80).optional() })).min(3).max(4), ...say }),
  z.object({ type: z.literal('checks'), items: z.array(words(7)).min(3).max(4), ...say }),
  z.object({ type: z.literal('stat'), value: chars(14), label: chars(80), ...say }),
  z.object({ type: z.literal('metrics'), title: words(7).optional(), accent: z.array(z.string()).max(2).optional(), items: z.array(z.object({ value: chars(14), label: chars(40) })).min(2).max(3), ...say }),
  z.object({ type: z.literal('compare'), title: words(7).optional(), accent: z.array(z.string()).max(2).optional(), before: z.object({ label: words(3), items: z.array(words(6)).min(2).max(4) }), after: z.object({ label: words(3), items: z.array(words(6)).min(2).max(4) }), ...say }),
  z.object({ type: z.literal('quote'), text: chars(200), name: chars(40), role: chars(60).optional(), ...say }),
  z.object({ type: z.literal('end'), headline: words(9).optional(), accent: z.array(z.string()).max(3).optional(), cta: words(4), ...say }),
]);
const Video = z.object({ format: z.enum(Object.keys(FORMATS)), title: chars(80), scenes: z.array(Scene).min(3).max(9) });
const Output = z.object({ videos: z.array(Video).min(1) });

/** What the model is told about the capture: copy, and every screen with its elements. */
function describe(capture) {
  const pages = capture.pages.map((p) => ({
    page: p.label,
    title: p.copy.title,
    description: p.copy.description,
    h1: p.copy.h1,
    sub: p.copy.sub,
    sections: p.copy.sections.map((s) => (s.body ? `${s.title} — ${s.body}` : s.title)),
    ctas: p.copy.ctas,
    bullets: p.copy.bullets,
    numbers: p.copy.numbers,
    prices: p.copy.prices,
  }));
  const shots = [...(capture.appShots || []), ...capture.shots].map((s) => ({
    id: s.id,
    kind: s.kind === 'app' ? 'logged-in product screen' : s.kind === 'upload' ? 'product screenshot the customer uploaded (no element ids: use focus without "element")' : s.kind === 'hero' ? 'first screen of a marketing page' : 'marketing page section',
    page: s.page,
    title: s.title,
    size: `${s.width}x${s.height}`,
    elements: s.elements.map((e) => `${e.id} ${e.role} ${e.w}x${e.h} "${e.text}"`),
  }));
  return { site: capture.siteName, url: capture.finalUrl || capture.url, pages, shots, loggedInScreens: (capture.appShots || []).length };
}

/** What each scene type is, for the model (the planner and the storyboard chat). */
const SCENE_DOC = `- {"type":"hook","lines":["Find keywords","Write drafts",...]} 3-5 short verb phrases (≤3 words) naming jobs THIS product does for the user, taken from the site. Shown and struck through: "you no longer do these".
- {"type":"title","kicker":"Meet <name>","headline":"...","accent":["word","word"],"sub":"..."} The promise. Headline ≤9 words, ideally the site's own h1 or close to it. accent = 1-3 words copied exactly from the headline to highlight. sub ≤150 chars.
- {"type":"reveal","shot":"<id of a first-screen or product screenshot>","caption":"...","chips":[{"title":"...","sub":"..."}]} The product rising into view with up to 3 floating notes; each chip is a short fact from the site.
- {"type":"focus","shot":"<id>","element":"<element id on that shot>","title":"...","body":"...","click":true,"step":1} The camera zooms into one real element and a cursor clicks it. Title ≤7 words, body ≤120 chars. click=false for things that aren't clickable (stats, text). "step" only in walkthroughs.
- {"type":"features","title":"...","items":[{"title":"...","body":"..."}]} 3-4 capabilities.
- {"type":"stat","value":"26 of 28","label":"..."} Only with a number that appears verbatim in "numbers" or the copy.
- {"type":"checks","items":["...","...","..."]} 3-4 short reassurances (≤7 words each) the site states (free plan, no card, integrations, privacy...).
- {"type":"metrics","title":"...","items":[{"value":"26 of 28","label":"..."},{"value":"$29","label":"..."}]} 2-3 numbers that count up side by side. Every value must appear verbatim in "numbers" or the copy; label ≤40 chars says what it measures. Use only when the site states 2-3 distinct figures.
- {"type":"compare","title":"...","before":{"label":"Without <name>","items":["...","..."]},"after":{"label":"With <name>","items":["...","..."]}} The old way (crossed out) next to the product's way (checked), 2-4 items each, ≤6 words. Only when the site itself describes the problem and how the product changes it.
- {"type":"quote","text":"...","name":"...","role":"..."} A customer quote copied word for word from the site (≤200 chars, trim to a whole sentence), with the person's name and role exactly as the site gives them. Never write or paraphrase a quote.
- {"type":"end","headline":"...","accent":[...],"cta":"..."} cta = one of the site's own call-to-action labels.`;

function prompt(capture, formats, notes) {
  return `You are the creative director of a motion-design studio. You make short product videos from a company's real website and product screens. The visual design is already built (brand colours, fonts, camera moves, sound); your job is the script: which scenes, which words, which real screens and which on-screen element each scene zooms into.

THE COMPANY (everything you may say comes from here):
${JSON.stringify(describe(capture), null, 1)}

The screenshots are attached in the same order as "shots", each labelled with its id.
${notes ? `\nTHE CUSTOMER'S NOTES: ${notes}\n` : ''}
MAKE THESE VIDEOS (one each): ${formats.map((f) => `${f} (${FORMATS[f].label}, ${FORMATS[f].size}; scenes: ${FORMATS[f].recipe})`).join('; ')}

SCENE TYPES (JSON):
${SCENE_DOC}

RULES:
1. Truth: every claim, number, price, integration and feature must be stated in the company data above. Never invent customers, metrics, awards or features. If unsure, leave it out.
2. Pick focus elements that SHOW the product working: dashboards, cards, results, forms, editors, previews. Prefer logged-in product screens when they exist. Never focus on navigation links, logos, cookie banners or a giant page headline. The element should be roughly 150-900px wide. Look at the attached screenshot to confirm it shows something meaningful.
3. Use each focus element once per video, and vary the screens.
4. Plain, specific, confident words. No hype: never use revolutionize, game-changer, unlock, seamless, supercharge, leverage, cutting-edge, next-level, effortless, world-class.
5. Follow each format's scene order. Walkthrough steps should follow the product's real flow, in order, each on a different screen or element.
6. Write in the site's language.

Respond with ONLY JSON: {"videos":[{"format":"launch","title":"short internal name","scenes":[...]}, ...]}`;
}

/** The screenshots for the model; `read(rel)` reads them from the store instead of a local folder. */
async function images(capture, dir, read) {
  const shots = [...(capture.appShots || []), ...capture.shots];
  const parts = [];
  for (const s of shots) {
    const data = read ? await read(s.thumb || s.file) : await fs.readFile(path.join(dir, s.thumb || s.file));
    if (!data) continue;
    parts.push({ type: 'text', text: `Screenshot ${s.id}:` });
    parts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data.toString('base64')}` } });
  }
  return parts;
}

/** effort: 'low' | 'medium' for calls the user is waiting on (brief options, chat edits); the default for the rest. */
async function complete(messages, maxTokens = 12000, opts = {}) {
  // Models occasionally return broken JSON; asking again is cheaper than failing the user's step.
  for (let attempt = 1; ; attempt++) {
    try {
      return await completeOnce(messages, maxTokens, opts);
    } catch (error) {
      if (!(error instanceof SyntaxError) || attempt >= 3) throw error;
      console.warn('[studio] model returned malformed JSON, asking again:', error.message.slice(0, 80));
    }
  }
}

async function completeOnce(messages, maxTokens, { effort } = {}) {
  const model = motionModel();
  const options = generationOptions(model, maxTokens);
  if (effort && options.reasoning) options.reasoning = { effort };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: providerHeaders(),
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, ...options }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `Model request failed (${response.status}).`);
  const text = body.choices?.[0]?.message?.content || '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return { data: JSON.parse(json), usage: body.usage, model: body.model };
}

const allText = (capture) => JSON.stringify(capture.pages.map((p) => p.copy)).toLowerCase();
/** Text compared for quotes: lower case, curly quotes and dashes straightened, whitespace collapsed. */
const norm = (t) => String(t).toLowerCase().replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/[“”«»„]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

/** Checks the schema can't express: real screens and elements, numbers that exist, no hype. Fixes what it safely can. */
function check(output, capture, formats) {
  const problems = [];
  const shots = new Map([...(capture.appShots || []), ...capture.shots].map((s) => [s.id, s]));
  const text = allText(capture);
  const flat = norm(text);
  for (const f of formats) if (!output.videos.some((v) => v.format === f)) problems.push(`Missing the ${f} video.`);
  for (const video of output.videos) {
    const where = (i) => `${video.format} scene ${i + 1}`;
    video.scenes = video.scenes.filter((s, i) => {
      if (s.type === 'stat' && !text.includes(String(s.value).toLowerCase())) {
        problems.push(`${where(i)}: the stat "${s.value}" does not appear on the site.`);
        return false;
      }
      if (s.type === 'metrics') {
        const missing = s.items.filter((m) => !text.includes(String(m.value).toLowerCase()));
        if (missing.length) {
          problems.push(`${where(i)}: ${missing.map((m) => `"${m.value}"`).join(', ')} does not appear on the site.`);
          return false;
        }
      }
      // A quote is the customer's words or nothing: the text and the name must both be on the site.
      if (s.type === 'quote' && (!flat.includes(norm(s.text).replace(/^["']+|["']+$/g, '').replace(/[.…]+$/, '')) || !flat.includes(norm(s.name)))) {
        problems.push(`${where(i)}: that quote (or its name) is not on the site word for word. Copy a real quote exactly or drop the scene.`);
        return false;
      }
      return true;
    });
    if (video.scenes[video.scenes.length - 1]?.type !== 'end') problems.push(`${video.format}: the last scene must be "end".`);
    video.scenes.forEach((s, i) => {
      if (HYPE.test(JSON.stringify(s))) problems.push(`${where(i)}: remove hype words.`);
      if (s.shot && !shots.has(s.shot)) problems.push(`${where(i)}: unknown shot "${s.shot}".`);
      if (s.type === 'focus' && s.element) {
        const el = shots.get(s.shot)?.elements.find((e) => e.id === s.element);
        if (!el) problems.push(`${where(i)}: element "${s.element}" is not on shot "${s.shot}".`);
      }
      // Highlights are matched word by word; keep only words that are really in the line.
      const line = (s.headline || s.title || '').toLowerCase();
      if (s.accent) s.accent = s.accent.flatMap((a) => a.split(/\s+/)).filter((w) => w && line.includes(w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '')));
      if (s.type === 'focus') s.title = s.title.replace(/^\s*(step\s*)?\d+[.):]?\s+/i, '');
    });
    // Walkthrough steps: numbered in order, with a progress bar.
    const steps = video.scenes.filter((s) => s.type === 'focus' && video.format === 'walkthrough');
    steps.forEach((s, i) => {
      s.step = i + 1;
      s.progress = { index: i, total: steps.length, labels: steps.map((x) => x.title) };
    });
  }
  return problems;
}

/** Plan the requested videos for a capture in `dir`. Returns { videos, usage, attempts }. */
/**
 * Shorten text to max characters at the end of a sentence, else of a clause, keeping at least half of the limit.
 * Returns null when there is no clean place to cut (the model is asked to rewrite it instead).
 */
function shorten(text, max) {
  const t = String(text).trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const sentence = Math.max(...['. ', '! ', '? '].map((m) => head.lastIndexOf(m)));
  if (sentence + 1 >= max / 2) return t.slice(0, sentence + 1);
  const clause = Math.max(...[', ', '; ', ' — ', ' – ', ' - '].map((m) => head.lastIndexOf(m)));
  if (clause >= max / 2) return `${t.slice(0, clause).replace(/\s+(and|or|with|to|for|the|a|an)$/i, '')}${/[.!?]$/.test(t) ? '.' : ''}`;
  return null;
}

/** Fix over-long text in place where it can be cut cleanly. Returns whether anything changed. */
function trimLong(data, issues) {
  let changed = false;
  for (const issue of issues) {
    if (issue.code !== 'too_big' || issue.origin !== 'string') continue;
    const parent = issue.path.slice(0, -1).reduce((o, k) => (o == null ? o : o[k]), data);
    const key = issue.path.at(-1);
    if (parent == null || typeof parent[key] !== 'string') continue;
    const short = shorten(parent[key], Number(issue.maximum));
    if (short && short.length <= Number(issue.maximum)) {
      parent[key] = short;
      changed = true;
    }
  }
  return changed;
}

async function planVideos({ capture, dir, read, formats, notes }) {
  const content = [{ type: 'text', text: prompt(capture, formats, notes) }, ...(await images(capture, dir, read))];
  const messages = [{ role: 'user', content }];
  let lastProblems = [];
  const usage = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, usage: u, model } = await complete(messages);
    usage.push({ model, ...u });
    let parsed = Output.safeParse(data);
    if (!parsed.success && trimLong(data, parsed.error.issues)) parsed = Output.safeParse(data);
    if (parsed.success) {
      const output = parsed.data;
      lastProblems = check(output, capture, formats);
      if (!lastProblems.length) return { videos: output.videos.filter((v) => formats.includes(v.format)), usage, attempts: attempt };
    } else {
      lastProblems = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.')}: ${i.message}`);
    }
    messages.push({ role: 'assistant', content: JSON.stringify(data) });
    messages.push({ role: 'user', content: `Fix these problems and return the full corrected JSON:\n- ${lastProblems.join('\n- ')}` });
  }
  throw new Error(`The script did not pass checks: ${lastProblems.slice(0, 3).join(' ')}`);
}

module.exports = { planVideos, complete, check, describe, SCENE_DOC, FORMATS, Scene, Video, HYPE, shorten, trimLong };
