const WebsiteExtractor = require('../agent/WebsiteExtractor');
const { OpenRouterProvider } = require('../agent/LLMProvider');

// Pages worth reading, in priority order. A marketing site says who it is on
// the homepage, what it does on product/features, and who for on about.
const PAGE_HINTS = [
  { re: /\/(about|about-us|company|team|story|mission)/i, label: 'about', weight: 9 },
  { re: /\/(product|products|features|platform|solutions?|how-it-works)/i, label: 'product', weight: 10 },
  { re: /\/(pricing|plans)/i, label: 'pricing', weight: 6 },
  { re: /\/(customers?|case-stud|success|testimonial)/i, label: 'customers', weight: 7 },
  { re: /\/(blog|resources|insights|articles)\/?$/i, label: 'blog', weight: 5 },
  { re: /\/(use-cases?|for-)/i, label: 'use-cases', weight: 6 },
];

const MAX_PAGES = 6;
const CONCURRENCY = 3;

const SYNTHESIS_PROMPT = `You are a brand strategist reading a company's website in order to run their social media.

You will be given the text of several pages from one website. Produce a factual brand profile that a content agent can post from.

RULES:
- Ground everything in what the pages actually say. Do NOT invent customers, metrics, funding, awards or features.
- If something is not stated, leave it out rather than guessing.
- "proofPoints" are concrete, specific, checkable claims the site makes - the raw material for posts. Prefer numbers, named integrations, named capabilities. Avoid marketing air like "world-class" or "seamless".
- "contentAngles" are things this company could credibly post about repeatedly, phrased as topics, not slogans.

Respond with ONLY valid JSON:

{
  "companyName": "",
  "oneLiner": "what they do, one plain sentence",
  "topicsAllowed": ["4-8 topics they can credibly post about"],
  "targetAudience": "who they sell to, specifically",
  "visualStyle": "the visual register their brand implies",
  "tone": "professional|casual|friendly|bold|inspirational",
  "uniqueSellingPoints": ["3-5 concrete differentiators, grounded in the pages"],
  "proofPoints": ["5-10 specific factual claims from the site, each usable as a post"],
  "contentAngles": ["5-8 recurring themes this account could post about"],
  "competitorsMentioned": [],
  "confidence": "high|medium|low"
}`;

/**
 * Crawls a company website and turns it into a brand profile the autopilot can
 * post from.
 *
 * WebsiteExtractor handles a single page; this walks a handful of the most
 * informative pages, because a homepage alone rarely says who the product is
 * for or what it concretely does.
 */
class BrandCrawler {
  constructor() {
    this.extractor = new WebsiteExtractor();
    this.llm = new OpenRouterProvider({ model: process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash' });
  }

  normalizeUrl(url) {
    let u = String(url || '').trim();
    if (!u) throw new Error('A website URL is required');
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    return new URL(u);
  }

  /**
   * Pick which internal links are worth fetching.
   */
  selectPages(baseUrl, links) {
    const origin = baseUrl.origin;
    const seen = new Set([baseUrl.href.replace(/\/$/, '')]);
    const scored = [];

    for (const raw of links || []) {
      let abs;
      try {
        abs = new URL(raw, baseUrl);
      } catch {
        continue;
      }

      // Same site only - never wander off to Twitter, docs subdomains, etc.
      if (abs.origin !== origin) continue;
      abs.hash = '';
      const href = abs.href.replace(/\/$/, '');
      if (seen.has(href)) continue;

      // Skip assets and obvious non-content routes.
      if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|css|js)$/i.test(abs.pathname)) continue;
      if (/\/(login|signin|signup|register|privacy|terms|legal|cookie|careers?|jobs)/i.test(abs.pathname)) continue;

      const hint = PAGE_HINTS.find((h) => h.re.test(abs.pathname));
      if (!hint) continue;

      seen.add(href);
      scored.push({ url: href, label: hint.label, weight: hint.weight });
    }

    // Highest-signal pages first, one per label so we get breadth not depth.
    const byLabel = new Map();
    for (const p of scored.sort((a, b) => b.weight - a.weight)) {
      if (!byLabel.has(p.label)) byLabel.set(p.label, p);
    }

    return [...byLabel.values()].slice(0, MAX_PAGES - 1);
  }

  async fetchPages(pages) {
    const out = [];
    // Small concurrency - we are a guest on someone's marketing site.
    for (let i = 0; i < pages.length; i += CONCURRENCY) {
      const batch = pages.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (p) => {
          const r = await this.extractor.extract(p.url);
          return r.success ? { ...p, data: r.data } : null;
        })
      );
      out.push(...results.filter(Boolean));
    }
    return out;
  }

  pageToText(page) {
    const d = page.data;
    return [
      `## ${page.label.toUpperCase()} - ${d.url}`,
      d.title && `Title: ${d.title}`,
      d.metaDescription && `Description: ${d.metaDescription}`,
      d.h1 && `Headline: ${d.h1}`,
      d.heroText && `Hero: ${d.heroText}`,
      d.keyBullets?.length && `Points: ${d.keyBullets.slice(0, 8).join(' | ')}`,
      d.mainContent && `Content: ${d.mainContent}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Crawl a site and synthesise a brand profile.
   * Returns { success, brand, pages, error }.
   */
  async crawl(url) {
    let base;
    try {
      base = this.normalizeUrl(url);
    } catch (err) {
      return { success: false, error: `Invalid URL: ${err.message}` };
    }

    console.log(`🕷️  [CRAWLER] Starting on ${base.href}`);

    const home = await this.extractor.extract(base.href);
    if (!home.success) {
      return { success: false, error: `Could not read ${base.href}: ${home.error}` };
    }

    const pages = [{ url: base.href, label: 'home', data: home.data }];

    const candidates = this.selectPages(base, home.data.links);
    console.log(`🕷️  [CRAWLER] ${candidates.length} additional page(s): ${candidates.map((c) => c.label).join(', ') || 'none'}`);
    pages.push(...(await this.fetchPages(candidates)));

    console.log(`🕷️  [CRAWLER] Read ${pages.length} page(s), synthesising brand profile`);

    const corpus = pages.map((p) => this.pageToText(p)).join('\n\n---\n\n');

    let brand;
    try {
      brand = await this.llm.chatJSON(
        [
          { role: 'system', content: SYNTHESIS_PROMPT },
          { role: 'user', content: `Website: ${base.href}\n\n${corpus}` },
        ],
        { temperature: 0.3, fallback: null }
      );
    } catch (err) {
      console.error('❌ [CRAWLER] Synthesis failed:', err.message);
      return { success: false, error: `Could not summarise the site: ${err.message}`, pages: pages.length };
    }

    if (!brand?.oneLiner) {
      return { success: false, error: 'The site was read but produced no usable brand profile', pages: pages.length };
    }

    // Never let the model invent an unsupported tone value.
    const TONES = ['professional', 'casual', 'friendly', 'bold', 'inspirational'];
    if (!TONES.includes(brand.tone)) brand.tone = 'professional';

    console.log(`✅ [CRAWLER] ${brand.companyName || base.hostname}: ${brand.proofPoints?.length || 0} proof points, ${brand.topicsAllowed?.length || 0} topics`);

    return {
      success: true,
      brand,
      website: base.href,
      pages: pages.map((p) => ({ url: p.data.url, label: p.label, title: p.data.title })),
    };
  }
}

module.exports = BrandCrawler;
