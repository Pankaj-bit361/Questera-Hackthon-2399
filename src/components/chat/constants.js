export const ASPECT_RATIOS = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '4:3', label: '4:3 Standard' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '21:9', label: '21:9 Cinematic' },
];

export const IMAGE_SIZES = [
  { value: '2K', label: '2K HD' },
  { value: '1K', label: '1K Standard' },
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
};