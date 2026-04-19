export const ASPECT_RATIOS = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Wide' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '4:5', label: '4:5 Feed' },
  { value: '3:2', label: '3:2 Photo' },
  { value: '2:3', label: '2:3 Photo' },
  { value: '4:3', label: '4:3 Standard' },
  { value: '3:4', label: '3:4 Standard' },
  { value: '1:4', label: '1:4 Tall' },
  { value: '4:1', label: '4:1 Wide' },
  { value: '1:8', label: '1:8 Banner' },
  { value: '8:1', label: '8:1 Banner' },
];

export const IMAGE_SIZES = [
  { value: '512', label: '0.5K' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

export const GEMINI_MODELS = [
  { value: 'flash', label: 'Flash 3.1', desc: 'Fast · High-volume' },
  { value: 'pro', label: 'Pro 3', desc: 'Professional · Best quality' },
  { value: 'flash2', label: 'Flash 2.5', desc: 'Speed · Low-latency' },
];

export const THINKING_LEVELS = [
  { value: 'minimal', label: 'Minimal', desc: 'Fastest' },
  { value: 'High', label: 'High', desc: 'Best quality' },
];

export const STYLES = [
  { value: 'none', label: 'No Style' },
  { value: 'Realistic', label: 'Realistic' },
  { value: 'Anime', label: 'Anime' },
  { value: 'Digital Art', label: 'Digital Art' },
  { value: 'Oil Painting', label: 'Oil Painting' },
  { value: '3D Render', label: '3D Render' },
  { value: 'Watercolor', label: 'Watercolor' },
  { value: 'Sketch', label: 'Sketch' },
];

export const DEFAULT_PROJECT_SETTINGS = {
  aspectRatio: 'auto',
  imageSize: '2K',
  style: 'none',
  instructions: '',
  temperature: 1,
  topP: 1,
  model: 'flash',
  thinkingLevel: 'minimal',
};
