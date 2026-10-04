const { GoogleGenAI, GenerateVideosOperation } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const Video = require('../models/video');
const VideoMessage = require('../models/videoMessage');
const MediaJob = require('../models/mediaJob');
const { CREDIT_COSTS, ensureCredits, saveVideoTurn } = require('./sharedHelpers');
const {
    markJob,
    failJob,
    downloadGoogleVideo,
    finishSuccessfulVideo,
} = require('./videoJobRunner');

const VIDEO_CREDIT_COST = CREDIT_COSTS.generate_video;

class VideoController {
    constructor() {
        this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
        this.model = 'veo-3.1-generate-preview';
        this.pollInterval = 10000; // 10 seconds
        this.maxPollAttempts = 60; // 10 minutes max

        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
        this.uploadsDir = path.join(__dirname, '..', 'uploads');
    }

    async checkVideoCredits(userId) {
        await ensureCredits(userId, VIDEO_CREDIT_COST);
    }

    async deductVideoCredit(userId, prompt = '') {
        const { deductCreditsSafe } = require('./sharedHelpers');
        return deductCreditsSafe(userId, VIDEO_CREDIT_COST, null, `Video generation: ${String(prompt || '').slice(0, 50)}`);
    }

    async uploadToS3(buffer, mimeType = 'video/mp4') {
        const { uploadBufferToS3 } = require('./sharedHelpers');
        return uploadBufferToS3(buffer, mimeType, 'videos');
    }

    async waitForCompletion(operation, assistantMsg) {
        let attempts = 0;

        while (!operation.done && attempts < this.maxPollAttempts) {
            await new Promise(resolve => setTimeout(resolve, this.pollInterval));
            attempts++;
            console.log(`⏳ [Video] Polling... Attempt ${attempts}/${this.maxPollAttempts}`);

            operation = await this.ai.operations.getVideosOperation({ operation });

            // Update progress on the message
            if (assistantMsg) {
                assistantMsg.progress = Math.min(90, attempts * 2);
                await assistantMsg.save();
            }
        }

        if (!operation.done) {
            throw new Error('Video generation timeout. Please try again.');
        }

        // Check for errors
        if (operation.error) {
            console.error('❌ [Video] Operation error:', operation.error);
            throw new Error(operation.error.message || 'Video generation failed');
        }

        // Check for RAI (Responsible AI) filtering
        if (operation.response?.raiMediaFilteredCount > 0) {
            const reasons = operation.response.raiMediaFilteredReasons || [];
            const errorMessage = reasons.length > 0
                ? reasons.join(' ')
                : 'Content was filtered by safety guidelines. Please try a different prompt or image.';
            console.error('🚫 [Video] Content filtered by RAI:', errorMessage);
            throw new Error(errorMessage);
        }

        return operation;
    }

    async saveMessage(chatId, userId, role, content, extras = {}) {
        const { message } = await saveVideoTurn(chatId, userId, role, content, extras);
        return message;
    }

    /**
     * Generate video - main endpoint
     */
    async generate(req) {
        let assistantMsg = null;
        let videoChatId = null;

        try {
            const {
                userId,
                prompt,
                videoChatId: providedChatId,
                startFrame,        // { data: base64, mimeType }
                endFrame,          // { data: base64, mimeType }
                startFrameUrl,     // Legacy URL format (for backward compat)
                endFrameUrl,       // Legacy URL format
                referenceImages = [],  // Array of { data, mimeType } or URLs
                lastVideoUrl,
                resolution = '720p',
                aspectRatio = '16:9',
                durationSeconds,   // 4, 6, or 8 — forced to 8 for 1080p/4k
            } = req.body;

            videoChatId = providedChatId || `vc-${uuidv4()}`;

            console.log('[VideoController] Generate request:', {
                userId,
                prompt: prompt?.slice(0, 50) + '...',
                hasStartFrame: !!startFrame,
                hasEndFrame: !!endFrame,
                refsCount: referenceImages.length,
                resolution,
            });

            if (!userId) {
                console.error('❌ [Video] userId is required');
                return { status: 400, json: { error: 'userId is required' } };
            }
            if (!prompt) {
                console.error('❌ [Video] prompt is required');
                return { status: 400, json: { error: 'prompt is required' } };
            }

            // Check video credits first
            console.log('[VideoController] Checking credits for:', userId);
            await this.checkVideoCredits(userId);
            console.log('[VideoController] Credits OK');

            // Save user message
            await this.saveMessage(videoChatId, userId, 'user', prompt, {
                referenceImages: referenceImages.map(r => r.data ? 'base64-data' : r),
            });

            // Create assistant message (pending)
            assistantMsg = await this.saveMessage(videoChatId, userId, 'assistant', 'Generating video...', {
                status: 'processing'
            });
            // Determine mode - check new format first, then legacy
            const hasStart = startFrame?.data || startFrameUrl;
            const hasEnd = endFrame?.data || endFrameUrl;
            const hasRefs = referenceImages.length > 0 && (referenceImages[0]?.data || typeof referenceImages[0] === 'string');

            console.log('[VideoController] hasRefs check:', {
                length: referenceImages.length,
                firstRef: referenceImages[0] ? (typeof referenceImages[0] === 'string' ? 'string-url' : Object.keys(referenceImages[0])) : 'none',
                hasData: !!referenceImages[0]?.data,
                hasRefs
            });

            let mode = 'prompt';
            if (lastVideoUrl) mode = 'extend';
            else if (hasStart && hasEnd) mode = 'interpolation';
            else if (hasStart) mode = 'start_frame';
            else if (hasRefs) mode = 'references';

            console.log('[VideoController] Mode:', mode);

            // Per docs: extension only supports 720p; 1080p/4k require exactly 8s duration
            const effectiveResolution = mode === 'extend' ? '720p' : resolution;
            const effectiveDuration = (effectiveResolution === '1080p' || effectiveResolution === '4k') ? 8 : (durationSeconds || 8);

            // Per docs: personGeneration differs by mode
            const personGeneration = (mode === 'prompt' || mode === 'extend') ? 'allow_all' : 'allow_adult';

            let operationConfig = {
                model: this.model,
                prompt,
                config: {
                    resolution: effectiveResolution,
                    aspectRatio,
                    durationSeconds: effectiveDuration,
                    personGeneration,
                },
            };

            // Handle modes - support both base64 data and URLs
            if (mode === 'start_frame') {
                let imageBytes, mimeType = 'image/png';
                if (startFrame?.data) {
                    imageBytes = startFrame.data;
                    mimeType = startFrame.mimeType || 'image/png';
                    console.log('[VideoController] Using startFrame base64 data');
                } else if (startFrameUrl) {
                    const imgRes = await fetch(startFrameUrl);
                    imageBytes = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
                }
                operationConfig.image = { imageBytes, mimeType };
            }

            if (mode === 'interpolation') {
                let startBytes, endBytes;
                let startMime = 'image/png', endMime = 'image/png';

                if (startFrame?.data) {
                    startBytes = startFrame.data;
                    startMime = startFrame.mimeType || 'image/png';
                } else if (startFrameUrl) {
                    const res = await fetch(startFrameUrl);
                    startBytes = Buffer.from(await res.arrayBuffer()).toString('base64');
                }

                if (endFrame?.data) {
                    endBytes = endFrame.data;
                    endMime = endFrame.mimeType || 'image/png';
                } else if (endFrameUrl) {
                    const res = await fetch(endFrameUrl);
                    endBytes = Buffer.from(await res.arrayBuffer()).toString('base64');
                }

                operationConfig.image = { imageBytes: startBytes, mimeType: startMime };
                operationConfig.config.lastFrame = { imageBytes: endBytes, mimeType: endMime };
            }

            // Reference images can be added to ANY mode (not just 'references' mode)
            // Per Google docs: reference_images is for style and content references (Veo 3.1 only)
            if (hasRefs && referenceImages.length > 0) {
                console.log('[VideoController] Processing reference images:', referenceImages.length);
                const refs = await Promise.all(
                    referenceImages.slice(0, 3).map(async (ref) => {
                        let imageBytes, mimeType = 'image/png';
                        if (ref?.data) {
                            imageBytes = ref.data;
                            mimeType = ref.mimeType || 'image/png';
                            console.log('[VideoController] Using ref base64 data');
                        } else if (typeof ref === 'string') {
                            console.log('[VideoController] Fetching ref URL:', ref.substring(0, 50) + '...');
                            const res = await fetch(ref);
                            imageBytes = Buffer.from(await res.arrayBuffer()).toString('base64');
                        }
                        return {
                            image: { imageBytes, mimeType },
                            referenceType: 'asset',
                        };
                    })
                );
                operationConfig.config.referenceImages = refs;
                console.log('[VideoController] Added referenceImages to config:', refs.length);
            }

            if (mode === 'extend') {
                // Find the original video message by S3 URL to get the googleFile reference
                // Google Veo can ONLY extend videos that were originally generated by Veo
                const originalVideoMessage = await VideoMessage.findOne({ videoUrl: lastVideoUrl });

                if (!originalVideoMessage) {
                    throw new Error('Original video not found. Cannot extend this video.');
                }

                if (!originalVideoMessage.googleFile) {
                    throw new Error('This video cannot be extended. Only videos generated by Veo can be extended, and the Google file reference is missing.');
                }

                // Extension only works on 720p videos — Google API hard limitation
                if (originalVideoMessage.videoResolution && originalVideoMessage.videoResolution !== '720p') {
                    throw new Error(`Video extension is only supported for 720p videos. This video was generated at ${originalVideoMessage.videoResolution}. Please generate a new video at 720p to use extension.`);
                }

                console.log(`📁 [Video] Found original video googleFile:`, originalVideoMessage.googleFile);
                // Pass the video object directly (not wrapped in { uri: ... })
                // Per Gemini docs: video=operation.response.generated_videos[0].video
                operationConfig.video = originalVideoMessage.googleFile;
            }

            console.log('🎬 [Video] Starting generation with Google AI...');
            console.log('📋 [Video] Config:', {
                model: operationConfig.model,
                hasPrompt: !!operationConfig.prompt,
                hasImage: !!operationConfig.image,
                hasVideo: !!operationConfig.video,
                hasConfig: !!operationConfig.config,
                configKeys: operationConfig.config ? Object.keys(operationConfig.config) : [],
                hasReferenceImages: !!operationConfig.config?.referenceImages,
                referenceImagesCount: operationConfig.config?.referenceImages?.length || 0
            });

            console.log('📝 [Video] Prompt:', prompt, operationConfig.prompt);

            const job = await MediaJob.create({
                userId,
                kind: 'video',
                provider: 'veo',
                status: 'queued',
                prompt,
                videoChatId,
                messageId: assistantMsg.messageId,
                creditsCost: VIDEO_CREDIT_COST,
                metadata: { model: this.model, mode, resolution: effectiveResolution },
            });

            let operation = await this.ai.models.generateVideos(operationConfig);
            assistantMsg.operationId = operation.name;
            await assistantMsg.save();
            await markJob(job, { status: 'processing', operationId: operation.name, progress: 5 });

            console.log(`⏳ [Video] Operation started: ${operation.name} job=${job.jobId}`);

            this.finishVeoJob({ job, assistantMsg, operation, prompt, userId, resolution: effectiveResolution })
                .catch((err) => console.error('❌ [Video] Background finish failed:', err.message));

            return {
                status: 202,
                json: {
                    success: true,
                    accepted: true,
                    jobId: job.jobId,
                    videoChatId,
                    status: 'processing',
                    message: assistantMsg,
                },
            };

        } catch (error) {
            console.error('❌ [Video] Error:', error.message);
            console.error('❌ [Video] Stack:', error.stack);

            if (assistantMsg) {
                try {
                    assistantMsg.status = 'failed';
                    assistantMsg.error = error.message;
                    assistantMsg.content = `Failed: ${error.message}`;
                    await assistantMsg.save();
                } catch (saveErr) {
                    console.error('❌ [Video] Failed to save error message:', saveErr.message);
                }
            }

            let statusCode = error.statusCode || 500;
            if (error.message.includes('credits') || error.message.includes('Insufficient')) {
                statusCode = 403;
            } else if (error.message.includes('not found')) {
                statusCode = 404;
            }

            return { status: statusCode, json: { error: error.message, videoChatId } };
        }
    }

    async finishVeoJob({ job, assistantMsg, operation, prompt, userId, resolution }) {
        const startedAt = Date.now();
        try {
            operation = await this.waitForCompletion(operation, assistantMsg);
            if (job) {
                job.progress = Math.min(90, assistantMsg?.progress || 90);
                await job.save();
            }

            const generatedVideo = operation.response?.generatedVideos?.[0];
            if (!generatedVideo?.video) {
                throw new Error('Video generation completed but no video was returned. Please try again.');
            }

            const videoUrl = await downloadGoogleVideo(this.ai, generatedVideo);
            await finishSuccessfulVideo({
                job, assistantMsg, videoUrl, prompt, userId,
                googleFile: generatedVideo.video, resolution, startedAt,
            });
            console.log(`✅ [Video] Completed and uploaded: ${videoUrl}`);
        } catch (error) {
            console.error('❌ [Video] Background job failed:', error.message);
            await failJob(job, assistantMsg, error, startedAt);
        }
    }

    async resumeOperation(job) {
        if (!job?.operationId) return;
        const assistantMsg = job.messageId
            ? await VideoMessage.findOne({ messageId: job.messageId })
            : null;
        const seed = new GenerateVideosOperation();
        seed.name = job.operationId;
        const operation = await this.ai.operations.getVideosOperation({
            operation: seed,
        });
        await this.finishVeoJob({
            job,
            assistantMsg,
            operation,
            prompt: job.prompt,
            userId: job.userId,
            resolution: job.metadata?.resolution,
        });
    }

    async getJobStatus(jobId) {
        const job = await MediaJob.findOne({ jobId });
        if (!job) return { status: 404, json: { error: 'Job not found' } };
        return {
            status: 200,
            json: {
                jobId: job.jobId,
                status: job.status,
                progress: job.progress,
                resultUrl: job.resultUrl,
                error: job.error,
                videoChatId: job.videoChatId,
                messageId: job.messageId,
            },
        };
    }

    async getConversation(req) {
        const { videoChatId } = req.params;
        const video = await Video.findOne({ videoChatId }).populate('messages');
        if (!video) return { status: 404, json: { error: 'Conversation not found' } };
        return { status: 200, json: { video, messages: video.messages } };
    }

    async getUserConversations(req) {
        const { userId } = req.params;
        const videos = await Video.find({ userId }).sort({ createdAt: -1 }).select('-messages');
        return { status: 200, json: { conversations: videos } };
    }

    async getSettings(req) {
        const { videoChatId } = req.params;
        const video = await Video.findOne({ videoChatId });
        if (!video) return { status: 404, json: { error: 'Not found' } };
        return { status: 200, json: { settings: video.videoSettings || {}, referenceImages: video.referenceImages || [] } };
    }

    async updateSettings(req) {
        const { videoChatId } = req.params;
        const { settings, referenceImages } = req.body;
        const update = {};
        if (settings) update.videoSettings = settings;
        if (referenceImages) update.referenceImages = referenceImages.slice(0, 3);

        const video = await Video.findOneAndUpdate({ videoChatId }, update, { new: true });
        if (!video) return { status: 404, json: { error: 'Not found' } };
        return { status: 200, json: { video } };
    }

    async deleteMessage(req) {
        const { messageId } = req.params;
        const msg = await VideoMessage.findOneAndDelete({ messageId });
        if (!msg) return { status: 404, json: { error: 'Message not found' } };
        await Video.updateOne({ videoChatId: msg.videoChatId }, { $pull: { messages: msg._id } });
        return { status: 200, json: { success: true } };
    }

    async deleteConversation(req) {
        const { videoChatId } = req.params;
        const video = await Video.findOneAndDelete({ videoChatId });
        if (!video) return { status: 404, json: { error: 'Not found' } };
        await VideoMessage.deleteMany({ videoChatId });
        return { status: 200, json: { success: true } };
    }
}

module.exports = VideoController;

// ─────────────────────────────────────────────
// KIE.ai  –  Wan 2.7 Image-to-Video
// ─────────────────────────────────────────────
class KieVideoController {
    constructor() {
        this.apiKey = process.env.KIE_API_KEY;
        this.baseUrl = 'https://api.kie.ai/api/v1';
        this.pollInterval = 10000; // 10 s
        this.maxPollAttempts = 60; // 10 min max

        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    }

    // ── helpers ──────────────────────────────

    async _post(path, body) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || `KIE API error ${res.status}`);
        return data;
    }

    async _get(path) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || `KIE API error ${res.status}`);
        return data;
    }

    async _pollTask(taskId, assistantMsg) {
        let attempts = 0;
        while (attempts < this.maxPollAttempts) {
            await new Promise(r => setTimeout(r, this.pollInterval));
            attempts++;
            console.log(`⏳ [KIE] Polling task ${taskId} – attempt ${attempts}`);

            const data = await this._get(`/jobs/recordInfo?taskId=${taskId}`);
            const task = data?.data;

            if (assistantMsg) {
                assistantMsg.progress = Math.min(90, attempts * 2);
                await assistantMsg.save();
            }

            const state = task?.state; // waiting | queuing | generating | success | fail
            if (state === 'success') return task;
            if (state === 'fail') throw new Error(task?.failMsg || 'KIE task failed');
        }
        throw new Error('KIE video generation timeout. Please try again.');
    }

    async _downloadAndUploadToS3(videoUrl) {
        const res = await fetch(videoUrl);
        if (!res.ok) throw new Error(`Failed to download KIE video: ${res.status}`);
        const { uploadBufferToS3 } = require('./sharedHelpers');
        return uploadBufferToS3(Buffer.from(await res.arrayBuffer()), 'video/mp4', 'videos');
    }

    async saveMessage(chatId, userId, role, content, extras = {}) {
        const { message } = await saveVideoTurn(chatId, userId, role, content, extras);
        return message;
    }

    // ── main generate ─────────────────────────

    /**
     * POST /api/video/generate-wan
     * body: {
     *   userId, prompt, videoChatId?,
     *   firstFrameUrl?,  lastFrameUrl?,  firstClipUrl?,
     *   resolution?, duration?, negativePrompt?
     * }
     *
     * Modes (derived automatically):
     *   - firstFrameUrl only          → first-frame-to-video
     *   - firstFrameUrl + lastFrameUrl → first-and-last-frame-to-video
     *   - firstClipUrl                → video continuation
     */
    async generate(req) {
        let assistantMsg = null;
        let videoChatId = null;

        try {
            const {
                userId,
                prompt,
                videoChatId: providedChatId,
                firstFrameUrl,
                lastFrameUrl,
                firstClipUrl,
                resolution = '1080p',
                duration = 5,
                negativePrompt,
            } = req.body;

            videoChatId = providedChatId || `vc-kie-${uuidv4()}`;

            if (!userId) return { status: 400, json: { error: 'userId is required' } };
            if (!prompt)  return { status: 400, json: { error: 'prompt is required' } };
            if (!firstFrameUrl && !firstClipUrl) {
                return { status: 400, json: { error: 'firstFrameUrl or firstClipUrl is required' } };
            }

            // Determine mode label for logging
            let mode = 'first_frame';
            if (firstClipUrl) mode = 'continuation';
            else if (firstFrameUrl && lastFrameUrl) mode = 'first_and_last_frame';
            console.log(`[KIE] Mode: ${mode}`);

            // Save user message
            await this.saveMessage(videoChatId, userId, 'user', prompt, {
                startFrameUrl: firstFrameUrl || null,
                endFrameUrl: lastFrameUrl || null,
            });

            // Pending assistant message
            assistantMsg = await this.saveMessage(videoChatId, userId, 'assistant', 'Generating video...', {
                status: 'processing',
            });

            // Build KIE request body
            const kieBody = {
                model: 'wan/2-7-image-to-video',
                input: {
                    prompt,
                    resolution,
                    duration,
                    prompt_extend: true,
                    watermark: false,
                    ...(negativePrompt && { negative_prompt: negativePrompt }),
                    ...(firstFrameUrl && { first_frame_url: firstFrameUrl }),
                    ...(lastFrameUrl  && { last_frame_url: lastFrameUrl }),
                    ...(firstClipUrl  && { first_clip_url: firstClipUrl }),
                },
            };

            console.log('[KIE] Full payload to be sent:');
            console.log(JSON.stringify(kieBody, null, 2));

            // ── TEST MODE: return early without calling the API ──
            if (process.env.VIDEO_TEST_MODE === 'true') {
                console.log('🧪 [KIE] TEST MODE ON — skipping API call. Payload logged above.');
                if (assistantMsg) {
                    assistantMsg.status = 'failed';
                    assistantMsg.error = 'TEST MODE — no API call made';
                    assistantMsg.content = 'TEST MODE — no API call made';
                    await assistantMsg.save();
                }
                return { status: 200, json: { success: false, testMode: true, payload: kieBody, videoChatId } };
            }

            console.log('[KIE] Creating task:', JSON.stringify({ model: kieBody.model, mode }, null, 2));
            const createRes = await this._post('/jobs/createTask', kieBody);
            const taskId = createRes?.data?.taskId;
            if (!taskId) throw new Error('KIE did not return a taskId');

            console.log(`[KIE] Task created: ${taskId}`);
            assistantMsg.operationId = taskId;
            await assistantMsg.save();

            const job = await MediaJob.create({
                userId, kind: 'video', provider: 'kie', status: 'processing',
                prompt, videoChatId, messageId: assistantMsg.messageId,
                operationId: taskId, creditsCost: VIDEO_CREDIT_COST,
                metadata: { model: kieBody.model, mode },
            });

            this.finishKieJob({ job, assistantMsg, taskId, prompt, userId })
                .catch((err) => console.error('❌ [KIE] Background finish failed:', err.message));

            return {
                status: 202,
                json: { success: true, accepted: true, jobId: job.jobId, videoChatId, status: 'processing', message: assistantMsg },
            };

        } catch (error) {
            console.error('❌ [KIE] Error:', error.message);

            if (assistantMsg) {
                assistantMsg.status = 'failed';
                assistantMsg.error = error.message;
                assistantMsg.content = `Failed: ${error.message}`;
                await assistantMsg.save().catch(() => {});
            }

            return { status: 500, json: { error: error.message, videoChatId } };
        }
    }

    async finishKieJob({ job, assistantMsg, taskId, prompt, userId }) {
        const startedAt = Date.now();
        try {
            const task = await this._pollTask(taskId, assistantMsg);
            let kieVideoUrl;
            try {
                const resultJson = typeof task?.resultJson === 'string' ? JSON.parse(task.resultJson) : task?.resultJson;
                kieVideoUrl = resultJson?.resultUrls?.[0];
            } catch (e) { /* ignore parse error */ }
            if (!kieVideoUrl) throw new Error('KIE returned no video URL');
            const s3Url = await this._downloadAndUploadToS3(kieVideoUrl);
            await finishSuccessfulVideo({ job, assistantMsg, videoUrl: s3Url, prompt, userId, startedAt });
            console.log(`✅ [KIE] Done: ${s3Url}`);
        } catch (error) {
            console.error('❌ [KIE] Background job failed:', error.message);
            await failJob(job, assistantMsg, error, startedAt);
        }
    }

    async resumeOperation(job) {
        if (!job?.operationId) return;
        const assistantMsg = job.messageId
            ? await VideoMessage.findOne({ messageId: job.messageId })
            : null;
        await this.finishKieJob({
            job, assistantMsg, taskId: job.operationId, prompt: job.prompt, userId: job.userId,
        });
    }
}

// ─────────────────────────────────────────────
// KIE.ai  –  Bytedance Seedance 2.0 / 2.0 Fast
// ─────────────────────────────────────────────
class SeedanceVideoController {
    constructor(fast = false) {
        this.model = fast ? 'bytedance/seedance-2-fast' : 'bytedance/seedance-2';
        this.apiKey = process.env.KIE_API_KEY;
        this.baseUrl = 'https://api.kie.ai/api/v1';
        this.pollInterval = 10000;
        this.maxPollAttempts = 90; // 15 min max

        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    }

    async _post(path, body) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || `KIE API error ${res.status}`);
        return data;
    }

    async _get(path) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || `KIE API error ${res.status}`);
        return data;
    }

    async _pollTask(taskId, assistantMsg) {
        let attempts = 0;
        while (attempts < this.maxPollAttempts) {
            await new Promise(r => setTimeout(r, this.pollInterval));
            attempts++;
            console.log(`⏳ [Seedance] Polling task ${taskId} – attempt ${attempts}`);

            const data = await this._get(`/jobs/recordInfo?taskId=${taskId}`);
            const task = data?.data;

            if (assistantMsg) {
                assistantMsg.progress = task?.progress ?? Math.min(90, attempts * 1.5);
                await assistantMsg.save();
            }

            const state = task?.state; // waiting | queuing | generating | success | fail
            if (state === 'success') return task;
            if (state === 'fail') throw new Error(task?.failMsg || 'Seedance task failed');
        }
        throw new Error('Seedance video generation timeout. Please try again.');
    }

    async _downloadAndUploadToS3(videoUrl) {
        const res = await fetch(videoUrl);
        if (!res.ok) throw new Error(`Failed to download Seedance video: ${res.status}`);
        const { uploadBufferToS3 } = require('./sharedHelpers');
        return uploadBufferToS3(Buffer.from(await res.arrayBuffer()), 'video/mp4', 'videos');
    }

    async saveMessage(chatId, userId, role, content, extras = {}) {
        const { message } = await saveVideoTurn(chatId, userId, role, content, extras);
        return message;
    }

    /**
     * POST /api/video/generate-seedance
     * body: {
     *   userId, prompt, videoChatId?,
     *   firstFrameUrl?, lastFrameUrl?,
     *   referenceImageUrls?, referenceVideoUrls?, referenceAudioUrls?,
     *   resolution?, aspectRatio?, duration?, generateAudio?
     * }
     *
     * Modes (mutually exclusive — pick one):
     *   A) firstFrameUrl (+ optional lastFrameUrl)  → Image-to-Video
     *   B) referenceImageUrls / referenceVideoUrls  → Multimodal Reference-to-Video
     *   C) prompt only                              → Text-to-Video
     */
    async generate(req) {
        let assistantMsg = null;
        let videoChatId = null;

        try {
            const {
                userId,
                prompt,
                videoChatId: providedChatId,
                firstFrameUrl,
                lastFrameUrl,
                referenceImageUrls = [],
                referenceVideoUrls = [],
                referenceAudioUrls = [],
                resolution = '720p',
                aspectRatio = '16:9',
                duration = 5,
                generateAudio = false,
                webSearch = false,
            } = req.body;

            videoChatId = providedChatId || `vc-seedance-${uuidv4()}`;

            if (!userId) return { status: 400, json: { error: 'userId is required' } };
            if (!prompt)  return { status: 400, json: { error: 'prompt is required' } };

            // Determine mode label for logging
            let mode = 'text_to_video';
            if (firstFrameUrl) mode = lastFrameUrl ? 'first_and_last_frame' : 'first_frame';
            else if (referenceImageUrls.length || referenceVideoUrls.length) mode = 'multimodal_reference';
            console.log(`[Seedance] Mode: ${mode}`);

            // Save user message
            await this.saveMessage(videoChatId, userId, 'user', prompt, {
                startFrameUrl: firstFrameUrl || null,
                endFrameUrl: lastFrameUrl || null,
                referenceImages: referenceImageUrls.slice(0, 9),
            });

            // Pending assistant message
            assistantMsg = await this.saveMessage(videoChatId, userId, 'assistant', 'Generating video...', {
                status: 'processing',
            });

            // Build KIE request body
            const input = {
                prompt,
                resolution,
                aspect_ratio: aspectRatio,
                duration,
                generate_audio: generateAudio,
                web_search: webSearch,
                watermark: false,
                ...(firstFrameUrl && { first_frame_url: firstFrameUrl }),
                ...(lastFrameUrl  && { last_frame_url: lastFrameUrl }),
                ...(referenceImageUrls.length && { reference_image_urls: referenceImageUrls.slice(0, 9) }),
                ...(referenceVideoUrls.length && { reference_video_urls: referenceVideoUrls.slice(0, 3) }),
                ...(referenceAudioUrls.length && { reference_audio_urls: referenceAudioUrls.slice(0, 3) }),
            };

            const kieBody = { model: this.model, input };

            console.log('[Seedance] Full payload to be sent:');
            console.log(JSON.stringify(kieBody, null, 2));

            // ── TEST MODE: return early without calling the API ──
            if (process.env.VIDEO_TEST_MODE === 'true') {
                console.log('🧪 [Seedance] TEST MODE ON — skipping API call. Payload logged above.');
                if (assistantMsg) {
                    assistantMsg.status = 'failed';
                    assistantMsg.error = 'TEST MODE — no API call made';
                    assistantMsg.content = 'TEST MODE — no API call made';
                    await assistantMsg.save();
                }
                return { status: 200, json: { success: false, testMode: true, payload: kieBody, videoChatId } };
            }

            console.log('[Seedance] Creating task:', JSON.stringify({ model: kieBody.model, mode }, null, 2));
            const createRes = await this._post('/jobs/createTask', kieBody);
            const taskId = createRes?.data?.taskId;
            if (!taskId) {
                console.error('[Seedance] Full API response:', JSON.stringify(createRes, null, 2));
                throw new Error(`Seedance error: ${createRes?.msg || createRes?.message || JSON.stringify(createRes)}`);
            }

            console.log(`[Seedance] Task created: ${taskId}`);
            assistantMsg.operationId = taskId;
            await assistantMsg.save();

            const job = await MediaJob.create({
                userId, kind: 'video',
                provider: this.model.includes('fast') ? 'seedance-fast' : 'seedance',
                status: 'processing', prompt, videoChatId,
                messageId: assistantMsg.messageId, operationId: taskId,
                creditsCost: VIDEO_CREDIT_COST, metadata: { model: this.model, mode },
            });

            this.finishSeedanceJob({ job, assistantMsg, taskId, prompt, userId })
                .catch((err) => console.error('❌ [Seedance] Background finish failed:', err.message));

            return {
                status: 202,
                json: { success: true, accepted: true, jobId: job.jobId, videoChatId, status: 'processing', message: assistantMsg },
            };

        } catch (error) {
            console.error('❌ [Seedance] Error:', error.message);

            if (assistantMsg) {
                assistantMsg.status = 'failed';
                assistantMsg.error = error.message;
                assistantMsg.content = `Failed: ${error.message}`;
                await assistantMsg.save().catch(() => {});
            }

            return { status: 500, json: { error: error.message, videoChatId } };
        }
    }

    async finishSeedanceJob({ job, assistantMsg, taskId, prompt, userId }) {
        const startedAt = Date.now();
        try {
            const task = await this._pollTask(taskId, assistantMsg);
            let seedanceVideoUrl;
            try {
                const resultJson = typeof task?.resultJson === 'string' ? JSON.parse(task.resultJson) : task?.resultJson;
                seedanceVideoUrl = resultJson?.resultUrls?.[0];
            } catch (e) { /* ignore parse error */ }
            if (!seedanceVideoUrl) throw new Error('Seedance returned no video URL');
            const s3Url = await this._downloadAndUploadToS3(seedanceVideoUrl);
            await finishSuccessfulVideo({ job, assistantMsg, videoUrl: s3Url, prompt, userId, startedAt });
            console.log(`✅ [Seedance] Done: ${s3Url}`);
        } catch (error) {
            console.error('❌ [Seedance] Background job failed:', error.message);
            await failJob(job, assistantMsg, error, startedAt);
        }
    }

    async resumeOperation(job) {
        if (!job?.operationId) return;
        const assistantMsg = job.messageId
            ? await VideoMessage.findOne({ messageId: job.messageId })
            : null;
        await this.finishSeedanceJob({
            job, assistantMsg, taskId: job.operationId, prompt: job.prompt, userId: job.userId,
        });
    }
}

// ─────────────────────────────────────────────
// Google  –  Gemini Omni 1.1 Flash (Interactions API)
// ─────────────────────────────────────────────
// Omni is not a long-running-operation model like Veo: one POST to
// /v1beta/interactions returns the finished clip (inline base64 for small
// files, a Files-API URI for larger ones). The SDK installed here predates the
// Interactions client, so this talks to the REST endpoint directly. Everything
// around it - MediaJob ledger, VideoMessage, credits, S3 - is shared with the
// other providers so callers cannot tell which model produced the clip.
class OmniVideoController extends SeedanceVideoController {
    constructor() {
        super(false);
        this.model = process.env.OMNI_VIDEO_MODEL || 'gemini-omni-1.1-flash';
        this.apiKey = process.env.GOOGLE_AI_API_KEY;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
        this.pollInterval = 5000;
        this.maxPollAttempts = 180; // 15 min
    }

    async _omni(method, path, body) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'x-goog-api-key': this.apiKey,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || `Gemini Omni API error ${res.status}`);
        return data;
    }

    async _imageToInline(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch reference image: ${res.status}`);
        const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
        return { type: 'image', mime_type: mime, data: Buffer.from(await res.arrayBuffer()).toString('base64') };
    }

    // The response nests output under steps[].content[]; older previews used
    // output_video. Check both so a schema shuffle does not hide the clip.
    _findVideo(interaction) {
        if (interaction?.output_video) return interaction.output_video;
        for (const step of interaction?.steps || []) {
            if (step?.type !== 'model_output') continue;
            const v = (step.content || []).find((c) => c?.type === 'video');
            if (v) return v;
        }
        for (const c of interaction?.outputs || interaction?.output || []) {
            if (c?.type === 'video') return c;
        }
        return null;
    }

    /**
     * POST /api/video/generate-omni
     * body: { userId, prompt, videoChatId?, firstFrameUrl?, referenceImageUrls?, aspectRatio?, resolution? }
     */
    async generate(req) {
        let assistantMsg = null;
        let videoChatId = null;
        try {
            const {
                userId, prompt, videoChatId: providedChatId,
                firstFrameUrl, referenceImageUrls = [],
                aspectRatio = '16:9', resolution = '720p',
                billing, // 'autopilot': the charge counts toward the autopilot's daily cap (AutopilotBilling)
            } = req.body;

            videoChatId = providedChatId || `vc-omni-${uuidv4()}`;
            if (!userId) return { status: 400, json: { error: 'userId is required' } };
            if (!prompt) return { status: 400, json: { error: 'prompt is required' } };

            const imageUrls = [firstFrameUrl, ...referenceImageUrls].filter(Boolean).slice(0, 4);
            const mode = imageUrls.length ? 'image_to_video' : 'text_to_video';
            console.log(`[Omni] Mode: ${mode} model: ${this.model}`);

            await this.saveMessage(videoChatId, userId, 'user', prompt, {
                startFrameUrl: firstFrameUrl || null,
                referenceImages: referenceImageUrls.slice(0, 4),
            });
            assistantMsg = await this.saveMessage(videoChatId, userId, 'assistant', 'Generating video...', { status: 'processing' });

            const job = await MediaJob.create({
                userId, kind: 'video', provider: 'gemini',
                status: 'processing', prompt, videoChatId,
                messageId: assistantMsg.messageId,
                creditsCost: VIDEO_CREDIT_COST,
                metadata: { model: this.model, mode, aspectRatio, resolution, imageUrls, billing: billing === 'autopilot' ? 'autopilot' : null },
            });

            this.finishOmniJob({ job, assistantMsg, prompt, userId, imageUrls, aspectRatio, resolution })
                .catch((err) => console.error('❌ [Omni] Background finish failed:', err.message));

            return {
                status: 202,
                json: { success: true, accepted: true, jobId: job.jobId, videoChatId, status: 'processing', message: assistantMsg },
            };
        } catch (error) {
            console.error('❌ [Omni] Error:', error.message);
            if (assistantMsg) {
                assistantMsg.status = 'failed';
                assistantMsg.error = error.message;
                assistantMsg.content = `Video generation failed: ${error.message}`;
                await assistantMsg.save().catch(() => {});
            }
            return { status: 500, json: { error: error.message, videoChatId } };
        }
    }

    async _createOrResume({ job, prompt, imageUrls, aspectRatio, resolution }) {
        if (job?.operationId) {
            return this._omni('GET', `/interactions/${job.operationId}`);
        }
        const input = [];
        for (const url of imageUrls || []) input.push(await this._imageToInline(url));
        input.push({ type: 'text', text: prompt });

        const body = {
            model: this.model,
            input: input.length === 1 ? prompt : input,
            response_format: {
                type: 'video',
                aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
                resolution,
                delivery: 'uri',
            },
        };
        if (process.env.VIDEO_TEST_MODE === 'true') {
            console.log('🧪 [Omni] TEST MODE ON — payload:', JSON.stringify({ ...body, input: '[omitted]' }));
            throw new Error('TEST MODE — no API call made');
        }
        const interaction = await this._omni('POST', '/interactions', body);
        if (interaction?.id && job) {
            job.operationId = interaction.id;
            await job.save().catch(() => {});
        }
        return interaction;
    }

    async _awaitInteraction(interaction, assistantMsg) {
        let attempts = 0;
        while (['in_progress', 'queued', 'pending', 'requires_action'].includes(interaction?.status)) {
            if (++attempts > this.maxPollAttempts) throw new Error('Gemini Omni generation timeout');
            await new Promise((r) => setTimeout(r, this.pollInterval));
            if (assistantMsg) {
                assistantMsg.progress = Math.min(90, attempts * 2);
                await assistantMsg.save().catch(() => {});
            }
            interaction = await this._omni('GET', `/interactions/${interaction.id}`);
        }
        if (interaction?.status && interaction.status !== 'completed') {
            throw new Error(interaction?.error?.message || `Gemini Omni interaction ${interaction.status}`);
        }
        return interaction;
    }

    async _videoToS3(video) {
        const { uploadBufferToS3 } = require('./sharedHelpers');
        if (video.data) {
            return uploadBufferToS3(Buffer.from(video.data, 'base64'), video.mime_type || 'video/mp4', 'videos');
        }
        if (!video.uri) throw new Error('Gemini Omni returned neither inline data nor a file uri');

        // Large clips land in the Files API and must finish processing first.
        const match = video.uri.match(/files\/([a-zA-Z0-9_-]+)/);
        if (match) {
            const name = `files/${match[1]}`;
            for (let i = 0; i < 60; i++) {
                const info = await this._omni('GET', `/${name}`);
                const state = info?.state?.name || info?.state;
                if (state === 'ACTIVE') break;
                if (state === 'FAILED') throw new Error('Gemini Omni file processing failed');
                await new Promise((r) => setTimeout(r, 5000));
            }
        }
        return downloadGoogleVideo(this.ai, { video: { uri: video.uri } });
    }

    async finishOmniJob({ job, assistantMsg, prompt, userId, imageUrls, aspectRatio, resolution }) {
        const startedAt = Date.now();
        try {
            let interaction = await this._createOrResume({ job, prompt, imageUrls, aspectRatio, resolution });
            interaction = await this._awaitInteraction(interaction, assistantMsg);
            const video = this._findVideo(interaction);
            if (!video) throw new Error('Gemini Omni returned no video');
            const s3Url = await this._videoToS3(video);
            await finishSuccessfulVideo({ job, assistantMsg, videoUrl: s3Url, prompt, userId, resolution, startedAt });
            console.log(`✅ [Omni] Done: ${s3Url}`);
        } catch (error) {
            console.error('❌ [Omni] Background job failed:', error.message);
            await failJob(job, assistantMsg, error, startedAt);
        }
    }

    async resumeOperation(job) {
        if (!job?.operationId) return;
        const assistantMsg = job.messageId ? await VideoMessage.findOne({ messageId: job.messageId }) : null;
        const m = job.metadata || {};
        await this.finishOmniJob({
            job, assistantMsg, prompt: job.prompt, userId: job.userId,
            imageUrls: m.imageUrls || [], aspectRatio: m.aspectRatio || '16:9', resolution: m.resolution || '720p',
        });
    }
}

module.exports = { VideoController, KieVideoController, SeedanceVideoController, OmniVideoController, SeedanceFastVideoController: class extends SeedanceVideoController { constructor() { super(true); } } };

