import React, { useEffect, useState } from 'react';
import { autopilotAPI } from '../../lib/api';

const NAME = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X' };
const KIND = { question: 'Question', praise: 'Praise', feedback: 'Feedback', complaint: 'Complaint', other: 'Comment' };

/**
 * The weekly report (backend functions/WeeklyReport.js): what went out in the last 7 days, what worked, and what the
 * autopilot changes next week because of it. The same report is emailed on Monday mornings.
 */
export function WeeklyReport({ userId, autopilotId }) {
  const [report, setReport] = useState(null);
  useEffect(() => {
    autopilotAPI.getReport(userId, autopilotId).then((d) => d?.success && setReport(d.report)).catch(() => {});
  }, [userId, autopilotId]);
  if (!report?.platforms?.length) return null;
  const total = report.platforms.reduce((a, p) => a + p.published, 0);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">This week</h2>
        <span className="text-xs text-zinc-500">{new Date(report.from).toLocaleDateString()} – {new Date(report.to).toLocaleDateString()} · emailed Mondays</span>
      </div>
      <div className="rounded-xl border border-zinc-800/60 bg-[#141416] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800/70">
              {['', 'Published', 'Waiting', 'Rejected', 'Review score', 'Interactions', 'Mode'].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.platforms.map((p) => (
              <tr key={p.platform} className="border-b border-zinc-800/40 last:border-0 text-zinc-300">
                <td className="px-4 py-2.5 font-medium text-white">{NAME[p.platform]}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.published}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.waiting}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.rejected}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.averageScore ?? '–'}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.interactions}</td>
                <td className="px-4 py-2.5">{p.trust.mode === 'autopilot' ? <span className="text-emerald-300">Autopilot</span> : `Supervised ${p.trust.streak}/5`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-4 border-t border-zinc-800/70 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">What worked</p>
            {report.platforms.some((p) => p.best) ? report.platforms.filter((p) => p.best).map((p) => (
              <p key={p.platform} className="text-xs text-zinc-400 mb-1.5">
                <span className="text-zinc-200">{NAME[p.platform]}:</span> “{p.best.caption}” · {p.best.interactions} interactions
                {p.best.url && <a href={p.best.url} target="_blank" rel="noreferrer" className="ml-1 underline hover:text-white">open</a>}
              </p>
            )) : <p className="text-xs text-zinc-500">{total ? 'No engagement reported yet for this week’s posts.' : 'Nothing published this week.'}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Next week</p>
            <ul className="space-y-1">
              {report.nextWeek.map((c, i) => <li key={i} className="text-xs text-zinc-300">{c}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Replies Velos drafted to comments on the autopilot's Instagram posts (backend functions/ReplyDrafts.js). Each is
 * sent only when the user sends it, as drafted or edited.
 */
export function ReplyDrafts({ userId, autopilotId }) {
  const [replies, setReplies] = useState([]);
  const [text, setText] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const load = () => autopilotAPI.getReplies(userId, autopilotId).then((d) => {
    if (d?.success) {
      setReplies(d.replies || []);
      setText(Object.fromEntries((d.replies || []).map((r) => [r.replyId, r.draft])));
    }
  }).catch(() => {});
  useEffect(() => { load(); }, [userId, autopilotId]);

  const act = async (r, fn) => {
    setBusy(r.replyId);
    setError('');
    const d = await fn().catch((e) => ({ error: e.message }));
    setBusy(null);
    if (!d?.success) setError(d?.error || 'Something went wrong');
    load();
  };

  if (!replies.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Replies to approve</h2>
        <p className="text-xs text-zinc-500">Drafted from your site’s facts for new comments on Instagram. Nothing is posted until you send it.</p>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {replies.map((r) => (
        <div key={r.replyId} className="rounded-xl border border-zinc-800/60 bg-[#141416] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">{KIND[r.kind] || 'Comment'}</span>
            <span className="text-zinc-500">@{r.commentAuthor} on “{(r.postCaption || '').slice(0, 60)}…”</span>
          </div>
          <p className="text-sm text-zinc-200">“{r.commentText}”</p>
          {r.note && <p className="text-xs text-amber-300/90">Check first: {r.note}</p>}
          {r.error && <p className="text-xs text-red-300">Last try failed: {r.error}</p>}
          <textarea
            value={text[r.replyId] ?? ''}
            onChange={(e) => setText((t) => ({ ...t, [r.replyId]: e.target.value }))}
            rows={2}
            className="w-full resize-y rounded-lg border border-zinc-800 bg-[#0e0e10] p-3 text-sm text-white"
          />
          <div className="flex gap-2">
            <button onClick={() => act(r, () => autopilotAPI.sendReply(userId, r.replyId, text[r.replyId]))} disabled={busy === r.replyId || !text[r.replyId]?.trim()} className="rounded-lg bg-white text-black px-3 py-1.5 text-xs font-bold disabled:opacity-40">
              {busy === r.replyId ? 'Sending…' : 'Send reply'}
            </button>
            <button onClick={() => act(r, () => autopilotAPI.dismissReply(userId, r.replyId))} disabled={busy === r.replyId} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-white">
              Don’t reply
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
