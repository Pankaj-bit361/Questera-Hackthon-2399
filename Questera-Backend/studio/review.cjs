// The visual check: render one settled frame of every scene, show them to the model next to the script, and apply the
// text or framing fixes it asks for. One pass; if the check itself fails, the video still renders.

const fs = require('node:fs/promises');
const { complete, Scene } = require('./planner.cjs');
const { renderStills } = require('./render.cjs');
const { timeline } = require('../../studio/remotion/timing.cjs');

const FIXABLE = new Set(['headline', 'sub', 'kicker', 'caption', 'title', 'body', 'cta', 'element', 'click', 'lines', 'items', 'chips', 'accent']);

function framesFor(plan) {
  // A frame per scene, after its entrance has settled.
  return timeline(plan).items.map((i) => ({ frame: i.from + Math.min(i.dur - 12, i.scene.type === 'focus' ? 110 : 70), type: i.scene.type }));
}

async function reviewPlan({ jobsRoot, jobId, capture, plan, dir }) {
  const shots = framesFor(plan);
  await fs.mkdir(dir, { recursive: true });
  const stills = await renderStills({ jobsRoot, jobId, capture, plan, frames: shots.map((s) => s.frame), dir, scale: 0.4 });
  const content = [
    {
      type: 'text',
      text: `You are checking frames of a ${plan.format} product video before it is rendered. Each frame below is one scene, in order, taken after its animation has settled. The script is:
${JSON.stringify(plan.scenes.map((s, i) => ({ scene: i, ...s, progress: undefined })), null, 1)}

Look for real problems only: text cut off or overflowing, text overlapping other things, text too small to read on a phone, a zoomed screen showing nothing meaningful (blank area, cookie banner, navigation), or a cursor pointing at empty space. Ignore taste.

For each problem give the smallest fix by changing fields of that scene. Allowed fields: ${[...FIXABLE].join(', ')}. To fix overflowing text, shorten it. To fix a meaningless zoom, choose another element id from the same shot or set "click": false.

Respond with ONLY JSON: {"ok": true} or {"ok": false, "fixes": [{"scene": 0, "problem": "...", "set": {"field": "new value"}}]}`,
    },
  ];
  for (const [i, s] of stills.entries()) {
    content.push({ type: 'text', text: `Scene ${i} (${shots[i].type}):` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${(await fs.readFile(s.file)).toString('base64')}` } });
  }
  const { data, usage } = await complete([{ role: 'user', content }], 4000);
  const applied = [];
  for (const fix of data.fixes || []) {
    const scene = plan.scenes[fix.scene];
    if (!scene || !fix.set) continue;
    const next = { ...scene };
    for (const [k, v] of Object.entries(fix.set)) if (FIXABLE.has(k)) next[k] = v;
    if (Scene.safeParse(next).success) {
      plan.scenes[fix.scene] = { ...next, progress: scene.progress, step: scene.step };
      applied.push({ scene: fix.scene, problem: fix.problem });
    }
  }
  return { plan, applied, usage, stills: stills.map((s) => s.file) };
}

module.exports = { reviewPlan, framesFor };
