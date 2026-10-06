import React from 'react';
import { AbsoluteFill, Audio, Composition, Easing, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { BrandProvider, MotionContext, asset, useBrand } from './kit.jsx';
import { SCENES, SceneView, timeline } from './scenes.jsx';
import timing from './timing.cjs';
import { DEMO_BRAND, DEMO_PLAN } from './demo.js';
import { POST_SIZES, PostImage } from './post.jsx';

/* One composition renders every Studio video: its size comes from the plan's format and its length from the scenes. */

export const FORMATS = {
  launch: { width: 1920, height: 1080 },
  walkthrough: { width: 1920, height: 1080 },
  teaser: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

// A plan may name its own size (guided Studio renders one storyboard at several sizes); else its format decides.
export const SIZES = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};
export const sizeOf = (plan) => SIZES[plan.size] || FORMATS[plan.format] || FORMATS.launch;

/** Music and effects: from the bundle's public folder, or from brand.audioBase (the browser preview). */
const sound = (brand, name) => (brand.audioBase ? `${brand.audioBase}/${name}` : staticFile(`studio-audio/${name}`));

// Music stems from audio/stems.py: 120 bpm, 8 bars (480 frames) per loop, sharing one chord timeline from frame 0.
const LOOP = 480;
const OUTRO = 180;
const MUSIC_VOLUME = 0.8;

const LENGTH = { click: 3, tick: 5, 'tick-hi': 5, pop: 6, whoosh: 22, swipe: 11, chime: 49, riser: 49, impact: 79, ping: 49, scratch: 8 };

/**
 * How loud the music is at a frame: dipped to a third under each voiceover line, with short ramps, so the voice is
 * always on top. 1 when the video has no voice.
 */
function ducker(t) {
  const spans = t.items.filter((i) => i.voice).map((i) => [i.from + timing.VOICE_IN, i.from + timing.VOICE_IN + i.voice.frames]);
  if (!spans.length) return () => 1;
  return (frame) => {
    let v = 1;
    for (const [a, b] of spans) v = Math.min(v, interpolate(frame, [a - 6, a, b, b + 10], [1, 0.32, 0.32, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    return v;
  };
}

/** A stem played from `from` to `to`, looping, kept in step with the shared chord timeline. */
function Loop({ src, from, to, duck = () => 1 }) {
  const parts = [];
  for (let at = from; at < to; ) {
    const offset = at % LOOP;
    const len = Math.min(LOOP - offset, to - at);
    const fadeOut = at + len >= to;
    const start = at; // the callback runs later, when the loop variable has moved on
    parts.push(
      <Sequence key={start} from={start} durationInFrames={len} layout="none">
        <Audio src={src} trimBefore={offset} volume={(f) => MUSIC_VOLUME * duck(start + f) * (fadeOut ? interpolate(f, [len - 6, len], [1, 0.4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1)} />
      </Sequence>,
    );
    at += len;
  }
  return <>{parts}</>;
}

/** A track composed for this video (Questera-Backend/studio/music.cjs): already at 120 bpm and starting on a beat. */
function Track({ t, brand, file, duck }) {
  return <Audio src={asset(brand, file)} loop volume={(f) => MUSIC_VOLUME * duck(f) * interpolate(f, [t.total - 30, t.total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />;
}

/** The voiceover: each scene's line, a few frames into the scene. */
function Voice({ t, brand }) {
  return (
    <>
      {t.items
        .filter((i) => i.voice)
        .map((i) => (
          <Sequence key={i.from} from={i.from + timing.VOICE_IN} durationInFrames={i.voice.frames + 4} layout="none">
            <Audio src={asset(brand, i.voice.file)} volume={1} />
          </Sequence>
        ))}
    </>
  );
}

function Soundtrack({ t, brand, music, mood, track, motion }) {
  const duck = ducker(t);
  // Each mood is the same three stems on the same 120 bpm grid; only the folder changes.
  const dir = mood && mood !== 'pulse' ? `music/${mood}/` : '';
  const cues = [];
  for (const item of t.items) {
    for (const [offset, name, volume] of SCENES[item.scene.type].cues(item.scene, brand)) {
      const at = item.from + offset;
      if (at >= 0 && at < t.total) cues.push({ at, name, volume });
    }
  }
  // Dynamic motion: a swipe under each wipe, timed to its sweep.
  if (motion === 'dynamic') for (const item of t.items.slice(1)) cues.push({ at: item.from - 7, name: 'swipe', volume: 0.38 });
  return (
    <>
      {music && track ? (
        <Track t={t} brand={brand} file={track} duck={duck} />
      ) : music ? (
        <>
          {t.drop > 0 ? <Loop src={sound(brand, `${dir}intro.wav`)} from={0} to={t.drop} duck={duck} /> : null}
          <Loop src={sound(brand, `${dir}main.wav`)} from={t.drop} to={t.endFrom} duck={duck} />
          <Sequence from={t.endFrom} durationInFrames={Math.min(OUTRO, t.total - t.endFrom)} layout="none">
            <Audio src={sound(brand, `${dir}outro.wav`)} volume={(f) => MUSIC_VOLUME * duck(t.endFrom + f) * interpolate(f, [t.total - t.endFrom - 24, t.total - t.endFrom], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
          </Sequence>
        </>
      ) : null}
      {cues.map((c, i) => (
        <Sequence key={i} from={c.at} durationInFrames={(LENGTH[c.name] || 20) + 1} layout="none">
          <Audio src={sound(brand, `sfx/${c.name}.wav`)} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
}

/** Dynamic motion: a skewed panel in the brand's accent sweeps across every cut, covering it at the cut frame. */
function Wipes({ t }) {
  const items = t.items.slice(1);
  return (
    <>
      {items.map((item) => (
        <Sequence key={item.from} from={item.from - 8} durationInFrames={16} layout="none">
          <Wipe />
        </Sequence>
      ))}
    </>
  );
}

function Wipe() {
  const brand = useBrand();
  const p = brand.palette;
  const f = useCurrentFrame();
  const x = interpolate(f, [0, 16], [-135, 135], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', left: 0, width: '100%', transform: `translateX(${x}%) skewX(-14deg)`, background: p.accent, boxShadow: `0 0 0 18px ${p.glow}55, 0 0 120px ${p.glow}88` }} />
    </AbsoluteFill>
  );
}

export function StudioVideo({ plan, brand, music = true }) {
  const t = timeline(plan);
  return (
    <BrandProvider brand={brand}>
      <MotionContext.Provider value={plan.motion || 'smooth'}>
      <AbsoluteFill style={{ background: brand.palette.stage }}>
        {t.items.map((item) => (
          <Sequence key={item.from} from={item.from} durationInFrames={item.dur}>
            <SceneView item={item} />
          </Sequence>
        ))}
        {plan.motion === 'dynamic' ? <Wipes t={t} /> : null}
        <Soundtrack t={t} brand={brand} music={music} mood={plan.music} track={plan.track} motion={plan.motion} />
        <Voice t={t} brand={brand} />
      </AbsoluteFill>
      </MotionContext.Provider>
    </BrandProvider>
  );
}

export function Root() {
  return (
    <>
    <Composition
      id="post"
      component={PostImage}
      fps={30}
      width={1080}
      height={1080}
      durationInFrames={1}
      defaultProps={{ slide: { kind: 'cover', headline: 'Posts about your real product', body: 'Made from your own site and screens.', kicker: 'New' }, brand: DEMO_BRAND, size: 'square' }}
      calculateMetadata={({ props }) => POST_SIZES[props.size] || POST_SIZES.square}
    />
    <Composition
      id="studio"
      component={StudioVideo}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={300}
      defaultProps={{ plan: DEMO_PLAN, brand: DEMO_BRAND, music: true }}
      calculateMetadata={({ props }) => ({ durationInFrames: timeline(props.plan).total, ...sizeOf(props.plan) })}
    />
    </>
  );
}
