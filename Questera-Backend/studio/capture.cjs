// Visits a product's website (and, if the user gives a login, the product itself) in headless Chrome and records what
// a video needs: the brand (colours, fonts, logo), the real copy, and screenshots with the position of every heading,
// button and card on them, so a scene can zoom to a real element and a cursor can click a real button.
//
// Credentials are used once, inside this browser session, and never written anywhere. Email addresses on captured
// product screens are masked before the screenshot is taken.

const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { chromePath } = require('./chrome.cjs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { buildPalette } = require('./color.cjs');
const { startEgressProxy, proxyArgs, safeFetch } = require('./egress.cjs');

const run = promisify(execFile);

const DESKTOP = { width: 1600, height: 1000, deviceScaleFactor: 1.5 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

// Marketing pages worth a visit after the homepage, best first.
const PAGE_HINTS = [
  { re: /\/(features?|product|platform|how-it-works|solutions?)(\/|$)/i, label: 'features' },
  { re: /\/(pricing|plans)(\/|$)/i, label: 'pricing' },
  { re: /\/(integrations?|use-cases?)(\/|$)/i, label: 'integrations' },
  { re: /\/(about|company)(\/|$)/i, label: 'about' },
];
const MAX_SECTIONS = 5;
const MAX_APP_PAGES = 3;
const RISKY_LINK = /log ?out|sign ?out|delete|remove|cancel|billing|unsubscribe|deactivate/i;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Keep the browser on the public web: block requests to loopback, private and link-local hosts (e.g. via redirects). */
const PRIVATE_HOST = /^(localhost|.*\.(local|internal|localhost)|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|0\.0\.0\.0|\[::1?\]|\[f[cd][0-9a-f:]*\])$/i;
async function guard(page) {
  if (process.env.STUDIO_ALLOW_PRIVATE === 'true') return page;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    let host = '';
    try {
      host = new URL(req.url()).hostname;
    } catch {
      /* data: and blob: URLs */
    }
    if (host && PRIVATE_HOST.test(host)) req.abort('blockedbyclient').catch(() => {});
    else req.continue().catch(() => {});
  });
  return page;
}

async function open(page, url) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch (error) {
    console.warn(`[studio] ${url} did not finish loading (${error.message.slice(0, 80)}); using it once the HTML is in`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(2500);
  }
  // Most pages go quiet a moment after load; some never do (chat widgets, analytics, prefetches), so the wait is capped.
  await page.waitForNetworkIdle({ idleTime: 500, concurrency: 2, timeout: 8000 }).catch(() => {});
}

/** Accept cookie banners, scroll once through the page so lazy content and scroll animations settle, return to top. */
async function settle(page) {
  await page.evaluate(() => {
    const yes = /^(accept( all)?|allow( all)?|got it|i agree|agree|ok(ay)?|accept cookies)$/i;
    for (const b of document.querySelectorAll('button, a, [role=button]')) {
      if (yes.test((b.textContent || '').trim())) {
        b.click();
        break;
      }
    }
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(height, 14000); y += 700) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await wait(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(900);
}

/** Hide floating chrome (chat bubbles, sticky bars, cookie notices) that would sit on top of section screenshots. */
async function hideFloating(page, keepTopBar) {
  await page.evaluate((keep) => {
    const all = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        all.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document.body);
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (keep && r.top <= 4 && r.height < 140 && r.width > innerWidth * 0.6) continue;
      el.setAttribute('data-studio-hidden', el.style.visibility || '1');
      el.style.visibility = 'hidden';
    }
    for (const f of document.querySelectorAll('iframe')) {
      const r = f.getBoundingClientRect();
      if (r.width < 500 && r.height < 800) f.style.visibility = 'hidden';
    }
  }, keepTopBar);
}

/** Scroll-triggered animations can leave content invisible in a screenshot; finish them inside the given band. */
async function revealIn(page, top, height) {
  await page.evaluate(
    ({ top, height }) => {
      for (const el of document.querySelectorAll('main *, section *, [class*=reveal], [data-aos], [class*=fade]')) {
        if (el.closest('header, nav, [role=dialog], [role=menu]')) continue;
        const r = el.getBoundingClientRect();
        const y = r.top + scrollY;
        if (y + r.height < top || y > top + height || r.width < 8) continue;
        const cs = getComputedStyle(el);
        if (Number(cs.opacity) < 0.95) el.style.setProperty('opacity', '1', 'important');
        if (cs.transform !== 'none' && /reveal|fade|aos|animate|motion/i.test(el.className + (el.getAttribute('data-aos') || ''))) el.style.setProperty('transform', 'none', 'important');
        if (cs.visibility === 'hidden' && !el.hasAttribute('data-studio-hidden')) el.style.setProperty('visibility', 'visible', 'important');
      }
      for (const el of document.querySelectorAll('[class*=reveal], [class*=fade-in], [data-aos]')) el.classList.add('is-in', 'in-view', 'visible', 'aos-animate', 'is-visible');
    },
    { top, height },
  );
  await wait(250);
}

/** Replace email addresses (and the signed-in user's name part) on screen, so captured product screens are shareable. */
async function maskPrivate(page, email) {
  await page.evaluate((own) => {
    const re = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
    const local = own ? own.split('@')[0] : null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      let t = node.nodeValue;
      if (!t || t.length > 400) continue;
      const next = t.replace(re, 'you@company.com');
      const masked = local && local.length > 2 ? next.split(local).join('you') : next;
      if (masked !== t) node.nodeValue = masked;
    }
    for (const input of document.querySelectorAll('input')) if (re.test(input.value || '')) input.value = 'you@company.com';
  }, email || null);
}

/** Everything on the page a video can point at, relative to a clip rectangle (CSS pixels). */
async function elementsIn(page, clip, prefix) {
  return page.evaluate(
    ({ clip, prefix }) => {
      const out = [];
      const seen = new Set();
      const visible = (el, r) => {
        const cs = getComputedStyle(el);
        return r.width > 8 && r.height > 8 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
      };
      const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const add = (el, role) => {
        if (seen.has(el)) return;
        const r = el.getBoundingClientRect();
        const x = r.left + scrollX - clip.x;
        const y = r.top + scrollY - clip.y;
        if (!visible(el, r) || x < -4 || y < -4 || x + r.width > clip.width + 4 || y + r.height > clip.height + 4) return;
        seen.add(el);
        out.push({ role, text: label(el), x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) });
      };
      document.querySelectorAll('h1, h2, h3').forEach((el) => add(el, 'heading'));
      document.querySelectorAll('button, a[class*=btn], a[class*=button], [role=button], input[type=submit]').forEach((el) => add(el, 'button'));
      document.querySelectorAll('input:not([type=hidden]), textarea, select').forEach((el) => add(el, 'input'));
      document.querySelectorAll('img, svg, video, canvas').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 80) add(el, 'media');
      });
      // Cards: boxed elements of a sensible size (border, shadow or their own background).
      document.querySelectorAll('div, li, article, section, aside, table').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 140 || r.height < 70 || r.width > clip.width * 0.92 || r.height > 900) return;
        const cs = getComputedStyle(el);
        const boxed = cs.boxShadow !== 'none' || (cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0) || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderRadius) >= 6);
        if (boxed) add(el, 'card');
      });
      const order = { heading: 0, button: 1, input: 2, card: 3, media: 4 };
      return out
        .sort((a, b) => order[a.role] - order[b.role])
        .slice(0, 36)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((e, i) => ({ id: `${prefix}e${i + 1}`, ...e }));
    },
    { clip, prefix },
  );
}

async function shoot(page, dir, id, clip) {
  const file = `${id}.jpg`;
  await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 86, clip: clip || undefined, captureBeyondViewport: Boolean(clip) });
  return file;
}

/** The words on the page, in reading order, trimmed to what a script writer needs. */
async function readCopy(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute('content') || '';
    const h1 = clean(document.querySelector('h1')?.innerText);
    let sub = '';
    const h1el = document.querySelector('h1');
    if (h1el) {
      let n = h1el.parentElement;
      for (let i = 0; i < 3 && n && !sub; i++, n = n.parentElement) {
        const p = [...n.querySelectorAll('p')].find((p) => clean(p.innerText).length > 30);
        if (p) sub = clean(p.innerText);
      }
    }
    const sections = [];
    document.querySelectorAll('h2, h3').forEach((h) => {
      const title = clean(h.innerText);
      if (!title || title.length > 140) return;
      let body = '';
      let n = h.nextElementSibling;
      for (let i = 0; i < 4 && n && !body; i++, n = n.nextElementSibling) if (/^(P|DIV|UL)$/.test(n.tagName)) body = clean(n.innerText).slice(0, 320);
      if (!body) body = clean(h.parentElement?.querySelector('p')?.innerText).slice(0, 320);
      sections.push({ level: h.tagName.toLowerCase(), title, body });
    });
    const ctas = [...new Set([...document.querySelectorAll('a, button')].map((a) => clean(a.innerText)).filter((t) => t && t.length < 40 && /^(get|start|try|book|sign up|join|request|see|watch|create|launch|download|contact|talk)/i.test(t)))].slice(0, 8);
    const nav = [...new Set([...document.querySelectorAll('header a, nav a')].map((a) => clean(a.innerText)).filter((t) => t && t.length < 30))].slice(0, 14);
    const bullets = [...document.querySelectorAll('main li, section li')].map((li) => clean(li.innerText)).filter((t) => t.length > 8 && t.length < 140).slice(0, 30);
    const text = clean(document.body.innerText);
    const numbers = [...new Set(text.match(/[$€£₹]?\d[\d,.]*\s?(%|\+|x|k|m|hrs?|hours|mins?|minutes|days|seconds|articles|users|customers|teams)\b/gi) || [])].slice(0, 16);
    const prices = [...new Set(text.match(/[$€£₹]\s?\d[\d,.]*(\s?\/\s?(mo|month|yr|year|user))?/gi) || [])].slice(0, 10);
    return {
      title: clean(document.title),
      description: meta('description') || meta('og:description'),
      siteName: meta('og:site_name'),
      h1,
      sub,
      sections: sections.slice(0, 24),
      ctas,
      nav,
      bullets,
      numbers,
      prices,
    };
  });
}

/** Colours and fonts as the site actually renders them, plus the logo and icon candidates. */
async function readBrand(page) {
  return page.evaluate(() => {
    const transparent = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    const bgAt = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (!transparent(cs.backgroundColor)) return cs.backgroundColor;
        const grad = cs.backgroundImage.match(/rgba?\([^)]+\)/);
        if (grad) return grad[0];
      }
      return 'rgb(255, 255, 255)';
    };
    const h1 = document.querySelector('h1') || document.querySelector('h2') || document.body;
    // The hero's backdrop is often a positioned layer behind the headline, not one of its parents: look through the stack.
    const stackBg = (x, y) => {
      for (const el of document.elementsFromPoint(x, y)) {
        const cs = getComputedStyle(el);
        if (!transparent(cs.backgroundColor)) return cs.backgroundColor;
        const grad = cs.backgroundImage.match(/rgba?\([^)]+\)/);
        if (grad) return grad[0];
      }
      return null;
    };
    const ht = h1.getBoundingClientRect();
    const heroBg = stackBg(Math.max(20, ht.left - 40), Math.min(innerHeight - 10, ht.top + 10)) || stackBg(20, Math.min(innerHeight - 10, ht.top + 10)) || bgAt(h1);
    const pageBg = bgAt(document.body);
    const p = [...document.querySelectorAll('p')].find((p) => p.getBoundingClientRect().top < innerHeight * 1.5 && p.innerText.trim().length > 30) || document.body;
    // CTA buttons in the first two screens: solid, visible, a real label.
    const buttons = [...document.querySelectorAll('a, button')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { el, r, bg: cs.backgroundColor, color: cs.color, radius: parseFloat(cs.borderRadius) || 0, text: el.innerText.trim() };
      })
      .filter((b) => b.r.top < innerHeight * 2 && b.r.width > 60 && b.r.height > 28 && b.text && b.text.length < 40 && !transparent(b.bg));
    const links = [...document.querySelectorAll('main a, section a')].slice(0, 40).map((a) => getComputedStyle(a).color);
    const famOf = (el) => getComputedStyle(el).fontFamily;
    const weightOf = (el) => getComputedStyle(el).fontWeight;

    // Logo: an image or inline SVG in the header, preferably linking home or labelled as the logo.
    const header = document.querySelector('header') || document.querySelector('nav') || document.body;
    const candidates = [...header.querySelectorAll('a[href="/"] img, a[href="/"] svg, [class*=logo] img, [class*=logo] svg, img[alt*=logo i], img[src*=logo i], svg[class*=logo i], a[href="/"], [class*=logo]')];
    let logo = null;
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width < 16 || r.height < 10 || r.top > 200) continue;
      const img = c.tagName === 'IMG' ? c : c.querySelector?.('img');
      const svg = c.tagName.toLowerCase() === 'svg' ? c : c.querySelector?.('svg');
      if (img && img.currentSrc) {
        logo = { kind: 'img', src: img.currentSrc, w: r.width, h: r.height };
        break;
      }
      if (svg) {
        const clone = svg.cloneNode(true);
        const sr = svg.getBoundingClientRect();
        clone.setAttribute('width', String(Math.round(sr.width)));
        clone.setAttribute('height', String(Math.round(sr.height)));
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${Math.round(sr.width)} ${Math.round(sr.height)}`);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.style.color = getComputedStyle(svg).color;
        logo = { kind: 'svg', markup: clone.outerHTML, w: sr.width, h: sr.height, color: getComputedStyle(svg).color };
        // An SVG icon next to a text wordmark: keep the text too.
        const text = (c.innerText || '').trim();
        if (text && text.length < 30) logo.text = text;
        break;
      }
      const text = (c.innerText || '').trim();
      if (text && text.length < 30 && c.tagName === 'A') {
        const cs = getComputedStyle(c.querySelector('span, div, b, strong') || c);
        logo = { kind: 'text', text, color: cs.color, fontFamily: cs.fontFamily, fontWeight: cs.fontWeight };
        break;
      }
    }
    const logoBg = logo ? bgAt(header) : null;
    const icons = [...document.querySelectorAll('link[rel*=icon]')].map((l) => ({ href: l.href, sizes: l.getAttribute('sizes') || '', rel: l.rel }));
    const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';

    // Font faces this page declares (same-origin sheets only; cross-origin ones are fetched by the server).
    const faces = [];
    const sheets = [];
    for (const s of document.styleSheets) {
      try {
        for (const rule of s.cssRules) {
          if (rule.constructor.name === 'CSSFontFaceRule' || rule.type === 5) {
            const st = rule.style;
            faces.push({ family: st.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: st.getPropertyValue('font-weight'), style: st.getPropertyValue('font-style'), range: st.getPropertyValue('unicode-range'), src: st.getPropertyValue('src'), base: s.href || location.href });
          }
        }
      } catch {
        if (s.href) sheets.push(s.href);
      }
    }
    return {
      heroBg,
      pageBg,
      ink: getComputedStyle(h1).color,
      muted: getComputedStyle(p).color,
      buttons: buttons.map((b) => ({ bg: b.bg, color: b.color, area: b.r.width * b.r.height, radius: b.radius, text: b.text, top: b.r.top })),
      links,
      displayFont: { family: famOf(h1), weight: weightOf(h1), transform: getComputedStyle(h1).textTransform, letterSpacing: getComputedStyle(h1).letterSpacing },
      bodyFont: { family: famOf(p), weight: weightOf(p) },
      logo,
      logoBg,
      icons,
      ogImage,
      faces,
      sheets,
    };
  });
}

/** The colour the first screen is mostly made of, measured from pixels (DOM backgrounds can hide behind layers). */
async function sampleBackground(page) {
  const png = await page.screenshot({ type: 'png', encoding: 'base64', clip: { x: 0, y: 0, width: DESKTOP.width, height: DESKTOP.height, scale: 0.08 } });
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const buckets = new Map();
    for (let i = 0; i < px.length; i += 4) {
      const key = `${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`;
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += px[i];
      b.g += px[i + 1];
      b.b += px[i + 2];
      buckets.set(key, b);
    }
    const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
    return `rgb(${Math.round(top.r / top.n)}, ${Math.round(top.g / top.n)}, ${Math.round(top.b / top.n)})`;
  }, png);
}

// ─── fonts ───────────────────────────────────────────────────────────────

const first = (family) => (family || '').split(',')[0].replace(/["']/g, '').trim();
/** next/font renames families to "__Inter_ab12cd"; the real name is in the middle. */
const realName = (family) => first(family).replace(/^__/, '').replace(/_[0-9a-f]{5,}$/i, '').replace(/_Fallback.*$/i, '').replace(/_/g, ' ');

function parseFaces(css, base) {
  const faces = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
    const get = (p) => (block.match(new RegExp(`${p}\\s*:\\s*([^;]+)`, 'i')) || [])[1] || '';
    faces.push({ family: get('font-family').replace(/["']/g, '').trim(), weight: get('font-weight').trim(), style: get('font-style').trim(), range: get('unicode-range').trim(), src: get('src'), base });
  }
  return faces;
}

function bestUrl(src, base) {
  const urls = [...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)\s*(format\(\s*["']?([\w-]+)["']?\s*\))?/g)].map((m) => ({ url: m[1], format: m[3] || '' }));
  const pick = urls.find((u) => /woff2/.test(u.format) || /\.woff2/.test(u.url)) || urls.find((u) => /woff|truetype|opentype/.test(u.format) || /\.(woff|ttf|otf)/.test(u.url));
  if (!pick || pick.url.startsWith('data:')) return null;
  try {
    return new URL(pick.url, base).href;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const r = await safeFetch(url, { headers: { 'User-Agent': UA } });
  return r.ok ? r.text() : '';
}

async function download(url, file) {
  const inline = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url);
  if (inline) {
    const buf = inline[1] ? Buffer.from(inline[2], 'base64') : Buffer.from(decodeURIComponent(inline[2]), 'utf8');
    await fs.writeFile(file, buf);
    return buf;
  }
  const r = await safeFetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await fs.writeFile(file, r.buffer);
  return r.buffer;
}

/** Download the woff2 files for a family (the page's own @font-face rules, else Google Fonts by name). */
async function resolveFont(familyCss, faces, dir, slug) {
  const raw = first(familyCss);
  const name = realName(familyCss);
  if (!raw || /^(system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|arial|helvetica|inherit|ui-sans-serif)$/i.test(raw)) return null;
  let mine = faces.filter((f) => f.family === raw || f.family === name);
  if (!mine.length) {
    const css = await fetchText(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;500;600;700;800;900&display=swap`).catch(() => '');
    mine = parseFaces(css, 'https://fonts.gstatic.com/').filter((f) => !/italic/.test(f.style));
    // Google splits by unicode range; keep the Latin subset (the last block per weight).
    const latest = new Map();
    for (const f of mine) latest.set(f.weight, f);
    mine = [...latest.values()];
  }
  // Subsetted families declare one face per script; only the one covering basic Latin is needed.
  const latin = (f) => !f.range || /U\+0+(-|,|$)|U\+0000-00FF|U\+0-FF/i.test(f.range);
  const perWeight = new Map();
  for (const f of mine) {
    if (/italic|oblique/.test(f.style)) continue;
    const key = f.weight || '400';
    if (!perWeight.has(key) || (latin(f) && !latin(perWeight.get(key)))) perWeight.set(key, f);
  }
  mine = [...perWeight.values()];
  const files = [];
  const done = new Set();
  for (const f of mine) {
    const url = bestUrl(f.src, f.base);
    if (!url || done.has(url)) continue;
    done.add(url);
    const ext = (url.match(/\.(woff2|woff|ttf|otf)(\?|$)/) || [])[1] || 'woff2';
    const file = `fonts/${slug}-${files.length}.${ext}`;
    try {
      await download(url, path.join(dir, file));
      files.push({ file, weight: f.weight || '400' });
    } catch {
      /* a missing weight is fine */
    }
    if (files.length >= 6) break;
  }
  return files.length ? { family: name, files } : null;
}

// ─── logo ────────────────────────────────────────────────────────────────

async function saveLogo(brand, dir) {
  const logo = brand.logo;
  try {
    if (logo?.kind === 'svg') {
      let markup = logo.markup;
      // currentColor resolves to the colour the site used.
      if (logo.color) markup = markup.replace(/currentColor/g, logo.color);
      await fs.writeFile(path.join(dir, 'logo.svg'), markup);
      return { file: 'logo.svg', kind: 'svg', w: logo.w, h: logo.h, text: logo.text || null, bg: brand.logoBg };
    }
    if (logo?.kind === 'img') {
      const ext = (logo.src.match(/\.(svg|png|webp|jpe?g)(\?|$)/i) || [])[1] || 'png';
      const file = `logo.${ext.toLowerCase()}`;
      await download(logo.src, path.join(dir, file));
      return { file, kind: 'img', w: logo.w, h: logo.h, bg: brand.logoBg };
    }
    if (logo?.kind === 'text') return { kind: 'text', text: logo.text, color: logo.color, bg: brand.logoBg };
  } catch {
    /* fall through to the icon */
  }
  return null;
}

async function saveIcon(brand, dir) {
  const score = (i) => (/apple/.test(i.rel) ? 400 : 0) + (parseInt(i.sizes, 10) || (/svg/.test(i.href) ? 300 : 32));
  const icons = [...brand.icons].sort((a, b) => score(b) - score(a));
  for (const icon of icons) {
    try {
      const ext = (icon.href.match(/\.(svg|png|ico|webp)(\?|$)/i) || [])[1] || 'png';
      if (ext === 'ico') continue;
      const file = `icon.${ext.toLowerCase()}`;
      await download(icon.href, path.join(dir, file));
      return { file };
    } catch {
      /* next */
    }
  }
  return null;
}

// ─── pages ───────────────────────────────────────────────────────────────

/** Screens of one marketing page: the first screen, then its main sections. */
async function captureMarketing(page, dir, prefix, label) {
  const shots = [];
  await hideFloating(page, true);
  const hero = { x: 0, y: 0, width: DESKTOP.width, height: DESKTOP.height };
  shots.push({ id: `${prefix}hero`, file: await shoot(page, dir, `${prefix}hero`, null), width: hero.width, height: hero.height, kind: 'hero', page: label, elements: await elementsIn(page, hero, `${prefix}hero-`) });
  await hideFloating(page, false);
  const sections = await page.evaluate((max) => {
    const out = [];
    const used = [];
    for (const h of document.querySelectorAll('h2')) {
      let box = h;
      for (let n = h.parentElement; n && n !== document.body; n = n.parentElement) {
        const r = n.getBoundingClientRect();
        if (r.height > 1600) break;
        box = n;
        if (r.height > 460 && r.width > innerWidth * 0.7) break;
      }
      const r = box.getBoundingClientRect();
      const top = r.top + scrollY;
      if (top < innerHeight * 0.8 || r.height < 300) continue;
      if (used.some(([a, b]) => top < b && top + r.height > a)) continue;
      used.push([top, top + r.height]);
      out.push({ y: Math.max(0, Math.round(top - 24)), height: Math.round(Math.min(r.height + 48, 1300)), title: h.innerText.trim().slice(0, 90) });
      if (out.length >= max) break;
    }
    return out;
  }, MAX_SECTIONS);
  for (const [i, s] of sections.entries()) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, s.y - 120));
    await wait(1100);
    await revealIn(page, s.y, s.height);
    const clip = { x: 0, y: s.y, width: DESKTOP.width, height: s.height };
    const id = `${prefix}s${i + 1}`;
    shots.push({ id, file: await shoot(page, dir, id, clip), width: clip.width, height: clip.height, kind: 'section', page: label, title: s.title, elements: await elementsIn(page, clip, `${id}-`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return shots;
}

async function captureAppScreen(page, dir, id, email) {
  await maskPrivate(page, email);
  await hideFloating(page, true);
  await wait(300);
  const clip = { x: 0, y: 0, width: DESKTOP.width, height: DESKTOP.height };
  return { id, file: await shoot(page, dir, id, null), width: clip.width, height: clip.height, kind: 'app', page: await page.title(), url: page.url(), elements: await elementsIn(page, clip, `${id}-`) };
}

async function signIn(page, login, siteUrl) {
  let target = login.loginUrl;
  if (!target) {
    await open(page, siteUrl);
    target = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => /^(log ?in|sign ?in)$/i.test(a.innerText.trim()))?.href || '');
    if (!target) target = new URL('/login', siteUrl).href;
  }
  await open(page, target);
  const emailSel = 'input[type=email], input[autocomplete=username], input[name*=email i], input[id*=email i], input[name*=user i], input[type=text]';
  await page.waitForSelector(`${emailSel}, input[type=password]`, { timeout: 20000 });
  const emailField = await page.$(emailSel);
  if (emailField) await emailField.type(login.email, { delay: 20 });
  let password = await page.$('input[type=password]');
  if (!password) {
    // Two-step sign-in: email first, password on the next screen.
    await page.keyboard.press('Enter');
    password = await page.waitForSelector('input[type=password]', { timeout: 15000 }).catch(() => null);
  }
  if (!password) throw new Error('Could not find a password field on the sign-in page.');
  await password.type(login.password, { delay: 20 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => null), page.keyboard.press('Enter')]);
  await wait(2500);
  const stillThere = await page.evaluate(() => [...document.querySelectorAll('input[type=password]')].some((i) => i.getBoundingClientRect().width > 0));
  if (stillThere) throw new Error('Sign-in did not go through. Check the email and password; accounts with two-factor sign-in cannot be captured yet.');
}

/**
 * Capture a site. `login` ({ loginUrl?, email, password }) is optional; when given, product screens are captured too.
 * Writes screenshots, fonts and the logo into `dir` and returns the manifest (also saved as capture.json).
 */
const PAGE_MS = 120000; // one page's budget: load, settle, screenshots and elements
const SITE_MS = 8 * 60000; // the whole read

/** `promise`, or a "took too long" error after `ms`. */
function within(promise, ms, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(Object.assign(new Error(`Timed out reading ${what}.`), { timeout: true })), ms)))]).finally(() => clearTimeout(timer));
}

async function readSite({ url, login, dir, onStep = () => {} }) {
  const siteUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  await fs.mkdir(path.join(dir, 'fonts'), { recursive: true });
  const proxy = process.env.STUDIO_ALLOW_PRIVATE === 'true' ? null : await startEgressProxy();
  // No single browser call may wait more than a minute (heavy sites can stall Chrome on a small machine).
  const browser = await puppeteer.launch({ headless: 'shell', protocolTimeout: 60000, executablePath: chromePath(), args: ['--no-sandbox', '--hide-scrollbars', '--disable-dev-shm-usage', '--font-render-hinting=none', ...(proxy ? proxyArgs(proxy.url) : [])] });
  const manifest = { url: siteUrl, capturedAt: new Date().toISOString(), pages: [], shots: [], appShots: [], login: login ? { attempted: true, ok: false } : null };
  try {
    const page = await guard(await browser.newPage());
    await page.setUserAgent(UA);
    await page.setViewport(DESKTOP);

    onStep('Opening your site');
    await open(page, siteUrl);
    await settle(page);
    manifest.finalUrl = page.url();
    const origin = new URL(manifest.finalUrl).origin;

    onStep('Reading your brand');
    const brand = await readBrand(page);
    brand.heroBg = await sampleBackground(page).catch(() => brand.heroBg);
    const home = await readCopy(page);
    manifest.siteName = home.siteName || home.title.split(/[|—–-]/)[0].trim() || new URL(origin).hostname.replace(/^www\./, '');
    manifest.palette = buildPalette(brand);
    manifest.buttonRadius = Math.min(40, Math.max(6, brand.buttons.sort((a, b) => b.area - a.area)[0]?.radius || 12));
    manifest.typeStyle = { transform: brand.displayFont.transform, weight: Number(brand.displayFont.weight) || 700, letterSpacing: brand.displayFont.letterSpacing };

    const faces = [...brand.faces];
    for (const href of brand.sheets.slice(0, 8)) faces.push(...parseFaces(await fetchText(href).catch(() => ''), href));
    const display = await resolveFont(brand.displayFont.family, faces, dir, 'display');
    const body = first(brand.bodyFont.family) === first(brand.displayFont.family) ? display : await resolveFont(brand.bodyFont.family, faces, dir, 'body');
    manifest.fonts = { display, body: body || display };
    manifest.logo = await saveLogo(brand, dir);
    manifest.icon = await saveIcon(brand, dir);

    onStep('Capturing your pages');
    manifest.pages.push({ url: manifest.finalUrl, label: 'home', copy: home });
    manifest.shots.push(...(await within(captureMarketing(page, dir, 'home-', 'home'), PAGE_MS, 'the home page')));

    const links = await page.evaluate(() => [...document.querySelectorAll('header a, nav a, footer a')].map((a) => a.href));
    const picked = [];
    for (const hint of PAGE_HINTS) {
      const href = links.find((l) => l.startsWith(origin) && hint.re.test(new URL(l).pathname) && !picked.some((p) => p.href === l));
      if (href) picked.push({ href, label: hint.label });
      if (picked.length >= 2) break;
    }
    for (const p of picked) {
      try {
        await within(
          (async () => {
            await open(page, p.href);
            await settle(page);
            const copy = await readCopy(page);
            const shots = (await captureMarketing(page, dir, `${p.label}-`, p.label)).slice(0, 3);
            manifest.pages.push({ url: p.href, label: p.label, copy });
            manifest.shots.push(...shots);
          })(),
          PAGE_MS,
          p.label,
        );
      } catch {
        /* a page that won't load, or takes too long, is skipped */
      }
    }

    // Phone-sized first screen, for vertical videos (skipped if the site won't render it in time).
    await within(
      (async () => {
        const phone = await guard(await browser.newPage());
        await phone.setUserAgent(UA.replace('Macintosh; Intel Mac OS X 10_15_7', 'iPhone; CPU iPhone OS 18_0 like Mac OS X'));
        await phone.setViewport(MOBILE);
        await open(phone, manifest.finalUrl);
        await settle(phone);
        await hideFloating(phone, true);
        manifest.mobileShot = { id: 'mobile-hero', file: await shoot(phone, dir, 'mobile-hero', null), width: MOBILE.width, height: MOBILE.height, kind: 'mobile' };
        await phone.close();
      })(),
      PAGE_MS,
      'the phone view',
    ).catch(() => {});

    if (login) {
      onStep('Signing in to your product');
      const app = await guard(await browser.newPage());
      await app.setUserAgent(UA);
      await app.setViewport(DESKTOP);
      try {
        await signIn(app, login, manifest.finalUrl);
        manifest.login.ok = true;
        onStep('Capturing your product');
        await wait(1500);
        manifest.appShots.push(await captureAppScreen(app, dir, 'app-1', login.email));
        const inApp = await app.evaluate((risky) => {
          const re = new RegExp(risky, 'i');
          const seen = new Set();
          return [...document.querySelectorAll('nav a, aside a, [role=navigation] a, header a')]
            .filter((a) => a.href.startsWith(location.origin) && a.href !== location.href && !re.test(a.innerText + a.href))
            .map((a) => ({ href: a.href.split('#')[0], text: a.innerText.trim().slice(0, 40) }))
            .filter((l) => l.text && !seen.has(l.href) && seen.add(l.href));
        }, RISKY_LINK.source);
        for (const [i, link] of inApp.slice(0, MAX_APP_PAGES).entries()) {
          try {
            await open(app, link.href);
            await wait(1200);
            const shot = await captureAppScreen(app, dir, `app-${i + 2}`, login.email);
            shot.page = link.text;
            manifest.appShots.push(shot);
          } catch {
            /* skip */
          }
        }
      } catch (error) {
        manifest.login.error = error.message;
      } finally {
        await app.close();
      }
    }
  } finally {
    await browser.close();
    await proxy?.close();
  }
  // Small previews: what the planner looks at, and what the Studio shows as the brand kit.
  for (const shot of [...manifest.shots, ...manifest.appShots, manifest.mobileShot].filter(Boolean)) {
    shot.thumb = `thumb-${shot.id}.jpg`;
    await run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, shot.file), '-vf', `scale=${shot.kind === 'mobile' ? 360 : 1000}:-2`, '-q:v', '4', path.join(dir, shot.thumb)]).catch(() => {
      shot.thumb = shot.file;
    });
  }
  await fs.writeFile(path.join(dir, 'capture.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Read a site (see readSite), giving up after SITE_MS rather than hanging on a site that never settles. */
const captureSite = (args) => within(readSite(args), SITE_MS, 'your site');

module.exports = { captureSite };
