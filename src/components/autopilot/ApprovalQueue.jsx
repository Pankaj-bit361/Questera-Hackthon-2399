import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { autopilotAPI } from '../../lib/api';

// Why a post was rejected; the autopilot's planner and writer read these (backend TrustLadder.REJECT_REASONS).
const REJECT_REASONS = [
  ['inaccurate', 'Not true'],
  ['off_brand', 'Off-brand'],
  ['generic', 'Too generic'],
  ['repetitive', 'Repeats itself'],
  ['bad_visual', 'Bad image or video'],
  ['wrong_timing', 'Wrong timing'],
  ['other', 'Something else'],
];
const SOURCE_LABEL = { campaign: 'Campaign', live: 'Live generation' };

const when = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Review queue for autopilot-generated posts.
 *
 * Autopilot writes posts with status 'pending_approval'; the publishing cron
 * only ever picks up 'scheduled', so nothing here can go live until it is
 * approved - by the user, or, once the autopilot has earned trust, by its
 * hold running out (autoApproveAt; backend functions/TrustLadder.js).
 */
const ApprovalQueue = ({ userId, autopilotId, platform, onDecision }) => {
  const [posts, setPosts] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [published, setPublished] = useState({}); // postId -> permalink
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState({});
  const [rejecting, setRejecting] = useState({}); // postId -> { reason, note }
  const [error, setError] = useState('');

  useEffect(() => {
    if (userId) loadQueue();
  }, [userId, autopilotId, platform]);

  const loadQueue = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, up] = await Promise.all([
        autopilotAPI.getQueue(userId, { autopilotId, platform }),
        autopilotAPI.getQueue(userId, { autopilotId, platform, status: 'scheduled' }).catch(() => ({})),
      ]);
      if (up?.success) setUpcoming(up.posts || []);
      if (data.success) {
        setPosts(data.posts || []);
        setEditing(
          Object.fromEntries(
            (data.posts || []).map((p) => [
              p.postId,
              {
                caption: p.caption || '',
                hashtags: p.hashtags || '',
                scheduledAt: p.scheduledAt,
                threadParts: p.threadParts || [],
              },
            ])
          )
        );
      } else {
        setError(data.error || 'Could not load the queue');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const patch = (postId, field, value) =>
    setEditing((prev) => ({ ...prev, [postId]: { ...prev[postId], [field]: value } }));

  // Edit one post within a thread. threadParts[0] and `caption` are kept in
  // sync because the backend mirrors the opener into caption for list views.
  const patchThreadPart = (postId, index, value) =>
    setEditing((prev) => {
      const parts = [...(prev[postId]?.threadParts || [])];
      parts[index] = value;
      return {
        ...prev,
        [postId]: {
          ...prev[postId],
          threadParts: parts,
          ...(index === 0 ? { caption: value } : {}),
        },
      };
    });

  const isDirty = (post) => {
    const edit = editing[post.postId];
    if (!edit) return false;
    return (
      edit.caption !== (post.caption || '') ||
      edit.hashtags !== (post.hashtags || '') ||
      JSON.stringify(edit.threadParts || []) !== JSON.stringify(post.threadParts || []) ||
      new Date(edit.scheduledAt).getTime() !== new Date(post.scheduledAt).getTime()
    );
  };

  const run = async (postId, fn) => {
    setBusyId(postId);
    setError('');
    try {
      const data = await fn();
      if (!data.success) setError(data.error || 'Something went wrong');
      return data;
    } catch (err) {
      setError(err.message);
      return { success: false };
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = (post) =>
    run(post.postId, () => autopilotAPI.updateQueuedPost(post.postId, editing[post.postId])).then(loadQueue);

  const handleApprove = async (post) => {
    // Save pending edits first so the approved post carries them.
    if (isDirty(post)) {
      const saved = await run(post.postId, () =>
        autopilotAPI.updateQueuedPost(post.postId, editing[post.postId])
      );
      if (!saved.success) return;
    }
    await run(post.postId, () => autopilotAPI.approvePost(post.postId));
    loadQueue();
    onDecision?.();
  };

  const handlePublishNow = async (post) => {
    if (!window.confirm('Publish this post right now?')) return;
    // Carry unsaved edits so what goes out is what you see.
    if (isDirty(post)) {
      const saved = await run(post.postId, () => autopilotAPI.updateQueuedPost(post.postId, editing[post.postId]));
      if (!saved.success) return;
    }
    const data = await run(post.postId, () => autopilotAPI.publishNow(post.postId));
    if (data.success) setPublished((prev) => ({ ...prev, [post.postId]: data.permalink || true }));
    loadQueue();
  };

  // Rejecting asks why: the reason goes to the planner and writer so the next post avoids it.
  const startReject = (post) => setRejecting((prev) => ({ ...prev, [post.postId]: { reason: '', note: '' } }));
  const cancelReject = (post) => setRejecting((prev) => {
    const next = { ...prev };
    delete next[post.postId];
    return next;
  });
  const handleReject = async (post) => {
    const r = rejecting[post.postId];
    if (!r?.reason) return;
    const data = await run(post.postId, () => autopilotAPI.rejectPost(post.postId, r.reason, r.note));
    if (data.success) cancelReject(post);
    loadQueue();
    onDecision?.();
  };

  const rejectPanel = (post) => {
    const r = rejecting[post.postId];
    if (!r) return null;
    return (
      <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-3">
        <p className="mb-2 text-xs font-medium text-gray-300">What is wrong with it? The autopilot learns from this.</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REJECT_REASONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRejecting((prev) => ({ ...prev, [post.postId]: { ...r, reason: key } }))}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${r.reason === key ? 'border-red-500 bg-red-950/50 text-red-200' : 'border-gray-700 text-gray-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={r.note}
          onChange={(e) => setRejecting((prev) => ({ ...prev, [post.postId]: { ...r, note: e.target.value } }))}
          placeholder="Optional: say what to do instead"
          maxLength={500}
          className="mb-2 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-600"
        />
        <div className="flex gap-2">
          <button
            onClick={() => handleReject(post)}
            disabled={!r.reason || busyId === post.postId}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-40"
          >
            {post.status === 'scheduled' ? 'Cancel post' : 'Reject post'}
          </button>
          <button onClick={() => cancelReject(post)} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-white">
            Keep it
          </button>
        </div>
      </div>
    );
  };

  // The agent fixes the post from its own review notes - no prompt needed.
  const handleFix = async (post, withInstructions = false) => {
    let instructions;
    if (withInstructions) {
      instructions = window.prompt('Anything specific you want changed? (optional)');
      if (instructions === null) return;
    }
    await run(post.postId, () => autopilotAPI.fixPost(post.postId, instructions || undefined));
    loadQueue();
  };

  const toLocalInput = (value) => {
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Caption limits per platform. These mirror agent/PlatformDefaults.js on the
  // backend - X in particular is 280, not the Instagram default, and getting
  // that wrong lets an over-length post reach a publisher that will reject it.
  const CAPTION_LIMITS = { linkedin: 3000, twitter: 280, instagram: 2200 };

  // X wraps every URL in t.co and counts it as 23 characters whatever its
  // real length; count the same way or a valid link post looks over-limit.
  const xLength = (text, platform) =>
    platform === 'twitter'
      ? [...(text || '').replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length
      : [...(text || '')].length;

  const charCount = (post) => {
    const edit = editing[post.postId] || {};
    // Count code points, not UTF-16 units, so emoji are not double-counted.
    const total = xLength(edit.caption, post.platform) + (edit.hashtags ? [...edit.hashtags].length + 2 : 0);
    const max = CAPTION_LIMITS[post.platform] ?? 2200;
    return { total, max, over: total > max };
  };

  // Nothing pending is the normal state - stay out of the way entirely
  // rather than occupying the page with an empty panel.
  if (loading || (posts.length === 0 && upcoming.length === 0 && !error)) return null;

  return (
    <div className="space-y-8">
      {Object.keys(published).length > 0 && (
        <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-200">
          Published {Object.keys(published).length} post{Object.keys(published).length === 1 ? '' : 's'} just now
          {Object.values(published).filter((v) => typeof v === 'string').map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="ml-2 underline">open</a>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Scheduled</h2>
            <p className="text-sm text-gray-400">{upcoming.length} post{upcoming.length === 1 ? '' : 's'} approved and waiting for their slot. Post now to skip the wait.</p>
          </div>
          {upcoming.map((post) => (
            <div key={post.postId} className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex gap-3 items-start">
              {(post.imageUrl || post.videoUrl) && (
                post.videoUrl
                  ? <video src={post.videoUrl} className="w-20 h-20 rounded-lg object-cover border border-gray-800" muted />
                  : <img src={post.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-800" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="rounded bg-gray-800 px-2 py-0.5 uppercase tracking-wide text-gray-400">{post.platform}</span>
                  <span className="rounded bg-gray-800 px-2 py-0.5 text-gray-400">{post.postType}</span>
                  {typeof post.review?.score === 'number' && <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-emerald-300">Review {post.review.score}/100</span>}
                  <span className="text-gray-500">· {when(post.scheduledAt)}</span>
                </div>
                <p className="text-sm text-gray-300 line-clamp-2">{post.threadParts?.[0] || post.caption}</p>
                {rejectPanel(post)}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => handlePublishNow(post)}
                  disabled={busyId === post.postId}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-40"
                >
                  {busyId === post.postId ? 'Posting…' : 'Post now'}
                </button>
                <button
                  onClick={() => startReject(post)}
                  disabled={busyId === post.postId}
                  className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {posts.length > 0 && (
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Waiting for your approval</h2>
          <p className="text-sm text-gray-400">
            {(() => {
              const held = posts.filter((p) => p.autoApproveAt).length;
              const count = `${posts.length} post${posts.length === 1 ? '' : 's'}`;
              return held
                ? `${count}. ${held} will publish on ${held === 1 ? 'its' : 'their'} own when the hold ends unless you reject ${held === 1 ? 'it' : 'them'}; the rest wait for you.`
                : `${count}. Nothing here goes out until you approve it.`;
            })()}
          </p>
        </div>
        <button
          onClick={loadQueue}
          className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-400 transition hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">{error}</div>
      )}

      <AnimatePresence>
        {posts.map((post) => {
          const edit = editing[post.postId] || {};
          const count = charCount(post);
          const busy = busyId === post.postId;
          const isThread = post.postType === 'thread' && (edit.threadParts?.length || 0) > 0;
          // For a thread, "over limit" means ANY part is over - approving on
          // the opener alone would let a long part through to the publisher.
          const anyOver = isThread
            ? edit.threadParts.some((p) => xLength(p, post.platform) > count.max)
            : count.over;

          return (
            <motion.div
              key={post.postId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4"
            >
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span className="rounded bg-gray-800 px-2 py-0.5 uppercase tracking-wide text-gray-400">
                  {post.platform}
                </span>
                <span className="rounded bg-gray-800 px-2 py-0.5 text-gray-400">{post.postType}</span>
                {typeof post.review?.score === 'number' && (
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${post.review.score >= 75 ? 'bg-emerald-900/50 text-emerald-300' : post.review.score >= 50 ? 'bg-amber-900/50 text-amber-300' : 'bg-red-900/50 text-red-300'}`}
                    title={post.review.verdict}
                  >
                    Review {post.review.score}/100
                  </span>
                )}
                {SOURCE_LABEL[post.source] && (
                  <span className="rounded bg-gray-800 px-2 py-0.5 text-gray-400">{SOURCE_LABEL[post.source]}</span>
                )}
              </div>
              {post.autoApproveAt && (
                <div className="mb-3 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs text-emerald-200">
                  Publishes on its own after {when(post.autoApproveAt)} (the hold before an autopilot post goes out). Reject it to stop it; approve it to skip the wait.
                </div>
              )}
              {(post.review?.ruleIssues?.length > 0 || post.review?.issues?.length > 0) && (
                <div className="mb-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200">
                  <p className="font-medium mb-1">What the checks found</p>
                  <ul className="space-y-0.5">
                    {(post.review.ruleIssues || []).map((i, k) => <li key={`r${k}`}>• {i}</li>)}
                    {(post.review.issues || []).map((i, k) => <li key={k}>• {i}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-4 md:flex-row">
                {(post.imageUrl || post.videoUrl) && (
                  <div className="md:w-56 md:shrink-0">
                    {post.videoUrl ? (
                      <video src={post.videoUrl} controls className="w-full rounded-lg border border-gray-800" />
                    ) : (
                      <img
                        src={post.imageUrl}
                        alt=""
                        className="w-full rounded-lg border border-gray-800 object-cover"
                      />
                    )}
                    {post.imageUrls?.length > 1 && (
                      <p className="mt-1 text-center text-xs text-gray-600">
                        +{post.imageUrls.length - 1} more image{post.imageUrls.length > 2 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex-1 space-y-3">
                  <div>
                    {isThread ? (
                      <>
                        <label className="mb-1 block text-xs font-medium text-gray-400">
                          Thread &middot; {edit.threadParts.length} posts
                        </label>
                        <div className="space-y-2">
                          {edit.threadParts.map((part, i) => {
                            const partLen = xLength(part, post.platform);
                            const partOver = partLen > count.max;
                            return (
                              <div key={i} className="flex gap-2">
                                <span className="mt-3 w-5 shrink-0 text-right text-xs text-gray-600">
                                  {i + 1}
                                </span>
                                <div className="flex-1">
                                  <textarea
                                    value={part}
                                    onChange={(e) => patchThreadPart(post.postId, i, e.target.value)}
                                    rows={3}
                                    className={`w-full resize-y rounded-lg border bg-gray-950 p-3 text-sm text-white ${
                                      partOver ? 'border-red-800' : 'border-gray-800'
                                    }`}
                                  />
                                  <p className={`mt-0.5 text-xs ${partOver ? 'text-red-400' : 'text-gray-600'}`}>
                                    {partLen} / {count.max}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="mb-1 block text-xs font-medium text-gray-400">Caption</label>
                        <textarea
                          value={edit.caption ?? ''}
                          onChange={(e) => patch(post.postId, 'caption', e.target.value)}
                          rows={6}
                          className="w-full resize-y rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-white"
                        />
                        <p className={`mt-1 text-xs ${count.over ? 'text-red-400' : 'text-gray-600'}`}>
                          {count.total} / {count.max} characters
                        </p>
                      </>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={isThread ? 'hidden' : ''}>
                      <label className="mb-1 block text-xs font-medium text-gray-400">Hashtags</label>
                      <input
                        value={edit.hashtags ?? ''}
                        onChange={(e) => patch(post.postId, 'hashtags', e.target.value)}
                        className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-400">Publish at</label>
                      <input
                        type="datetime-local"
                        value={edit.scheduledAt ? toLocalInput(edit.scheduledAt) : ''}
                        onChange={(e) => patch(post.postId, 'scheduledAt', new Date(e.target.value).toISOString())}
                        className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(post)}
                      disabled={busy || anyOver}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-500 disabled:opacity-40"
                    >
                      {busy ? 'Working…' : isDirty(post) ? 'Save & approve' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handlePublishNow(post)}
                      disabled={busy || anyOver}
                      className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/40 disabled:opacity-40"
                    >
                      Post now
                    </button>
                    {isDirty(post) && (
                      <button
                        onClick={() => handleSave(post)}
                        disabled={busy}
                        className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-40"
                      >
                        Save draft
                      </button>
                    )}
                    {!post.videoUrl && (
                      <span className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
                        <button
                          onClick={() => handleFix(post)}
                          disabled={busy}
                          title="The agent rewrites the copy or re-renders the image from its own review notes, then re-scores it"
                          className="px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-40"
                        >
                          {busy ? 'Fixing…' : post.imageUrl ? 'Let the agent fix the image' : 'Let the agent rewrite it'}
                        </button>
                        <button
                          onClick={() => handleFix(post, true)}
                          disabled={busy}
                          title="Same, with a note from you"
                          className="border-l border-gray-700 px-2 text-xs text-gray-500 hover:text-white disabled:opacity-40"
                        >
                          + note
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => startReject(post)}
                      disabled={busy || !!rejecting[post.postId]}
                      className="rounded-lg px-4 py-2 text-sm text-gray-500 transition hover:text-red-400 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                  {rejectPanel(post)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      </div>
      )}
    </div>
  );
};

export default ApprovalQueue;
