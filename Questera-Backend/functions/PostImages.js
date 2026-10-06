/**
 * Post images made from the company's real site instead of an image model (Studio "images" jobs,
 * studio/remotion/post.jsx):
 *   - a single image is a product shot: a real screen of the site in a browser window, moved in on the part the post
 *     is about, under the post's headline;
 *   - a carousel tells a story: a cover with the promise, a product shot, one slide per point, and a closing slide.
 * Everything is in the brand's own colours, fonts and logo, as captured from the site. Text is real type, never
 * letters an image model drew.
 *
 * Returns null when Studio is off or the brand has no website (the caller generates images as before).
 */

const SIZE = {
  instagram: { single: 'portrait', multi: 'portrait' },
  linkedin: { single: 'landscape', multi: 'portrait' },
  twitter: { single: 'landscape', multi: 'square' },
};
// Most slides a carousel may have per platform (X shows at most 4 images).
const MAX_SLIDES = { instagram: 7, linkedin: 7, twitter: 4 };
const CAPTURE_DAYS = Number(process.env.STUDIO_CAPTURE_DAYS || 7);

/** The slides for this post. */
function slidesFor({ platform, multi, copy, shot, brandUrl }) {
  if (!multi) return [{ kind: 'shot', headline: copy.headline || '', fact: copy.fact || '', ...shot }];
  const max = MAX_SLIDES[platform] || 7;
  const points = (copy.slides || []).filter((s) => s?.headline);
  const room = max - 2 - (shot ? 1 : 0);
  const shown = points.slice(0, Math.max(1, room));
  const slides = [{ kind: 'cover', headline: copy.cover?.headline || copy.headline || '', body: copy.cover?.body || '', kicker: copy.cover?.kicker || '' }];
  if (shot) slides.push({ kind: 'shot', headline: copy.shotHeadline || '', optional: true, ...shot });
  shown.forEach((p, i) => slides.push({ kind: 'point', index: i + 1, total: shown.length, headline: p.headline, body: p.body || '' }));
  let host = '';
  try {
    host = new URL(brandUrl).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  slides.push({ kind: 'end', headline: copy.end?.headline || 'See it for yourself', body: copy.end?.cta || host });
  return slides.slice(0, max);
}

/**
 * Make the images. Returns { imageUrls, reviewUrls, jobId, slides } or null when Studio cannot be used.
 * imageUrls are permanent links for the post (swapped for fresh ones at publish time); reviewUrls are direct links
 * the reviewer can fetch now.
 */
async function make({ config, memory, copy, platform, multi, factSource = null }) {
  const { studioJobs, mediaUrl } = require('../studio/service.cjs');
  const studio = studioJobs();
  const site = memory?.website?.url;
  if (!studio || !site) return null;
  const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;

  const latest = await studio.latestCapture(config.userId, url).catch(() => null);
  const fresh = latest && Date.now() - Date.parse(latest.capturedAt) < CAPTURE_DAYS * 86400e3;
  // The screen is chosen by the images job once it has the capture (studio/shots.cjs); this says what to show.
  const shot = { match: `${copy.headline || ''} ${copy.fact || ''}`, source: factSource };
  const slides = slidesFor({ platform, multi, copy, shot, brandUrl: url });

  const job = await studio.createImages({
    userId: config.userId,
    url,
    slides,
    size: SIZE[platform]?.[multi ? 'multi' : 'single'] || 'square',
    reuseCapture: fresh ? latest.jobId : null,
    autopilotId: config.autopilotId || null,
    platform,
    angle: copy.headline || null,
  });
  const done = await studio.waitFor(config.userId, job.id, { timeoutMs: 12 * 60000 });
  const images = (done.images || []).filter((i) => i.status === 'done' && i.file);
  const expected = (done.images || []).filter((i) => i.status !== 'skipped').length;
  if (done.status !== 'done' || !images.length || images.length !== expected) throw new Error(done.error || 'Studio did not finish the images');

  const signed = (rel) => (studio.store.signedUrl ? studio.store.signedUrl(job.id, rel) : null);
  const imageUrls = await Promise.all(images.map(async (i) => mediaUrl(job.id, i.file) || signed(i.file)));
  const reviewUrls = await Promise.all(images.map((i) => signed(i.file)));
  return { imageUrls, reviewUrls: reviewUrls.filter(Boolean), jobId: job.id, slides: images.map((i) => i.slide) };
}

module.exports = { make, slidesFor, MAX_SLIDES };
