import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import { autopilotAPI } from '../lib/api';
import { getUserId } from '../lib/velosStorage';

const { FiChevronLeft, FiGlobe, FiCalendar, FiCheck, FiExternalLink, FiPlay } = FiIcons;

/*
 * "Your first week": paste your website, get seven ready posts and one product video, made from your own site,
 * before connecting any account (backend functions/Preview.js). Then put them in the approval queue.
 */

const PLATFORM = {
  instagram: { label: 'Instagram', glyph: 'IG', color: 'from-pink-500 to-orange-400' },
  linkedin: { label: 'LinkedIn', glyph: 'in', color: 'from-sky-600 to-blue-700' },
  twitter: { label: 'X', glyph: 'X', color: 'from-zinc-600 to-zinc-800' },
};
const FORMAT = { text: 'Text post', thread: 'Thread', image: 'Product shot', carousel: 'Carousel', reel: 'Product video' };
const DAYS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
const STEPS = [
  ['reading', 'Reading your site'],
  ['writing', 'Writing your week'],
  ['imaging', 'Making images from your site'],
  ['done', 'Ready'],
];

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

export default function FirstWeekPage() {
  const navigate = useNavigate();
  const userId = getUserId();
  const [sidebar, setSidebar] = useState(false);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(undefined); // undefined: loading, null: none yet
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(null);
  const timer = useRef(null);

  const load = async (id) => {
    const d = id ? await autopilotAPI.getPreview(userId, id) : await autopilotAPI.latestPreview(userId);
    if (d?.success) setPreview(d.preview || null);
    return d?.preview;
  };

  useEffect(() => {
    if (!userId) { navigate('/login'); return; }
    load().catch(() => setPreview(null));
    return () => clearTimeout(timer.current);
  }, [userId]);

  // Poll while anything is still being made (the video takes a few minutes longer than the posts).
  useEffect(() => {
    clearTimeout(timer.current);
    const pending = preview && (preview.status !== 'done' && preview.status !== 'failed' || preview.video?.status === 'running');
    if (pending) timer.current = setTimeout(() => load(preview.previewId), 4000);
  }, [preview]);

  const start = async () => {
    setBusy(true);
    setError('');
    setUsed(null);
    const d = await autopilotAPI.startPreview(userId, url.trim()).catch((e) => ({ error: e.message }));
    setBusy(false);
    if (d.success) await load(d.previewId);
    else setError(d.error || 'Could not start');
  };

  const useWeek = async () => {
    setBusy(true);
    const d = await autopilotAPI.usePreview(userId, preview.previewId).catch((e) => ({ error: e.message }));
    setBusy(false);
    if (d.success) {
      setUsed(d);
      load(preview.previewId);
    } else setError(d.error || 'Could not schedule');
  };

  const making = preview && preview.status !== 'done' && preview.status !== 'failed';
  const stepIndex = preview ? STEPS.findIndex(([s]) => s === preview.status) : -1;

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <Sidebar isOpen={sidebar} onMouseEnter={() => setSidebar(true)} onMouseLeave={() => setSidebar(false)} />
      <div className="fixed top-0 left-0 w-4 h-full z-40" onMouseEnter={() => setSidebar(true)} />
      <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/autopilot')} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
            <span className="text-sm font-medium">Autopilot</span>
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <SafeIcon icon={FiCalendar} className="w-4 h-4 text-emerald-400" />
          <h1 className="text-lg font-bold">Your first week</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">A week of posts from your own website</h2>
            <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
              Velos reads your site, writes seven posts for Instagram, LinkedIn and X from what it says, makes the images from your real
              screens, and records a product video. No account needed to see them.
            </p>
          </div>
          <div className="flex gap-2 max-w-2xl">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#0e0e10] px-3">
              <SafeIcon icon={FiGlobe} className="w-4 h-4 text-zinc-500" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && url.trim() && !making && start()}
                placeholder="yourcompany.com"
                className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-600"
              />
            </div>
            <button
              onClick={start}
              disabled={busy || making || !url.trim()}
              className="rounded-lg bg-white text-black px-4 py-2 text-sm font-bold disabled:opacity-40"
            >
              {making ? 'Making your week…' : 'Make my week'}
            </button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </section>

        {preview === undefined && <p className="text-sm text-zinc-500">Loading…</p>}

        {preview && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-sm text-zinc-300">
                <span className="font-semibold text-white">{preview.company || hostOf(preview.url)}</span>
                {preview.factsRead ? <span className="text-zinc-500"> · {preview.factsRead} facts read from {hostOf(preview.url)}</span> : null}
              </p>
              {making && (
                <ol className="flex items-center gap-3 text-xs">
                  {STEPS.map(([key, label], i) => (
                    <li key={key} className={`flex items-center gap-1.5 ${i < stepIndex ? 'text-emerald-400' : i === stepIndex ? 'text-white' : 'text-zinc-600'}`}>
                      {i < stepIndex ? <SafeIcon icon={FiCheck} className="w-3.5 h-3.5" /> : <span className={`w-1.5 h-1.5 rounded-full ${i === stepIndex ? 'bg-white animate-pulse' : 'bg-zinc-700'}`} />}
                      {label}
                    </li>
                  ))}
                </ol>
              )}
              {preview.status === 'failed' && <p className="text-sm text-red-300">{preview.error || 'Something went wrong. Try again tomorrow or with another address.'}</p>}
            </div>

            {preview.posts?.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
                {[...preview.posts].sort((a, b) => a.day - b.day).map((post) => (
                  <PostCard key={post.day} post={post} video={post.format === 'reel' ? preview.video : null} imaging={preview.status === 'imaging'} />
                ))}
              </div>
            )}

            {preview.status === 'done' && (
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm font-semibold">Post this week</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    The posts go to your approval queue, one a day from tomorrow, for the accounts you have connected. Nothing goes out until you approve it.
                  </p>
                  {used && (
                    <p className="text-xs mt-2 text-emerald-300">
                      {used.queued} post{used.queued === 1 ? '' : 's'} added to your queue.
                      {used.skipped?.length ? ` Connect ${used.skipped.map((p) => PLATFORM[p]?.label || p).join(' and ')} in Settings, then add the rest.` : ''}
                    </p>
                  )}
                </div>
                <button onClick={useWeek} disabled={busy} className="rounded-lg bg-emerald-500 text-black px-4 py-2 text-sm font-bold disabled:opacity-40">
                  Add to my approval queue
                </button>
                <button onClick={() => navigate('/settings')} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:text-white">
                  Connect accounts
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function PostCard({ post, video, imaging }) {
  const p = PLATFORM[post.platform];
  const [open, setOpen] = useState(false);
  const text = post.threadParts?.length ? post.threadParts : [post.caption];
  return (
    <article className="rounded-xl border border-zinc-800/70 bg-[#141416] overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/70">
        <span className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.color} flex items-center justify-center text-[11px] font-bold`}>{p.glyph}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{p.label} · {FORMAT[post.format]}</p>
          <p className="text-[11px] text-zinc-500">{DAYS[post.day - 1]}{post.queuedPostId ? ' · in your queue' : ''}</p>
        </div>
        {typeof post.review?.score === 'number' && (
          <span
            title={post.review.verdict || 'Score from the review, which a different model than the writer does'}
            className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium ${post.review.score >= 75 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}
          >
            Review {post.review.score}
          </span>
        )}
      </div>

      <Media post={post} video={video} imaging={imaging} />

      <div className="px-4 py-3 space-y-2 flex-1">
        {text.map((t, i) => (
          <p key={i} className={`text-sm text-zinc-300 whitespace-pre-line ${open ? '' : 'line-clamp-4'}`}>
            {text.length > 1 ? <span className="text-zinc-600 mr-1">{i + 1}/</span> : null}{t}
          </p>
        ))}
        {post.hashtags && open && <p className="text-xs text-sky-300/80">{post.hashtags}</p>}
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-500 hover:text-white">{open ? 'Less' : 'Read all'}</button>
      </div>

      {post.fact && (
        <div className="px-4 py-2.5 border-t border-zinc-800/70 text-[11px] text-zinc-500 leading-snug">
          Built on: “{post.fact}”
          {post.factSource && (
            <a href={post.factSource} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-zinc-400 hover:text-white">
              {new URL(post.factSource).pathname === '/' ? hostOf(post.factSource) : new URL(post.factSource).pathname}
              <SafeIcon icon={FiExternalLink} className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function Media({ post, video, imaging }) {
  if (post.format === 'reel') {
    if (video?.url) return <video src={video.url} poster={video.thumb || undefined} controls playsInline className="w-full aspect-[9/16] max-h-[520px] bg-black object-contain" />;
    return (
      <div className="aspect-[9/16] max-h-[520px] bg-[#0e0e10] flex flex-col items-center justify-center gap-2 text-xs text-zinc-500">
        <SafeIcon icon={FiPlay} className="w-5 h-5" />
        {video?.status === 'failed' ? 'The video could not be made this time' : `Recording your product video… ${video?.activity || ''}`}
      </div>
    );
  }
  if (!post.imageUrls?.length) {
    if (post.format === 'text' || post.format === 'thread') return null;
    return <div className="aspect-[4/3] bg-[#0e0e10] flex items-center justify-center text-xs text-zinc-500">{imaging ? 'Making the image from your site…' : 'No image'}</div>;
  }
  if (post.imageUrls.length === 1) return <img src={post.imageUrls[0]} alt="" className="w-full bg-black" />;
  return (
    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory bg-black p-2">
      {post.imageUrls.map((u, i) => (
        <img key={i} src={u} alt={`Slide ${i + 1}`} className="h-72 w-auto rounded-md snap-start shrink-0" />
      ))}
    </div>
  );
}
