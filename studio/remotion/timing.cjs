// Scene durations (frames at 30 fps), shared by the renderer (scenes.jsx) and the server (review, progress). Every
// duration is rounded up to whole beats of the 120 bpm music (15 frames), so cuts land on the beat.

const DUR = {
  title: () => 105,
  hook: (s) => 90 + Math.min(5, s.lines.length) * 6 + 15,
  reveal: () => 180,
  focus: (s) => (s.body && s.body.length > 90 ? 165 : 150),
  features: (s) => 120 + Math.min(4, s.items.length) * 8,
  checks: () => 120,
  stat: () => 105,
  end: () => 150,
  metrics: (s) => 135 + Math.min(3, s.items.length) * 8,
  compare: (s) => 120 + Math.min(4, Math.max(s.before.items.length, s.after.items.length)) * 14,
  quote: (s) => 105 + Math.min(75, s.text.split(/\s+/).length * 3),
};

const beat = (n) => Math.ceil(n / 15) * 15;

/** A "snappy" plan (the Style step's rhythm) holds each longer scene one beat less; entrances keep their timing. */
const duration = (scene, pace) => {
  const d = beat(DUR[scene.type](scene));
  return pace === 'snappy' && d >= 120 ? d - 15 : d;
};

// A voiceover line starts this many frames into its scene; the scene runs at least a beat past the line's end.
const VOICE_IN = 9;
const voiceOf = (plan, scene) => (scene.say && plan.voice?.lines?.find((l) => l.text === scene.say)) || null;

/** Where each scene starts and how long it runs (long enough for its voiceover line), plus the frames the music cares about. */
function timeline(plan) {
  let at = 0;
  const items = plan.scenes.map((scene) => {
    const voice = voiceOf(plan, scene);
    const dur = Math.max(duration(scene, plan.pace), voice ? beat(VOICE_IN + voice.frames + 15) : 0);
    const item = { scene, from: at, dur, voice };
    at += dur;
    return item;
  });
  const end = items.find((i) => i.scene.type === 'end');
  const firstBody = items.find((i) => !['title', 'hook'].includes(i.scene.type));
  return { items, total: at, endFrom: end ? end.from : at, drop: firstBody ? firstBody.from : 0 };
}

module.exports = { DUR, beat, duration, timeline, VOICE_IN };
