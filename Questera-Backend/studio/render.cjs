// Renders a Studio plan to MP4 (and stills for checks and thumbnails) with Remotion, then masters the audio.
//
// The captured screens, fonts and logo live in the job's folder; a small file server on a private loopback port hands
// them to the renderer's browser. The Remotion bundle is built once per process, or read from STUDIO_BUNDLE_DIR (the
// worker image builds it ahead of time with `node Questera-Backend/studio/render.cjs --bundle <dir>`).

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chromePath, ROOT } = require('./chrome.cjs');

const run = promisify(execFile);
const ENTRY = path.join(ROOT, 'studio/remotion/index.jsx');
const PUBLIC = path.join(ROOT, 'studio/remotion/public');
const TYPES = { '.flac': 'audio/flac', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let bundled = null;
async function serveUrl() {
  const prebuilt = process.env.STUDIO_BUNDLE_DIR;
  if (!bundled && prebuilt && fs.existsSync(path.join(prebuilt, 'index.html'))) bundled = Promise.resolve(prebuilt);
  if (!bundled) {
    const { bundle } = require('@remotion/bundler');
    bundled = bundle({ entryPoint: ENTRY, publicDir: PUBLIC, onProgress: () => {} }).catch((e) => {
      bundled = null;
      throw e;
    });
  }
  return bundled;
}

/** Serves files under `root` (read-only, no directory listing, no path escapes) for the renderer. */
let files = null;
function fileServer(root) {
  if (files) return files;
  files = new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
      const file = path.resolve(root, rel);
      if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    server.unref();
  });
  return files;
}

/** The brand props a render needs, built from a capture manifest. */
function brandFrom(capture, assetBase) {
  return {
    url: capture.finalUrl || capture.url,
    siteName: capture.siteName,
    palette: capture.palette,
    fonts: capture.fonts,
    logo: capture.logo,
    icon: capture.icon,
    buttonRadius: capture.buttonRadius,
    typeStyle: capture.typeStyle,
    shots: [...(capture.appShots || []), ...(capture.shots || [])],
    mobileShot: capture.mobileShot || null,
    assetBase,
  };
}

async function props(jobsRoot, jobId, capture, plan, music) {
  const base = await fileServer(jobsRoot);
  return { plan, brand: brandFrom(capture, `${base}/${jobId}/capture`), music };
}

async function composition(inputProps) {
  const { selectComposition } = require('@remotion/renderer');
  const url = await serveUrl();
  return { url, comp: await selectComposition({ serveUrl: url, id: 'studio', inputProps, browserExecutable: chromePath(), chromeMode: 'headless-shell' }) };
}

/** Two-pass loudness normalisation to -14 LUFS / -1.5 dBTP; video stream is copied untouched. */
async function master(input, output) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', input, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { maxBuffer: 1 << 24 });
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const filter = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-c:v', 'copy', '-af', filter, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', output]);
}

/**
 * Render one video. Returns { file, duration, width, height }.
 * onProgress receives 0..1 for the frame render (mastering takes a few seconds more).
 */
async function renderVideo({ jobsRoot, jobId, capture, plan, outFile, music = true, onProgress = () => {} }) {
  const { renderMedia } = require('@remotion/renderer');
  const inputProps = await props(jobsRoot, jobId, capture, plan, music);
  const { url, comp } = await composition(inputProps);
  const raw = outFile.replace(/\.mp4$/, '.raw.mp4');
  await renderMedia({
    composition: comp,
    serveUrl: url,
    codec: 'h264',
    crf: 18,
    audioBitrate: '320k',
    outputLocation: raw,
    inputProps,
    browserExecutable: chromePath(),
    chromeMode: 'headless-shell',
    concurrency: Math.max(2, Math.min(8, require('node:os').cpus().length - 2)),
    onProgress: ({ progress }) => onProgress(progress),
  });
  await master(raw, outFile);
  await fsp.rm(raw, { force: true });
  return { file: outFile, duration: comp.durationInFrames / comp.fps, width: comp.width, height: comp.height };
}

/**
 * A GIF of a finished video, for places that can't play video (READMEs, docs, some email clients): 12 fps, an adaptive
 * palette, `width` px wide (sized so the file stays around 5-10 MB for a 30 s video). Silent by nature.
 */
async function makeGif(input, output, width) {
  const filter = `fps=12,scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-filter_complex', filter, output]);
  return output;
}

/** Render stills at the given frames (JPEG), e.g. for the visual check and the thumbnail. */
async function renderStills({ jobsRoot, jobId, capture, plan, frames, dir, scale = 0.5 }) {
  const { renderStill } = require('@remotion/renderer');
  const inputProps = await props(jobsRoot, jobId, capture, plan, false);
  const { url, comp } = await composition(inputProps);
  const out = [];
  for (const frame of frames) {
    const file = path.join(dir, `still-${frame}.jpg`);
    await renderStill({ composition: comp, serveUrl: url, frame: Math.min(frame, comp.durationInFrames - 1), output: file, inputProps, imageFormat: 'jpeg', jpegQuality: 82, scale, browserExecutable: chromePath(), chromeMode: 'headless-shell' });
    out.push({ frame, file });
  }
  return out;
}

/**
 * Render one post image (the 'post' composition, studio/remotion/post.jsx): a slide in the captured brand, as PNG.
 * size: square | portrait | landscape.
 */
async function renderPostImage({ jobsRoot, jobId, capture, slide, size = 'square', outFile }) {
  const { renderStill, selectComposition } = require('@remotion/renderer');
  const base = await fileServer(jobsRoot);
  const inputProps = { slide, size, brand: brandFrom(capture, `${base}/${jobId}/capture`) };
  const url = await serveUrl();
  const comp = await selectComposition({ serveUrl: url, id: 'post', inputProps, browserExecutable: chromePath(), chromeMode: 'headless-shell' });
  await renderStill({ composition: comp, serveUrl: url, frame: 0, output: outFile, inputProps, imageFormat: 'png', browserExecutable: chromePath(), chromeMode: 'headless-shell' });
  return { file: outFile, width: comp.width, height: comp.height };
}

module.exports = { renderVideo, renderStills, renderPostImage, brandFrom, makeGif };

if (require.main === module && process.argv[2] === '--bundle') {
  const { bundle } = require('@remotion/bundler');
  bundle({ entryPoint: ENTRY, publicDir: PUBLIC, outDir: path.resolve(process.argv[3]) }).then((dir) => console.log(`Studio bundle: ${dir}`));
}
