// Guided Studio: the brief questions, the storyboard and the storyboard chat.
//
//   briefFor(capture)        what kinds of video this site supports (product launch, a feature launch per main feature,
//                            a walkthrough), each described from the site's own copy
//   planStoryboard(...)      one storyboard for the brief, from the screens the user picked (the planner, unchanged)
//   checkScenes(...)         a storyboard edited by hand: the planner's schema and checks, before it is saved
//   editStoryboard(...)      a chat message ("make it shorter", "end on the pricing page") applied to the storyboard
//
// The storyboard is one script; each size the user asked for renders it with its own layout (Root.jsx SIZES).

const { z } = require('zod');
const { planVideos, complete, check, describe, SCENE_DOC, HYPE, Video } = require('./planner.cjs');

const SIZES = ['16:9', '9:16', '1:1', '4:5'];

const Brief = z.object({
  product: z.string().trim().min(5).max(140),
  features: z.array(z.object({ title: z.string().trim().min(2).max(48), detail: z.string().trim().min(5).max(140) })).max(3),
  walkthrough: z.string().trim().min(5).max(140),
});

function copyOf(capture) {
  return capture.pages.map((p) => ({ page: p.label, h1: p.copy.h1, sub: p.copy.sub, sections: p.copy.sections.map((s) => (s.body ? `${s.title} — ${s.body}` : s.title)).slice(0, 14), ctas: p.copy.ctas }));
}

/** The video types to offer for this site. Falls back to plain options when the model is unavailable. */
async function briefFor(capture) {
  const name = capture.siteName || 'your product';
  const fallback = [
    { id: 'product', kind: 'launch', title: 'Product launch', detail: `Introduce ${name}: what it does, on its real screens.` },
    { id: 'walkthrough', kind: 'walkthrough', title: 'Product walkthrough', detail: `Step through ${name} one screen at a time.` },
  ];
  try {
    const { data, usage } = await complete(
      [
        {
          role: 'user',
          content: `From this company's website copy, describe the launch videos it could make. Use only what the copy says; plain words, no hype.

${JSON.stringify({ name, pages: copyOf(capture) }, null, 1)}

Respond with ONLY JSON:
{"product":"one sentence (≤120 chars): what a product launch video for the whole product would introduce, e.g. \\"Introduce ${name}'s end-to-end SEO content workflow.\\"",
 "features":[{"title":"the feature's name, ≤5 words","detail":"one sentence (≤120 chars): what a launch video about just this feature would show"}],
 "walkthrough":"one sentence (≤120 chars): the product flow a step-by-step walkthrough would follow"}
features: the 2-3 most important distinct capabilities the site names; none if it names none.`,
        },
      ],
      1500,
      { effort: 'low' },
    );
    const parsed = Brief.safeParse(data);
    if (!parsed.success || HYPE.test(JSON.stringify(parsed.data))) return { options: fallback, usage };
    const b = parsed.data;
    return {
      usage,
      options: [
        { id: 'product', kind: 'launch', title: 'Product launch', detail: b.product },
        ...b.features.map((f, i) => ({ id: `feature-${i + 1}`, kind: 'feature', title: `Feature launch: ${f.title}`, detail: f.detail, focus: f.title })),
        { id: 'walkthrough', kind: 'walkthrough', title: 'Product walkthrough', detail: b.walkthrough },
      ],
    };
  } catch {
    return { options: fallback, usage: null };
  }
}

/** The planner format (scene recipe) for a brief. */
function formatFor(brief, option) {
  if (option?.kind === 'walkthrough') return 'walkthrough';
  return brief.length === 'short' ? 'teaser' : 'launch';
}

function notesFor(brief, option, sizes) {
  const parts = [];
  if (option?.kind === 'feature') parts.push(`This is a feature launch. Make the whole video about one capability: "${option.focus}" (${option.detail}). The title, close-ups and end are about it; other features appear only in passing, if at all.`);
  else if (option?.kind === 'walkthrough') parts.push(`A walkthrough: ${option.detail}`);
  else if (option) parts.push(`A product launch: ${option.detail}`);
  if (brief.custom) parts.push(`The customer's brief, in their words: ${brief.custom}`);
  parts.push(`The same script will be rendered at ${sizes.join(', ')}; keep lines short enough for a phone screen.`);
  return parts.join('\n');
}

/** The capture with only the screens the user picked (at least one), so the storyboard uses those. */
function withScreens(capture, ids) {
  const keep = new Set(ids || []);
  const pick = (list) => (list || []).filter((s) => keep.has(s.id));
  const appShots = pick(capture.appShots);
  const shots = pick(capture.shots);
  if (!appShots.length && !shots.length) return capture;
  return { ...capture, appShots, shots };
}

/** One storyboard for the brief. Returns { plan: { format, title, scenes }, usage }. */
async function planStoryboard({ capture, read, brief, option, screens }) {
  const format = formatFor(brief, option);
  const result = await planVideos({ capture: withScreens(capture, screens), read, formats: [format], notes: notesFor(brief, option, brief.sizes) });
  const video = result.videos.find((v) => v.format === format) || result.videos[0];
  return { plan: { format: video.format, title: video.title, scenes: video.scenes }, usage: result.usage };
}

/** A storyboard from the browser, held to the planner's rules. Returns { scenes } or { problems }. */
function checkScenes(scenes, format, title, capture) {
  const parsed = Video.safeParse({ format, title: title || 'Storyboard', scenes: (scenes || []).map(({ progress, step, ...s }) => s) });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path.length === 1 && issue.path[0] === 'scenes') return { problems: ['A video needs between 3 and 9 scenes.'] };
    const where = typeof issue.path[1] === 'number' ? `Scene ${issue.path[1] + 1}: ` : '';
    return { problems: [`${where}${issue.message}`] };
  }
  const output = { videos: [parsed.data] };
  const problems = check(output, capture, [format]);
  return problems.length ? { problems } : { scenes: output.videos[0].scenes };
}

const Edit = z.object({
  reply: z.string().trim().min(1).max(400),
  scenes: z.array(z.any()),
  pace: z.enum(['fluid', 'snappy']).optional(),
  compose: z.string().trim().max(300).optional(),
  kit: z
    .object({
      name: z.string().optional(),
      logo: z.enum(['logo', 'icon', 'text']).optional(),
      heading: z.enum(['display', 'body']).optional(),
      music: z.string().optional(),
      motion: z.enum(['smooth', 'dynamic', 'clean']).optional(),
      voice: z.enum(['off', 'Charon', 'Kore', 'Puck', 'Sulafat', 'Aoede', 'Iapetus']).optional(),
      colors: z.object({ bg: z.string().optional(), ink: z.string().optional(), accent: z.string().optional() }).optional(),
    })
    .optional(),
});

/**
 * Apply one chat message to the storyboard. Returns { plan, kit, reply, usage }; the scenes pass the same checks as a
 * hand edit (one corrected retry), else the storyboard is left as it was and the reply says why.
 */
async function editStoryboard({ capture, plan, kit, message, history = [], tracks = [] }) {
  const shots = describe(capture).shots.map((s) => ({ id: s.id, kind: s.kind, page: s.page, title: s.title, elements: s.elements.slice(0, 30) }));
  const messages = [
    {
      role: 'user',
      content: `You edit the storyboard of a short product video for ${kit?.name || capture.siteName} together with its owner. The scene layouts and sound effects are fixed; you change the script, and the kit, music and motion within the options below.

WHAT THE SITE SAYS (the only facts you may use):
${JSON.stringify(copyOf(capture), null, 1)}

SCREENS YOU MAY SHOW (ids and the elements on each):
${JSON.stringify(shots, null, 1)}

SCENE TYPES (JSON):
${SCENE_DOC}

THE STORYBOARD NOW (format "${plan.format}", pace "${plan.pace || 'fluid'}"):
${JSON.stringify(plan.scenes.map(({ progress, step, ...s }) => s), null, 1)}

THE BRAND KIT NOW: ${JSON.stringify(kit || {})}

${history.length ? `EARLIER IN THIS CONVERSATION:\n${history.slice(-6).map((m) => `${m.role === 'user' ? 'Owner' : 'You'}: ${m.text}`).join('\n')}\n\n` : ''}THE OWNER SAYS: "${message}"

Rules:
- Change only what they asked for. Keep every other scene exactly as it is.
- You can: change words; reorder, add or remove scenes (3-9 scenes, the last is "end"); switch a scene to another screen or element; set pace to "snappy" (each long scene one beat shorter) or "fluid"; change the kit's colours (hex like #1a2b3c), name, logo ("logo", "icon" or "text"), heading font ("display" or "body", the site's two fonts) and music: a preset ("pulse": upbeat electronic, "calm": warm and unhurried, "drive": energetic, "minimal": sparse and precise)${tracks.length ? ` or a track already composed for this video (${tracks.map((t) => `"${t.id}": ${t.description || 'composed'}`).join(', ')})` : ''}.
- Motion (how scenes hand over): set kit.motion to "smooth" (soft ease and lift, the default), "dynamic" (scenes slide through and an accent-colour wipe sweeps across every cut, with a swipe sound) or "clean" (plain crossfades). Asked for better, livelier or more exciting animation: use "dynamic"; calmer or simpler: "clean".
- Voiceover: set kit.voice to a voice to add narration ("Charon": informative, "Kore": firm, "Puck": upbeat, "Sulafat": warm, "Aoede": breezy, "Iapetus": clear) or "off" to remove it. Each scene's spoken line is its "say" field; edit "say" when they ask to change what the narrator says (same truth rules, short spoken sentences). Lines are voiced automatically after your reply.
- New music: if they want music beyond these (a new song, better music, a genre or instruments), set "compose" to a short description of the sound (genre, instruments, mood, energy; no artist or brand names) and say in "reply" that a new track is being composed. It takes about a minute and is picked automatically when ready.
- You cannot: change scene layouts beyond the motion styles above, resize single elements, use other fonts, or add facts the site does not state. If they ask for one of these, say so plainly in "reply" and leave that part unchanged.
- Truth: every claim and number must come from the site. No hype words.
- "reply": one or two plain sentences saying what you changed (or could not change).

Respond with ONLY JSON: {"reply":"...","scenes":[...all scenes...],"pace":"fluid","kit":{...only fields that change},"compose":"only when new music is wanted"}`,
    },
  ];
  const usage = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, usage: u, model } = await complete(messages, 8000, { effort: 'medium' });
    usage.push({ model, ...u });
    const parsed = Edit.safeParse(data);
    let problems;
    if (!parsed.success) problems = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`);
    else {
      const checked = checkScenes(parsed.data.scenes, plan.format, plan.title, capture);
      if (checked.scenes) {
        const next = { ...plan, scenes: checked.scenes, pace: parsed.data.pace || plan.pace };
        const nextKit = parsed.data.kit ? { ...kit, ...parsed.data.kit, colors: { ...kit?.colors, ...parsed.data.kit.colors } } : kit;
        return { plan: next, kit: nextKit, reply: parsed.data.reply, compose: parsed.data.compose || null, usage };
      }
      problems = checked.problems;
    }
    messages.push({ role: 'assistant', content: JSON.stringify(data) });
    messages.push({ role: 'user', content: `Fix these problems and return the full corrected JSON:\n- ${problems.join('\n- ')}` });
  }
  return { plan, kit, reply: "I couldn't make that change and keep the video accurate, so the storyboard is unchanged. Try saying it another way.", usage };
}

module.exports = { SIZES, briefFor, formatFor, planStoryboard, checkScenes, editStoryboard, withScreens };
