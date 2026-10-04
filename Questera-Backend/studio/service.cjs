// The one Studio instance in a process, shared by the /api/studio routes and the autopilot (which makes product videos
// with it), plus long-lived links to finished videos for scheduled posts.
//
// A scheduled post can wait days in the approval queue, longer than an S3 link lives. So posts store a permanent,
// signed Velos API link (/api/studio/media/…), and the scheduler swaps it for a fresh direct S3 link just before it
// publishes (freshMediaUrl), because Instagram fetches the video itself and may not follow redirects.

const crypto = require('node:crypto');
const path = require('node:path');
const { StudioJobs } = require('./jobs.cjs');
const { studioFromEnv } = require('./launch.cjs');
const { checkId, safeRel } = require('./store.cjs');

let instance = null;

/** The shared StudioJobs, or null when Studio is off (STUDIO_ENABLED). */
function studioJobs() {
  if (process.env.STUDIO_ENABLED !== 'true') return null;
  if (!instance) {
    const opts = studioFromEnv(path.join(__dirname, '../../.studio-data/jobs'));
    instance = new StudioJobs(opts);
    instance.ready = instance.recover();
  }
  return instance;
}

const mediaKey = () => crypto.createHash('sha256').update(`${process.env.JWT_SECRET || ''}:studio-media`).digest();
const mediaSig = (id, rel) => crypto.createHmac('sha256', mediaKey()).update(`${id}/${rel}`).digest('base64url').slice(0, 32);

/** A permanent link to a job file for posts (needs STUDIO_PUBLIC_API_URL, the public /api/studio address). */
function mediaUrl(id, rel) {
  const base = (process.env.STUDIO_PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/media/${checkId(id)}/${safeRel(rel)}?sig=${mediaSig(id, rel)}`;
}

/** { id, rel } for a valid media link signature, else null. */
function verifyMedia(id, rel, sig) {
  try {
    checkId(id);
    safeRel(rel);
  } catch {
    return null;
  }
  const want = Buffer.from(mediaSig(id, rel));
  const got = Buffer.from(String(sig || ''));
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? { id, rel } : null;
}

/** For the scheduler: a Studio media link becomes a fresh direct link (S3, one hour); anything else is returned as is. */
async function freshMediaUrl(url) {
  const jobs = studioJobs();
  if (!jobs || !url || !jobs.store.signedUrl) return url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const m = /\/media\/([a-f0-9-]{36})\/(.+)$/.exec(u.pathname);
  if (m) {
    const ok = verifyMedia(m[1], decodeURIComponent(m[2]), u.searchParams.get('sig'));
    return ok ? jobs.store.signedUrl(ok.id, ok.rel) : url;
  }
  // A direct S3 link to this bucket that may have expired.
  const bucket = jobs.store.bucket;
  const ours = u.hostname.startsWith(`${bucket}.`) || u.pathname.startsWith(`/${bucket}/`);
  const s3 = /^\/(?:[^/]+\/)?jobs\/([a-f0-9-]{36})\/(.+)$/.exec(u.pathname);
  if (ours && s3) return jobs.store.signedUrl(s3[1], decodeURIComponent(s3[2]));
  return url;
}

module.exports = { studioJobs, mediaUrl, verifyMedia, freshMediaUrl };
