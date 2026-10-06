const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const MediaJob = require('../models/mediaJob');
const { uploadBufferToS3, deductCreditsSafe, recordUsage, CREDIT_COSTS } = require('./sharedHelpers');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

async function markJob(job, patch) {
  if (!job) return null;
  Object.assign(job, patch);
  await job.save();
  return job;
}

async function failJob(job, assistantMsg, error, startedAt) {
  const message = error?.message || String(error);
  if (assistantMsg) {
    assistantMsg.status = 'failed';
    assistantMsg.error = message;
    assistantMsg.content = `Failed: ${message}`;
    await assistantMsg.save().catch(() => {});
  }
  await markJob(job, { status: 'failed', error: message, progress: 0 });
  await recordUsage({
    userId: job?.userId, tool: 'generate_video', provider: job?.provider,
    creditsCost: 0, success: false, error: message, jobId: job?.jobId,
    latencyMs: startedAt ? Date.now() - startedAt : 0,
  });
}

async function completeVideoMessage(assistantMsg, { prompt, videoUrl, googleFile, resolution }) {
  if (!assistantMsg) return;
  assistantMsg.content = prompt;
  assistantMsg.videoUrl = videoUrl;
  if (googleFile) assistantMsg.googleFile = googleFile;
  if (resolution) assistantMsg.videoResolution = resolution;
  assistantMsg.status = 'completed';
  assistantMsg.progress = 100;
  await assistantMsg.save();
}

async function downloadGoogleVideo(ai, generatedVideo) {
  const tempPath = path.join(UPLOADS_DIR, `temp_${uuidv4()}.mp4`);
  await fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
  await ai.files.download({ file: generatedVideo.video, downloadPath: tempPath });
  const buffer = await fs.readFile(tempPath);
  await fs.unlink(tempPath).catch(() => {});
  return uploadBufferToS3(buffer, 'video/mp4', 'videos');
}

async function finishSuccessfulVideo({ job, assistantMsg, videoUrl, prompt, userId, googleFile, resolution, startedAt }) {
  await completeVideoMessage(assistantMsg, { prompt, videoUrl, googleFile, resolution });
  if (userId && CREDIT_COSTS.generate_video) {
    const referenceType = job?.metadata?.billing === 'autopilot' ? 'autopilot' : 'image_generation';
    await deductCreditsSafe(userId, CREDIT_COSTS.generate_video, job?.jobId, `Video generation: ${String(prompt || '').slice(0, 50)}`, referenceType);
  }
  await markJob(job, { status: 'completed', resultUrl: videoUrl, progress: 100, creditsDeducted: true });
  await recordUsage({
    userId, tool: 'generate_video', provider: job?.provider, model: job?.metadata?.model,
    creditsCost: CREDIT_COSTS.generate_video, success: true, jobId: job?.jobId,
    resultUrl: videoUrl, latencyMs: startedAt ? Date.now() - startedAt : 0,
  });
}

function controllerForProvider(controllers, provider) {
  if (provider === 'kie') return controllers.kie;
  if (provider === 'seedance' || provider === 'seedance-fast') return controllers.seedance;
  if (provider === 'gemini') return controllers.omni || controllers.veo;
  return controllers.veo;
}

async function resumeStuckJobs(controllers) {
  const pool = controllers?.generate ? { veo: controllers } : (controllers || {});
  const stuck = await MediaJob.find({
    kind: 'video',
    status: { $in: ['queued', 'processing'] },
    updatedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) },
  }).limit(10);
  let resumed = 0;
  for (const job of stuck) {
    if (!job.operationId) continue;
    const controller = controllerForProvider(pool, job.provider);
    if (!controller || typeof controller.resumeOperation !== 'function') continue;
    try {
      await markJob(job, { status: 'processing', progress: Math.max(job.progress || 0, 5) });
      await controller.resumeOperation(job);
      resumed += 1;
    } catch (err) {
      console.error('[MEDIA-JOB] Resume failed', job.jobId, err.message);
    }
  }
  return resumed;
}

module.exports = {
  markJob, failJob, completeVideoMessage, downloadGoogleVideo, finishSuccessfulVideo, resumeStuckJobs,
};
