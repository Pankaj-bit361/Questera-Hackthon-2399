// Colour helpers and the palette a video is drawn with, built from the colours the site actually renders.

function parse(c) {
  if (!c) return null;
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : c;
    const n = parseInt(h.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
}

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

function luminance(c) {
  const [r, g, b] = (typeof c === 'string' ? parse(c) : c).slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function mix(a, b, t) {
  const p = typeof a === 'string' ? parse(a) : a;
  const q = typeof b === 'string' ? parse(b) : b;
  return hex(p.map((v, i) => (i < 3 ? v + (q[i] - v) * t : 1)));
}

function saturation(c) {
  const [r, g, b] = parse(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Composite a translucent colour over a background. */
function solid(c, over) {
  const p = parse(c);
  if (!p) return null;
  if (p[3] >= 0.99) return hex(p);
  return mix(over, hex(p), p[3]);
}

const readableOn = (bg) => (contrast(bg, '#ffffff') >= contrast(bg, '#0b0b0f') ? '#ffffff' : '#0b0b0f');

/**
 * From the raw colours read off the page (see capture.cjs readBrand) to a palette every template can rely on:
 * bg/ink/muted for the site's own look, accent/accentInk for its call to action, and a dark "stage" for cinematic scenes.
 */
function buildPalette(brand) {
  const white = '#ffffff';
  const bg = solid(brand.heroBg, white) || solid(brand.pageBg, white) || white;
  const theme = luminance(bg) < 0.3 ? 'dark' : 'light';
  let ink = solid(brand.ink, bg) || readableOn(bg);
  if (contrast(ink, bg) < 4.5) ink = readableOn(bg);
  let muted = solid(brand.muted, bg) || mix(ink, bg, 0.35);
  if (contrast(muted, bg) < 3) muted = mix(ink, bg, 0.32);

  // The call to action: the biggest solid button near the top that stands apart from the background.
  const buttons = (brand.buttons || [])
    .map((b) => ({ ...b, bg: solid(b.bg, bg), color: solid(b.color, bg) }))
    .filter((b) => b.bg && contrast(b.bg, bg) > 1.25)
    .sort((a, b) => b.area * (0.6 + saturation(b.bg)) - a.area * (0.6 + saturation(a.bg)));
  let accent = buttons[0]?.bg;
  let accentInk = buttons[0]?.color;
  if (!accent || saturation(accent) < 0.12) {
    const link = (brand.links || []).map((c) => solid(c, bg)).find((c) => c && saturation(c) > 0.3 && contrast(c, bg) > 2);
    if (link) accent = link;
  }
  if (!accent) accent = theme === 'dark' ? '#8ab4ff' : '#3b5bdb';
  if (!accentInk || contrast(accentInk, accent) < 3) accentInk = readableOn(accent);

  // The dark stage: near-black tinted by the brand, unless the site is itself dark.
  const stage = theme === 'dark' ? mix(bg, '#000000', 0.15) : mix('#0a0b0e', accent, 0.1);
  const stageInk = '#ffffff';
  // An accent bright enough to read on the stage.
  let glow = accent;
  for (let i = 0; i < 6 && contrast(glow, stage) < 4.5; i++) glow = mix(glow, '#ffffff', 0.25);

  return {
    theme,
    bg,
    surface: mix(bg, ink, theme === 'dark' ? 0.07 : 0.035),
    line: mix(bg, ink, 0.13),
    ink,
    muted,
    accent,
    accentInk,
    accentSoft: mix(bg, accent, theme === 'dark' ? 0.22 : 0.12),
    stage,
    stageInk,
    stageMuted: mix(stageInk, stage, 0.35),
    glow,
  };
}

module.exports = { parse, hex, luminance, contrast, mix, saturation, buildPalette, readableOn };
