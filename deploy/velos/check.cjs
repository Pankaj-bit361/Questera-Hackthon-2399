// Build check for the API bundle: loads every module index.js uses, without starting the server or connecting to
// anything, so a missing dependency or a syntax error fails the build instead of the deploy.
//
//   node deploy/velos/check.cjs            (from the repo root, after npm ci in Questera-Backend)

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', 'Questera-Backend');
// Razorpay's client refuses to load without ids; these placeholders never reach a server.
process.env.RAZORPAY_KEY_ID ||= 'build-check';
process.env.RAZORPAY_KEY_SECRET ||= 'build-check';
process.chdir(root);

// Loaded only when MOTION_PUBLIC_API_URL is set: classic Motion renders with Remotion's bundler, which this bundle
// doesn't install (it runs from deploy/motion instead).
const OPTIONAL = new Set(['./motion/router.cjs']);

const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const modules = [...new Set([...source.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)].map((m) => m[1]))].filter((m) => !OPTIONAL.has(m));
let failed = 0;
for (const name of modules) {
  try {
    require(path.join(root, name));
  } catch (error) {
    failed++;
    console.error(`✗ ${name}: ${error.message.split('\n')[0]}`);
  }
}
console.log(`${modules.length - failed}/${modules.length} API modules load`);
process.exit(failed ? 1 : 0);
