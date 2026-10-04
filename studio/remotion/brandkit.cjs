// The Style step: the user's changes to the brand Studio read from their site. Applied the same way by the renderer
// (Questera-Backend/studio/jobs.cjs) and by the live preview in the browser (src/studio), so what the user sees while
// editing is what renders. buildPalette is passed in (Questera-Backend/studio/color.cjs) to keep this file free of
// requires, which the browser build can't follow.

const HEX = /^#[0-9a-f]{6}$/i;
const LOGOS = ['logo', 'icon', 'text'];
// Music moods (studio/audio): 'pulse' is the original score in studio-audio/, the rest live in studio-audio/music/<mood>/.
const MUSIC = ['pulse', 'calm', 'drive', 'minimal'];
// How scenes hand over (kit.jsx Scene, Root.jsx Wipes).
const MOTION = ['smooth', 'dynamic', 'clean'];
// Voiceover voices (Questera-Backend/studio/voice.cjs); 'off' for none.
const VOICES = ['off', 'Charon', 'Kore', 'Puck', 'Sulafat', 'Aoede', 'Iapetus'];

/** The kit as Studio found it on the site. */
function defaultKit(capture) {
  const p = capture.palette || {};
  return {
    name: capture.siteName || '',
    logo: capture.logo?.file ? 'logo' : capture.icon?.file ? 'icon' : 'text',
    colors: { bg: p.bg || '#ffffff', ink: p.ink || '#0b0b0f', accent: p.accent || '#3b5bdb' },
    heading: 'display',
    rhythm: 'fluid',
    music: 'pulse',
    motion: 'smooth',
    voice: 'off',
  };
}

/**
 * A kit from the browser, kept to what the capture can support; anything invalid falls back to the site's own.
 * tracks: ids of the music composed for this job (gen-1, gen-2, …), valid music choices next to the presets.
 */
function cleanKit(kit, capture, tracks = []) {
  const base = defaultKit(capture);
  const k = kit && typeof kit === 'object' ? kit : {};
  const colors = {};
  for (const key of ['bg', 'ink', 'accent']) colors[key] = HEX.test(k.colors?.[key] || '') ? k.colors[key].toLowerCase() : base.colors[key];
  let logo = LOGOS.includes(k.logo) ? k.logo : base.logo;
  if (logo === 'logo' && !capture.logo?.file) logo = base.logo;
  if (logo === 'icon' && !capture.icon?.file) logo = base.logo;
  return {
    name: String(k.name || base.name).trim().slice(0, 60) || base.name,
    logo,
    colors,
    heading: k.heading === 'body' && capture.fonts?.body ? 'body' : 'display',
    rhythm: k.rhythm === 'snappy' ? 'snappy' : 'fluid',
    music: MUSIC.includes(k.music) || tracks.includes(k.music) ? k.music : base.music,
    motion: MOTION.includes(k.motion) ? k.motion : base.motion,
    voice: VOICES.includes(k.voice) ? k.voice : base.voice,
  };
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * The brand (or capture: both have siteName, palette, fonts, logo, icon) with the kit applied. Colours the user did not
 * change keep the palette Studio derived from the site; changed ones rebuild it the same way.
 */
function applyKit(brand, kit, buildPalette) {
  if (!kit) return brand;
  const out = { ...brand, siteName: kit.name || brand.siteName };
  const p = brand.palette || {};
  const c = kit.colors || {};
  if (!(same(c.bg, p.bg) && same(c.ink, p.ink) && same(c.accent, p.accent))) {
    out.palette = buildPalette({ heroBg: c.bg, ink: c.ink, buttons: [{ bg: c.accent, area: 1 }] });
  }
  if (kit.logo === 'icon' && brand.icon?.file) out.logo = { file: brand.icon.file, w: 1, h: 1, text: out.siteName };
  else if (kit.logo === 'text') out.logo = { kind: 'text', text: out.siteName };
  else if (brand.logo?.kind === 'text') out.logo = { ...brand.logo, text: out.siteName };
  if (kit.heading === 'body' && brand.fonts?.body) out.fonts = { ...brand.fonts, display: brand.fonts.body };
  return out;
}

module.exports = { defaultKit, cleanKit, applyKit, MUSIC, MOTION, VOICES };
