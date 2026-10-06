// Local Studio API for development: http://127.0.0.1:4702/api/studio
//
// Uses .studio-data/ for jobs and a local signing key, and hands the dev frontend a local session (no production
// database, no real accounts). Production mounts createStudioRouter in Questera-Backend/index.js with the real JWT_SECRET.
//
//   npm run studio:dev        (and `npm run dev` for the frontend; Vite proxies /api/studio here)
//   STUDIO_RUNNER=process … npm run studio:dev   runs every job as a worker process against S3 (see launch.cjs)

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const crypto = require('node:crypto');
const fs = require('node:fs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createStudioRouter } = require('./router.cjs');
const { studioFromEnv } = require('./launch.cjs');

const ROOT = path.resolve(__dirname, '../../.studio-data');
const PORT = Number(process.env.STUDIO_PORT || 4702);

fs.mkdirSync(ROOT, { recursive: true });
const keyFile = path.join(ROOT, 'local-session-key');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
const secret = fs.readFileSync(keyFile, 'utf8');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return res.status(403).json({ error: 'The local Studio API only accepts the local frontend.' });
  next();
});
app.post('/api/studio/local-session', (req, res) => {
  if (req.headers['x-studio-local'] !== '1') return res.status(403).json({ error: 'Local session header required.' });
  res.json({ token: jwt.sign({ userId: 'local-studio' }, secret, { expiresIn: '12h' }) });
});
const { router } = createStudioRouter({ ...studioFromEnv(path.join(ROOT, 'jobs')), secret });
app.use('/api/studio', router);
app.listen(PORT, '127.0.0.1', () => console.log(`Studio API: http://127.0.0.1:${PORT}/api/studio (local data in .studio-data/)`));
