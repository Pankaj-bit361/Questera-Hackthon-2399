// Where Studio keeps its jobs.
//
//   DiskStore — a local folder: development, and the scratch space inside a worker.
//   S3Store   — a private S3 bucket: production, where each job runs in its own Fargate task.
//
// Layout (folder or bucket):
//   jobs/<id>/job.json            the record the API returns and the UI polls
//   jobs/<id>/plans.json          the scripts (never served to the browser)
//   jobs/<id>/capture/…           screenshots, fonts, logo, capture.json
//   jobs/<id>/videos/…            finished MP4s and thumbnails
//   users/<user>/<createdAt>_<id> empty index entries, so a user's jobs list without scanning every job (S3 only)
//   secrets/<id>                  a product login, sealed, read and deleted by the worker (S3 only)

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ID = /^[a-f0-9-]{36}$/;
const TYPES = { '.mp4': 'video/mp4', '.gif': 'image/gif', '.flac': 'audio/flac', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json' };

function notFound(message = 'Unknown job.') {
  return Object.assign(new Error(message), { status: 404 });
}

function checkId(id) {
  if (!ID.test(String(id))) throw notFound();
  return id;
}

/** A file inside a job that the browser may load: no escapes, and never the job record or the scripts. */
function safeRel(rel) {
  const clean = path.posix.normalize(String(rel || '')).replace(/^\/+/, '');
  if (!clean || clean === '.' || clean.startsWith('..') || clean.includes('\0') || /(^|\/)(job|plans)\.json$/.test(clean)) throw notFound('Not found.');
  return clean;
}

/** User ids become one safe path segment. */
const userKey = (userId) => (/^[A-Za-z0-9_-]{1,64}$/.test(userId) ? userId : crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 32));

class DiskStore {
  constructor(root) {
    this.root = root;
    this.kind = 'disk';
  }

  dir(id) {
    return path.join(this.root, checkId(id));
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true });
  }

  async read(id) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir(id), 'job.json'), 'utf8'));
    } catch {
      throw notFound();
    }
  }

  async write(job) {
    const file = path.join(this.dir(job.id), 'job.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(job, null, 2));
    await fs.rename(tmp, file);
  }

  async create(job) {
    await fs.mkdir(path.join(this.dir(job.id), 'videos'), { recursive: true });
    await this.write(job);
  }

  async all() {
    await this.init();
    const out = [];
    for (const id of await fs.readdir(this.root)) {
      if (!ID.test(id)) continue;
      try {
        out.push(await this.read(id));
      } catch {
        /* not a job folder */
      }
    }
    return out;
  }

  async list(userId, limit) {
    return (await this.all())
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async remove(job) {
    await fs.rm(this.dir(job.id), { recursive: true, force: true });
  }

  /** Give a new job the site capture of an earlier one, so it starts at the script. */
  async copyCapture(fromId, toId) {
    await fs.cp(path.join(this.dir(fromId), 'capture'), path.join(this.dir(toId), 'capture'), { recursive: true });
  }

  async readCapture(id) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir(id), 'capture', 'capture.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  /** A job file's bytes, or null (the API reads captured screens to plan a storyboard). */
  async readFile(id, rel) {
    return fs.readFile(path.join(this.dir(id), rel)).catch(() => null);
  }

  async removeFile(id, rel) {
    await fs.rm(path.join(this.dir(id), rel), { force: true });
  }

  async writeFile(id, rel, body) {
    const file = path.join(this.dir(id), rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  /** Absolute path of a job file, for sendFile. */
  file(id, rel) {
    const dir = this.dir(id);
    const full = path.resolve(dir, safeRel(rel));
    if (!full.startsWith(dir + path.sep)) throw notFound('Not found.');
    return full;
  }
}

class S3Store {
  constructor({ bucket, region, endpoint, credentials }) {
    if (!bucket) throw new Error('Studio needs STUDIO_BUCKET for S3 storage.');
    const { S3Client } = require('@aws-sdk/client-s3');
    this.kind = 's3';
    this.bucket = bucket;
    this.s3 = new S3Client({ region, endpoint, forcePathStyle: Boolean(endpoint), credentials });
    this.cmd = require('@aws-sdk/client-s3');
  }

  async init() {}

  key(id, rel) {
    return `jobs/${checkId(id)}/${rel}`;
  }

  async getText(key) {
    try {
      const res = await this.s3.send(new this.cmd.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return await res.Body.transformToString();
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async put(key, body, contentType) {
    const Body = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    await this.s3.send(new this.cmd.PutObjectCommand({ Bucket: this.bucket, Key: key, Body, ContentLength: Body.length, ContentType: contentType }));
  }

  async del(keys) {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      if (chunk.length) await this.s3.send(new this.cmd.DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
    }
  }

  async keys(prefix) {
    const out = [];
    let ContinuationToken;
    do {
      const res = await this.s3.send(new this.cmd.ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }));
      for (const o of res.Contents || []) out.push({ key: o.Key, size: o.Size });
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
  }

  /** Copy an object to a local file. */
  async download(key, file) {
    const res = await this.s3.send(new this.cmd.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(await res.Body.transformToByteArray()));
  }

  /** Copy a local file to an object. */
  async upload(key, file) {
    await this.put(key, await fs.readFile(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  }

  async read(id) {
    const text = await this.getText(this.key(id, 'job.json'));
    if (!text) throw notFound();
    return JSON.parse(text);
  }

  async write(job) {
    await this.put(this.key(job.id, 'job.json'), JSON.stringify(job, null, 2), 'application/json');
  }

  async create(job) {
    await this.write(job);
    await this.put(`users/${userKey(job.userId)}/${job.createdAt}_${job.id}`, '', 'text/plain');
  }

  async list(userId, limit) {
    const index = (await this.keys(`users/${userKey(userId)}/`)).map((o) => o.key).sort().reverse().slice(0, limit);
    const jobs = await Promise.all(index.map((k) => this.read(k.slice(k.lastIndexOf('_') + 1)).catch(() => null)));
    return jobs.filter((j) => j && j.userId === userId);
  }

  async remove(job) {
    const keys = (await this.keys(`jobs/${checkId(job.id)}/`)).map((o) => o.key);
    keys.push(`users/${userKey(job.userId)}/${job.createdAt}_${job.id}`, `secrets/${job.id}`);
    await this.del(keys);
  }

  async copyCapture(fromId, toId) {
    const from = `jobs/${checkId(fromId)}/capture/`;
    const objects = await this.keys(from);
    for (let i = 0; i < objects.length; i += 8) {
      await Promise.all(
        objects.slice(i, i + 8).map((o) =>
          this.s3.send(new this.cmd.CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${encodeURI(o.key)}`, Key: `jobs/${checkId(toId)}/capture/${o.key.slice(from.length)}` })),
        ),
      );
    }
  }

  async readCapture(id) {
    const text = await this.getText(this.key(id, 'capture/capture.json'));
    return text ? JSON.parse(text) : null;
  }

  async readFile(id, rel) {
    try {
      const res = await this.s3.send(new this.cmd.GetObjectCommand({ Bucket: this.bucket, Key: this.key(id, rel) }));
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async removeFile(id, rel) {
    await this.del([this.key(id, rel)]);
  }

  async writeFile(id, rel, body) {
    await this.put(this.key(id, rel), body, TYPES[path.extname(rel).toLowerCase()] || 'application/octet-stream');
  }

  /** A short-lived link to a job file. `download` names the file the browser saves. */
  async signedUrl(id, rel, { download } = {}) {
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const params = { Bucket: this.bucket, Key: this.key(id, safeRel(rel)) };
    if (download) params.ResponseContentDisposition = `attachment; filename="${String(download).replace(/[^\w.-]+/g, '-')}"`;
    return getSignedUrl(this.s3, new this.cmd.GetObjectCommand(params), { expiresIn: 3600 });
  }

  async putSecret(id, sealed) {
    await this.put(`secrets/${checkId(id)}`, sealed, 'application/octet-stream');
  }

  /** Read the sealed login once and delete it. */
  async takeSecret(id) {
    const key = `secrets/${checkId(id)}`;
    const text = await this.getText(key);
    if (text) await this.del([key]);
    return text;
  }
}

/**
 * Logins on their way to a worker: AES-256-GCM with a fresh key per job. The sealed blob goes to the bucket and the key
 * goes to the worker's start request, so neither alone reveals the password. The worker deletes the blob on read.
 */
function seal(value) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { key: key.toString('base64'), sealed: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64') };
}

function unseal(sealed, key) {
  const raw = Buffer.from(sealed, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
}

module.exports = { DiskStore, S3Store, seal, unseal, safeRel, checkId, userKey };
