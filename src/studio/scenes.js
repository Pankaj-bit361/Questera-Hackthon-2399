// The words in each kind of scene, as the storyboard and the edit drawer show them.

export const SCENE_NAMES = { hook: 'Hook', title: 'Title', reveal: 'Product reveal', focus: 'Close-up', features: 'Features', checks: 'Checklist', stat: 'Number', metrics: 'Numbers', compare: 'Before / after', quote: 'Customer quote', end: 'End card' };

export function fieldsFor(scene) {
  switch (scene.type) {
    case 'hook':
      return [{ key: 'lines', label: 'Lines (one per line)', list: true }];
    case 'title':
      return [{ key: 'kicker', label: 'Label' }, { key: 'headline', label: 'Headline' }, { key: 'sub', label: 'Supporting line', long: true }];
    case 'reveal':
      return [{ key: 'caption', label: 'Caption' }, ...(scene.chips || []).flatMap((_, i) => [{ key: `chips.${i}.title`, label: `Note ${i + 1}` }, { key: `chips.${i}.sub`, label: `Note ${i + 1} detail` }])];
    case 'focus':
      return [{ key: 'title', label: 'Title' }, { key: 'body', label: 'Text', long: true }];
    case 'features':
      return [{ key: 'title', label: 'Title' }, ...scene.items.flatMap((_, i) => [{ key: `items.${i}.title`, label: `Feature ${i + 1}` }, { key: `items.${i}.body`, label: `Feature ${i + 1} text` }])];
    case 'checks':
      return [{ key: 'items', label: 'Points (one per line)', list: true }];
    case 'stat':
      return [{ key: 'value', label: 'Number' }, { key: 'label', label: 'What it means' }];
    case 'metrics':
      return [{ key: 'title', label: 'Title' }, ...scene.items.flatMap((_, i) => [{ key: `items.${i}.value`, label: `Number ${i + 1} (as on your site)` }, { key: `items.${i}.label`, label: `Number ${i + 1} meaning` }])];
    case 'compare':
      return [{ key: 'title', label: 'Title' }, { key: 'before.label', label: 'Before: label' }, { key: 'before.items', label: 'Before (one per line)', list: true }, { key: 'after.label', label: 'After: label' }, { key: 'after.items', label: 'After (one per line)', list: true }];
    case 'quote':
      return [{ key: 'text', label: 'Quote (exactly as on your site)', long: true }, { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }];
    case 'end':
      return [{ key: 'headline', label: 'Closing line' }, { key: 'cta', label: 'Button' }];
    default:
      return [];
  }
}

export const getPath = (obj, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export function setPath(obj, key, value) {
  const parts = key.split('.');
  const copy = structuredClone(obj);
  let o = copy;
  parts.slice(0, -1).forEach((k) => (o = o[k]));
  o[parts.at(-1)] = value;
  return copy;
}

