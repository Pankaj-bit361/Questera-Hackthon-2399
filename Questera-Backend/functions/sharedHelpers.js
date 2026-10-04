const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const ImageChat = require('../models/image');
const ImageMessage = require('../models/imageMessage');
const Video = require('../models/video');
const VideoMessage = require('../models/videoMessage');
const GenerationUsage = require('../models/generationUsage');
const CreditsController = require('./Credits');

const creditsController = new CreditsController();

const CREDIT_COSTS = {
  generate_image: 1,
  edit_image: 1,
  create_variations: 1, // per successful image
  generate_video: 10,
};

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function uploadBufferToS3(buffer, mimeType, folder = 'generated') {
  const ext = (mimeType && mimeType.split('/')[1]) || 'bin';
  const key = `${folder}/${uuidv4()}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  }));
  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

async function ensureCredits(userId, amount) {
  if (!userId || !amount) return { ok: true, balance: null };
  const has = await creditsController.hasCredits(userId, amount);
  if (!has) {
    const credits = await creditsController.getOrCreateCredits(userId);
    const err = new Error(`Insufficient credits. Need ${amount}, have ${credits.balance}.`);
    err.statusCode = 403;
    err.creditsRequired = amount;
    err.balance = credits.balance;
    throw err;
  }
  return { ok: true };
}

async function deductCreditsSafe(userId, amount, reference, description, referenceType) {
  if (!userId || !amount) return { success: true, balance: null };
  return creditsController.deductCredits(userId, amount, reference, description, referenceType);
}

async function saveImageTurn(chatId, userId, role, content, extras = {}) {
  const imageChatId = chatId || `chat-${uuidv4()}`;
  if (userId) {
    await ImageChat.findOneAndUpdate(
      { imageChatId },
      { $setOnInsert: { userId, imageChatId, name: String(content || '').slice(0, 60) } },
      { upsert: true, new: true }
    );
  }
  const refUrls = (extras.referenceImages || [])
    .map((img) => (typeof img === 'string' ? img : img?.url))
    .filter(Boolean);
  const msg = await ImageMessage.create({
    role, userId, content, imageChatId, messageId: extras.messageId || uuidv4(),
    imageUrl: extras.imageUrl, referenceImages: refUrls,
    thoughtSignature: extras.thoughtSignature, imageMimeType: extras.imageMimeType,
    viralContent: extras.viralContent,
    videoUrl: extras.videoUrl, videoJobId: extras.videoJobId,
  });
  await ImageChat.updateOne({ imageChatId }, { $push: { messages: msg._id } });
  return { imageChatId, message: msg };
}

async function saveVideoTurn(chatId, userId, role, content, extras = {}) {
  const videoChatId = chatId || `vc-${uuidv4()}`;
  const msg = await VideoMessage.create({
    messageId: extras.messageId || `vmsg-${uuidv4()}`,
    videoChatId, role, content, userId,
    videoUrl: extras.videoUrl, thumbnailUrl: extras.thumbnailUrl,
    referenceImages: extras.referenceImages, startFrameUrl: extras.startFrameUrl,
    endFrameUrl: extras.endFrameUrl, status: extras.status || 'completed',
    operationId: extras.operationId, error: extras.error,
    googleFile: extras.googleFile, videoResolution: extras.videoResolution,
  });
  await Video.findOneAndUpdate(
    { videoChatId },
    { $push: { messages: msg._id }, $setOnInsert: { userId, videoChatId, name: String(content || '').slice(0, 50) } },
    { upsert: true, new: true }
  );
  return { videoChatId, message: msg };
}

async function recordUsage(entry) {
  try {
    await GenerationUsage.create(entry);
  } catch (err) {
    console.warn('[USAGE] Failed to record generation usage:', err.message);
  }
}

function sseWrite(res, event, data) {
  if (!res || res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === 'function') res.flush();
}

function initSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

module.exports = {
  CREDIT_COSTS, uploadBufferToS3, ensureCredits, deductCreditsSafe,
  saveImageTurn, saveVideoTurn, recordUsage, sseWrite, initSse, creditsController,
};
