// The Chrome both the site capture and Remotion's renderer use: STUDIO_CHROME_PATH if set, else the Chrome Headless
// Shell that Remotion downloads into node_modules/.remotion, else a system Chrome.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function chromePath() {
  if (process.env.STUDIO_CHROME_PATH) return process.env.STUDIO_CHROME_PATH;
  const base = path.join(ROOT, 'node_modules/.remotion/chrome-headless-shell');
  if (fs.existsSync(base)) {
    for (const platform of fs.readdirSync(base)) {
      const dir = path.join(base, platform);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const sub of fs.readdirSync(dir)) {
        const bin = path.join(dir, sub, 'chrome-headless-shell');
        if (fs.existsSync(bin)) return bin;
      }
    }
  }
  for (const bin of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error('No Chrome found. Run a Remotion render once (it downloads Chrome Headless Shell) or set STUDIO_CHROME_PATH.');
}

module.exports = { chromePath, ROOT };
