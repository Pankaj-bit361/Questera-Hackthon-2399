const crypto = require('crypto');
const express = require('express');
const Autopilot = require('../models/autopilot');
const AutopilotMemory = require('../models/autopilotMemory');

/**
 * Blog to social, from Seovyn: Seovyn's publish webhook (its account settings take one URL and secret) points here,
 * and each approved article becomes news the autopilot announces on every platform (whatsNew, kind 'blog').
 *
 * Public: Seovyn has no Velos login. Each autopilot has its own secret, and Seovyn signs every delivery with it
 * (x-contentautopilot-signature: hex HMAC-SHA256 of the raw body), so only Seovyn can post here.
 */
const integrationsRouter = express.Router();

const sign = (secret, raw) => crypto.createHmac('sha256', secret).update(raw).digest('hex');
const sameHex = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

integrationsRouter.post('/seovyn/:autopilotId', async (req, res) => {
  try {
    const ap = await Autopilot.findOne({ autopilotId: req.params.autopilotId, archived: false }).select('+seovynSecret userId autopilotId');
    if (!ap?.seovynSecret || !req.rawBody) return res.status(404).json({ error: 'Not found' });
    if (!sameHex(sign(ap.seovynSecret, req.rawBody), req.headers['x-contentautopilot-signature'])) {
      return res.status(401).json({ error: 'Bad signature' });
    }
    const { event, data } = req.body || {};
    // Refreshes of an article already announced are not news.
    if (event !== 'article.approved' || !data?.title) return res.status(200).json({ ok: true, ignored: true });

    const memory = await AutopilotMemory.findOne({ autopilotId: ap.autopilotId });
    if (!memory) return res.status(200).json({ ok: true, ignored: true });
    const site = memory.website?.url ? new URL(/^https?:\/\//i.test(memory.website.url) ? memory.website.url : `https://${memory.website.url}`).origin : null;
    const url = data.url || (site && data.slug ? `${site}/${(data.pageType || 'blog') === 'blog' ? 'blog/' : ''}${data.slug}` : null);
    const key = url || `seovyn:${data.itemId}`;
    if ((memory.whatsNew || []).some((w) => w.key === key)) return res.status(200).json({ ok: true, duplicate: true });

    memory.whatsNew = [
      { key, kind: 'blog', title: String(data.title).slice(0, 200), url, summary: String(data.summary || data.metaDescription || '').slice(0, 400), fact: '', foundAt: new Date(), source: 'seovyn' },
      ...(memory.whatsNew || []),
    ].slice(0, 30);
    await memory.save();
    console.log(`📰 [SEOVYN] ${ap.autopilotId}: "${data.title}" queued for every platform`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[INTEGRATIONS] Seovyn webhook error:', error);
    return res.status(500).json({ error: 'Webhook failed' });
  }
});

module.exports = integrationsRouter;
module.exports.sign = sign;
