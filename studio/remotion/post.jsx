import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { BrandProvider, Frame, Logo, asset, camera, fitSize, useBrand } from './kit.jsx';

/*
 * Post images for the autopilot: one still per slide, in the brand captured from the site (its colours, fonts, logo
 * and real screens). Kinds:
 *   shot   - a real screen of the product in a browser window, moved in on one element, with a headline
 *   cover  - a carousel's first slide: the promise of the post
 *   point  - one point of a carousel: its number, a short title and a sentence
 *   end    - the last slide: what to do next, and where
 * Text is static (a still has no time for words to rise in), sized to fit its box with the brand's own metrics.
 */

export const POST_SIZES = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 627 },
};

function Title({ text, maxWidth, max, min = 34, maxLines = 3, color, align = 'left' }) {
  const brand = useBrand();
  const weight = Math.max(700, brand.typeStyle?.weight || 700);
  const shown = brand.upper ? String(text || '').toUpperCase() : String(text || '');
  const size = fitSize(shown, { family: brand.display, weight, max, min, maxWidth, maxLines, spacing: -0.02 });
  return (
    <h1 style={{ margin: 0, maxWidth, fontFamily: brand.display, fontWeight: weight, fontSize: size, lineHeight: 1.05, letterSpacing: '-0.025em', color, textAlign: align, textWrap: 'balance' }}>
      {shown}
    </h1>
  );
}

function Body({ text, size, color, maxWidth }) {
  const brand = useBrand();
  return <p style={{ margin: 0, maxWidth, fontFamily: brand.body, fontSize: size, lineHeight: 1.4, color, textWrap: 'pretty' }}>{text}</p>;
}

/** The brand's night stage, without motion: its colour, light from above, a glow on the horizon. */
function Backdrop({ dark }) {
  const p = useBrand().palette;
  if (!dark) return <AbsoluteFill style={{ background: p.bg }} />;
  return (
    <AbsoluteFill style={{ background: p.stage }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 45% at 50% -10%, ${p.glow}2e, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 40% at 50% 112%, ${p.glow}3a, transparent 70%)` }} />
    </AbsoluteFill>
  );
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function ShotSlide({ slide, w, h }) {
  const brand = useBrand();
  const p = brand.palette;
  const shots = brand.shots || [];
  const shot = shots.find((s) => s.id === slide.shotId) || shots[0];
  const wide = w > h * 1.4;
  const pad = Math.round(w * 0.07);
  const textW = wide ? w * 0.4 : w - pad * 2;
  const frameW = wide ? w * 0.5 : w - pad * 2;
  const frameH = wide ? h - pad * 2 : h * (slide.headline ? 0.56 : 0.78);
  const view = { w: frameW, h: frameH - 44 };
  const focus = slide.focus ? shot.elements?.find((e) => e.id === slide.focus) : null;
  const cam = camera(shot, view, focus, focus ? 1 : 0, { fill: 0.62, maxScale: 2 });
  return (
    <AbsoluteFill>
      <Backdrop dark />
      <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: wide ? 'row' : 'column', gap: pad * 0.7, alignItems: wide ? 'center' : 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: textW, flex: wide ? '0 0 auto' : undefined }}>
          <div style={{ height: wide ? 30 : 38 }}><Logo height={wide ? 26 : 32} /></div>
          {slide.headline ? <Title text={slide.headline} maxWidth={textW} max={wide ? 52 : 72} maxLines={wide ? 4 : 3} color={p.stageInk} /> : null}
          {slide.body && wide ? <Body text={slide.body} size={22} color={p.stageMuted} maxWidth={textW} /> : null}
        </div>
        <Frame url={hostOf(brand.url)} radius={wide ? 14 : 18} style={{ width: frameW, height: frameH, flex: '0 0 auto' }}>
          <div style={{ position: 'relative', width: view.w, height: view.h, overflow: 'hidden' }}>
            <Img src={asset(brand, shot.file)} style={{ position: 'absolute', left: cam.x, top: cam.y, width: shot.width * cam.s, height: shot.height * cam.s, maxWidth: 'none' }} />
          </div>
        </Frame>
      </div>
    </AbsoluteFill>
  );
}

function CoverSlide({ slide, w, h }) {
  const brand = useBrand();
  const p = brand.palette;
  const pad = Math.round(w * 0.08);
  return (
    <AbsoluteFill>
      <Backdrop dark />
      <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Logo height={34} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {slide.kicker ? (
            <span style={{ alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 999, background: p.accentSoft, color: p.glow, fontFamily: brand.body, fontWeight: 600, fontSize: 24 }}>{slide.kicker}</span>
          ) : null}
          <Title text={slide.headline} maxWidth={w - pad * 2} max={h > w ? 104 : 92} maxLines={4} color={p.stageInk} />
          {slide.body ? <Body text={slide.body} size={30} color={p.stageMuted} maxWidth={w - pad * 2} /> : null}
        </div>
        <span style={{ fontFamily: brand.body, fontSize: 24, color: p.stageMuted }}>Swipe →</span>
      </div>
    </AbsoluteFill>
  );
}

function PointSlide({ slide, w, h }) {
  const brand = useBrand();
  const p = brand.palette;
  const pad = Math.round(w * 0.08);
  const light = p.theme !== 'dark';
  const ink = light ? p.ink : p.stageInk;
  return (
    <AbsoluteFill>
      <Backdrop dark={!light} />
      <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {slide.index ? (
          <span style={{ fontFamily: brand.display, fontWeight: 800, fontSize: 30, color: p.accent }}>
            {String(slide.index).padStart(2, '0')}<span style={{ color: light ? p.muted : p.stageMuted, fontWeight: 500 }}> / {String(slide.total).padStart(2, '0')}</span>
          </span>
        ) : (
          <div style={{ height: 34 }}><Logo height={30} onDark={!light} /></div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          <div style={{ width: 72, height: 6, borderRadius: 3, background: p.accent }} />
          <Title text={slide.headline} maxWidth={w - pad * 2} max={h > w ? 88 : 76} maxLines={4} color={ink} />
          {slide.body ? <Body text={slide.body} size={h > w ? 36 : 32} color={light ? p.muted : p.stageMuted} maxWidth={w - pad * 2} /> : null}
        </div>
        {slide.index ? <div style={{ height: 34, opacity: 0.85 }}><Logo height={26} onDark={!light} /></div> : <span style={{ fontFamily: brand.body, fontSize: 24, color: light ? p.muted : p.stageMuted }}>{hostOf(brand.url)}</span>}
      </div>
    </AbsoluteFill>
  );
}

function EndSlide({ slide, w, h }) {
  const brand = useBrand();
  const p = brand.palette;
  const pad = Math.round(w * 0.08);
  return (
    <AbsoluteFill>
      <Backdrop dark />
      <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40, textAlign: 'center' }}>
        <Logo height={56} />
        <Title text={slide.headline} maxWidth={w - pad * 2} max={h > w ? 84 : 72} maxLines={3} color={p.stageInk} align="center" />
        <span style={{ padding: '20px 40px', borderRadius: brand.buttonRadius || 14, background: p.accent, color: p.accentInk, fontFamily: brand.body, fontWeight: 700, fontSize: 34 }}>
          {slide.body || hostOf(brand.url)}
        </span>
      </div>
    </AbsoluteFill>
  );
}

// 'card': one point on its own (a single image with no screen that shows it).
const KINDS = { shot: ShotSlide, cover: CoverSlide, point: PointSlide, card: PointSlide, end: EndSlide };

export function PostImage({ slide, brand, size = 'square' }) {
  const { width, height } = POST_SIZES[size] || POST_SIZES.square;
  const View = KINDS[slide.kind] || PointSlide;
  return (
    <BrandProvider brand={brand}>
      <AbsoluteFill>
        <View slide={slide} w={width} h={height} />
      </AbsoluteFill>
    </BrandProvider>
  );
}
