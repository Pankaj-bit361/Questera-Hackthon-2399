const LinkedInController = require('./LinkedIn');

const API_BASE = 'https://api.linkedin.com';

// LinkedIn caps post commentary at 3000 characters.
const MAX_COMMENTARY = 3000;

// Video constraints from the Videos API docs.
const VIDEO_MIN_BYTES = 75 * 1024;
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;

// A MultiImage post takes 2-20 images.
const MULTI_IMAGE_MIN = 2;
const MULTI_IMAGE_MAX = 20;

// Video processing poll budget: 60 attempts x 5s = 5 minutes.
const VIDEO_POLL_ATTEMPTS = 60;
const VIDEO_POLL_INTERVAL_MS = 5000;

// LinkedIn error codes that will never succeed on retry - the user has to act.
const NON_RETRYABLE_CODES = [
  'ACCESS_DENIED',
  'REVOKED_ACCESS_TOKEN',
  'EMPTY_ACCESS_TOKEN',
  'RECONNECT_REQUIRED',
  'INVALID_URN_TYPE',
  'INVALID_URN_ID',
  'FIELD_LENGTH_TOO_LONG',
  'MEDIA_ASSET_PROCESSING_FAILED',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publishes to LinkedIn via the versioned REST Posts / Images / Videos APIs.
 *
 * Deliberately mirrors InstagramController's calling convention - each publish
 * method takes a `{ body: {...} }` object and returns `{ status, json }` - so
 * SchedulerController.publishPost can call it the same way it calls Instagram.
 *
 * The structural difference from Instagram: LinkedIn will not fetch a public
 * media URL. Every asset is uploaded as raw bytes to a LinkedIn-issued upload
 * URL first, and the resulting URN is referenced in the post.
 */
class LinkedInPublisher {
  constructor(linkedinController) {
    this.linkedin = linkedinController || new LinkedInController();
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Turn a LinkedIn error response into an Error carrying retry semantics,
   * so SchedulerController can decide between retrying and failing outright.
   */
  buildError(context, res, data) {
    const code = data?.code || data?.serviceErrorCode || `HTTP_${res?.status}`;
    const message = data?.message || JSON.stringify(data || {}).slice(0, 300);
    const err = new Error(`${context}: ${message} (${code})`);
    err.code = code;
    err.httpStatus = res?.status;
    err.nonRetryable =
      NON_RETRYABLE_CODES.includes(code) ||
      res?.status === 401 ||
      res?.status === 403 ||
      res?.status === 400;
    return err;
  }

  /**
   * Resolve the account and guarantee a usable access token.
   */
  async authorize(userId, accountId) {
    if (!userId) {
      const err = new Error('userId is required');
      err.nonRetryable = true;
      throw err;
    }
    const account = await this.linkedin.resolveAccount(userId, accountId);
    return this.linkedin.ensureFreshToken(account);
  }

  /**
   * Pull an S3 (or any public) asset into memory so we can push the bytes to
   * LinkedIn. Buckets written by sharedHelpers.uploadBufferToS3 are public.
   */
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

  buildCommentary(caption) {
    const text = String(caption || '').trim();
    if (text.length <= MAX_COMMENTARY) return text;
    console.warn(`⚠️ [LINKEDIN] Commentary truncated from ${text.length} to ${MAX_COMMENTARY} chars`);
    return `${text.slice(0, MAX_COMMENTARY - 1)}…`;
  }

  // ------------------------------------------------------------ asset upload

  /**
   * Images API: initializeUpload -> PUT bytes -> image URN.
   */
  async uploadImage(account, imageUrl) {
    console.log(`🖼️ [LINKEDIN] Uploading image: ${String(imageUrl).slice(0, 80)}`);

    const initRes = await fetch(`${API_BASE}/rest/images?action=initializeUpload`, {
      method: 'POST',
      headers: this.linkedin.restHeaders(account.accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ initializeUploadRequest: { owner: account.authorUrn } }),
    });

    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok || !initData?.value?.uploadUrl) {
      throw this.buildError('Image initializeUpload failed', initRes, initData);
    }

    const { uploadUrl, image: imageUrn } = initData.value;
    const { buffer, contentType } = await this.downloadMedia(imageUrl);

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': contentType,
      },
      body: buffer,
    });

    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => '');
      throw this.buildError('Image byte upload failed', putRes, { message: detail.slice(0, 200) });
    }

    console.log(`✅ [LINKEDIN] Image uploaded: ${imageUrn}`);
    return imageUrn;
  }

  /**
   * Videos API: initializeUpload -> PUT each 4MB part (collecting ETags in
   * order) -> finalizeUpload -> poll until AVAILABLE.
   *
   * Part order matters twice: the byte ranges must be uploaded as given, and
   * `uploadedPartIds` must list the ETags in that same order.
   */
  async uploadVideo(account, videoUrl) {
    console.log(`🎬 [LINKEDIN] Uploading video: ${String(videoUrl).slice(0, 80)}`);

    const { buffer } = await this.downloadMedia(videoUrl);
    const fileSizeBytes = buffer.length;

    if (fileSizeBytes < VIDEO_MIN_BYTES || fileSizeBytes > VIDEO_MAX_BYTES) {
      const err = new Error(
        `Video must be between 75KB and 500MB for LinkedIn (got ${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB)`
      );
      err.nonRetryable = true;
      throw err;
    }

    const initRes = await fetch(`${API_BASE}/rest/videos?action=initializeUpload`, {
      method: 'POST',
      headers: this.linkedin.restHeaders(account.accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: account.authorUrn,
          fileSizeBytes,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    });

    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok || !initData?.value?.uploadInstructions?.length) {
      throw this.buildError('Video initializeUpload failed', initRes, initData);
    }

    const { video: videoUrn, uploadInstructions, uploadToken } = initData.value;
    console.log(`📦 [LINKEDIN] Video ${videoUrn} split into ${uploadInstructions.length} part(s)`);

    const uploadedPartIds = [];
    for (let i = 0; i < uploadInstructions.length; i++) {
      const { uploadUrl, firstByte, lastByte } = uploadInstructions[i];
      // lastByte is inclusive; Buffer.subarray end is exclusive.
      const part = buffer.subarray(firstByte, Math.min(lastByte + 1, fileSizeBytes));

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: part,
      });

      if (!putRes.ok) {
        const detail = await putRes.text().catch(() => '');
        throw this.buildError(`Video part ${i + 1} upload failed`, putRes, { message: detail.slice(0, 200) });
      }

      const etag = putRes.headers.get('etag');
      if (!etag) {
        const err = new Error(`Video part ${i + 1} returned no ETag - cannot finalize upload`);
        err.nonRetryable = false;
        throw err;
      }

      // Some CDNs quote the ETag; finalizeUpload wants the raw value.
      uploadedPartIds.push(etag.replace(/^"|"$/g, ''));
      console.log(`📤 [LINKEDIN] Part ${i + 1}/${uploadInstructions.length} uploaded (${part.length} bytes)`);
    }

    const finalizeRes = await fetch(`${API_BASE}/rest/videos?action=finalizeUpload`, {
      method: 'POST',
      headers: this.linkedin.restHeaders(account.accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: uploadToken || '',
          uploadedPartIds,
        },
      }),
    });

    if (!finalizeRes.ok) {
      const data = await finalizeRes.json().catch(() => ({}));
      throw this.buildError('Video finalizeUpload failed', finalizeRes, data);
    }

    await this.waitForVideoReady(account, videoUrn);
    console.log(`✅ [LINKEDIN] Video ready: ${videoUrn}`);
    return videoUrn;
  }

  /**
   * Poll the video until LinkedIn finishes transcoding.
   * WAITING_UPLOAD -> PROCESSING -> AVAILABLE (or PROCESSING_FAILED).
   */
  async waitForVideoReady(account, videoUrn) {
    const url = `${API_BASE}/rest/videos/${encodeURIComponent(videoUrn)}`;

    for (let attempt = 1; attempt <= VIDEO_POLL_ATTEMPTS; attempt++) {
      await sleep(VIDEO_POLL_INTERVAL_MS);

      const res = await fetch(url, { headers: this.linkedin.restHeaders(account.accessToken) });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.warn(`⚠️ [LINKEDIN] Video status check ${attempt} failed (${res.status})`);
        continue;
      }

      if (data.status === 'AVAILABLE') return true;

      if (data.status === 'PROCESSING_FAILED') {
        const err = new Error(`LinkedIn video processing failed: ${data.processingFailureReason || 'unknown reason'}`);
        err.code = 'MEDIA_ASSET_PROCESSING_FAILED';
        err.nonRetryable = true;
        throw err;
      }

      console.log(`⏳ [LINKEDIN] Video ${data.status} (${attempt}/${VIDEO_POLL_ATTEMPTS})`);
    }

    throw new Error('LinkedIn video processing timed out');
  }

  // ----------------------------------------------------------- post creation

  /**
   * POST /rest/posts. The created post URN comes back in the `x-restli-id`
   * response header, not the body.
   */
  async createPost(account, { commentary, content }) {
    const payload = {
      author: account.authorUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    if (content) payload.content = content;

    const res = await fetch(`${API_BASE}/rest/posts`, {
      method: 'POST',
      headers: this.linkedin.restHeaders(account.accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw this.buildError('Post creation failed', res, data);
    }

    const postUrn = res.headers.get('x-restli-id');
    if (!postUrn) {
      throw new Error('LinkedIn accepted the post but returned no x-restli-id header');
    }

    console.log(`✅ [LINKEDIN] Published ${postUrn}`);
    return {
      postUrn,
      permalink: `https://www.linkedin.com/feed/update/${postUrn}/`,
    };
  }

  /**
   * Shared wrapper so every publish method returns the same envelope and maps
   * thrown errors into the `{ status, json }` shape the scheduler expects.
   */
  async run(label, fn) {
    try {
      const { postUrn, permalink } = await fn();
      return {
        status: 200,
        json: { success: true, mediaId: postUrn, permalink, postUrn },
      };
    } catch (error) {
      console.error(`❌ [LINKEDIN] ${label} failed:`, error.message);
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
      const commentary = this.buildCommentary(caption);
      if (!commentary) {
        const err = new Error('A text post needs a caption');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);
      return this.createPost(account, { commentary });
    });
  }

  async publishImage(req) {
    const { userId, imageUrl, caption, altText, accountId } = req.body;

    return this.run('publishImage', async () => {
      if (!imageUrl) {
        const err = new Error('imageUrl is required for a LinkedIn image post');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);
      const imageUrn = await this.uploadImage(account, imageUrl);

      return this.createPost(account, {
        commentary: this.buildCommentary(caption),
        content: { media: { id: imageUrn, altText: altText || '' } },
      });
    });
  }

  /**
   * LinkedIn's organic equivalent of a carousel. Organic carousels proper are
   * ads-only; MultiImage is what a normal feed post uses.
   */
  async publishMultiImage(req) {
    const { userId, imageUrls, caption, accountId } = req.body;

    return this.run('publishMultiImage', async () => {
      const urls = (imageUrls || []).filter(Boolean);

      if (urls.length < MULTI_IMAGE_MIN) {
        const err = new Error(`A LinkedIn multi-image post needs at least ${MULTI_IMAGE_MIN} images`);
        err.nonRetryable = true;
        throw err;
      }
      if (urls.length > MULTI_IMAGE_MAX) {
        console.warn(`⚠️ [LINKEDIN] Trimming ${urls.length} images to the ${MULTI_IMAGE_MAX} LinkedIn allows`);
        urls.length = MULTI_IMAGE_MAX;
      }

      const account = await this.authorize(userId, accountId);

      // Sequential: uploads share one token and LinkedIn rate-limits bursts.
      const images = [];
      for (const url of urls) {
        images.push({ id: await this.uploadImage(account, url), altText: '' });
      }

      return this.createPost(account, {
        commentary: this.buildCommentary(caption),
        content: { multiImage: { images } },
      });
    });
  }

  async publishVideo(req) {
    const { userId, videoUrl, caption, title, accountId } = req.body;

    return this.run('publishVideo', async () => {
      if (!videoUrl) {
        const err = new Error('videoUrl is required for a LinkedIn video post');
        err.nonRetryable = true;
        throw err;
      }

      const account = await this.authorize(userId, accountId);
      const videoUrn = await this.uploadVideo(account, videoUrl);

      return this.createPost(account, {
        commentary: this.buildCommentary(caption),
        content: { media: { id: videoUrn, title: title || 'Video' } },
      });
    });
  }
}

module.exports = LinkedInPublisher;
