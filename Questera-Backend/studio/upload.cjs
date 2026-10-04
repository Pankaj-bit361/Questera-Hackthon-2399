// Screenshots the user uploads in the guided flow (for screens Studio can't film itself). The type comes from the
// file's own bytes, never the browser's word for it; only PNG, JPEG and WebP of a sensible size are kept.

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_UPLOADS = 8;

/** { type, ext, width, height } of a PNG, JPEG or WebP image, or null. */
function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) return null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'image/png', ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length; ) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // Start-of-frame markers carry the size (C0-CF, except C4, C8 and CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: 'image/jpeg', ext: 'jpg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { type: 'image/webp', ext: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { type: 'image/webp', ext: 'webp', width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { type: 'image/webp', ext: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** Checks an upload; returns its image info or throws a message the user can act on. */
function checkUpload(buf, count) {
  const bad = (message) => Object.assign(new Error(message), { status: 400 });
  if (count >= MAX_UPLOADS) throw bad(`You can add up to ${MAX_UPLOADS} screenshots.`);
  if (!buf?.length) throw bad('Choose a screenshot to upload.');
  if (buf.length > MAX_BYTES) throw bad('That image is over 8 MB. Use a smaller screenshot.');
  const info = imageInfo(buf);
  if (!info) throw bad('Upload a PNG, JPEG or WebP screenshot.');
  if (info.width < 480 || info.height < 300) throw bad('That image is too small to show well. Use a screenshot at least 480 px wide.');
  if (info.width > 6000 || info.height > 8000) throw bad('That image is too large. Use a screenshot under 6000 px wide.');
  return info;
}

module.exports = { imageInfo, checkUpload, MAX_BYTES, MAX_UPLOADS };
