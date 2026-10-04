// Which captured screen shows a post's point, and which part of it to move in on. Used where the capture is at hand
// (the images job, after it captured or copied the site), so it works for a site captured a moment ago.

// Words that say nothing about what a screen shows. Short UI text uses few of them, which would make them look rare.
const STOP = new Set('the and for with from your you our are can has have into more than when what will was were their they them its also all any each how who why not but just only very most such been being about over then there these those which while where this that get got use using one two new now out off own per via'.split(' '));
const words = (t) => new Set((String(t || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)));

/**
 * The screen and element that show `text`, or null when no screen does (a wrong screen under a headline is worse
 * than none: the caller makes a text card instead).
 *
 * A screen counts when it is from the page the fact came from (`sourceUrl`), or when its words match the post's -
 * weighted by how rare each word is across the site's screens, so "blog" or the brand name (everywhere) count for
 * little and "wix" (one page) for a lot. `used` holds screens already shown in this job, so a week of posts does not
 * repeat a screen while another relevant one is left.
 */
function pickShot(capture, { text, sourceUrl } = {}, used = new Set()) {
  const shots = [...(capture?.appShots || []), ...(capture?.shots || [])].filter((s) => s?.file && s.kind !== 'mobile');
  if (!shots.length) return null;
  // The brand's own name is on every screen in spirit, whatever the captured text says.
  const brand = words(`${capture.siteName || ''} ${(() => { try { return new URL(capture.finalUrl || capture.url).hostname.replace(/^www\./, ''); } catch { return ''; } })()}`);
  const want = new Set([...words(text)].filter((w) => !brand.has(w)));

  // How many blocks of the site's text use each word (its pages' sections, list items and the screens' elements):
  // the rarer, the more a match means.
  const blocks = [
    ...shots.flatMap((shot) => (shot.elements || []).map((el) => el.text)),
    ...(capture.pages || []).flatMap((p) => [p.copy?.h1, p.copy?.sub, ...(p.copy?.sections || []).map((x) => `${x.title} ${x.body || ''}`), ...(p.copy?.bullets || [])]),
  ].filter(Boolean);
  const df = new Map();
  const docs = blocks.length;
  for (const block of blocks) for (const w of words(block)) df.set(w, (df.get(w) || 0) + 1);
  const weight = (w) => Math.log((docs + 1) / ((df.get(w) || 0) + 1));
  // About two words found nowhere else on the site, whatever the site's size.
  const bar = 1.5 * Math.log(docs + 1);

  const pathOf = (u) => {
    try {
      return new URL(u).pathname.replace(/\/+$/, '') || '/';
    } catch {
      return null;
    }
  };
  const source = sourceUrl ? pathOf(sourceUrl) : null;
  // The page each screen was taken on (capture.pages carries the URL for each label).
  const pageUrl = Object.fromEntries((capture.pages || []).map((p) => [p.label, pathOf(p.url)]));

  const candidates = [];
  for (const shot of shots) {
    const shotPath = pageUrl[shot.page] || null;
    // The very page the fact came from shows it; the same section of the site only helps.
    const samePage = Boolean(source && shotPath && shotPath === source);
    const sameSection = Boolean(source && shotPath && source !== '/' && shotPath.split('/')[1] === source.split('/')[1]);
    for (const el of [null, ...(shot.elements || [])]) {
      if (el && (el.w < 120 || el.h < 30 || el.role === 'button')) continue;
      // Shared words, rarer ones counting more, scaled down for long blocks (a pricing table shares words with
      // everything).
      const elWords = el ? words(el.text) : new Set();
      const match = el ? [...elWords].filter((w) => want.has(w)).reduce((sum, w) => sum + weight(w), 0) / Math.max(1, elWords.size / 15) : 0;
      const relevant = samePage || match >= bar;
      if (!relevant) continue;
      const score = (samePage ? 6 : 0) + (sameSection ? 1.5 : 0) + match + (String(shot.id).startsWith('app-') ? 1 : 0) + (!el && shot.kind === 'hero' ? 0.5 : 0) - (used.has(shot.id) ? 2.5 : 0);
      candidates.push({ score, shot, el, match });
    }
  }
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  used.add(best.shot.id);
  return { shotId: best.shot.id, focus: best.el && best.match >= bar ? best.el.id : null };
}

module.exports = { pickShot };
