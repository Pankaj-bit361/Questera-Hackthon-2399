const Autopilot = require('../models/autopilot');
const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');
const AutopilotEvent = require('../models/autopilotEvent');
const ScheduledPost = require('../models/scheduledPost');
const { minutesOfDayInZone, isValidTimeZone } = require('./timeHelpers');

/**
 * The weekly report, for each autopilot: what went out, what worked, what the user turned down and why, and what
 * the autopilot will do differently next week because of it. Shown on the autopilot page and emailed on Monday
 * morning in the autopilot's timezone.
 */

const NAME = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X' };
const REASON = { inaccurate: 'not true', off_brand: 'off-brand', generic: 'too generic', repetitive: 'repeats itself', bad_visual: 'bad image or video', wrong_timing: 'wrong timing', other: 'something else' };

const interactions = (e = {}) => (e.likes || 0) + (e.comments || 0) + (e.shares || 0) + (e.saves || 0);

async function build(autopilotId, now = new Date()) {
  const ap = await Autopilot.findOne({ autopilotId }).lean();
  if (!ap) return null;
  const from = new Date(now.getTime() - 7 * 86400e3);
  const [configs, memory, posts, events] = await Promise.all([
    AutopilotConfig.find({ autopilotId }).lean(),
    AutopilotMemory.findOne({ autopilotId }).lean(),
    ScheduledPost.find({ autopilotId, updatedAt: { $gte: from } }).lean(),
    AutopilotEvent.find({ autopilotId, createdAt: { $gte: from } }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  const platforms = [];
  for (const config of configs.filter((c) => c.enabled)) {
    const mine = posts.filter((p) => p.platform === config.platform);
    const published = mine.filter((p) => p.status === 'published' && p.publishedAt >= from);
    const scored = mine.filter((p) => typeof p.review?.score === 'number' && p.createdAt >= from);
    const best = [...published].sort((a, b) => interactions(b.engagement) - interactions(a.engagement))[0];
    platforms.push({
      platform: config.platform,
      published: published.length,
      waiting: mine.filter((p) => p.status === 'pending_approval').length,
      rejected: mine.filter((p) => p.rejectedAt && p.rejectedAt >= from).length,
      failed: mine.filter((p) => p.status === 'failed').length,
      averageScore: scored.length ? Math.round(scored.reduce((a, p) => a + p.review.score, 0) / scored.length) : null,
      interactions: published.reduce((a, p) => a + interactions(p.engagement), 0),
      best: best && interactions(best.engagement) > 0
        ? { caption: String(best.threadParts?.[0] || best.caption || '').slice(0, 160), url: best.platformPostUrl || null, interactions: interactions(best.engagement) }
        : null,
      trust: { mode: config.trust?.mode || 'supervised', streak: config.trust?.approvalStreak || 0 },
    });
  }

  const reasons = {};
  for (const p of posts.filter((x) => x.rejectedAt && x.rejectedAt >= from)) reasons[p.rejectReason || 'other'] = (reasons[p.rejectReason || 'other'] || 0) + 1;
  const news = (memory?.whatsNew || []).filter((w) => new Date(w.foundAt) >= from);

  return {
    autopilotId,
    name: ap.name,
    from,
    to: now,
    platforms,
    rejections: Object.entries(reasons).map(([reason, count]) => ({ reason, label: REASON[reason] || reason, count })).sort((a, b) => b.count - a.count),
    news: news.map((w) => ({ title: w.title, url: w.url, kind: w.kind })),
    events: events.map((e) => ({ platform: e.platform, action: e.action, reason: e.reason, at: e.createdAt })),
    nextWeek: changes({ memory, platforms, reasons, news }),
  };
}

/** What the autopilot will do differently, in plain sentences, from the numbers it has. */
function changes({ memory, platforms, reasons, news }) {
  const out = [];
  for (const p of platforms) {
    const s = memory?.stats?.[p.platform];
    const name = NAME[p.platform];
    if (s?.posts >= 4) {
      const up = s.byTheme?.find((g) => g.lift >= 1.2);
      const down = [...(s.byTheme || [])].reverse().find((g) => g.lift <= 0.7);
      const time = s.byTime?.find((g) => g.lift >= 1.2);
      const format = s.byFormat?.find((g) => g.lift >= 1.2);
      if (up) out.push(`More "${up.key}" posts on ${name}: they got ${up.lift}x your usual engagement.`);
      if (down) out.push(`Fewer "${down.key}" posts on ${name}: ${down.lift}x your usual engagement.`);
      if (format) out.push(`More ${format.key} posts on ${name} (${format.lift}x).`);
      if (time) out.push(`Posting on ${name} in the ${time.key} more often (${time.lift}x).`);
    }
    if (p.trust.mode === 'supervised' && p.trust.streak > 0) {
      out.push(`${Math.max(0, 5 - p.trust.streak)} more clean approval${5 - p.trust.streak === 1 ? '' : 's'} and ${name} goes on autopilot.`);
    }
  }
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (top) out.push(`You turned posts down as "${REASON[top[0]] || top[0]}" ${top[1]} time${top[1] > 1 ? 's' : ''}; the planner and the writer now read that before every post.`);
  if (news.length) out.push(`${news.length} new thing${news.length > 1 ? 's' : ''} found on your site this week ${news.length > 1 ? 'are' : 'is'} announced first.`);
  if (!out.length) out.push('Not enough results yet to change course; the autopilot keeps varying themes and formats so it can learn.');
  return out;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function html(report) {
  const cell = 'padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#3f3f46;';
  const rows = report.platforms.map((p) => `
    <tr>
      <td style="${cell}font-weight:600;color:#18181b;">${NAME[p.platform]}</td>
      <td style="${cell}">${p.published}</td>
      <td style="${cell}">${p.waiting}</td>
      <td style="${cell}">${p.rejected}</td>
      <td style="${cell}">${p.averageScore ?? '-'}</td>
      <td style="${cell}">${p.trust.mode === 'autopilot' ? 'Autopilot' : `Supervised ${p.trust.streak}/5`}</td>
    </tr>`).join('');
  const best = report.platforms.filter((p) => p.best).map((p) => `
    <p style="margin:0 0 12px;font-size:14px;color:#3f3f46;line-height:1.5;"><strong>${NAME[p.platform]}:</strong> "${esc(p.best.caption)}" - ${p.best.interactions} interactions${p.best.url ? ` (<a href="${esc(p.best.url)}" style="color:#18181b;">open</a>)` : ''}</p>`).join('');
  const app = process.env.FRONTEND_URL || 'https://www.velosapps.com';
  return `
    <p style="margin:0 0 20px;font-size:16px;line-height:26px;color:#52525b;font-weight:500;">Your week on ${esc(report.name)}, ${report.from.toDateString()} to ${report.to.toDateString()}.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;text-align:left;">
      <tr>${['', 'Published', 'Waiting', 'Rejected', 'Review score', 'Mode'].map((h) => `<th style="${cell}font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">${h}</th>`).join('')}</tr>
      ${rows}
    </table>
    ${best ? `<p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;font-weight:600;">What worked</p>${best}` : ''}
    <p style="margin:16px 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Next week</p>
    <ul style="margin:0 0 24px;padding-left:18px;font-size:14px;color:#3f3f46;line-height:1.6;">${report.nextWeek.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <p style="margin:0;font-size:14px;"><a href="${esc(app)}/autopilot/${esc(report.autopilotId)}" style="color:#18181b;font-weight:600;">Open your autopilot</a></p>`;
}

/**
 * Hourly: autopilots that are switched on somewhere, whose last report is a week old, and where it is now Monday
 * morning (08:00-12:00) in their timezone. Claimed before sending, so each goes out once.
 */
async function sendDue(now = new Date()) {
  const EmailService = require('./EmailService');
  const email = new EmailService();
  const active = await AutopilotConfig.distinct('autopilotId', { enabled: true });
  let sent = 0;
  for (const ap of await Autopilot.find({ autopilotId: { $in: active }, archived: false }).select('autopilotId userId timezone lastReportAt').lean()) {
    const tz = isValidTimeZone(ap.timezone) ? ap.timezone : 'Asia/Kolkata';
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const minutes = minutesOfDayInZone(now, tz);
    if (weekday !== 'Mon' || minutes < 8 * 60 || minutes >= 12 * 60) continue;
    const claimed = await Autopilot.findOneAndUpdate(
      { autopilotId: ap.autopilotId, $or: [{ lastReportAt: null }, { lastReportAt: { $lt: new Date(now.getTime() - 6.5 * 86400e3) } }] },
      { $set: { lastReportAt: now } },
    );
    if (!claimed) continue;
    const report = await build(ap.autopilotId, now);
    if (!report?.platforms.length) continue;
    const to = await email.getUserEmail(ap.userId);
    if (!to) continue;
    await email.sendEmail(to, `Your week on ${report.name}`, email.wrapInTemplate(`Your week on ${report.name} - Velos`, html(report))).catch((err) => console.error('❌ [REPORT] Email failed:', err.message));
    sent += 1;
  }
  return sent;
}

module.exports = { build, changes, html, sendDue };
