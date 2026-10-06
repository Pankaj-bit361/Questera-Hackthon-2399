const TwitterController = require('./Twitter');

const API_BASE = 'https://api.x.com/2';
const MEDIA_UPLOAD_URL = `${API_BASE}/media/upload`;

// Standard access. Premium accounts get 25,000, but assuming that would
// silently produce posts X rejects for everyone else.
const MAX_TWEET_LENGTH = 280;

// X allows at most 4 images on a single post.
const MAX_IMAGES = 4;

// Docs cap an APPEND chunk at 5MB; 4MB leaves headroom for the multipart frame.
const CHUNK_SIZE = 4 * 1024 * 1024;

// Video processing poll budget: 60 x 5s = 5 minutes.
const MEDIA_POLL_ATTEMPTS = 60;
const MEDIA_POLL_INTERVAL_MS = 5000;

const NON_RETRYABLE_CODES = [
  'RECONNECT_REQUIRED',
  'unauthorized',
  'forbidden',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publishes to X (Twitter) via API v2.
 *
 * Same `{ body }` -> `{ status, json }` convention as the Instagram and
 * LinkedIn publishers so SchedulerController can call it identically.
 *
 * Two things differ from the other platforms:
 *  - Media goes up in chunks (INIT/APPEND/FINALIZE), and video then needs
 *    STATUS polling before it can be attached to a post.
 *  - Threads are a first-class format: each part is a separate post chained
 *    through `reply.in_reply_to_tweet_id`.
 */
class TwitterPublisher {
  constructor(twitterController) {
    this.twitter = twitterController || new TwitterController();
  }

  // ---------------------------------------------------------------- helpers

  buildError(context, res, data) {
    // X returns either {title, detail, status} or {errors: [...]}
    const first = Array.isArray(data?.errors) ? data.errors[0] : null;
    const detail = data?.detail || first?.message || first?.detail || data?.title || JSON.stringify(data || {}).slice(0, 300);
    const code = data?.title || first?.code || `HTTP_${res?.status}`;

    const err = new Error(`${context}: ${detail} (${code})`);
    err.code = code;
    err.httpStatus = res?.status;
    // 429 is a rate limit - worth retrying later. 4xx auth/validation is not.
    err.nonRetryable =
      NON_RETRYABLE_CODES.includes(code) ||
      res?.status === 401 ||
      res?.status === 403 ||
      (res?.status >= 400 && res?.status < 500 && res?.status !== 429);
    return err;
  }

  async authorize(userId, accountId) {
    if (!userId) {
      const err = new Error('userId is required');
      err.nonRetryable = true;
      throw err;
    }
    const account = await this.twitter.resolveAccount(userId, accountId);
    return this.twitter.ensureFreshToken(account);
  }

  async downloadMedia(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`Failed to download media (${res.status}) from ${url}`);
      err.nonRetryable = res.status === 404;
      throw err;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType };
  }

  /**
   * X counts characters, not bytes, but a naive slice can split a surrogate
   * pair or grapheme cluster and produce mojibake. Split on code points.
   */
  truncate(text, limit = MAX_TWEET_LENGTH) {
    const chars = [...String(text || '')];
    if (chars.length <= limit) return chars.join('');
    return chars.slice(0, limit - 1).join('') + '…';
  }

  /**
   * Turn an over-length body into a thread, breaking on paragraph then
   * sentence then word boundaries rather than mid-word.
   */
  splitIntoThread(text, limit = MAX_TWEET_LENGTH) {
    const clean = String(text || '').trim();
    if (!clean) return [];
    if ([...clean].length <= limit) return [clean];

    // Numbering ("1/7 ") costs characters, so budget for it up front.
    const budget = limit - 6;
    const parts = [];
    let current = '';

    const flush = () => {
      if (current.trim()) parts.push(current.trim());
      current = '';
    };

    // Prefer paragraph breaks, then sentences, then words.
    const blocks = clean.split(/\n\n+/);
    for (const block of blocks) {
      const sentences = block.match(/[^.!?]+[.!?]*\s*/g) || [block];

      for (const sentence of sentences) {
        if ([...sentence].length > budget) {
          // A single sentence longer than one post - fall back to words.
          for (const word of sentence.split(/\s+/)) {
            if ([...`${current} ${word}`].length > budget) flush();
            current = current ? `${current} ${word}` : word;
          }
          continue;
        }
        if ([...`${current} ${sentence}`].length > budget) flush();
        current = current ? `${current} ${sentence}`.replace(/\s+/g, ' ') : sentence.trim();
      }
      flush();
    }
    flush();

    const total = parts.length;
    if (total <= 1) return parts;
    return parts.map((part, i) => `${i + 1}/${total} ${part}`);
  }

  // ------------------------------------------------------------ media upload

  mediaCategory(contentType) {
    if (contentType.includes('gif')) return 'tweet_gif';
    if (contentType.startsWith('video/')) return 'tweet_video';
    return 'tweet_image';
  }

  /**
   * Chunked upload: INIT -> APPEND per chunk -> FINALIZE -> (STATUS if
   * processing). Used for images as well as video - v2 documents no separate
   * simple-upload endpoint.
   */
  async uploadMedia(account, url) {
    const { buffer, contentType } = await this.downloadMedia(url);
    const category = this.mediaCategory(contentType);
    const auth = { Authorization: `Bearer ${account.accessToken}` };

    console.log(`📎 [TWITTER] Uploading ${category} (${(buffer.length / 1024).toFixed(0)}KB)`);

    // --- INIT ---
    const initParams = new URLSearchParams({
      command: 'INIT',
      media_type: contentType,
      total_bytes: String(buffer.length),
      media_category: category,
    });

    const initRes = await fetch(`${MEDIA_UPLOAD_URL}?${initParams}`, { method: 'POST', headers: auth });
    const initData = await initRes.json().catch(() => ({}));

    // v2 returns { data: { id } }; tolerate the legacy media_id_string too.
    const mediaId = initData?.data?.id || initData?.media_id_string;
    if (!initRes.ok || !mediaId) {
      throw this.buildError('Media INIT failed', initRes, initData);
    }

    // --- APPEND ---
    const chunks = Math.ceil(buffer.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      const chunk = buffer.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, buffer.length));

      const form = new FormData();
      form.append('command', 'APPEND');
      form.append('media_id', mediaId);
      form.append('segment_index', String(i));
      form.append('media', new Blob([chunk], { type: 'application/octet-stream' }));

      const appendRes = await fetch(MEDIA_UPLOAD_URL, { method: 'POST', headers: auth, body: form });
      if (!appendRes.ok) {
        const data = await appendRes.json().catch(() => ({}));
        throw this.buildError(`Media APPEND ${i + 1}/${chunks} failed`, appendRes, data);
      }
      console.log(`📤 [TWITTER] Chunk ${i + 1}/${chunks} uploaded (${chunk.length} bytes)`);
    }

    // --- FINALIZE ---
    const finalizeParams = new URLSearchParams({ command: 'FINALIZE', media_id: mediaId });
    const finalizeRes = await fetch(`${MEDIA_UPLOAD_URL}?${finalizeParams}`, { method: 'POST', headers: auth });
    const finalizeData = await finalizeRes.json().catch(() => ({}));

    if (!finalizeRes.ok) {
      throw this.buildError('Media FINALIZE failed', finalizeRes, finalizeData);
    }

    // Video and GIF need server-side transcoding before they can be attached.
    const processing = finalizeData?.data?.processing_info || finalizeData?.processing_info;
    if (processing) {
      await this.waitForMediaReady(account, mediaId, processing);
    }

    console.log(`✅ [TWITTER] Media ready: ${mediaId}`);
    return mediaId;
  }

  async waitForMediaReady(account, mediaId, initialProcessing) {
    let waitSecs = initialProcessing?.check_after_secs ?? 1;

    for (let attempt = 1; attempt <= MEDIA_POLL_ATTEMPTS; attempt++) {
      await sleep(Math.max(waitSecs, 1) * 1000);

      const params = new URLSearchParams({ command: 'STATUS', media_id: mediaId });
      const res = await fetch(`${MEDIA_UPLOAD_URL}?${params}`, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.warn(`⚠️ [TWITTER] Media STATUS check ${attempt} failed (${res.status})`);
        waitSecs = MEDIA_POLL_INTERVAL_MS / 1000;
        continue;
      }

      const info = data?.data?.processing_info || data?.processing_info;
      if (!info || info.state === 'succeeded') return true;

      if (info.state === 'failed') {
        const err = new Error(`X media processing failed: ${info.error?.message || 'unknown reason'}`);
        err.nonRetryable = true;
        throw err;
      }

      waitSecs = info.check_after_secs ?? MEDIA_POLL_INTERVAL_MS / 1000;
      console.log(`⏳ [TWITTER] Media ${info.state} (${attempt}/${MEDIA_POLL_ATTEMPTS})`);
    }

    throw new Error('X media processing timed out');
  }

  // ----------------------------------------------------------- post creation

  /**
   * POST /2/tweets. Returns the created post id in the body (unlike LinkedIn,
   * which uses a response header).
   */
  async createTweet(account, { text, mediaIds, replyToId }) {
    const payload = { text };
    if (mediaIds?.length) payload.media = { media_ids: mediaIds };
    if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };

    const res = await fetch(`${API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.data?.id) {
      throw this.buildError('Post creation failed', res, data);
    }

    return data.data.id;
  }

  permalink(account, tweetId) {
    const handle = account.platformUsername || 'i';
    return `https://x.com/${handle}/status/${tweetId}`;
  }

  async run(label, fn) {
    try {
      const { tweetId, permalink, threadIds } = await fn();
      return {
        status: 200,
        json: { success: true, mediaId: tweetId, tweetId, permalink, threadIds },
      };
    } catch (error) {
      console.error(`❌ [TWITTER] ${label} failed:`, error.message);
      return {
        status: error.httpStatus || 500,
        json: {
          success: false,
          error: error.message,
          code: error.code,
          nonRetryable: Boolean(error.nonRetryable),
        },
      };
    }
  }

  // -------------------------------------------------------- publish methods

  async publishText(req) {
    const { userId, caption, accountId } = req.body;

    return this.run('publishText', async () => {
      const text = String(caption || '').trim();
      if (!text) {
        const err = new Error('A post needs text');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);

      // Over-length copy becomes a thread rather than being silently cut.
      const parts = this.splitIntoThread(text);
      if (parts.length > 1) {
        console.log(`🧵 [TWITTER] Caption exceeds ${MAX_TWEET_LENGTH} chars - posting as a ${parts.length}-part thread`);
        return this.postThread(account, parts, []);
      }

      const tweetId = await this.createTweet(account, { text: parts[0] });
      console.log(`✅ [TWITTER] Published ${tweetId}`);
      return { tweetId, permalink: this.permalink(account, tweetId) };
    });
  }

  async publishImage(req) {
    const { userId, imageUrl, caption, accountId } = req.body;

    return this.run('publishImage', async () => {
      if (!imageUrl) {
        const err = new Error('imageUrl is required for an X image post');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);
      const mediaId = await this.uploadMedia(account, imageUrl);

      const tweetId = await this.createTweet(account, {
        text: this.truncate(caption),
        mediaIds: [mediaId],
      });

      console.log(`✅ [TWITTER] Published ${tweetId} with image`);
      return { tweetId, permalink: this.permalink(account, tweetId) };
    });
  }

  async publishMultiImage(req) {
    const { userId, imageUrls, caption, accountId } = req.body;

    return this.run('publishMultiImage', async () => {
      let urls = (imageUrls || []).filter(Boolean);
      if (urls.length < 2) {
        const err = new Error('A multi-image X post needs at least 2 images');
        err.nonRetryable = true;
        throw err;
      }
      if (urls.length > MAX_IMAGES) {
        console.warn(`⚠️ [TWITTER] Trimming ${urls.length} images to the ${MAX_IMAGES} X allows`);
        urls = urls.slice(0, MAX_IMAGES);
      }

      const account = await this.authorize(userId, accountId);

      const mediaIds = [];
      for (const url of urls) {
        mediaIds.push(await this.uploadMedia(account, url));
      }

      const tweetId = await this.createTweet(account, {
        text: this.truncate(caption),
        mediaIds,
      });

      console.log(`✅ [TWITTER] Published ${tweetId} with ${mediaIds.length} images`);
      return { tweetId, permalink: this.permalink(account, tweetId) };
    });
  }

  async publishVideo(req) {
    const { userId, videoUrl, caption, accountId } = req.body;

    return this.run('publishVideo', async () => {
      if (!videoUrl) {
        const err = new Error('videoUrl is required for an X video post');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);
      const mediaId = await this.uploadMedia(account, videoUrl);

      const tweetId = await this.createTweet(account, {
        text: this.truncate(caption),
        mediaIds: [mediaId],
      });

      console.log(`✅ [TWITTER] Published ${tweetId} with video`);
      return { tweetId, permalink: this.permalink(account, tweetId) };
    });
  }

  /**
   * Post a thread. Media, if any, is attached to the opening post.
   */
  async publishThread(req) {
    const { userId, threadParts, caption, imageUrl, imageUrls, accountId } = req.body;

    return this.run('publishThread', async () => {
      const parts = (threadParts?.length ? threadParts : this.splitIntoThread(caption)).filter(Boolean);
      if (parts.length === 0) {
        const err = new Error('A thread needs at least one part');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);

      const urls = (imageUrls?.length ? imageUrls : [imageUrl]).filter(Boolean).slice(0, MAX_IMAGES);
      const mediaIds = [];
      for (const url of urls) {
        mediaIds.push(await this.uploadMedia(account, url));
      }

      return this.postThread(account, parts, mediaIds);
    });
  }

  /**
   * Chain posts as replies. If a middle post fails the earlier ones are
   * already live and cannot be rolled back, so the error carries how far it
   * got - the caller records a partial publish rather than retrying the whole
   * thread and double-posting.
   */
  async postThread(account, parts, mediaIds) {
    const threadIds = [];
    let replyToId = null;

    for (let i = 0; i < parts.length; i++) {
      try {
        const tweetId = await this.createTweet(account, {
          text: this.truncate(parts[i]),
          // Media rides on the opening post only.
          mediaIds: i === 0 && mediaIds?.length ? mediaIds : undefined,
          replyToId,
        });
        threadIds.push(tweetId);
        replyToId = tweetId;
      } catch (error) {
        if (threadIds.length > 0) {
          error.message = `Thread partially published (${threadIds.length}/${parts.length} posted): ${error.message}`;
          // Retrying would duplicate what already went out.
          error.nonRetryable = true;
          error.threadIds = threadIds;
        }
        throw error;
      }
    }

    console.log(`✅ [TWITTER] Published ${threadIds.length}-part thread`);
    return {
      tweetId: threadIds[0],
      threadIds,
      permalink: this.permalink(account, threadIds[0]),
    };
  }
}

module.exports = TwitterPublisher;
