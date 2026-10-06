import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import timing from './timing.cjs';
import { BACK, Check, Chip, Cursor, Frame, Headline, IN_OUT, Kicker, Logo, Paper, Ripple, Scene, Screen, Spotlight, Stage, camera, fitSize, mix, tw, useBrand, useSpring } from './kit.jsx';

const { timeline } = timing;

/* The scene library. Each scene type has a duration (frames at 30 fps, in whole beats of 15 frames so cuts land on the
   music), the sound cues it wants, a background, and a component that lays itself out for landscape, vertical and
   square canvases. The planner only fills in words and picks screens; how it moves is decided here. */

// A portrait frame (4:5) lays each scene out as a square, centred, over a full-bleed background; SceneView provides it.
const CanvasContext = React.createContext(null);
const portraitOf = (w, h) => h > w * 1.1 && h < w * 1.5;

const useCanvas = () => {
  const { width: w, height: h } = useVideoConfig();
  const inner = React.useContext(CanvasContext);
  return inner || { w, h, vertical: h > w * 1.2, square: Math.abs(w - h) < 10 };
};

const shotById = (brand, id) => brand.shots.find((s) => s.id === id) || brand.shots[0];
const elementOf = (shot, id) => (id && shot?.elements?.find((e) => e.id === id)) || null;

// ─── title ───────────────────────────────────────────────────────────────

function Title({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const sub = tw(f, 34, 52);
  const width = c.w - (c.vertical ? 140 : 260);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: c.vertical ? '0 70px' : '0 130px' }}>
      {scene.kicker ? <Kicker start={0}>{scene.kicker}</Kicker> : null}
      <Headline text={scene.headline} accent={scene.accent} start={5} stagger={4} color={p.stageInk} accentColor={p.glow} maxWidth={width} maxLines={c.vertical ? 4 : 3} max={c.vertical ? 140 : c.square ? 112 : 150} style={{ marginTop: scene.kicker ? 40 : 0 }} />
      {scene.sub ? (
        <p style={{ marginTop: 36, maxWidth: Math.min(width, 1150), color: p.stageMuted, fontFamily: brand.body, fontSize: c.vertical ? 38 : 32, lineHeight: 1.4, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>{scene.sub}</p>
      ) : null}
    </AbsoluteFill>
  );
}

// ─── hook: the work it takes off your hands ──────────────────────────────

function Hook({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const items = scene.lines.slice(0, 5);
  const maxWidth = c.w - (c.vertical ? 140 : 360);
  const longest = items.reduce((a, b) => (b.length > a.length ? b : a), '');
  const size = fitSize(longest.toUpperCase(), { family: brand.display, weight: 800, max: c.vertical ? 110 : 116, min: 40, maxWidth, maxLines: 1 });
  const strikeAt = 18 + items.length * 7;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: size * 0.06 }}>
        {items.map((line, i) => {
          const at = 4 + i * 7;
          const p0 = tw(f, at, at + 14);
          const strike = tw(f, strikeAt + i * 6, strikeAt + 12 + i * 6, IN_OUT);
          return (
            <div key={i} style={{ position: 'relative', opacity: p0, transform: `translateX(${(1 - p0) * -60}px)` }}>
              <span style={{ fontFamily: brand.display, fontWeight: 800, fontSize: size, lineHeight: 0.98, textTransform: 'uppercase', color: p.stageInk, opacity: mix(1, 0.32, strike) }}>{line}</span>
              <span style={{ position: 'absolute', left: -12, right: -12, top: '50%', height: size * 0.11, marginTop: -size * 0.03, borderRadius: 8, background: p.glow, transform: `scaleX(${strike})`, transformOrigin: 'left', boxShadow: `0 0 30px ${p.glow}99` }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
const hookCues = (scene) => {
  const n = Math.min(5, scene.lines.length);
  const strikeAt = 18 + n * 7;
  return [...Array.from({ length: n }, (_, i) => [4 + i * 7, 'tick-hi', 0.22]), ...Array.from({ length: n }, (_, i) => [strikeAt + 2 + i * 6, 'swipe', 0.32])];
};

// ─── reveal: the product, standing up out of the dark ────────────────────

function Reveal({ scene, dur }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const rise = tw(f, 0, 36);
  const tilt = tw(f, 0, 60, IN_OUT);
  const push = tw(f, 50, dur, IN_OUT);
  const chips = (scene.chips || []).slice(0, 3);
  const cap = tw(f, 4, 20);
  const mobile = c.vertical && brand.mobileShot;
  const shot = mobile ? brand.mobileShot : shotById(brand, scene.shot);
  const frameW = c.vertical ? (mobile ? 640 : 960) : c.square ? 920 : 1460;
  const viewH = mobile ? Math.round(640 * (shot.height / shot.width)) : Math.round(frameW * (c.vertical ? 0.78 : 0.6));
  const view = { w: frameW, h: Math.min(viewH, c.vertical ? 1180 : viewH) };
  const cam = camera(shot, view, null, 0);
  const spots = c.vertical
    ? [{ x: 40, y: view.h - 60, r: -3 }, { x: frameW - 380, y: 120, r: 3 }, { x: frameW - 440, y: view.h + 10, r: -2 }]
    : c.square
      ? [{ x: -40, y: view.h * 0.66, r: -3 }, { x: frameW - 340, y: 60, r: 3 }, { x: frameW - 350, y: view.h * 0.84, r: -2 }]
      : [{ x: -150, y: view.h * 0.62, r: -3 }, { x: frameW - 260, y: -40, r: 3 }, { x: frameW - 250, y: view.h * 0.78, r: -2 }];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: c.vertical ? 'center' : 'flex-start', paddingTop: c.vertical ? 0 : c.square ? 70 : 64 }}>
      {scene.caption ? (
        <p style={{ marginBottom: c.vertical ? 50 : 34, maxWidth: c.w - 160, textAlign: 'center', color: p.stageInk, fontFamily: brand.body, fontWeight: 600, fontSize: c.vertical ? 46 : 36, letterSpacing: '-0.02em', opacity: cap, transform: `translateY(${(1 - cap) * 14}px)` }}>{scene.caption}</p>
      ) : null}
      <div style={{ perspective: 2600 }}>
        <div style={{ position: 'relative', width: frameW, transform: `translateY(${(1 - rise) * 380}px) rotateX(${mix(22, 0, tilt)}deg) scale(${mix(0.92, 1, tilt) * mix(1, 1.05, push)})`, transformOrigin: '50% 0%', opacity: rise }}>
          <Frame url={mobile ? '' : new URL(brand.url).hostname} chrome={!mobile} radius={mobile ? 48 : 24} style={{ boxShadow: `0 0 0 1px rgb(255 255 255 / 0.06), 0 80px 160px -40px rgb(0 0 0 / 0.75), 0 0 140px ${p.glow}33` }}>
            <div style={{ width: view.w, height: view.h, background: p.bg }}>
              <Screen shot={shot} cam={cam} />
            </div>
          </Frame>
          {chips.map((chip, i) => (
            <FloatChip key={i} at={44 + i * 22} {...spots[i]} title={chip.title} sub={chip.sub} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function FloatChip({ at, x, y, r, title, sub }) {
  const f = useCurrentFrame();
  const s = useSpring(at, 12, 170);
  const bob = Math.sin((f - at) / 18) * 6;
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 5, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 40 + bob}px) rotate(${r}deg) scale(${mix(0.6, 1, s)})` }}>
      <Chip title={title} sub={sub} />
    </div>
  );
}
const revealCues = (scene) => [[0, 'whoosh', 0.45], ...(scene.chips || []).slice(0, 3).map((_, i) => [46 + i * 22, 'pop', 0.42])];

// ─── focus: one real element, zoomed into and clicked ────────────────────

const ZOOM_IN = [16, 62];
const PRESS = 92;

function Focus({ scene, dur }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const shot = shotById(brand, scene.shot);
  const el = elementOf(shot, scene.element);
  const zoom = el ? tw(f, ZOOM_IN[0], ZOOM_IN[1], IN_OUT) : tw(f, 10, dur, IN_OUT) * 0.35;
  const text = tw(f, 4, 22);

  const layout = c.vertical
    ? { text: { left: 70, top: 170, width: c.w - 140 }, frame: { left: 60, top: 780, w: c.w - 120, h: 1000 } }
    : c.square
      ? { text: { left: 70, top: 70, width: c.w - 140 }, frame: { left: 70, top: 400, w: c.w - 140, h: 600 } }
      : { text: { left: 120, top: 0, width: 640 }, frame: { left: 840, top: 150, w: 960, h: 700 } };
  const view = { w: layout.frame.w, h: layout.frame.h - 44 };
  // Without an element, drift across the screen instead of zooming.
  const focus = el || { x: shot.width * 0.5 - 200, y: Math.min(shot.height * 0.6, 900), w: 400, h: 200 };
  const cam = camera(shot, view, focus, zoom, { fill: c.vertical ? 0.7 : 0.55 });
  const rect = el ? cam.toView(el) : null;
  const spot = el ? tw(f, ZOOM_IN[1] + 2, ZOOM_IN[1] + 16) * (1 - tw(f, dur - 14, dur - 2)) : 0;
  const clicks = Boolean(el && scene.click !== false);
  const glide = tw(f, 50, PRESS - 4, IN_OUT);
  const press = f >= PRESS && f < PRESS + 8 ? Math.sin(((f - PRESS) / 8) * Math.PI) : 0;
  const target = rect ? { x: rect.x + Math.min(rect.w * 0.5, 120), y: rect.y + rect.h * 0.55 } : { x: 0, y: 0 };

  const align = c.vertical || c.square ? 'center' : 'left';
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', ...layout.text, height: c.vertical ? 560 : c.square ? 300 : c.h, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start', textAlign: align, opacity: 1 }}>
        {scene.step ? (
          <span style={{ fontFamily: brand.display, fontWeight: 900, fontSize: c.vertical ? 120 : c.square ? 76 : 170, lineHeight: 0.9, color: p.accent, opacity: text, transform: `translateY(${(1 - text) * 30}px)`, marginBottom: c.square ? 6 : 20 }}>{String(scene.step).padStart(2, '0')}</span>
        ) : null}
        <Headline text={scene.title} start={6} stagger={3} color={p.ink} accentColor={p.accent} accent={scene.accent} maxWidth={layout.text.width} maxLines={c.square ? 2 : 3} max={c.vertical ? 96 : c.square ? 64 : 84} min={34} align={align} />
        {scene.body && !c.square ? (
          <p style={{ marginTop: 26, color: p.muted, fontFamily: brand.body, fontSize: c.vertical ? 36 : 30, lineHeight: 1.45, opacity: tw(f, 18, 34), transform: `translateY(${(1 - tw(f, 18, 34)) * 14}px)` }}>{scene.body}</p>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: layout.frame.left, top: layout.frame.top, transform: `translateY(${(1 - tw(f, 0, 26)) * 120}px)`, opacity: tw(f, 0, 18) }}>
        <Frame url={shot.url ? new URL(shot.url).hostname : new URL(brand.url).hostname} radius={c.vertical ? 30 : 22}>
          <div style={{ position: 'relative', width: view.w, height: view.h, background: p.bg }}>
            <Screen shot={shot} cam={cam} />
            <Spotlight rect={rect} on={spot} color={p.accent} />
            {clicks ? <Cursor x={mix(view.w * 0.85, target.x, glide)} y={mix(view.h * 0.95, target.y, glide)} press={press} opacity={tw(f, 46, 52) * (1 - tw(f, dur - 16, dur - 8))} /> : null}
            {clicks ? <Ripple x={target.x} y={target.y} at={PRESS + 2} color={p.accent} /> : null}
          </div>
        </Frame>
      </div>
      {scene.progress ? <Progress {...scene.progress} /> : null}
    </AbsoluteFill>
  );
}
const focusCues = (scene, brand) => {
  const shot = shotById(brand, scene.shot);
  const el = elementOf(shot, scene.element);
  const cues = [[0, 'whoosh', 0.4]];
  if (el) cues.push([ZOOM_IN[1] + 2, 'tick-hi', 0.3]);
  if (el && scene.click !== false) cues.push([PRESS, 'click', 0.65]);
  return cues;
};

/** Walkthrough progress: one bar per step along the bottom. */
function Progress({ index, total, labels = [] }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  if (c.vertical || c.square) return null;
  return (
    <div style={{ position: 'absolute', left: 120, right: 120, bottom: 56, display: 'flex', gap: 16 }}>
      {Array.from({ length: total }, (_, i) => {
        const fill = i < index ? 1 : i === index ? tw(f, 0, 150, (t) => t) : 0;
        return (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 9, background: p.line, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${fill * 100}%`, background: p.accent }} />
            </div>
            <p style={{ marginTop: 12, color: i <= index ? p.ink : p.muted, fontFamily: brand.body, fontWeight: 600, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {String(i + 1).padStart(2, '0')} {labels[i] || ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── features ────────────────────────────────────────────────────────────

function Features({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const items = scene.items.slice(0, c.vertical ? 4 : 4);
  const cols = c.vertical ? 1 : c.square ? 2 : items.length;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: c.vertical ? '0 70px' : '0 120px' }}>
      <Headline text={scene.title} accent={scene.accent} start={0} stagger={3} color={p.ink} accentColor={p.accent} maxWidth={c.w - (c.vertical ? 140 : 300)} maxLines={2} max={c.vertical ? 100 : c.square ? 76 : 96} />
      <div style={{ marginTop: c.vertical ? 70 : 60, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: c.square ? 18 : 24, width: '100%' }}>
        {items.map((item, i) => {
          const s = tw(f, 16 + i * 6, 38 + i * 6);
          return (
            <article key={i} style={{ padding: c.square ? '26px 26px' : '36px 34px', borderRadius: 28, background: p.surface, boxShadow: `inset 0 0 0 1px ${p.line}`, opacity: s, transform: `translateY(${(1 - s) * 60}px)`, textAlign: 'left' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: 16, background: p.accent, color: p.accentInk, fontFamily: brand.display, fontWeight: 900, fontSize: 26 }}>{i + 1}</span>
              <h3 style={{ margin: '24px 0 0', color: p.ink, fontFamily: brand.body, fontWeight: 700, fontSize: c.square ? 26 : 30, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{item.title}</h3>
              {item.body && !c.square ? <p style={{ margin: '12px 0 0', color: p.muted, fontFamily: brand.body, fontSize: 22, lineHeight: 1.45 }}>{item.body}</p> : null}
            </article>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
const featureCues = (scene) => [[0, 'whoosh', 0.4], ...scene.items.slice(0, 4).map((_, i) => [18 + i * 6, 'pop', 0.35])];

// ─── checks ──────────────────────────────────────────────────────────────

function Checks({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const items = scene.items.slice(0, 4);
  const maxWidth = c.w - (c.vertical ? 260 : c.square ? 240 : 520);
  const longest = items.reduce((a, b) => (b.length > a.length ? b : a), '');
  const size = fitSize(longest, { family: brand.display, weight: 800, max: c.vertical ? 76 : c.square ? 64 : 84, min: 34, maxWidth, maxLines: c.vertical || c.square ? 2 : 1 });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: size * 0.45 }}>
        {items.map((item, i) => {
          const s = tw(f, 4 + i * 9, 26 + i * 9, BACK);
          const on = tw(f, 12 + i * 9, 24 + i * 9);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: size * 0.4, opacity: tw(f, 4 + i * 9, 14 + i * 9), transform: `translateX(${(1 - s) * 80}px)` }}>
              <Check size={size * 0.95} on={on} />
              <span style={{ maxWidth, fontFamily: brand.display, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: '-0.03em', color: p.stageInk }}>{item}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
const checkCues = (scene) => scene.items.slice(0, 4).map((_, i) => [12 + i * 9, 'pop', 0.48]);

// ─── stat ────────────────────────────────────────────────────────────────

function Stat({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const m = String(scene.value).match(/^(\D*)([\d,.]+)(.*)$/);
  const t = tw(f, 6, 46);
  let shown = scene.value;
  if (m) {
    const n = Number(m[2].replace(/,/g, ''));
    const decimals = (m[2].split('.')[1] || '').length;
    shown = `${m[1]}${(n * t).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}`;
  }
  const size = fitSize(scene.value, { family: brand.display, weight: 900, max: c.vertical ? 260 : 300, min: 80, maxWidth: c.w - 200, maxLines: 1 });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 100px' }}>
      <span style={{ fontFamily: brand.display, fontWeight: 900, fontSize: size, lineHeight: 0.9, color: p.glow, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{shown}</span>
      <p style={{ marginTop: 30, maxWidth: 1200, color: p.stageInk, fontFamily: brand.body, fontWeight: 600, fontSize: c.vertical ? 46 : 40, lineHeight: 1.3, opacity: tw(f, 20, 36) }}>{scene.label}</p>
    </AbsoluteFill>
  );
}
const statCues = () => [[6, 'whoosh', 0.35], [46, 'tick-hi', 0.4]];

// ─── metrics ─────────────────────────────────────────────────────────────

/** A value with its number counted up to t (0..1): "26 of 28", "$29", "10x", "1,200+". */
function counted(value, t) {
  const m = String(value).match(/^(\D*)([\d,.]+)(.*)$/);
  if (!m) return value;
  const n = Number(m[2].replace(/,/g, ''));
  const decimals = (m[2].split('.')[1] || '').length;
  return `${m[1]}${(n * t).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}`;
}

function Metrics({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const items = scene.items.slice(0, 3);
  const cols = c.vertical ? 1 : items.length;
  const gap = c.square ? 18 : 28;
  const colW = c.vertical ? c.w - 180 : (c.w - (c.square ? 140 : 260) - gap * (cols - 1)) / cols;
  const longest = items.reduce((a, b) => (String(b.value).length > String(a.value).length ? b : a), items[0]).value;
  const size = fitSize(String(longest), { family: brand.display, weight: 900, max: c.vertical ? 150 : c.square ? 96 : 140, min: 44, maxWidth: colW - 60, maxLines: 1 });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: c.vertical ? '0 90px' : c.square ? '0 70px' : '0 130px' }}>
      {scene.title ? <Headline text={scene.title} accent={scene.accent} start={0} stagger={3} color={p.stageInk} accentColor={p.glow} maxWidth={c.w - (c.vertical ? 180 : 300)} maxLines={2} max={c.vertical ? 84 : c.square ? 60 : 76} style={{ marginBottom: c.vertical ? 70 : 54 }} /> : null}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, width: '100%' }}>
        {items.map((item, i) => {
          const s = tw(f, 8 + i * 8, 28 + i * 8, BACK);
          const count = tw(f, 12 + i * 8, 52 + i * 8);
          return (
            <div key={i} style={{ padding: c.square ? '30px 24px' : '44px 34px', borderRadius: 30, background: `${p.glow}12`, boxShadow: `inset 0 0 0 1px ${p.glow}33`, textAlign: 'center', opacity: tw(f, 8 + i * 8, 18 + i * 8), transform: `translateY(${(1 - s) * 50}px)` }}>
              <span style={{ display: 'block', fontFamily: brand.display, fontWeight: 900, fontSize: size, lineHeight: 0.95, color: p.glow, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>{counted(item.value, count)}</span>
              <span style={{ display: 'block', marginTop: 18, color: p.stageInk, fontFamily: brand.body, fontWeight: 600, fontSize: c.vertical ? 40 : c.square ? 26 : 32, lineHeight: 1.3, opacity: tw(f, 30 + i * 8, 44 + i * 8) }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
const metricsCues = (scene) => [[0, 'whoosh', 0.38], ...scene.items.slice(0, 3).map((_, i) => [52 + i * 8, 'tick-hi', 0.36])];

// ─── before / after ──────────────────────────────────────────────────────

function Mark({ size, on, ok, color }) {
  return (
    <span style={{ display: 'grid', placeItems: 'center', width: size, height: size, flex: 'none', borderRadius: 999, background: ok ? color : 'transparent', boxShadow: ok ? 'none' : `inset 0 0 0 2px ${color}`, transform: `scale(${mix(0.4, 1, on)})`, opacity: on }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke={ok ? '#fff' : color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {ok ? <path d="m5 12.5 4.5 4.5L19 7" /> : <path d="M6 6l12 12M18 6 6 18" />}
      </svg>
    </span>
  );
}

function Compare({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const before = scene.before.items.slice(0, 4);
  const after = scene.after.items.slice(0, 4);
  const stacked = c.vertical;
  const colW = stacked ? c.w - 180 : (c.w - (c.square ? 140 : 300) - 40) / 2;
  const longest = [...before, ...after].reduce((a, b) => (b.length > a.length ? b : a), '');
  const size = fitSize(longest, { family: brand.body, weight: 700, max: c.vertical ? 50 : c.square ? 34 : 42, min: 22, maxWidth: colW - 130, maxLines: 2 });
  const column = (side, items, ok, start) => {
    const head = tw(f, start, start + 14);
    return (
      <div style={{ flex: 1, padding: c.square ? '26px 24px' : '36px 36px', borderRadius: 30, background: ok ? p.surface : 'transparent', boxShadow: `inset 0 0 0 ${ok ? 2 : 1}px ${ok ? p.accent : p.line}`, opacity: Math.max(0.0001, head) * (ok ? 1 : 0.85), transform: `translateY(${(1 - head) * 30}px)` }}>
        <span style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 999, background: ok ? p.accent : p.line, color: ok ? p.accentInk : p.muted, fontFamily: brand.body, fontWeight: 700, fontSize: c.vertical ? 30 : 22, letterSpacing: '0.02em' }}>{side.label}</span>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: size * 0.55 }}>
          {items.map((item, i) => {
            const at = start + 10 + i * 7;
            const strike = ok ? 0 : tw(f, at + 14, at + 26, IN_OUT);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: size * 0.5, opacity: tw(f, at, at + 10) }}>
                <Mark size={size * 1.15} on={tw(f, at + 4, at + 14, BACK)} ok={ok} color={ok ? p.accent : p.muted} />
                <span style={{ position: 'relative', color: ok ? p.ink : p.muted, fontFamily: brand.body, fontWeight: ok ? 700 : 600, fontSize: size, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  {item}
                  {!ok ? <i style={{ position: 'absolute', left: 0, top: '52%', height: 3, width: `${strike * 100}%`, background: p.muted, borderRadius: 2 }} /> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: c.vertical ? '0 90px' : c.square ? '0 70px' : '0 150px' }}>
      {scene.title ? <Headline text={scene.title} accent={scene.accent} start={0} stagger={3} color={p.ink} accentColor={p.accent} maxWidth={c.w - (c.vertical ? 180 : 300)} maxLines={2} max={c.vertical ? 80 : c.square ? 56 : 70} style={{ marginBottom: c.vertical ? 56 : 44 }} /> : null}
      <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', gap: 40, width: '100%', alignItems: 'stretch' }}>
        {column(scene.before, before, false, 6)}
        {column(scene.after, after, true, 52)}
      </div>
    </AbsoluteFill>
  );
}
const compareCues = (scene) => [
  [0, 'whoosh', 0.34],
  ...scene.before.items.slice(0, 4).map((_, i) => [6 + 10 + i * 7 + 16, 'swipe', 0.26]),
  [50, 'whoosh', 0.3],
  ...scene.after.items.slice(0, 4).map((_, i) => [52 + 10 + i * 7 + 6, 'pop', 0.4]),
];

// ─── quote ───────────────────────────────────────────────────────────────

function Quote({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const words = scene.text.split(/\s+/);
  const maxWidth = c.w - (c.vertical ? 180 : c.square ? 160 : 420);
  const size = fitSize(scene.text, { family: brand.display, weight: 700, max: c.vertical ? 72 : c.square ? 54 : 66, min: 28, maxWidth, maxLines: c.vertical ? 7 : 5 });
  const per = Math.min(1.6, 40 / Math.max(1, words.length));
  const name = tw(f, 14 + words.length * per, 30 + words.length * per);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: c.vertical ? '0 90px' : '0 160px' }}>
      <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: size * 2.4, lineHeight: 0.6, height: size * 1.1, color: p.glow, opacity: tw(f, 0, 12), transform: `scale(${mix(0.6, 1, tw(f, 0, 16, BACK))})` }}>“</span>
      <p style={{ margin: 0, maxWidth, fontFamily: brand.display, fontWeight: 700, fontSize: size, lineHeight: 1.22, letterSpacing: '-0.02em', color: p.stageInk }}>
        {words.map((w, i) => {
          const t = tw(f, 8 + i * per, 16 + i * per);
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: '0.25em', opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>
              {w}
            </span>
          );
        })}
      </p>
      <p style={{ marginTop: size * 0.9, fontFamily: brand.body, fontSize: c.vertical ? 38 : 30, lineHeight: 1.35, opacity: name, transform: `translateY(${(1 - name) * 12}px)` }}>
        <b style={{ color: p.stageInk, fontWeight: 700 }}>{scene.name}</b>
        {scene.role ? <span style={{ color: p.stageMuted }}>{` · ${scene.role}`}</span> : null}
      </p>
    </AbsoluteFill>
  );
}
const quoteCues = () => [[0, 'whoosh', 0.32], [2, 'pop', 0.22]];

// ─── end card ────────────────────────────────────────────────────────────

function End({ scene }) {
  const brand = useBrand();
  const p = brand.palette;
  const c = useCanvas();
  const f = useCurrentFrame();
  const mark = useSpring(4, 13, 150);
  const cta = useSpring(30, 15, 150);
  const small = tw(f, 40, 58);
  const host = new URL(brand.url).hostname.replace(/^www\./, '');
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: c.vertical ? '0 70px' : '0 120px' }}>
      <div style={{ transform: `scale(${mix(0.5, 1, mark)})`, opacity: Math.min(1, mark * 1.5) }}>
        <Logo height={c.vertical ? 120 : c.square ? 96 : 120} />
      </div>
      {scene.headline ? <Headline text={scene.headline} accent={scene.accent} start={12} stagger={2} color={p.stageInk} accentColor={p.glow} maxWidth={c.w - (c.vertical ? 140 : 300)} maxLines={c.vertical ? 3 : 2} max={c.vertical ? 76 : 68} style={{ marginTop: 44 }} /> : null}
      <div style={{ marginTop: 52, opacity: Math.min(1, cta * 1.4), transform: `translateY(${(1 - cta) * 30}px) scale(${mix(0.85, 1, cta)})` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: c.vertical ? '28px 48px' : '22px 42px', borderRadius: brand.buttonRadius || 999, background: p.accent, color: p.accentInk, fontFamily: brand.body, fontWeight: 700, fontSize: c.vertical ? 38 : 30, boxShadow: `0 0 0 8px ${p.accent}26, 0 0 90px ${p.accent}66` }}>
          {scene.cta || 'Get started'}
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <p style={{ marginTop: 30, color: p.stageMuted, fontFamily: brand.body, fontWeight: 500, fontSize: c.vertical ? 32 : 26, opacity: small, transform: `translateY(${(1 - small) * 10}px)` }}>{host}</p>
    </AbsoluteFill>
  );
}
const endCues = () => [[-46, 'riser', 0.4], [4, 'impact', 0.75], [30, 'pop', 0.4], [42, 'tick', 0.22]];

// ─── registry ────────────────────────────────────────────────────────────

export const SCENES = {
  title: { Component: Title, bg: 'stage', cues: () => [[0, 'whoosh', 0.42], [2, 'pop', 0.25]] },
  hook: { Component: Hook, bg: 'stage', cues: hookCues },
  reveal: { Component: Reveal, bg: 'stage', cues: revealCues },
  focus: { Component: Focus, bg: 'paper', cues: focusCues },
  features: { Component: Features, bg: 'paper', cues: featureCues },
  checks: { Component: Checks, bg: 'stage', cues: checkCues },
  stat: { Component: Stat, bg: 'stage', cues: statCues },
  end: { Component: End, bg: 'stage', cues: endCues },
  metrics: { Component: Metrics, bg: 'stage', cues: metricsCues },
  compare: { Component: Compare, bg: 'paper', cues: compareCues },
  quote: { Component: Quote, bg: 'stage', cues: quoteCues },
};

export { timeline };

export function SceneView({ item }) {
  const def = SCENES[item.scene.type];
  const C = def.Component;
  const { width, height } = useVideoConfig();
  const body = (
    <Scene dur={item.dur} outFrames={item.scene.type === 'end' ? 0 : 10}>
      <C scene={item.scene} dur={item.dur} />
    </Scene>
  );
  return (
    <AbsoluteFill>
      {def.bg === 'stage' ? <Stage /> : <Paper />}
      {portraitOf(width, height) ? (
        <CanvasContext.Provider value={{ w: width, h: width, vertical: false, square: true }}>
          <div style={{ position: 'absolute', left: 0, top: (height - width) / 2, width, height: width }}>{body}</div>
        </CanvasContext.Provider>
      ) : (
        body
      )}
    </AbsoluteFill>
  );
}

