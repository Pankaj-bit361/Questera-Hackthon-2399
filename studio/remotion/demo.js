// Defaults so the composition opens on its own in Remotion Studio; real renders always pass a captured brand and plan.
export const DEMO_BRAND = {
  url: 'https://example.com',
  siteName: 'Velos',
  assetBase: '',
  palette: { theme: 'dark', bg: '#101113', surface: '#1a1b1e', line: '#2a2b2f', ink: '#ffffff', muted: '#a1a1aa', accent: '#a3e635', accentInk: '#101113', accentSoft: '#2a3a14', stage: '#0b0c0e', stageInk: '#ffffff', stageMuted: '#a1a1aa', glow: '#a3e635' },
  fonts: {},
  logo: null,
  shots: [],
  buttonRadius: 12,
  typeStyle: { weight: 800 },
};

export const DEMO_PLAN = {
  format: 'launch',
  scenes: [
    { type: 'title', kicker: 'Velos Studio', headline: 'Product videos from your URL.', accent: ['URL.'] },
    { type: 'end', headline: 'Paste a link. Get a launch film.', cta: 'Try it free' },
  ],
};
