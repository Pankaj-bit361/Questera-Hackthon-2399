// Velos post quality, measured the same way before every release: `npm run velos:eval`.
//
// For each test brand: the brand profile and facts from its site (cached in eval/cache, so runs compare the writer,
// not the crawl; --refresh reads the sites again), then six posts - one per platform format the autopilot makes -
// each built on a different fact, each through the same rule check and reviewer as a real autopilot post.
//
// Reports the average review score per brand and platform, the share at 75+, rule failures, and posts the reviewer
// says claim something the facts do not support. --gate exits non-zero when the average is under 75 or any post
// makes an unsupported claim (the plan's Phase 2 gate).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'Questera-Backend');
const require = createRequire(path.join(backend, 'index.js'));
process.chdir(backend);
require('dotenv').config({ path: path.join(backend, '.env'), quiet: true });
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'dummy';

const args = new Set(process.argv.slice(2));
const only = process.argv.find((a) => a.startsWith('--brand='))?.split('=')[1];
const BRANDS = ['seovyn.com', 'cal.com', 'plausible.io', 'resend.com'].filter((b) => !only || b === only);
const POSTS = [
  { platform: 'linkedin', format: 'text' },
  { platform: 'linkedin', format: 'image' },
  { platform: 'twitter', format: 'text' },
  { platform: 'twitter', format: 'thread' },
  { platform: 'instagram', format: 'image' },
  { platform: 'instagram', format: 'multi_image' },
];

const cacheDir = path.join(root, 'eval/cache');
const outDir = path.join(root, 'eval/results');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

async function brandFor(host) {
  const file = path.join(cacheDir, `${host}.json`);
  if (!args.has('--refresh') && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const BrandCrawler = require('./functions/BrandCrawler');
  const SiteFacts = require('./functions/SiteFacts');
  const crawl = await new BrandCrawler().crawl(host);
  if (!crawl.success) throw new Error(`${host}: ${crawl.error}`);
  const memory = { website: { url: crawl.website }, facts: [], brand: { ...crawl.brand }, whatsNew: [] };
  await SiteFacts.refresh(memory);
  const data = { host, brand: memory.brand, facts: memory.facts.map(({ text, kind, sourceUrl }) => ({ text, kind, sourceUrl })), readAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}

async function evalBrand(host) {
  const data = await brandFor(host);
  const PostWriter = require('./functions/PostWriter');
  const AutopilotService = require('./functions/AutopilotService');
  const order = { feature: 0, customer: 1, number: 2, integration: 3, pricing: 4, audience: 5, other: 6 };
  const facts = [...data.facts].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  const memory = {
    brand: data.brand,
    facts: data.facts,
    contentHistory: [],
    rejections: [],
    freshProofPoints: () => data.facts.map((f) => f.text),
    factSource: (t) => data.facts.find((f) => f.text === t) || null,
  };
  const svc = new AutopilotService();
  return Promise.all(POSTS.map(async (slot, i) => {
    const fact = facts[i % Math.max(1, facts.length)];
    const hasLink = slot.platform !== 'instagram' && Boolean(fact?.sourceUrl);
    const writeArgs = {
      platform: slot.platform,
      format: slot.format,
      brand: data.brand,
      idea: `A post built on this fact from the site: ${fact?.text}`,
      proofPoint: fact?.text || '',
      proofSource: fact?.sourceUrl || '',
      visualConcept: ['text', 'thread'].includes(slot.format) ? '' : 'Real screens of the product from its website',
      hasLink,
      cta: 'See how it works',
      slideCount: slot.format === 'multi_image' ? 4 : 0,
      facts: data.facts.map((f) => f.text),
    };
    const copy = await new PostWriter().write(writeArgs);
    const postType = slot.format === 'multi_image' ? (slot.platform === 'instagram' ? 'carousel' : 'multi_image') : slot.format;
    // The same path a real autopilot post takes: review, and one revision when the review finds problems.
    const { post: linked, review } = await svc.reviewAndRevise({
      config: { platform: slot.platform },
      memory,
      platform: slot.platform,
      linkUrl: hasLink ? fact.sourceUrl : '',
      cta: 'See how it works',
      post: {
        postType,
        ...svc.attachLink(copy, slot.platform, hasLink ? fact.sourceUrl : '', 'See how it works'),
        proofPoint: fact?.text,
        imagePrompt: ['text', 'thread'].includes(slot.format) ? 'none (text only)' : 'Real screens of the company website, in its brand',
      },
      media: { textOnly: !['text', 'thread'].includes(slot.format) },
      rewrite: (revise) => new PostWriter().write({ ...writeArgs, revise }),
    });
    const issues = [...(review?.ruleIssues || []), ...(review?.issues || [])];
    return {
      brand: host,
      ...slot,
      fact: fact?.text,
      score: review?.score ?? null,
      ruleFailed: Boolean(review?.ruleFailed),
      unsupported: (review?.unsupportedClaims || []).length > 0,
      unsupportedClaims: review?.unsupportedClaims || [],
      revised: Boolean(review?.revised),
      verdict: review?.verdict || 'no review',
      issues,
      text: linked.threadParts?.length > 1 ? linked.threadParts.join('\n---\n') : `${linked.caption}${linked.hashtags ? `\n\n${linked.hashtags}` : ''}`,
    };
  }));
}

const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

const started = Date.now();
const results = [];
for (const host of BRANDS) {
  try {
    results.push(...(await evalBrand(host)));
  } catch (err) {
    console.error(`✖ ${host}: ${err.message}`);
  }
}
const scored = results.filter((r) => typeof r.score === 'number');
const summary = {
  at: new Date().toISOString(),
  writer: require('./functions/PostWriter').WRITER_MODEL,
  reviewer: require('./functions/PostReviewer').REVIEW_MODEL,
  posts: results.length,
  average: avg(scored.map((r) => r.score)),
  at75: scored.length ? Math.round((scored.filter((r) => r.score >= 75).length / scored.length) * 100) : 0,
  ruleFailures: results.filter((r) => r.ruleFailed).length,
  unsupported: results.filter((r) => r.unsupported).length,
  revised: results.filter((r) => r.revised).length,
  byBrand: Object.fromEntries(BRANDS.map((b) => [b, avg(scored.filter((r) => r.brand === b).map((r) => r.score))])),
  byPlatform: Object.fromEntries(['linkedin', 'twitter', 'instagram'].map((p) => [p, avg(scored.filter((r) => r.platform === p).map((r) => r.score))])),
};
const file = path.join(outDir, `${summary.at.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 2));

console.log(`\nVelos eval - ${results.length} posts, ${Math.round((Date.now() - started) / 1000)}s (writer ${summary.writer}, reviewer ${summary.reviewer})`);
for (const r of results) console.log(`  ${String(r.score ?? '-').padStart(3)} ${r.ruleFailed ? 'R' : ' '}${r.unsupported ? 'U' : ' '}${r.revised ? 'v' : ' '} ${r.brand.padEnd(13)} ${r.platform.padEnd(9)} ${r.format.padEnd(11)} ${r.unsupported ? `unsupported: ${r.unsupportedClaims.join(' | ')}`.slice(0, 110) : r.verdict.slice(0, 90)}`);
console.log(`\nAverage ${summary.average} · ${summary.at75}% at 75+ · ${summary.ruleFailures} rule failures (R) · ${summary.unsupported} posts with unsupported claims (U) · ${summary.revised} revised (v)`);
console.log(`By brand: ${Object.entries(summary.byBrand).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`By platform: ${Object.entries(summary.byPlatform).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`Saved ${path.relative(root, file)}`);

if (args.has('--gate') && (summary.average < 75 || summary.unsupported > 0)) {
  console.log('\nGate not passed: needs an average of 75+ and no unsupported claims.');
  process.exit(1);
}
process.exit(0);
