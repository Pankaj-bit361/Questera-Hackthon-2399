import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Easing, Img, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/* The motion kit every template is drawn with. Everything that moves is a function of the frame number, so preview
   and render match. The brand (palette, fonts, logo, captured screens) arrives as input props from the site capture. */

export const EXPO = Easing.bezier(0.16, 1, 0.3, 1);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);

export const tw = (f, a, b, easing = EXPO) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
export const mix = (a, b, t) => a + (b - a) * t;

export function useSpring(delay, damping = 16, stiffness = 140) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness, mass: 0.9 } });
}

// ─── brand ───────────────────────────────────────────────────────────────

const BrandContext = createContext(null);
export const useBrand = () => useContext(BrandContext);

const FALLBACK_SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";

// One family name per font file, so swapping which captured font plays which role (the brand kit) takes effect in the
// browser preview, where faces stay registered on the page.
const familyOf = (role, font) => `Brand${role}${String(font?.files?.[0]?.file || '').replace(/[^A-Za-z0-9]/g, '')}`;

/** Loads the brand's fonts before anything is drawn, then provides the brand to every scene. */
export function BrandProvider({ brand, children }) {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Loading brand fonts'));
  useEffect(() => {
    const faces = [];
    for (const [role, font] of Object.entries(brand.fonts || {})) {
      if (!font) continue;
      for (const file of font.files) {
        faces.push(new FontFace(familyOf(role, font), `url(${asset(brand, file.file)})`, { weight: file.weight || '400' }));
      }
    }
    Promise.allSettled(faces.map((f) => f.load().then((loaded) => document.fonts.add(loaded))))
      .then(() => document.fonts.ready)
      .then(() => {
        setReady(true);
        continueRender(handle);
      });
  }, [brand, handle]);
  const value = useMemo(() => {
    const display = brand.fonts?.display ? `'${familyOf('display', brand.fonts.display)}', ${FALLBACK_SANS}` : FALLBACK_SANS;
    const body = brand.fonts?.body ? `'${familyOf('body', brand.fonts.body)}', ${FALLBACK_SANS}` : display;
    return { ...brand, display, body, upper: brand.typeStyle?.transform === 'uppercase' };
  }, [brand]);
  if (!ready) return null;
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

// assetQuery: the browser preview's signed file ticket (?t=…).
export const asset = (brand, file) => `${brand.assetBase}/${file}${brand.assetQuery || ''}`;

// ─── text that fits ──────────────────────────────────────────────────────

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

function lines(text, font, size, maxWidth, spacing) {
  const g = canvas.getContext('2d');
  g.font = `${font.weight} ${size}px ${font.family}`;
  const width = (s) => g.measureText(s).width + spacing * size * s.length;
  const words = text.split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (width(next) <= maxWidth || !line) line = next;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return { count: out.length, widest: Math.max(...out.map(width)) };
}

/** The largest font size (≤ max) at which `text` fits in maxWidth on at most maxLines lines. Measured, not guessed. */
export function fitSize(text, { family, weight = 700, max, min = 16, maxWidth, maxLines = 2, spacing = 0 }) {
  if (!canvas || !text) return max;
  for (let size = max; size > min; size -= 2) {
    const m = lines(text, { family, weight }, size, maxWidth, spacing);
    if (m.count <= maxLines && m.widest <= maxWidth) return size;
  }
  return min;
}

/** Words that rise out of a mask, one after another. `accent` marks words (by text) painted in the accent colour. */
export function Words({ text, start = 0, stagger = 3, dur = 18, accent = [], accentStyle, style }) {
  const f = useCurrentFrame();
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const marks = new Set(accent.map((a) => a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  return (
    <span style={style}>
      {words.map((word, i) => {
        const p = tw(f, start + i * stagger, start + i * stagger + dur);
        const key = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.08em 0.04em 0.16em', margin: `-0.08em ${i < words.length - 1 ? '0.2em' : '0'} -0.16em -0.04em` }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 5}deg)`, transformOrigin: '0 100%', ...(marks.has(key) ? accentStyle : null) }}>{word}</span>
          </span>
        );
      })}
    </span>
  );
}

/** A headline in the brand's display face, sized to fit its box. */
export function Headline({ text, accent, start = 0, color, accentColor, maxWidth, maxLines = 2, max = 120, min = 36, align = 'center', stagger = 3, style }) {
  const brand = useBrand();
  const weight = Math.max(700, brand.typeStyle?.weight || 700);
  const shown = brand.upper ? String(text).toUpperCase() : text;
  const size = fitSize(shown, { family: brand.display, weight, max, min, maxWidth, maxLines, spacing: -0.02 });
  return (
    <h1 style={{ margin: 0, maxWidth, fontFamily: brand.display, fontWeight: weight, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.025em', color, textAlign: align, textWrap: 'balance', ...style }}>
      <Words text={shown} start={start} stagger={stagger} accent={accent || []} accentStyle={{ color: accentColor }} />
    </h1>
  );
}

// ─── stages ──────────────────────────────────────────────────────────────

function contour(cx, cy, r, seed, squash) {
  let d = '';
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const k = r * (1 + 0.06 * Math.sin(3 * t + seed) + 0.04 * Math.sin(5 * t + seed * 1.7) + 0.02 * Math.sin(9 * t + seed * 0.6));
    d += `${i ? 'L' : 'M'}${(cx + k * Math.cos(t)).toFixed(1)} ${(cy + k * squash * Math.sin(t)).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** The cinematic dark stage: brand-tinted night, light from above, the brand colour glowing on the horizon. */
export function Stage({ glow = 1, peak = 0.95 }) {
  const brand = useBrand();
  const p = brand.palette;
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const breathe = f * 0.012;
  return (
    <AbsoluteFill style={{ background: p.stage, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 42% at 50% -8%, ${p.glow}22, transparent 72%)` }} />
      <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={contour(width / 2, height * peak, (110 + i * 76) * (Math.max(width, height) / 1600), i * 0.9 + breathe * 0.6, 0.5)} fill="none" stroke={p.glow} strokeWidth={1.2} opacity={Math.max(0.08, 0.26 - i * 0.012)} />
        ))}
      </svg>
      <div style={{ position: 'absolute', left: '50%', top: `${peak * 100}%`, width: Math.max(width, height) * 0.95, height: Math.max(width, height) * 0.58, borderRadius: 9999, transform: 'translate(-50%, -50%)', opacity: glow, background: `radial-gradient(closest-side, ${p.glow}55, ${p.glow}14 55%, transparent)` }} />
    </AbsoluteFill>
  );
}

/** Daylight: the site's own background with a faint dot grid, for scenes that show its screens. */
export function Paper() {
  const p = useBrand().palette;
  return (
    <AbsoluteFill style={{ background: p.bg }}>
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${p.line} 1.3px, transparent 1.3px)`, backgroundSize: '30px 30px', maskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black, transparent)', WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black, transparent)' }} />
    </AbsoluteFill>
  );
}

/**
 * How scenes hand over to each other (the brand kit's Motion): 'smooth' eases in and lifts away with a soft blur,
 * 'dynamic' slides through (Root.jsx adds an accent-colour wipe over each cut), 'clean' crossfades and nothing else.
 */
export const MotionContext = createContext('smooth');

/** A scene's envelope, in the video's motion style. */
export function Scene({ dur, children, inFrames = 12, outFrames = 10, push = true }) {
  const f = useCurrentFrame();
  const motion = useContext(MotionContext);
  const { width } = useVideoConfig();
  const enter = inFrames ? tw(f, 0, inFrames) : 1;
  const exit = outFrames ? tw(f, dur - outFrames, dur, IN_OUT) : 0;
  if (motion === 'clean') return <AbsoluteFill style={{ opacity: tw(f, 0, 8) * (1 - (outFrames ? tw(f, dur - 8, dur) : 0)) }}>{children}</AbsoluteFill>;
  if (motion === 'dynamic') {
    const into = inFrames ? tw(f, 0, 14, IN_OUT) : 1;
    const shift = (1 - into) * width * 0.12 - exit * width * 0.12;
    const scale = push ? mix(1.06, 1, into) * mix(1, 1.04, exit) : 1;
    return <AbsoluteFill style={{ opacity: Math.min(1, into * 1.6) * (1 - exit), transform: `translateX(${shift}px) scale(${scale})`, filter: exit > 0.05 || into < 0.95 ? `blur(${Math.max(1 - into, exit) * 6}px)` : undefined }}>{children}</AbsoluteFill>;
  }
  const scale = push ? mix(1.04, 1, enter) * mix(1, 0.97, exit) : 1;
  return <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${scale})`, filter: exit > 0 ? `blur(${exit * 8}px)` : undefined }}>{children}</AbsoluteFill>;
}

// ─── pieces ──────────────────────────────────────────────────────────────

export function Kicker({ children, start = 0, dark = true }) {
  const brand = useBrand();
  const p = brand.palette;
  const f = useCurrentFrame();
  const t = tw(f, start, start + 16);
  const color = dark ? p.glow : p.accent;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '10px 22px 10px 16px', borderRadius: 999, background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}44`, color: dark ? p.glow : p.ink, fontFamily: brand.body, fontWeight: 600, fontSize: 24, opacity: t, transform: `translateY(${(1 - t) * 18}px)` }}>
      <i style={{ width: 10, height: 10, borderRadius: 9, background: color }} />
      {children}
    </span>
  );
}

/** The arrow pointer, ink with a white edge. */
export function Cursor({ x, y, press = 0, opacity = 1, scale = 1.6 }) {
  return (
    <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: x, top: y, width: 24 * scale, height: 24 * scale, zIndex: 50, opacity, transform: `translate(-22%, -12%) scale(${1 - press * 0.16})`, transformOrigin: '20% 15%', filter: 'drop-shadow(0 6px 10px rgb(0 0 0 / 0.35))' }}>
      <path d="M5.5 3.2v15.6l4.1-4 2.6 6 2.7-1.2-2.6-5.9h5.6z" fill="#0e0f0c" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Ripple({ x, y, at, color }) {
  const f = useCurrentFrame();
  const p = tw(f, at, at + 20);
  if (f < at || p >= 1) return null;
  return <span style={{ position: 'absolute', left: x, top: y, width: 100, height: 100, marginLeft: -50, marginTop: -50, borderRadius: 999, border: `3px solid ${color}`, transform: `scale(${0.2 + p})`, opacity: 1 - p, zIndex: 49 }} />;
}

export function Check({ size = 40, on = 1 }) {
  const p = useBrand().palette;
  return (
    <span style={{ display: 'grid', placeItems: 'center', width: size, height: size, flex: 'none', borderRadius: 999, background: p.glow, color: p.stage, transform: `scale(${mix(0.3, 1, on)})`, opacity: on }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12.5 4.5 4.5L19 7" />
      </svg>
    </span>
  );
}

/** A floating note, like a toast from the product. */
export function Chip({ title, sub, style }) {
  const brand = useBrand();
  const p = brand.palette;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px 14px 14px', borderRadius: 22, background: '#ffffff', boxShadow: '0 0 0 1px rgb(0 0 0 / 0.06), 0 30px 60px -20px rgb(0 0 0 / 0.55)', fontFamily: brand.body, whiteSpace: 'nowrap', ...style }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 14, background: p.accent, color: p.accentInk }}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      </span>
      <span>
        <b style={{ display: 'block', color: '#0e0f0c', fontSize: 20, fontWeight: 650, letterSpacing: '-0.01em' }}>{title}</b>
        {sub ? <small style={{ display: 'block', color: '#6a6c6a', fontSize: 15, marginTop: 2 }}>{sub}</small> : null}
      </span>
    </div>
  );
}

/** The brand's logo: its own file on the plate it was designed for, or its wordmark in the display face. */
export function Logo({ height = 90, onDark = true }) {
  const brand = useBrand();
  const p = brand.palette;
  const logo = brand.logo;
  if (logo?.file) {
    const ratio = logo.w && logo.h ? logo.w / logo.h : 3;
    const plate = logo.bg && onDark;
    const img = <Img src={asset(brand, logo.file)} style={{ height, width: height * ratio, objectFit: 'contain' }} />;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.3 }}>
        {plate ? <span style={{ display: 'inline-flex', padding: `${height * 0.28}px ${height * 0.4}px`, borderRadius: height * 0.35, background: logo.bg }}>{img}</span> : img}
        {logo.text ? <span style={{ fontFamily: brand.display, fontWeight: 800, fontSize: height * 0.9, color: onDark ? p.stageInk : p.ink }}>{logo.text}</span> : null}
      </span>
    );
  }
  const name = logo?.text || brand.siteName;
  const color = logo?.color && onDark ? logo.color : onDark ? p.glow : p.accent;
  return <span style={{ fontFamily: brand.display, fontWeight: 900, fontSize: height * 1.25, lineHeight: 1, letterSpacing: '-0.02em', color }}>{name}</span>;
}

// ─── captured screens ────────────────────────────────────────────────────

/** A browser window around a captured screen. */
export function Frame({ url, children, radius = 22, chrome = true, style }) {
  const brand = useBrand();
  return (
    <div style={{ borderRadius: radius, overflow: 'hidden', background: '#fff', boxShadow: '0 0 0 1px rgb(0 0 0 / 0.08), 0 70px 140px -50px rgb(0 0 0 / 0.65)', ...style }}>
      {chrome ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', background: '#f3f4f2', borderBottom: '1px solid #e2e4df' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <i key={c} style={{ width: 12, height: 12, borderRadius: 9, background: c, opacity: 0.85 }} />
          ))}
          <span style={{ margin: '0 auto', padding: '5px 22px', borderRadius: 999, background: '#fff', boxShadow: 'inset 0 0 0 1px #e2e4df', color: '#6a6c6a', fontFamily: brand.body, fontSize: 14 }}>{url}</span>
          <span style={{ width: 52 }} />
        </div>
      ) : null}
      <div style={{ position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

/**
 * A captured screen seen through a camera. `view` is the size of the window it is shown in; `focus` (an element
 * rectangle in the screenshot's CSS pixels) is what the camera moves to as `zoom` goes 0 → 1. Returns the screen and,
 * for overlays, where the focus ends up inside the window.
 */
export function camera(shot, view, focus, zoom, { fill = 0.5, maxScale = 2.4 } = {}) {
  const base = Math.max(view.w / shot.width, view.h / shot.height);
  const fit = view.w / shot.width;
  const start = Math.max(fit, base);
  let target = start;
  let fx = shot.width / 2;
  let fy = Math.min(shot.height / 2, view.h / start / 2);
  if (focus) {
    target = Math.min(maxScale * start, Math.max(start, (view.w * fill) / Math.max(focus.w, 60)));
    fx = focus.x + focus.w / 2;
    fy = focus.y + focus.h / 2;
  }
  const s = mix(start, target, zoom);
  const startX = view.w / 2 - (shot.width / 2) * start;
  const startY = 0;
  const clampX = (x) => Math.min(0, Math.max(view.w - shot.width * s, x));
  const clampY = (y) => Math.min(0, Math.max(view.h - shot.height * s, y));
  const endX = clampX(view.w / 2 - fx * target);
  const endY = clampY(view.h / 2 - fy * target);
  const x = mix(clampX(startX), endX, zoom);
  const y = mix(clampY(startY), endY, zoom);
  const toView = (r) => ({ x: x + r.x * s, y: y + r.y * s, w: r.w * s, h: r.h * s });
  return { x, y, s, toView };
}

export function Screen({ shot, cam }) {
  const brand = useBrand();
  return <Img src={asset(brand, shot.file)} style={{ position: 'absolute', left: cam.x, top: cam.y, width: shot.width * cam.s, height: shot.height * cam.s, maxWidth: 'none' }} />;
}

/** A soft spotlight ring around an element on screen. */
export function Spotlight({ rect, on, color }) {
  if (!rect || on <= 0) return null;
  const pad = 10;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `rgb(0 0 0 / ${0.32 * on})`, clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.y - pad}px, ${rect.x - pad}px ${rect.y - pad}px, ${rect.x - pad}px ${rect.y + rect.h + pad}px, ${rect.x + rect.w + pad}px ${rect.y + rect.h + pad}px, ${rect.x + rect.w + pad}px ${rect.y - pad}px, 0 ${rect.y - pad}px)` }} />
      <div style={{ position: 'absolute', left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2, borderRadius: 14, boxShadow: `0 0 0 ${3 * on}px ${color}, 0 0 ${40 * on}px ${color}88`, opacity: on }} />
    </>
  );
}
