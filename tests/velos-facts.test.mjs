// Phase 3: facts read from the company's own site, each tied to its page and checked against it; what is new since
// the last read; and the next post on each platform announcing it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'Questera-Backend', 'index.js'));
process.env.STUDIO_ALLOW_PRIVATE = 'true'; // the fake site runs on localhost
Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_dummy', RAZORPAY_KEY_SECRET: 'dummy' });

const SiteFacts = require('./functions/SiteFacts');
const page = (title, lines) => `<html><head><title>${title}</title></head><body><nav><a href="/login">Log in</a></nav><main><h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join('')}</main><footer>© Acme</footer></body></html>`;

// The site: a sitemap, a few pages, and links the reader should skip.
const site = {
  '/': page('Acme scheduling', ['Acme schedules posts for Instagram, LinkedIn and X from one calendar.', '<a href="/pricing">Pricing</a> <a href="/privacy">Privacy</a>']),
  '/features': page('Features', ['Acme suggests the best posting time for each channel from your last 90 days of results.', 'Bulk upload accepts up to 50 posts from a CSV file.']),
  '/pricing': page('Pricing', ['The Team plan costs $29 per month and includes 3 users.']),
  '/integrations': page('Integrations', ['Acme connects to Canva and Google Drive to pull in images.']),
  '/privacy': page('Privacy', ['We store cookies.']),
  '/login': page('Log in', ['Email and password.']),
};
const sitemap = () => `<?xml version="1.0"?><urlset>${Object.keys(site).map((p) => `<url><loc>${base}${p}</loc></url>`).join('')}</urlset>`;
const articles = [{ title: 'Older post', path: '/blog/older', date: new Date(Date.now() - 10 * 86400e3) }];
const feed = () => `<?xml version="1.0"?><rss><channel>${articles.map((a) => `<item><title>${a.title}</title><link>${base}${a.path}</link><pubDate>${a.date.toUTCString()}</pubDate><description>About ${a.title}</description></item>`).join('')}</channel></rss>`;
let server, base;

// A stand-in for the model: one fact per sentence, plus one invented fact the grounding check must drop.
const llm = {
  chatJSON: async (messages) => {
    const body = messages[1].content;
    const facts = [];
    body.split('### Page ').slice(1).forEach((chunk, i) => {
      for (const line of chunk.split('\n')) {
        if (/^(Acme|Bulk|The Team)/.test(line)) facts.push({ page: i + 1, kind: /\$|\d/.test(line) ? 'number' : 'feature', text: line });
      }
      facts.push({ page: i + 1, kind: 'number', text: 'Acme customers grow their following by 300% in a month.' });
    });
    return { facts };
  },
};

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *');
    if (req.url === '/sitemap.xml') return res.end(sitemap());
    if (req.url === '/feed') return res.end(feed());
    const html = site[req.url.replace(/\/$/, '') || '/'];
    if (!html) return (res.statusCode = 404), res.end();
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('reads the useful pages, skips login and legal ones', async () => {
  const d = await SiteFacts.discover(base);
  const labels = d.pages.map((p) => `${p.label}:${new URL(p.url).pathname}`).sort();
  assert.deepEqual(labels, ['integrations:/integrations', 'pricing:/pricing', 'product:/features']);
});

test('every fact is on its page; invented numbers are dropped', async () => {
  const memory = { website: { url: base }, facts: [], brand: {}, whatsNew: [] };
  const r = await SiteFacts.refresh(memory, { llm });
  assert.ok(r.facts.length >= 5, `${r.facts.length} facts`);
  assert.ok(!r.facts.some((f) => /300%/.test(f.text)), 'the invented 300% must not survive');
  const price = r.facts.find((f) => /\$29/.test(f.text));
  assert.equal(new URL(price.sourceUrl).pathname, '/pricing');
  assert.deepEqual(r.whatsNew, [], 'nothing is "new" on the first read');
  assert.equal(memory.brand.proofPoints.length, r.facts.length);
});

test('the next read finds the new page and the new feature, and forgets what the site stopped saying', async () => {
  const memory = { website: { url: base }, facts: [], brand: {}, whatsNew: [] };
  await SiteFacts.refresh(memory, { llm });

  site['/integrations/notion'] = page('Notion integration', ['Acme now imports post drafts from Notion databases.']);
  site['/features'] = page('Features', ['Acme suggests the best posting time for each channel from your last 90 days of results.', 'Acme now writes alt text for every image automatically.']);
  const r = await SiteFacts.refresh(memory, { llm, now: new Date(Date.now() + 7 * 86400e3) });

  assert.ok(r.whatsNew.some((w) => w.kind === 'page' && w.url.endsWith('/integrations/notion')), 'new page');
  assert.ok(r.whatsNew.some((w) => w.kind === 'feature' && /alt text/.test(w.title)), 'new feature on a known page');
  assert.ok(!memory.facts.some((f) => /Bulk upload/.test(f.text)), 'the features page no longer says this');
  assert.ok(memory.facts.some((f) => /Canva/.test(f.text)), 'unchanged facts stay');
});

test('news is announced once per platform, before anything else', async () => {
  const AutopilotMemory = require('./models/autopilotMemory');
  const AutopilotService = require('./functions/AutopilotService');
  const memory = new AutopilotMemory({
    userId: 'u1',
    whatsNew: [{ key: 'k1', kind: 'blog', title: 'How we cut posting time in half', url: 'https://acme.test/blog/half', summary: 'What changed.', foundAt: new Date() }],
  });
  const svc = new AutopilotService();
  const plan = svc.withAnnouncement({ theme: 'tips', promptSuggestion: 'a tip' }, memory, 'linkedin');
  assert.equal(plan.theme, 'announcement');
  assert.equal(plan.linkUrl, 'https://acme.test/blog/half');
  assert.match(plan.promptSuggestion, /new article on the blog: How we cut posting time in half/);
  memory.markAnnounced('k1', 'linkedin', 'post-9');
  assert.equal(memory.nextAnnouncement('linkedin'), null);
  assert.equal(memory.nextAnnouncement('twitter').key, 'k1', 'still due on X');
});

test('grounding needs the numbers and most of the words', () => {
  const text = 'The Team plan costs $29 per month and includes 3 users.';
  assert.equal(SiteFacts.grounded('The Team plan costs $29 per month for 3 users.', text), true);
  assert.equal(SiteFacts.grounded('The Team plan costs $49 per month for 3 users.', text), false);
  assert.equal(SiteFacts.grounded('Acme is trusted by Fortune 500 companies worldwide.', text), false);
});

test('blog to social: a new article in the feed becomes news; the first check only finds the feed', async () => {
  const memory = { website: { url: base }, whatsNew: [] };
  assert.deepEqual(await SiteFacts.checkFeed(memory), []);
  assert.equal(memory.website.feedUrl, `${base}/feed`);

  articles.unshift({ title: 'We now post to Threads', path: '/blog/threads', date: new Date() });
  const fresh = await SiteFacts.checkFeed(memory, new Date(Date.now() + 60e3));
  assert.deepEqual(fresh.map((f) => [f.kind, f.title, f.source]), [['blog', 'We now post to Threads', 'rss']]);
  assert.equal(memory.whatsNew[0].url, `${base}/blog/threads`);
  assert.deepEqual(await SiteFacts.checkFeed(memory, new Date(Date.now() + 120e3)), [], 'announced once');
});

test('an article is a LinkedIn post, an X thread and an Instagram carousel', () => {
  const AutopilotService = require('./functions/AutopilotService');
  const AutopilotMemory = require('./models/autopilotMemory');
  const memory = new AutopilotMemory({ userId: 'u', whatsNew: [{ key: 'a', kind: 'blog', title: 'T', url: 'https://x/a', foundAt: new Date() }] });
  const svc = new AutopilotService();
  const formats = ['linkedin', 'twitter', 'instagram'].map((p) => svc.withAnnouncement({ format: 'image' }, memory, p).format);
  assert.deepEqual(formats, ['text', 'thread', 'carousel']);
});
