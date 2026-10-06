// Post images from the site: which captured screen shows a post's point, and the slides a post becomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'Questera-Backend', 'index.js'));
const { pickShot } = require('./studio/shots.cjs');
const { slidesFor } = require('./functions/PostImages');

const el = (id, text, extra = {}) => ({ id, text, role: 'card', w: 400, h: 120, ...extra });
const capture = {
  url: 'https://acme.test/',
  siteName: 'Acme',
  pages: [
    { label: 'home', url: 'https://acme.test/', copy: { h1: 'Acme schedules your posts', sections: [{ title: 'Pricing', body: 'Plans for teams with posts and publishing' }] } },
    { label: 'integrations', url: 'https://acme.test/integrations/canva', copy: { h1: 'Canva integration' } },
  ],
  shots: [
    { id: 'home-hero', page: 'home', kind: 'hero', file: 'a.jpg', elements: [el('h1', 'Acme schedules your posts for every channel')] },
    { id: 'home-s1', page: 'home', kind: 'section', file: 'b.jpg', elements: [el('s1', 'Best time to post: Acme suggests a time for each channel from your results')] },
    { id: 'home-s2', page: 'home', kind: 'section', file: 'c.jpg', elements: [el('s2', 'Pro plan with publishing for teams with more posts')] },
    { id: 'integrations-hero', page: 'integrations', kind: 'hero', file: 'd.jpg', elements: [el('i1', 'Pull designs straight from Canva')] },
  ],
};

test('the screen from the very page the fact came from wins', () => {
  const pick = pickShot(capture, { text: 'Bring your designs in', sourceUrl: 'https://acme.test/integrations/canva' });
  assert.equal(pick.shotId, 'integrations-hero');
});

test('rare shared words find the right screen and the part to move in on', () => {
  const pick = pickShot(capture, { text: 'Acme suggests the best posting time for each channel', sourceUrl: 'https://acme.test/blog/timing' });
  assert.deepEqual(pick, { shotId: 'home-s1', focus: 's1' });
});

test('no screen shows it: null (the caller makes a text card), not a screen that merely shares common words', () => {
  assert.equal(pickShot(capture, { text: 'Acme now publishes with posts to Notion for teams', sourceUrl: 'https://acme.test/integrations/notion' }), null);
});

test('a week of posts does not repeat a screen while another relevant one is left', () => {
  const used = new Set();
  const a = pickShot(capture, { text: 'x', sourceUrl: 'https://acme.test/' }, used);
  const b = pickShot(capture, { text: 'y', sourceUrl: 'https://acme.test/' }, used);
  assert.notEqual(a.shotId, b.shotId);
});

test('a carousel is a cover, an optional screen, one slide per point and a closing slide; X keeps to 4', () => {
  const copy = { headline: 'H', cover: { headline: 'Cover' }, slides: [1, 2, 3, 4].map((i) => ({ headline: `Point ${i}`, body: 'b' })), end: { headline: 'Try it' } };
  const ig = slidesFor({ platform: 'instagram', multi: true, copy, shot: { match: 'm' }, brandUrl: 'https://acme.test' });
  assert.deepEqual(ig.map((s) => s.kind), ['cover', 'shot', 'point', 'point', 'point', 'point', 'end']);
  assert.equal(ig[1].optional, true);
  assert.equal(ig[6].body, 'acme.test');
  const x = slidesFor({ platform: 'twitter', multi: true, copy, shot: { match: 'm' }, brandUrl: 'https://acme.test' });
  assert.equal(x.length, 4);
  assert.deepEqual(slidesFor({ platform: 'linkedin', multi: false, copy: { headline: 'One', fact: 'F' }, shot: { match: 'm' } }).map((s) => [s.kind, s.fact]), [['shot', 'F']]);
});
