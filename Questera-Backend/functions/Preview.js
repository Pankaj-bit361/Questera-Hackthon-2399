const Preview = require('../models/preview');
const Autopilot = require('../models/autopilot');
const AutopilotMemory = require('../models/autopilotMemory');

/**
 * "Your first week": paste a URL, get seven ready posts and one product video, before connecting any account.
 *
 * The site is read once (brand profile + facts, saved to the user's autopilot so nothing is read twice), each post
 * is written from a different fact, the images are made from the site's own screens in one Studio job, and a
 * product video is rendered alongside. When accounts are connected, `use` puts the posts into the approval queue
 * across the next seven days.
 */

// The week: every platform, every format the autopilot makes. The reel carries the product video.
const WEEK = [
  { day: 1, platform: 'linkedin', format: 'text' },
  { day: 2, platform: 'instagram', format: 'carousel' },
  { day: 3, platform: 'twitter', format: 'thread' },
  { day: 4, platform: 'linkedin', format: 'image' },
  { day: 5, platform: 'instagram', format: 'reel' },
  { day: 6, platform: 'twitter', format: 'image' },
  { day: 7, platform: 'instagram', format: 'image' },
];
const IMAGE_SIZE = { instagram: 'portrait', linkedin: 'landscape', twitter: 'landscape' };

const set = (preview, fields) => Preview.updateOne({ _id: preview._id }, { $set: fields });

/** Facts worth a post, best kinds first, one per post where the site has enough. */
function pickFacts(memory, n) {
  const order = { feature: 0, customer: 1, number: 2, integration: 3, pricing: 4, audience: 5, other: 6 };
  const facts = [...(memory.facts || [])].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  const list = facts.length ? facts : (memory.brand?.proofPoints || []).map((text) => ({ text, sourceUrl: memory.website?.url }));
  return Array.from({ length: n }, (_, i) => list[i % Math.max(1, list.length)] || null);
}

async function start({ userId, url, autopilotId = null }) {
  const since = new Date(Date.now() - 86400e3);
  if (await Preview.exists({ userId, createdAt: { $gte: since } })) {
    throw Object.assign(new Error('You can make one free week a day. Open the one you made today.'), { statusCode: 429 });
  }
  const apId = autopilotId || (await Autopilot.defaultIdFor(userId));
  const preview = await Preview.create({ userId, autopilotId: apId, url: String(url).trim() });
  run(preview).catch((err) => console.error(`❌ [PREVIEW] ${preview.previewId}:`, err.message));
  return preview;
}

async function run(preview) {
  try {
    const memory = await readSite(preview);
    await set(preview, { status: 'writing', activity: 'Writing your week', company: memory.brand?.companyName || '', factsRead: memory.facts?.length || 0 });

    const video = startVideo(preview, memory).catch((err) => {
      console.warn(`[PREVIEW] video not started: ${err.message}`);
      return set(preview, { 'video.status': 'failed' });
    });
    const posts = await writePosts(memory);
    await set(preview, { posts, status: 'imaging', activity: 'Making the images from your site' });
    await video; // the video job exists now; the images start from its capture

    const imaged = await makeImages(preview, memory, posts).catch((err) => {
      console.warn(`[PREVIEW] images failed: ${err.message}`);
      return posts;
    });
    await set(preview, { posts: imaged.map(({ reviewUrls, ...p }) => p), activity: 'Checking every post' });
    const withImages = await reviewAll(memory, imaged);
    await set(preview, { posts: withImages, status: 'done', activity: 'Ready' });
    console.log(`✨ [PREVIEW] ${preview.previewId}: ${withImages.length} posts for ${preview.url}`);
  } catch (err) {
    await set(preview, { status: 'failed', error: err.message, activity: 'Something went wrong' });
    throw err;
  }
}

/** Brand profile and facts, into the user's autopilot memory (reused later by the autopilot itself). */
async function readSite(preview) {
  const BrandCrawler = require('./BrandCrawler');
  const SiteFacts = require('./SiteFacts');
  const result = await new BrandCrawler().crawl(preview.url);
  if (!result.success) throw new Error(result.error || 'We could not read that site');
  let memory = await AutopilotMemory.findOne({ autopilotId: preview.autopilotId });
  if (!memory) memory = new AutopilotMemory({ userId: preview.userId, autopilotId: preview.autopilotId });
  const b = result.brand;
  memory.brand = { ...(memory.brand?.toObject?.() || {}), ...b };
  memory.website = { ...(memory.website?.toObject?.() || {}), url: result.website, pagesRead: result.pages, lastCrawledAt: new Date(), confidence: b.confidence || 'medium', factsRefreshedAt: null, pages: [] };
  await set(preview, { activity: 'Reading the facts on your pages', company: b.companyName || '' });
  await SiteFacts.refresh(memory, { captureCopies: await SiteFacts.studioCopies(memory) }).catch((err) => console.warn(`[PREVIEW] facts: ${err.message}`));
  await memory.save();
  await Autopilot.updateOne({ autopilotId: preview.autopilotId, websiteUrl: { $in: ['', null] } }, { $set: { websiteUrl: result.website } });
  return memory;
}

/**
 * The same checks as every autopilot post: the free rule check and a reviewer that is not the writer. A post that
 * scores under REWRITE_BELOW or fails a rule is written once more with what was found.
 */
const REWRITE_BELOW = 70;
async function review(memory, post) {
  const AutopilotService = require('./AutopilotService');
  const postType = post.format === 'reel' ? 'reel' : post.format === 'carousel' ? 'carousel' : post.format;
  const visual = post.format === 'reel' ? 'A product video recorded from the company website (attached to the post separately)'
    : post.imageUrls?.length ? 'Real screens of the company website, in its brand (attached)' : 'none (text only)';
  return new AutopilotService().reviewPost({ platform: post.platform, userId: memory.userId, autopilotId: memory.autopilotId }, memory, {
    postType, caption: post.caption, hashtags: post.hashtags, threadParts: post.threadParts, proofPoint: post.fact,
    linkUrl: post.platform !== 'instagram' ? post.factSource : '', imagePrompt: visual,
  }, { imageUrls: post.reviewUrls || [] });
}

/** Review every post as it will go out (link and images included); rewrite the weak ones once, keeping the images. */
async function reviewAll(memory, posts) {
  const brand = memory.brand?.toObject?.() || memory.brand || {};
  return Promise.all(posts.map(async (post) => {
    let verdict = await review(memory, post).catch(() => null);
    let best = post;
    // Up to two rewrites, each from what the last review found; the best-scoring version is kept.
    for (let round = 0; round < 2; round++) {
      if (!verdict || !(verdict.ruleFailed || (typeof verdict.score === 'number' && verdict.score < REWRITE_BELOW))) break;
      const found = [...(verdict.ruleIssues || []), ...(verdict.issues || [])].slice(0, 6).join('; ');
      const next = await writeOne(memory, brand, best, found).catch(() => null);
      const again = next ? await review(memory, next).catch(() => null) : null;
      if (!next || !again) break;
      if ((again.score ?? 0) > (verdict.score ?? 0) || (verdict.ruleFailed && !again.ruleFailed)) {
        best = next;
        verdict = again;
      }
    }
    const { reviewUrls, ...clean } = best;
    return { ...clean, review: verdict ? { score: verdict.score, verdict: verdict.verdict, issues: verdict.issues, ruleIssues: verdict.ruleIssues, ruleFailed: verdict.ruleFailed, model: verdict.model } : null };
  }));
}

/** One post's copy again, with what the review found to fix (the images stay as they are). */
async function writeOne(memory, brand, post, fix) {
  const PostWriter = require('./PostWriter');
  const format = post.format === 'reel' ? 'video' : post.format === 'carousel' ? 'multi_image' : post.format;
  const copy = await new PostWriter().write({
    platform: post.platform,
    format,
    brand,
    idea: `A post built on this fact from the site: ${post.fact}\nA reviewer found these problems in the last draft; fix them, and claim nothing beyond the fact: ${fix}`,
    proofPoint: post.fact,
    proofSource: post.factSource,
    visualConcept: post.format === 'reel' ? 'A short product video made from the site' : post.imageUrls?.length ? 'Real screens of the product from the website' : '',
    hasLink: post.platform !== 'instagram' && Boolean(post.factSource),
    cta: 'See how it works',
  });
  const link = post.platform !== 'instagram' && post.factSource ? `\n\n${post.factSource}` : '';
  return {
    ...post,
    caption: (copy.caption || '') + (copy.threadParts?.length > 1 ? '' : link),
    hashtags: copy.hashtags || '',
    threadParts: copy.threadParts?.length > 1 ? [...copy.threadParts.slice(0, -1), copy.threadParts[copy.threadParts.length - 1] + link] : [],
  };
}

async function writePosts(memory) {
  const PostWriter = require('./PostWriter');
  const facts = pickFacts(memory, WEEK.length);
  const brand = memory.brand?.toObject?.() || memory.brand || {};
  const allFacts = (memory.facts || []).map((f) => f.text);
  const written = await Promise.all(WEEK.map(async (slot, i) => {
    const fact = facts[i];
    const format = slot.format === 'reel' ? 'video' : slot.format === 'carousel' ? 'multi_image' : slot.format;
    try {
      const write = (fix = '') => new PostWriter().write({
        platform: slot.platform,
        format,
        brand,
        idea: (fact ? `A post built on this fact from the site: ${fact.text}` : `What ${brand.companyName || 'the company'} does, for ${brand.targetAudience || 'its audience'}`) + (fix ? `\nA reviewer found these problems in the last draft; fix them: ${fix}` : ''),
        proofPoint: fact?.text || '',
        proofSource: fact?.sourceUrl || '',
        visualConcept: slot.format === 'reel' ? 'A short product video made from the site' : slot.format === 'text' || slot.format === 'thread' ? '' : 'A real screen of the product from the website',
        hasLink: slot.platform !== 'instagram' && Boolean(fact?.sourceUrl),
        cta: 'See how it works',
        slideCount: slot.format === 'carousel' ? 4 : 0,
        facts: slot.format === 'carousel' ? allFacts : [],
      });
      const copy = await write();
      const link = slot.platform !== 'instagram' && fact?.sourceUrl ? `\n\n${fact.sourceUrl}` : '';
      return {
        ...slot,
        caption: (copy.caption || '') + (copy.threadParts?.length > 1 ? '' : link),
        hashtags: copy.hashtags || '',
        threadParts: copy.threadParts?.length > 1 ? [...copy.threadParts.slice(0, -1), copy.threadParts[copy.threadParts.length - 1] + link] : [],
        headline: copy.headline || '',
        slides: copy.slides || [],
        cover: copy.cover || null,
        end: copy.end || null,
        fact: fact?.text || '',
        factSource: fact?.sourceUrl || '',
        imageUrls: [],
      };
    } catch (err) {
      console.warn(`[PREVIEW] day ${slot.day} not written: ${err.message}`);
      return null;
    }
  }));
  const posts = written.filter(Boolean);
  if (posts.length < 4) throw new Error('We could not write enough posts from that site');
  return posts;
}

/** Every image of the week in one Studio job, from the site's own screens. */
async function makeImages(preview, memory, posts) {
  const { studioJobs, mediaUrl } = require('../studio/service.cjs');
  const { slidesFor } = require('./PostImages');
  const studio = studioJobs();
  if (!studio) return posts;
  const url = /^https?:\/\//i.test(preview.url) ? preview.url : `https://${preview.url}`;
  // Start from the video job's capture once it has one (a minute or so), so the site is captured once and the
  // images can show its real screens; else the images job captures the site itself.
  const captured = await waitForCapture(preview.userId, preview.video?.jobId || (await Preview.findById(preview._id).lean())?.video?.jobId);

  const slides = [];
  const owner = []; // which post each slide belongs to
  posts.forEach((post, k) => {
    if (!['image', 'carousel'].includes(post.format)) return;
    const shot = { match: `${post.headline} ${post.fact}`, source: post.factSource };
    const size = post.format === 'carousel' ? 'portrait' : IMAGE_SIZE[post.platform];
    for (const slide of slidesFor({ platform: post.platform, multi: post.format === 'carousel', copy: post, shot, brandUrl: url })) {
      slides.push({ ...slide, size });
      owner.push(k);
    }
  });
  if (!slides.length) return posts;

  const job = await studio.createImages({ userId: preview.userId, url, slides, reuseCapture: captured, autopilotId: preview.autopilotId, source: 'preview' });
  const done = await studio.waitFor(preview.userId, job.id, { timeoutMs: 15 * 60000 });
  if (done.status !== 'done') throw new Error(done.error || 'Images did not finish');
  const out = posts.map((p) => ({ ...p, imageUrls: [] }));
  for (const [i, image] of (done.images || []).entries()) {
    if (image.status !== 'done') continue;
    const direct = studio.store.signedUrl ? await studio.store.signedUrl(job.id, image.file) : null;
    const link = mediaUrl(job.id, image.file) || direct;
    if (link) out[owner[i]].imageUrls.push(link);
    if (direct) (out[owner[i]].reviewUrls ||= []).push(direct);
  }
  return out;
}

/** The id of a Studio job once its site capture is done (it can then be reused), or null after `ms`. */
async function waitForCapture(userId, jobId, ms = 5 * 60000) {
  const { studioJobs } = require('../studio/service.cjs');
  const studio = studioJobs();
  if (!studio || !jobId) return null;
  for (const until = Date.now() + ms; Date.now() < until; ) {
    const job = await studio.get(userId, jobId).catch(() => null);
    if (!job || job.status === 'failed') return null;
    if (job.steps?.find((s) => s.id === 'capture')?.status === 'done') return jobId;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

async function startVideo(preview, memory) {
  const { studioJobs } = require('../studio/service.cjs');
  const studio = studioJobs();
  if (!studio) return set(preview, { 'video.status': 'failed' });
  const top = pickFacts(memory, 1)[0];
  const url = /^https?:\/\//i.test(preview.url) ? preview.url : `https://${preview.url}`;
  const latest = await studio.latestCapture(preview.userId, url).catch(() => null);
  const job = await studio.create({
    userId: preview.userId,
    url,
    formats: ['teaser'],
    notes: top ? `Make this video about: ${top.text}` : '',
    reuseCapture: latest?.jobId || null,
    source: 'autopilot',
    autopilotId: preview.autopilotId,
    platform: 'instagram',
    angle: top?.text || null,
  });
  return set(preview, { 'video.jobId': job.id, 'video.status': 'running' });
}

/** The preview as the page shows it; the video's state is read from Studio. */
async function view(userId, previewId) {
  const preview = await Preview.findOne({ userId, previewId }).lean();
  if (!preview) return null;
  if (preview.video?.jobId && preview.video.status !== 'done') {
    const { studioJobs, mediaUrl } = require('../studio/service.cjs');
    const studio = studioJobs();
    const job = studio ? await studio.get(userId, preview.video.jobId).catch(() => null) : null;
    const video = job?.videos?.find((v) => v.status === 'done' && v.file);
    if (video) {
      const rel = `videos/${video.file}`;
      const link = mediaUrl(job.id, rel) || (studio.store.signedUrl ? await studio.store.signedUrl(job.id, rel) : null);
      const thumb = video.thumb ? mediaUrl(job.id, `videos/${video.thumb}`) || (studio.store.signedUrl ? await studio.store.signedUrl(job.id, `videos/${video.thumb}`) : null) : null;
      await Preview.updateOne({ _id: preview._id }, { $set: { 'video.status': 'done', 'video.url': link, 'video.thumb': thumb } });
      Object.assign(preview.video, { status: 'done', url: link, thumb });
    } else if (job?.status === 'failed') {
      preview.video.status = 'failed';
    } else if (job) {
      preview.video.activity = job.activity;
    }
  }
  return preview;
}

/**
 * Put the week into the approval queue, a post a day from tomorrow at 10:00 server time, for the platforms that are
 * connected now. Returns { queued, skipped: [platform] }.
 */
async function use(userId, previewId) {
  const preview = await view(userId, previewId);
  if (!preview || preview.status !== 'done') throw Object.assign(new Error('This week is not ready yet'), { statusCode: 409 });
  const SchedulerService = require('./SchedulerService');
  const scheduler = new SchedulerService();
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const queued = [];
  const skipped = new Set();
  const posts = [...preview.posts];
  for (const [i, post] of posts.entries()) {
    if (post.queuedPostId) continue;
    const media = post.format === 'reel' ? { videoUrl: preview.video?.url } : { imageUrl: post.imageUrls?.[0], imageUrls: post.imageUrls };
    if (post.format === 'reel' && !preview.video?.url) continue;
    try {
      const created = await scheduler.schedulePost(userId, {
        platform: post.platform,
        caption: post.caption,
        hashtags: post.hashtags,
        threadParts: post.threadParts,
        postType: { text: 'text', thread: 'thread', image: 'image', carousel: post.platform === 'instagram' ? 'carousel' : 'multi_image', reel: post.platform === 'instagram' ? 'reel' : 'video' }[post.format],
        ...media,
        scheduledAt: new Date(start.getTime() + (post.day - 1) * 86400e3),
        source: 'autopilot',
        status: 'pending_approval',
        autopilotId: preview.autopilotId,
      });
      if (post.review) await require('../models/scheduledPost').updateOne({ postId: created.postId }, { $set: { review: { ...post.review, reviewedAt: new Date() } } });
      posts[i] = { ...post, queuedPostId: created.postId };
      queued.push(created.postId);
    } catch (err) {
      skipped.add(post.platform);
    }
  }
  await Preview.updateOne({ _id: preview._id }, { $set: { posts, usedAt: new Date() } });
  return { queued: queued.length, skipped: [...skipped] };
}

module.exports = { start, run, view, use, WEEK, pickFacts };
