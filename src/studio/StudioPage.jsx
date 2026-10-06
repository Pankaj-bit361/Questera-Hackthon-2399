import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bot, Check, ChevronDown, Download, Globe, KeyRound, Loader2, Lock, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { fileUrl, request } from './api';
import { SCENE_NAMES, fieldsFor, getPath, setPath } from './scenes';
import GuidedJob from './GuidedJob';

/* Studio: paste a website, get a finished product video. New videos are guided (GuidedJob.jsx): Studio reads the site,
   then asks about style, the video, the screens and the storyboard before opening the editor. Videos made before the
   guided flow, and those the autopilot makes, open in JobView. Jobs are listed on the left; ?job=<id> deep-links one. */

const FORMATS = [
  { id: 'launch', label: 'Launch film', size: '16:9', length: '~35 s', ratio: 16 / 9, blurb: 'Your product’s story, from promise to sign-up.' },
  { id: 'walkthrough', label: 'Walkthrough', size: '16:9', length: '~30 s', ratio: 16 / 9, blurb: 'Step by step through your real screens.' },
  { id: 'teaser', label: 'Vertical teaser', size: '9:16', length: '~25 s', ratio: 9 / 16, blurb: 'For Reels, Shorts and TikTok.' },
  { id: 'square', label: 'Square ad', size: '1:1', length: '~18 s', ratio: 1, blurb: 'For feeds and paid social.' },
];
const formatOf = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];
const busy = (job) => job && (job.status === 'queued' || job.status === 'running');
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function StudioPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('job');
  const [jobs, setJobs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { jobs } = await request('/jobs');
      setJobs(jobs);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = jobs.find((j) => j.id === selectedId) || null;

  // Poll while the selected job (or any job) is running.
  const running = jobs.some(busy);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      try {
        const target = jobs.find(busy);
        const { job } = await request(`/jobs/${target.id}`);
        setJobs((all) => all.map((j) => (j.id === job.id ? job : j)));
      } catch {
        /* keep the last state; next tick retries */
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [running, jobs]);

  const select = (id) => setParams(id ? { job: id } : {});
  const upsert = (job) => setJobs((all) => [job, ...all.filter((j) => j.id !== job.id)]);

  return (
    <div className="min-h-[100dvh] bg-[#0c0d0f] text-zinc-100">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[#0c0d0f]/90 px-4 backdrop-blur md:px-6">
        <button onClick={() => navigate('/home')} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Back to Velos">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-[15px] font-semibold tracking-tight">Studio</span>
        <span className="rounded-full bg-lime-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lime-300">Beta</span>
        <span className="flex-1" />
        {selected ? (
          <button onClick={() => select(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[13px] font-medium text-zinc-200 hover:bg-white/10">
            <Plus className="h-3.5 w-3.5" /> New video
          </button>
        ) : null}
      </header>

      {selected?.guided && selected.stage === 'editor' && selected.storyboard ? (
        <GuidedJob key={selected.id} job={selected} onChange={upsert} onDeleted={() => { setJobs((all) => all.filter((j) => j.id !== selected.id)); select(null); }} />
      ) : (
        <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <History jobs={jobs} loaded={loaded} selectedId={selectedId} onSelect={select} />
          <main className="min-w-0">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {selected?.guided ? (
              <GuidedJob key={selected.id} job={selected} onChange={upsert} onDeleted={() => { setJobs((all) => all.filter((j) => j.id !== selected.id)); select(null); }} />
            ) : selected ? (
              <JobView key={selected.id} job={selected} onChange={upsert} onDeleted={() => { setJobs((all) => all.filter((j) => j.id !== selected.id)); select(null); }} />
            ) : (
              <NewVideo
                disabled={running}
                onCreated={(job) => {
                  upsert(job);
                  select(job.id);
                }}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// ─── history ─────────────────────────────────────────────────────────────

const PLATFORM = { instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X', tiktok: 'TikTok' };
const GUIDED_STAGE = { reading: 'Reading the site', style: 'Waiting for your answers', storyboard: 'Storyboard', editor: 'In the editor' };

function History({ jobs, loaded, selectedId, onSelect }) {
  if (!loaded) return <aside className="hidden lg:block" />;
  return (
    <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your videos</p>
      {jobs.length === 0 ? <p className="px-2 text-[13px] text-zinc-500">Nothing yet. Your first set will appear here.</p> : null}
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
        {jobs.map((job) => {
          const thumb = job.videos.find((v) => v.thumb);
          return (
            <li key={job.id} className="shrink-0 lg:shrink">
              <button onClick={() => onSelect(job.id)} className={`flex w-60 items-center gap-3 rounded-xl p-2 text-left transition-colors lg:w-full ${job.id === selectedId ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                <span className="relative grid h-10 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06]">
                  {thumb ? <img src={fileUrl(job, `videos/${thumb.thumb}`)} alt="" className="h-full w-full object-cover" /> : <Globe className="h-4 w-4 text-zinc-500" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-zinc-100">{job.brand?.name || host(job.url)}</span>
                  <span className="block truncate text-[12px] text-zinc-500">
                    {busy(job) ? job.activity : job.status === 'failed' ? 'Stopped' : job.source === 'autopilot' ? `Autopilot · ${PLATFORM[job.platform] || 'post'}` : job.guided ? GUIDED_STAGE[job.stage] || '' : `${job.videos.length} video${job.videos.length === 1 ? '' : 's'}`}
                  </span>
                </span>
                {busy(job) ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-lime-300" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ─── a new video ─────────────────────────────────────────────────────────

function NewVideo({ onCreated, disabled }) {
  const [url, setUrl] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [login, setLogin] = useState({ loginUrl: '', email: '', password: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!url.trim()) return setError('Enter your website address.');
    setSending(true);
    try {
      const body = { url: url.trim(), guided: true };
      if (showLogin && (login.email || login.password)) body.login = { ...login, loginUrl: login.loginUrl.trim() || undefined };
      const { job } = await request('/jobs', 'POST', body);
      setLogin({ loginUrl: '', email: '', password: '' });
      onCreated(job);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl pt-6 text-center md:pt-16">
      <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] md:text-[52px]">
        Your product, <span className="text-lime-300">in motion.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-zinc-400">
        Paste your website. Studio reads your brand, your copy and your real screens, asks a few questions, and writes a storyboard you can edit by chatting. Every frame previews live, with music and sound.
      </p>

      <div className="mt-9 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#141518] p-2 pl-4 text-left shadow-2xl shadow-black/40 focus-within:border-lime-300/50">
        <Globe className="h-5 w-5 shrink-0 text-zinc-500" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourproduct.com" inputMode="url" autoComplete="url" className="min-w-0 flex-1 bg-transparent py-2 text-[17px] text-white placeholder:text-zinc-600 focus:outline-none" aria-label="Website address" />
        <button type="submit" disabled={sending || disabled} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-[14px] font-semibold text-black hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Start <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#141518] text-left">
        <button type="button" onClick={() => setShowLogin((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={showLogin}>
          <KeyRound className="h-4 w-4 text-zinc-400" />
          <span className="flex-1">
            <span className="block text-[13px] font-medium text-white">Show the inside of your product</span>
            <span className="block text-[12px] text-zinc-500">Optional. Sign in once so Studio can film your real app screens. You can also add this later.</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${showLogin ? 'rotate-180' : ''}`} />
        </button>
        {showLogin ? (
          <div className="grid gap-3 border-t border-white/[0.06] px-4 pb-4 pt-3 md:grid-cols-3">
            <Field label="Login page (optional)" value={login.loginUrl} onChange={(v) => setLogin((l) => ({ ...l, loginUrl: v }))} placeholder="app.yourproduct.com/login" />
            <Field label="Email" value={login.email} onChange={(v) => setLogin((l) => ({ ...l, email: v }))} autoComplete="off" />
            <Field label="Password" type="password" value={login.password} onChange={(v) => setLogin((l) => ({ ...l, password: v }))} autoComplete="new-password" />
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-500 md:col-span-3">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Used once to capture screens, then discarded: never saved or logged. Email addresses on screen are hidden in the video. Use a demo account; two-factor sign-in isn’t supported yet.
            </p>
          </div>
        ) : null}
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {disabled ? <Notice>Studio is busy with your last video. Start the next when it’s done.</Notice> : null}

      <ol className="mx-auto mt-10 grid max-w-xl grid-cols-2 gap-2 text-left text-[12px] text-zinc-500 sm:grid-cols-4">
        {['Style from your site', 'A few questions', 'Your real screens', 'Storyboard, then chat'].map((t, i) => (
          <li key={t} className="rounded-xl border border-white/[0.06] px-3 py-2.5">
            <span className="block text-[11px] font-semibold text-lime-300/80">0{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
    </form>
  );
}

function Field({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-zinc-400">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0f1012] px-3 py-2 text-[14px] text-white placeholder:text-zinc-600 focus:border-lime-300/50 focus:outline-none" {...rest} />
    </label>
  );
}

function Notice({ tone, children }) {
  return <p className={`mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed ${tone === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-white/[0.04] text-zinc-300'}`}>{children}</p>;
}

// ─── a job ───────────────────────────────────────────────────────────────

function JobView({ job, onChange, onDeleted }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const retry = async () => {
    try {
      onChange((await request(`/jobs/${job.id}/retry`, 'POST', {})).job);
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete these videos? This can’t be undone.')) return;
    try {
      await request(`/jobs/${job.id}`, 'DELETE');
      onDeleted();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] font-semibold tracking-[-0.02em]">{job.brand?.name || host(job.url)}</h1>
          <a href={job.url} target="_blank" rel="noreferrer" className="text-[13px] text-zinc-500 hover:text-zinc-300">
            {host(job.url)}
          </a>
        </div>
        {job.status === 'failed' ? (
          <button onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-[13px] font-medium hover:bg-white/10">
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </button>
        ) : null}
        {!busy(job) ? (
          <button onClick={remove} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-red-300" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {job.source === 'autopilot' ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" />
          <div className="min-w-0 text-[13px] leading-[1.5] text-zinc-400">
            <p className="text-zinc-100">Made by autopilot for {PLATFORM[job.platform] || 'a scheduled post'}</p>
            {job.angle ? <p>About: {job.angle}</p> : null}
            <p>It's in your post queue with its caption; approve or edit it there.</p>
          </div>
        </div>
      ) : null}
      {job.whatsNew?.length ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-lime-300/20 bg-lime-300/[0.04] p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" />
          <div className="min-w-0 text-[13px] leading-[1.5] text-zinc-400">
            <p className="text-zinc-100">New on the site since the last video</p>
            <ul className="mt-1 list-disc pl-4">
              {job.whatsNew.map((h) => (
                <li key={h} className="first-letter:uppercase">{h}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {job.status !== 'done' ? <Steps job={job} /> : null}
      {job.error ? <Notice tone="error">{job.error}</Notice> : null}
      {job.warning ? <Notice>{job.warning}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {job.videos.length ? (
        <div className="mt-6 grid items-start gap-5 md:grid-cols-2">
          {job.videos.map((v) => (
            <VideoCard key={v.id} job={job} video={v} onEdit={() => setEditing(v)} />
          ))}
        </div>
      ) : null}

      {job.brand ? <BrandKit job={job} /> : null}

      {editing ? <EditDrawer job={job} video={editing} onClose={() => setEditing(null)} onSaved={(j) => { onChange(j); setEditing(null); }} /> : null}
    </div>
  );
}

function Steps({ job }) {
  return (
    <ol className="mt-6 grid gap-2 rounded-2xl border border-white/10 bg-[#141518] p-4 md:grid-cols-3">
      {job.steps.map((s) => (
        <li key={s.id} className="flex items-center gap-3">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${s.status === 'done' ? 'bg-lime-300 text-black' : s.status === 'active' ? 'bg-lime-300/15 text-lime-300' : s.status === 'failed' ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.06] text-zinc-500'}`}>
            {s.status === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.status === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : s.status === 'failed' ? <X className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <span className="min-w-0">
            <span className={`block text-[13px] font-medium ${s.status === 'pending' ? 'text-zinc-500' : 'text-zinc-100'}`}>{s.label}</span>
            {s.status === 'active' ? <span className="block truncate text-[12px] text-zinc-500">{job.activity}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function VideoCard({ job, video, onEdit }) {
  const f = formatOf(video.format);
  const ready = video.status === 'done' && video.file;
  const working = !ready && (video.status === 'checking' || video.status === 'rendering' || video.status === 'pending');
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#141518]">
      <div className="grid place-items-center bg-black/40 p-3" style={{ minHeight: 240 }}>
        <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${f.ratio}`, maxWidth: f.ratio < 1 ? 230 : f.ratio === 1 ? 320 : '100%' }}>
          {ready ? (
            <video key={video.file} src={fileUrl(job, `videos/${video.file}`)} poster={video.thumb ? fileUrl(job, `videos/${video.thumb}`) : undefined} controls playsInline preload="metadata" className="h-full w-full" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-center">
              {working ? (
                <span className="px-4">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-lime-300" />
                  <span className="mt-3 block text-[13px] text-zinc-300">{video.status === 'rendering' ? `Rendering · ${video.progress || 0}%` : video.status === 'checking' ? 'Checking every scene' : 'Waiting'}</span>
                  {video.status === 'rendering' ? (
                    <span className="mx-auto mt-3 block h-1 w-32 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full bg-lime-300 transition-[width]" style={{ width: `${video.progress || 0}%` }} />
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-[13px] text-red-300">This video didn’t render.</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{video.label}</span>
          <span className="block text-[12px] text-zinc-500">
            {f.size}
            {video.duration ? ` · ${Math.round(video.duration)} s` : ''}
            {video.fixes?.length ? ` · ${video.fixes.length} fix${video.fixes.length === 1 ? '' : 'es'} after checking` : ''}
          </span>
        </span>
        {ready ? (
          <>
            <button onClick={onEdit} disabled={busy(job)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[13px] font-medium hover:bg-white/10 disabled:opacity-40">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <a href={fileUrl(job, `videos/${video.file}`, `${(job.brand?.name || 'video').replace(/[^\w-]+/g, '-')}-${video.format}.mp4`)} download className="inline-flex items-center gap-1.5 rounded-lg bg-lime-300 px-3 py-1.5 text-[13px] font-semibold text-black hover:bg-lime-200">
              <Download className="h-3.5 w-3.5" /> MP4
            </a>
          </>
        ) : null}
      </div>
    </article>
  );
}

function BrandKit({ job }) {
  const b = job.brand;
  const swatches = useMemo(() => (b.palette ? [['Background', b.palette.bg], ['Text', b.palette.ink], ['Accent', b.palette.accent], ['Stage', b.palette.stage]] : []), [b]);
  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-[#141518] p-5">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[13px] font-semibold text-zinc-300">Brand kit Studio found</p>
        {b.signedIn ? <span className="rounded-full bg-lime-300/10 px-2 py-0.5 text-[11px] font-medium text-lime-300">Includes your product screens</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <span className="grid h-14 min-w-14 place-items-center rounded-xl px-3" style={{ background: b.palette?.bg }}>
          {b.logo ? <img src={fileUrl(job, b.logo)} alt="Logo" className="max-h-8 max-w-[140px]" /> : <span className="text-[18px] font-bold" style={{ color: b.palette?.accent }}>{b.logoText || b.name}</span>}
        </span>
        <div className="flex gap-3">
          {swatches.map(([label, color]) => (
            <span key={label} className="text-center">
              <span className="block h-9 w-9 rounded-lg border border-white/10" style={{ background: color }} />
              <span className="mt-1 block text-[10px] text-zinc-500">{label}</span>
            </span>
          ))}
        </div>
        <div className="text-[12px] leading-relaxed text-zinc-400">
          <span className="block">
            Headlines: <span className="text-zinc-200">{b.fonts?.display || 'Inter'}</span>
          </span>
          <span className="block">
            Text: <span className="text-zinc-200">{b.fonts?.body || b.fonts?.display || 'Inter'}</span>
          </span>
        </div>
      </div>
      {b.screens?.length ? (
        <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
          {b.screens.map((s) => (
            <img key={s.id} src={fileUrl(job, s.thumb)} alt={`${s.page || ''} screen`} className="h-24 shrink-0 rounded-lg border border-white/10 object-cover object-top" style={{ width: s.kind === 'mobile' ? 54 : 150 }} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─── editing a video's words ─────────────────────────────────────────────

function EditDrawer({ job, video, onClose, onSaved }) {
  const [scenes, setScenes] = useState(() => structuredClone(video.plan.scenes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (i, key, value, list) => setScenes((all) => all.map((s, j) => (j === i ? setPath(s, key, list ? value.split('\n').map((l) => l.trim()).filter(Boolean) : value) : s)));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const clean = scenes.map(({ progress, step, ...s }) => s);
      onSaved((await request(`/jobs/${job.id}/videos/${video.id}/edit`, 'POST', { scenes: clean })).job);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={`Edit ${video.label}`} onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#111214]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Edit the {video.label.toLowerCase()}</span>
            <span className="block text-[12px] text-zinc-500">Change any words, then render again. Screens and timing stay the same.</span>
          </span>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {scenes.map((scene, i) => (
            <section key={i}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {i + 1}. {SCENE_NAMES[scene.type]}
              </p>
              <div className="mt-2 space-y-2">
                {fieldsFor(scene).map((field) => {
                  const value = getPath(scene, field.key);
                  const text = field.list ? (value || []).join('\n') : value || '';
                  return (
                    <label key={field.key} className="block">
                      <span className="text-[12px] text-zinc-400">{field.label}</span>
                      {field.list || field.long ? (
                        <textarea value={text} rows={field.list ? Math.max(3, (value || []).length) : 2} onChange={(e) => update(i, field.key, e.target.value, field.list)} className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-[#0c0d0f] px-3 py-2 text-[14px] text-white focus:border-lime-300/50 focus:outline-none" />
                      ) : (
                        <input value={text} onChange={(e) => update(i, field.key, e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0f] px-3 py-2 text-[14px] text-white focus:border-lime-300/50 focus:outline-none" />
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="border-t border-white/[0.06] px-5 py-4">
          {error ? <p className="mb-3 text-[13px] text-red-300">{error}</p> : null}
          <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-[14px] font-semibold text-black hover:bg-lime-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save and render again
          </button>
        </div>
      </div>
    </div>
  );
}
