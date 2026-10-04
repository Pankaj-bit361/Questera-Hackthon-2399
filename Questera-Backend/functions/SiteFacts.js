const cheerio = require('cheerio');
const { safeFetch } = require('../studio/egress.cjs');
const { OpenRouterProvider } = require('../agent/LLMProvider');

/**
 * What the autopilot posts from: 30-100 facts read from the company's own site, each with the page it came from,
 * refreshed weekly, plus what is new on the site since the last read (new pages, blog posts, features).
 *
 * Pages are found from the sitemap and the site's own links and read over plain HTTP through the same guarded fetch
 * Studio uses (no private or internal addresses). A page that is all JavaScript and reads empty falls back to the
 * text Studio's rendered capture took of it. Every fact is checked against its page's text before it is kept: its
 * numbers must appear there, and most of its words.
 */

const MAX_PAGES = 25;
const MAX_FACTS = 100;
// Less text than this is an empty JavaScript shell, not a page (a short pricing page still has more).
const MIN_TEXT = 60;
const UA = 'Mozilla/5.0 (compatible; VelosBot/1.0; +https://www.velosapps.com)';

// Which pages to read, by path, and how many of each.
const KINDS = [
  { label: 'product', re: /\/(product|products|features?|platform|solutions?|how-it-works|tour)(\/|$)/i, max: 5 },
  { label: 'pricing', re: /\/(pricing|plans)(\/|$)/i, max: 1 },
  { label: 'about', re: /\/(about|about-us|company|story|mission)(\/|$)/i, max: 1 },
  { label: 'customers', re: /\/(customers?|case-stud(y|ies)|success|testimonials?|stories)(\/|$)/i, max: 3 },
  { label: 'integrations', re: /\/(integrations?|apps|connectors?|partners)(\/|$)/i, max: 2 },
  { label: 'changelog', re: /\/(changelog|whats-new|what-s-new|releases?|updates|release-notes)(\/|$)/i, max: 2 },
  { label: 'use-cases', re: /\/(use-cases?|for-[\w-]+|industries|solutions)\//i, max: 3 },
  { label: 'blog', re: /\/(blog|articles?|posts?|news|insights|resources)\/[\w-]{3,}/i, max: 5 },
  { label: 'docs', re: /\/(docs|help|guides?)\/[\w-]{3,}/i, max: 2 },
];
const SKIP = /\/(login|signin|sign-in|signup|sign-up|register|cart|checkout|account|privacy|terms|legal|cookie|careers|jobs|tag|category|author|page\/\d+)(\/|$)|\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|xml|json)$/i;
// Pages that, when new, are worth an announcement.
const NEWSWORTHY = new Set(['product', 'integrations', 'changelog', 'use-cases', 'blog', 'customers']);

const labelOf = (url) => {
  const path = new URL(url).pathname;
  if (path === '/' || path === '') return 'home';
  return KINDS.find((k) => k.re.test(path))?.label || null;
};

async function fetchText(url, maxBytes = 3 << 20) {
  const res = await safeFetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, maxBytes, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Every <loc> in the sitemap(s), with lastmod: robots.txt's Sitemap lines, else /sitemap.xml; one index level. */
async function sitemapUrls(origin) {
  const robots = await fetchText(`${origin}/robots.txt`, 200 << 10).catch(() => '');
  const maps = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  if (!maps.length) maps.push(`${origin}/sitemap.xml`);
  const out = [];
  const seen = new Set();
  const read = async (url, depth) => {
    if (seen.has(url) || seen.size > 6) return;
    seen.add(url);
    const xml = await fetchText(url, 10 << 20).catch(() => '');
    const $ = cheerio.load(xml, { xmlMode: true });
    const children = $('sitemap > loc').map((_, el) => $(el).text().trim()).get();
    if (children.length && depth < 1) {
      for (const child of children.slice(0, 5)) await read(child, depth + 1);
      return;
    }
    $('url').each((_, el) => {
      const loc = $(el).find('loc').text().trim();
      if (loc) out.push({ url: loc, lastmod: $(el).find('lastmod').text().trim() || null });
    });
  };
  for (const m of maps.slice(0, 3)) await read(m, 0);
  return out;
}

/** The page's readable text: headings, paragraphs and list items from the main content. */
function readHtml(html, url) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const description = $('meta[name="description"], meta[property="og:description"]').first().attr('content') || '';
  const links = $('a[href]').map((_, a) => $(a).attr('href')).get();
  $('script, style, noscript, svg, iframe, nav, footer, header, form, [aria-hidden="true"]').remove();
  const root = $('main').length ? $('main') : $('body');
  const parts = [];
  const seen = new Set();
  root.find('h1, h2, h3, h4, p, li, td, blockquote, figcaption').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length < 3 || t.length > 600 || seen.has(t)) return;
    seen.add(t);
    parts.push(/^h[1-4]$/i.test(el.tagName) ? `## ${t}` : t);
  });
  const h1 = root.find('h1').first().text().replace(/\s+/g, ' ').trim();
  return { url, title, description, h1, text: parts.join('\n').slice(0, 6000), links };
}

/** Studio's rendered copy of a page (capture.json pages[].copy), as text. */
function captureText(copy) {
  if (!copy) return '';
  return [
    copy.h1 && `## ${copy.h1}`,
    copy.sub,
    ...(copy.sections || []).map((s) => `## ${s.title}\n${s.body || ''}`),
    ...(copy.bullets || []),
    copy.prices?.length ? `Prices: ${copy.prices.join(', ')}` : '',
  ].filter(Boolean).join('\n').slice(0, 6000);
}

/** Up to MAX_PAGES pages worth reading, home first. */
async function discover(siteUrl) {
  const base = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
  const homeHtml = await fetchText(base.href);
  const home = readHtml(homeHtml, base.href);
  const origin = base.origin;
  const sameSite = (u) => {
    try {
      const x = new URL(u, origin);
      return x.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '') ? `${x.origin}${x.pathname.replace(/\/+$/, '')}` : null;
    } catch {
      return null;
    }
  };
  const found = new Map();
  for (const s of await sitemapUrls(origin)) {
    const u = sameSite(s.url);
    if (u && !SKIP.test(u)) found.set(u, { url: u, lastmod: s.lastmod });
  }
  for (const href of home.links) {
    const u = sameSite(href);
    if (u && !SKIP.test(u) && !found.has(u)) found.set(u, { url: u, lastmod: null });
  }

  const byKind = {};
  for (const page of found.values()) {
    const label = labelOf(page.url);
    if (!label || label === 'home') continue;
    (byKind[label] ||= []).push({ ...page, label });
  }
  const picked = [];
  for (const kind of KINDS) {
    const list = (byKind[kind.label] || []).sort((a, b) =>
      // Newest first where the sitemap says; otherwise shorter paths (section roots) first.
      (b.lastmod || '').localeCompare(a.lastmod || '') || a.url.length - b.url.length);
    picked.push(...list.slice(0, kind.max));
  }
  return {
    home: { ...home, label: 'home', lastmod: null },
    pages: picked.slice(0, MAX_PAGES - 1),
    // Everything the site lists, for spotting new pages next time (not read).
    allUrls: [...found.values()].map((p) => ({ url: p.url, label: labelOf(p.url), lastmod: p.lastmod })).filter((p) => p.label),
  };
}

const bare = (u) => String(u || '').replace(/[#?].*$/, '').replace(/\/+$/, '');
const copyFor = (copies, url) => copies[bare(url)] || null;

async function readPages(list, captureCopies = {}) {
  const out = [];
  for (let i = 0; i < list.length; i += 4) {
    const batch = await Promise.all(list.slice(i, i + 4).map(async (p) => {
      try {
        const page = { ...readHtml(await fetchText(p.url), p.url), label: p.label, lastmod: p.lastmod };
        // An all-JavaScript page reads empty; use what Studio's real browser saw, if it captured this page.
        if (page.text.length < 300 && copyFor(captureCopies, p.url)) page.text = captureText(copyFor(captureCopies, p.url));
        return page.text.length >= MIN_TEXT ? page : null;
      } catch {
        return null;
      }
    }));
    out.push(...batch.filter(Boolean));
  }
  return out;
}

const norm = (t) => String(t || '').toLowerCase().replace(/[’']/g, "'");
const STOP = new Set('the and for with that this from your you our are can has have into more than when what will was were their they them its also all any each how who why not but just only very most such been being about over then there these those which while where'.split(' '));
const contentWords = (t) => (norm(t).match(/[a-z0-9][a-z0-9'+.-]*/g) || []).filter((w) => w.length >= 4 && !STOP.has(w));
const numbersIn = (t) => (String(t).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, '').replace(/,/g, ''));

/** Is this fact really on the page? Its numbers all appear there, and at least 70% of its content words. */
function grounded(fact, pageText) {
  const page = norm(pageText).replace(/,(?=\d{3})/g, '');
  if (!numbersIn(fact).every((n) => page.includes(n))) return false;
  const words = contentWords(fact);
  if (words.length < 2) return false;
  const hits = words.filter((w) => page.includes(w)).length;
  return hits / words.length >= 0.7;
}

/** Same fact, said a little differently? */
function sameFact(a, b) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size) >= 0.75;
}

const EXTRACT = `You read pages from one company's website and list the facts its social media can post about.

A fact is ONE specific, checkable thing the page says: a feature and what it does, a number, a named integration, a named customer or result, a price, who it is for. Write each as one plain sentence using the page's own words and numbers. Never add anything the page does not say. Skip slogans and adjectives ("seamless", "powerful"), navigation, legal text and cookie banners.

Respond with ONLY JSON: {"facts":[{"page":1,"kind":"feature|number|integration|customer|pricing|audience|other","text":"..."}]}
Up to 12 facts per page; fewer when the page says less.`;

async function extractFacts(pages, llm) {
  const facts = [];
  for (let i = 0; i < pages.length; i += 4) {
    const batch = pages.slice(i, i + 4);
    const body = batch.map((p, k) => `### Page ${k + 1}: ${p.title || p.url}\nURL: ${p.url}\n${p.text}`).join('\n\n');
    const out = await llm.chatJSON([{ role: 'system', content: EXTRACT }, { role: 'user', content: body }], { temperature: 0.1, fallback: null }).catch(() => null);
    for (const f of out?.facts || []) {
      const page = batch[Number(f.page) - 1];
      const text = String(f.text || '').replace(/\s+/g, ' ').trim();
      if (!page || text.length < 15 || text.length > 260) continue;
      if (!grounded(text, `${page.title}\n${page.description}\n${page.text}`)) continue;
      facts.push({ text, kind: String(f.kind || 'other'), sourceUrl: page.url, sourceTitle: page.title || page.h1 || '' });
    }
  }
  return facts;
}

/**
 * Merge freshly read facts into the kept ones. A fact seen again keeps its firstSeen; a fact from a page that was
 * read again but no longer says it is dropped; facts from pages not read this time stay. At most MAX_FACTS, newest
 * first.
 */
function mergeFacts(previous, fresh, pagesRead, now = new Date()) {
  const readUrls = new Set(pagesRead.map((p) => p.url));
  const kept = [];
  for (const f of fresh) {
    if (kept.some((k) => sameFact(k.text, f.text))) continue;
    const old = previous.find((p) => sameFact(p.text, f.text));
    kept.push({ ...f, firstSeen: old?.firstSeen || now, lastSeen: now });
  }
  for (const p of previous) {
    if (readUrls.has(p.sourceUrl)) continue; // re-read and not found again: the page no longer says it
    if (kept.some((k) => sameFact(k.text, p.text))) continue;
    kept.push(p);
  }
  return kept.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).slice(0, MAX_FACTS);
}

/**
 * Read the site and update the memory: facts, pages, and what is new since the last read.
 * Returns { facts, newFacts, whatsNew, pagesRead }.
 */
async function refresh(memory, { llm = null, captureCopies = {}, now = new Date() } = {}) {
  const url = memory.website?.url;
  if (!url) throw new Error('No website to read');
  const model = llm || new OpenRouterProvider({ model: process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash' });

  const site = await discover(url);
  // The home page, or what Studio's browser saw of it when it is all JavaScript.
  let home = site.home;
  if (home.text.length < 300 && copyFor(captureCopies, home.url)) home = { ...home, text: captureText(copyFor(captureCopies, home.url)) };
  const pages = [home.text.length >= MIN_TEXT ? home : null, ...(await readPages(site.pages, captureCopies))].filter(Boolean);
  // Pages only Studio could read (a JavaScript site lists no links to plain HTTP).
  for (const [u, copy] of Object.entries(captureCopies)) {
    if (pages.some((p) => bare(p.url) === u)) continue;
    const text = captureText(copy);
    if (text.length >= MIN_TEXT) pages.push({ url: u, title: copy.title || '', description: copy.description || '', h1: copy.h1 || '', text, label: labelOf(u) || 'other' });
  }
  const fresh = await extractFacts(pages, model);

  const previous = (memory.facts || []).map((f) => (f.toObject ? f.toObject() : f));
  const hadRead = Boolean(memory.website?.factsRefreshedAt);
  const facts = mergeFacts(previous, fresh, pages, now);
  const newFacts = hadRead ? facts.filter((f) => !previous.some((p) => sameFact(p.text, f.text))) : [];

  // New pages: in the site's list now, not last time. Only after a first read (on the first, everything is new).
  const known = new Set((memory.website?.pages || []).map((p) => p.url));
  const pageList = site.allUrls.map((p) => ({ ...p, firstSeen: known.has(p.url) ? (memory.website.pages.find((x) => x.url === p.url)?.firstSeen || now) : now }));
  const whatsNew = [];
  if (hadRead) {
    for (const p of site.allUrls.filter((x) => !known.has(x.url) && NEWSWORTHY.has(x.label)).slice(0, 5)) {
      const read = pages.find((x) => x.url === p.url) || (await readPages([p]))[0];
      if (!read) continue;
      const fact = facts.find((f) => f.sourceUrl === p.url);
      whatsNew.push({
        key: p.url,
        kind: p.label === 'blog' ? 'blog' : 'page',
        title: read.h1 || read.title,
        url: p.url,
        summary: (read.description || read.text.split('\n').find((l) => !l.startsWith('##') && l.length > 60) || '').slice(0, 300),
        fact: fact?.text || '',
        foundAt: now,
      });
    }
    // A new feature on a page we already knew (a changelog or product page) is news too.
    for (const f of newFacts.filter((x) => x.kind === 'feature' && !whatsNew.some((w) => w.url === x.sourceUrl)).slice(0, 3)) {
      whatsNew.push({ key: `fact:${f.text.slice(0, 80)}`, kind: 'feature', title: f.text, url: f.sourceUrl, summary: f.text, fact: f.text, foundAt: now });
    }
  }

  memory.facts = facts;
  memory.website = {
    ...(memory.website?.toObject?.() || memory.website || {}),
    pages: pageList.slice(0, 400),
    pagesRead: pages.map((p) => ({ url: p.url, label: p.label, title: p.title })),
    factsRefreshedAt: now,
  };
  // Older brand profiles post from brand.proofPoints; keep the best facts there too.
  if (memory.brand) memory.brand.proofPoints = facts.slice(0, 15).map((f) => f.text);
  const existing = new Set((memory.whatsNew || []).map((w) => w.key));
  memory.whatsNew = [...whatsNew.filter((w) => !existing.has(w.key)), ...(memory.whatsNew || [])].slice(0, 30);
  return { facts, newFacts, whatsNew, pagesRead: pages.length };
}

/** Weekly: memories whose facts are older than a week, a few per call (claimed so servers do not double up). */
async function refreshDue({ limit = 3 } = {}) {
  const AutopilotMemory = require('../models/autopilotMemory');
  const weekAgo = new Date(Date.now() - 7 * 86400e3);
  const done = [];
  for (let i = 0; i < limit; i++) {
    const memory = await AutopilotMemory.findOneAndUpdate(
      {
        'website.url': { $nin: ['', null] },
        $or: [{ 'website.factsRefreshedAt': null }, { 'website.factsRefreshedAt': { $lt: weekAgo } }],
        $and: [{ $or: [{ 'website.factsClaimedAt': null }, { 'website.factsClaimedAt': { $lt: new Date(Date.now() - 3600e3) } }] }],
      },
      { $set: { 'website.factsClaimedAt': new Date() } },
      { new: true },
    );
    if (!memory) break;
    try {
      const r = await refresh(memory, { captureCopies: await studioCopies(memory) });
      await memory.save();
      done.push({ autopilotId: memory.autopilotId, facts: r.facts.length, whatsNew: r.whatsNew.length });
      console.log(`📚 [FACTS] ${memory.website.url}: ${r.facts.length} facts from ${r.pagesRead} pages, ${r.whatsNew.length} new`);
    } catch (err) {
      console.error(`❌ [FACTS] ${memory.website?.url}:`, err.message);
    }
  }
  return done;
}

/** The site's RSS or Atom feed: the one its home page links to, else a common location. */
async function findFeed(siteUrl) {
  const base = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
  const feedLinks = async (pageUrl) => {
    const $ = cheerio.load(await fetchText(pageUrl).catch(() => ''));
    return {
      feeds: $('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]').map((_, el) => new URL($(el).attr('href'), pageUrl).href).get(),
      blog: $('a[href]').map((_, a) => $(a).attr('href')).get().find((h) => /^(\/|https?:)/.test(h) && /\/(blog|news|articles)\/?$/i.test(h)),
    };
  };
  const home = await feedLinks(base.href);
  // A blog often declares its feed on its own index page rather than on the home page.
  const blog = home.blog ? await feedLinks(new URL(home.blog, base).href) : { feeds: [] };
  const common = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/feed.rss', '/atom.xml', '/index.xml', '/blog/rss.xml', '/blog/feed', '/blog/feed.xml', '/blog/feed.rss', '/blog/rss', '/blog/index.xml'];
  const candidates = [...new Set([...home.feeds, ...blog.feeds, ...common.map((p) => new URL(p, base).href)])];
  for (const url of candidates) {
    const xml = await fetchText(url, 5 << 20).catch(() => '');
    if (/<(rss|feed)[\s>]/i.test(xml)) return { url, xml };
  }
  return null;
}

/** Items of an RSS or Atom feed: { title, url, summary, date }. */
function parseFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const text = (el, sel) => $(el).find(sel).first().text().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const items = $('item').map((_, el) => ({
    title: text(el, 'title'),
    url: text(el, 'link'),
    summary: text(el, 'description').slice(0, 400),
    date: text(el, 'pubDate') || text(el, 'dc\\:date'),
  })).get();
  const entries = $('entry').map((_, el) => ({
    title: text(el, 'title'),
    url: $(el).find('link[rel="alternate"]').attr('href') || $(el).find('link').attr('href') || '',
    summary: (text(el, 'summary') || text(el, 'content')).slice(0, 400),
    date: text(el, 'updated') || text(el, 'published'),
  })).get();
  return [...items, ...entries].filter((i) => i.title && i.url).map((i) => ({ ...i, date: i.date ? new Date(i.date) : null }));
}

/**
 * Blog to social: articles in the site's feed since the last check become news (whatsNew, kind 'blog'), announced
 * on every platform. The first check only notes where the feed is.
 */
async function checkFeed(memory, now = new Date()) {
  if (!memory.website?.url) return [];
  let xml;
  let feedUrl = memory.website.feedUrl;
  if (feedUrl) xml = await fetchText(feedUrl, 5 << 20).catch(() => '');
  if (!xml || !/<(rss|feed)[\s>]/i.test(xml)) {
    const found = await findFeed(memory.website.url);
    if (!found) return [];
    feedUrl = found.url;
    xml = found.xml;
  }
  // Articles are told apart by URL, not by date (feeds round, shift and omit dates): anything not seen before and
  // dated in the last 14 days is new. The first check only learns what is already there.
  const firstCheck = !memory.website.feedCheckedAt;
  const seen = new Set(memory.website.feedSeen || []);
  const items = parseFeed(xml);
  memory.website.feedUrl = feedUrl;
  memory.website.feedCheckedAt = now;
  memory.website.feedSeen = [...new Set([...items.map((i) => i.url), ...seen])].slice(0, 200);
  if (firstCheck) return [];
  const recent = new Date(now.getTime() - 14 * 86400e3);
  const fresh = items
    .filter((i) => !seen.has(i.url) && (!i.date || (i.date > recent && i.date <= new Date(now.getTime() + 86400e3))))
    .slice(0, 3)
    .map((i) => ({ key: i.url, kind: 'blog', title: i.title, url: i.url, summary: i.summary, fact: '', foundAt: now, source: 'rss' }));
  memory.whatsNew = [...fresh, ...(memory.whatsNew || [])].slice(0, 30);
  return fresh;
}

/** Daily: the feeds not checked in the last day, a batch per call (each claimed, so servers do not double up). */
async function checkFeedsDue({ limit = 20 } = {}) {
  const AutopilotMemory = require('../models/autopilotMemory');
  const dayAgo = new Date(Date.now() - 86400e3);
  const hourAgo = new Date(Date.now() - 3600e3);
  let found = 0;
  for (let i = 0; i < limit; i++) {
    const memory = await AutopilotMemory.findOneAndUpdate(
      {
        'website.url': { $nin: ['', null] },
        $and: [
          { $or: [{ 'website.feedCheckedAt': null }, { 'website.feedCheckedAt': { $lt: dayAgo } }] },
          { $or: [{ 'website.feedClaimedAt': null }, { 'website.feedClaimedAt': { $lt: hourAgo } }] },
        ],
      },
      { $set: { 'website.feedClaimedAt': new Date() } },
      { new: true },
    );
    if (!memory) break;
    try {
      const fresh = await checkFeed(memory);
      if (!memory.website.feedCheckedAt) memory.website.feedCheckedAt = new Date(); // no feed: try again tomorrow
      await memory.save();
      found += fresh.length;
      if (fresh.length) console.log(`📰 [FEED] ${memory.website.url}: ${fresh.length} new article(s)`);
    } catch (err) {
      console.error(`❌ [FEED] ${memory.website?.url}:`, err.message);
    }
  }
  return found;
}

/** Studio's rendered text for this site's pages (its latest capture), for JavaScript-only pages. */
async function studioCopies(memory) {
  try {
    const { studioJobs } = require('../studio/service.cjs');
    const studio = studioJobs();
    if (!studio || !memory.website?.url) return {};
    const latest = await studio.latestCapture(memory.userId, memory.website.url);
    if (!latest) return {};
    const capture = await studio.store.readCapture(latest.jobId);
    return Object.fromEntries((capture?.pages || []).map((p) => [bare(p.url), p.copy]));
  } catch {
    return {};
  }
}

module.exports = { refresh, refreshDue, checkFeed, checkFeedsDue, parseFeed, findFeed, discover, readHtml, grounded, sameFact, mergeFacts, extractFacts, labelOf, studioCopies, MAX_FACTS };
