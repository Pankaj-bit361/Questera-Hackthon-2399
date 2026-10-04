import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Download, ImagePlus, KeyRound, Loader2, Lock, MessageSquare, Music2, Pause, Play, Plus, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { audioBase, fileUrl, request, upload } from './api';
import { SceneFrame, VideoPlayer, timeline, useBrand, useCapturedBrand } from './Preview';
import { SCENE_NAMES, fieldsFor, getPath, setPath } from './scenes';

/* A guided Studio video, the way a motion designer would run it: Studio reads the site, then asks before each step.
     Style (the brand kit it found, editable) → Questions (what to make, sizes, length) → Product screens → Storyboard
     (every frame is the real video, rendered live) → Editor (chat on the left, the video playing on the right) → Export.
   The server keeps the job's stage; the three questions before the storyboard are answered here and sent together. */

const SIZES = [
  { id: '16:9', label: 'Landscape', hint: 'Website, YouTube, LinkedIn', ratio: 16 / 9 },
  { id: '9:16', label: 'Vertical', hint: 'Reels, Shorts, TikTok', ratio: 9 / 16 },
  { id: '1:1', label: 'Square', hint: 'Feeds and ads', ratio: 1 },
  { id: '4:5', label: 'Portrait', hint: 'Instagram and LinkedIn feeds', ratio: 4 / 5 },
];
const SUGGESTIONS = ['Add a warm voiceover', 'Make the animation more dynamic', 'Compose a new upbeat track', 'Shorten the opening line', 'Use a darker background', 'Show the product sooner'];

const busy = (job) => job.status === 'queued' || job.status === 'running';
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fontFamily = (role, font) => (font?.files?.[0] ? `'Brand${role}${font.files[0].file.replace(/[^A-Za-z0-9]/g, '')}', Inter, sans-serif` : 'Inter, sans-serif');
const allScreens = (job) => (job.brand?.screens || []).map((s) => s.id);
const strip = (scenes) => scenes.map(({ progress, step, ...s }) => s);

export default function GuidedJob({ job, onChange, onDeleted }) {
  const raw = useCapturedBrand(job);
  const [kit, setKit] = useState(job.kit);
  const [brief, setBrief] = useState(() => job.brief || { option: job.options?.[0]?.id || '', custom: '', sizes: ['16:9', '9:16'], length: 'standard' });
  const [screens, setScreens] = useState(() => job.screens || allScreens(job));
  const [step, setStep] = useState('style');
  const [scenes, setScenes] = useState(() => job.storyboard?.scenes || []);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // The server's copy wins whenever it changes (a new capture, a written storyboard, a chat edit).
  useEffect(() => setKit(job.kit), [JSON.stringify(job.kit)]);
  useEffect(() => setScenes(job.storyboard?.scenes || []), [JSON.stringify(job.storyboard?.scenes)]);
  useEffect(() => {
    if (!brief.option && job.options?.length) setBrief((b) => ({ ...b, option: job.options[0].id }));
  }, [job.options]);
  // Screens that appear later (a sign-in, an upload) start picked; the user's other choices stay as they are.
  const seen = useRef(new Set(allScreens(job)));
  useEffect(() => {
    const fresh = allScreens(job).filter((id) => !seen.current.has(id));
    fresh.forEach((id) => seen.current.add(id));
    if (fresh.length) setScreens((s) => [...new Set([...fresh, ...s])]);
  }, [job.brand?.screens?.length]);

  const brand = useBrand(job, raw, kit);
  const track = (job.tracks || []).find((t) => t.id === kit?.music)?.file;
  const plan = useMemo(() => (job.storyboard ? { ...job.storyboard, scenes, pace: kit?.rhythm, music: kit?.music, motion: kit?.motion, track } : null), [job.storyboard, scenes, kit?.rhythm, kit?.music, kit?.motion, track]);

  // While a track is being composed, check back every few seconds; when it lands, it becomes the video's music.
  useEffect(() => {
    if (!job.composing) return undefined;
    const timer = setInterval(async () => {
      try {
        onChange((await request(`/jobs/${job.id}`)).job);
      } catch {
        /* the next tick retries */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [job.composing?.n, job.id]);
  const tracksSeen = useRef((job.tracks || []).length);
  useEffect(() => {
    const list = job.tracks || [];
    if (list.length > tracksSeen.current) setKit((k) => ({ ...k, music: list.at(-1).id }));
    tracksSeen.current = list.length;
  }, [job.tracks?.length]);

  const call = async (path, method, body) => {
    setSending(true);
    setError('');
    try {
      const r = await request(`/jobs/${job.id}${path}`, method, body);
      if (r?.job) onChange(r.job);
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setSending(false);
    }
  };
  const actions = {
    storyboard: () => call('/storyboard', 'POST', { kit, brief, screens }),
    create: async () => {
      const r = await call('/storyboard', 'PUT', { scenes: strip(scenes), kit });
      if (r && kit.voice && kit.voice !== 'off') await call('/voice', 'POST', { kit });
      return r;
    },
    save: () => call('/storyboard', 'PUT', { scenes: strip(scenes), kit }),
    chat: (message) => call('/chat', 'POST', { message, scenes: strip(scenes), kit }),
    export: () => call('/export', 'POST', { scenes: strip(scenes), kit }),
    signin: (login) => call('/signin', 'POST', { login }),
    retry: () => call('/retry', 'POST', {}),
    compose: (description) => call('/music', 'POST', { description }),
    voice: () => call('/voice', 'POST', { kit, scenes: strip(scenes) }),
    upload: async (files) => {
      setSending(true);
      setError('');
      try {
        for (const file of files) {
          const r = await upload(`/jobs/${job.id}/screens`, file);
          onChange(r.job);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setSending(false);
      }
    },
  };
  const remove = async () => {
    if (!window.confirm('Delete this video? This can’t be undone.')) return;
    try {
      await request(`/jobs/${job.id}`, 'DELETE');
      onDeleted();
    } catch (e) {
      setError(e.message);
    }
  };

  const shared = { job, raw, brand, kit, setKit, brief, setBrief, screens, setScreens, plan, scenes, setScenes, actions, sending, error };
  if (job.stage === 'editor' && job.storyboard) return <Editor {...shared} onDelete={remove} />;
  return <Flow {...shared} step={step} setStep={setStep} onDelete={remove} />;
}

// ─── the steps before the editor ─────────────────────────────────────────

function Flow({ job, raw, brand, kit, setKit, brief, setBrief, screens, setScreens, plan, scenes, setScenes, actions, sending, error, step, setStep, onDelete }) {
  const reading = job.stage === 'reading' || (busy(job) && job.step === 'capture');
  const past = job.stage === 'storyboard';
  const order = ['style', 'brief', 'screens'];
  const at = past ? 3 : order.indexOf(step);
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [step, job.stage, Boolean(job.storyboard)]);

  return (
    <div className="mx-auto max-w-[760px] pb-24">
      <div className="flex items-center justify-end gap-2">
        {!busy(job) ? (
          <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-red-300" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[14px] font-medium text-black">
          Make a video for {host(job.url)}
          {job.withLogin ? <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[11px]">with product login</span> : null}
        </p>
      </div>

      <Work job={job} />
      {job.status === 'failed' ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-[13px] text-red-200">
          <p>{job.error}</p>
          <button onClick={actions.retry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15">
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : null}

      {!reading && job.kit ? (
        <>
          <StyleCard job={job} raw={raw} brand={brand} kit={kit} setKit={setKit} open={!past && step === 'style'} onOpen={past ? null : () => setStep('style')} onDone={() => setStep('brief')} onCompose={actions.compose} />
          {at >= 1 ? <BriefCard job={job} brief={brief} setBrief={setBrief} open={!past && step === 'brief'} onOpen={past ? null : () => setStep('brief')} onDone={() => setStep('screens')} /> : null}
          {at >= 2 ? (
            <ScreensCard job={job} screens={screens} setScreens={setScreens} open={!past && step === 'screens'} onOpen={past ? null : () => setStep('screens')} onDone={actions.storyboard} onSignin={actions.signin} onUpload={actions.upload} sending={sending} />
          ) : null}
        </>
      ) : null}
      {busy(job) && job.stage !== 'reading' && job.step === 'capture' ? <Thinking text={job.activity || 'Reading your site again'} /> : null}

      {past ? <StoryboardCard job={job} plan={plan} scenes={scenes} setScenes={setScenes} brand={brand} raw={raw} brief={brief} kit={kit} onCreate={actions.create} onRetry={actions.storyboard} sending={sending} /> : null}

      {error ? <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-[13px] text-red-300">{error}</p> : null}
      <div ref={end} />
    </div>
  );
}

function Work({ job }) {
  const capture = job.steps.find((s) => s.id === 'capture');
  const screens = job.brand?.screens?.length || 0;
  if (capture?.status === 'done' && job.stage !== 'reading') {
    return (
      <p className="mt-6 flex items-center gap-2 text-[12px] text-zinc-500">
        <Check className="h-3.5 w-3.5 text-lime-300" /> Read {host(job.url)} · {screens} screen{screens === 1 ? '' : 's'}
        {job.brand?.signedIn ? ' · signed in' : ''}
      </p>
    );
  }
  if (job.status === 'failed') return null;
  return <Thinking text={job.activity || 'Reading your site'} />;
}

function Thinking({ text }) {
  return (
    <div className="mt-6 flex items-center gap-3 text-[13px] text-zinc-400">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
      {text}
    </div>
  );
}

/** A step in the conversation: open while it's the user's turn, a one-line summary once answered. */
function Card({ title, summary, open, onOpen, children, footer }) {
  if (!open) {
    return (
      <button type="button" onClick={onOpen || undefined} disabled={!onOpen} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#141518] px-4 py-3 text-left enabled:hover:border-white/20">
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
        <span className="text-[14px] font-semibold text-zinc-100">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[12px] text-zinc-500">{summary}</span>
      </button>
    );
  }
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#141518]">
      <p className="border-b border-white/[0.06] px-5 py-3.5 text-[14px] font-semibold text-zinc-100">{title}</p>
      <div className="px-5 py-5">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-5 py-3.5">{footer}</div> : null}
    </section>
  );
}

function Primary({ children, ...rest }) {
  return (
    <button {...rest} className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2 text-[14px] font-semibold text-black transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40">
      {children}
    </button>
  );
}

function Label({ children, hint }) {
  return (
    <p className="mb-2 text-[12px] font-medium text-zinc-400">
      {children}
      {hint ? <span className="font-normal text-zinc-600"> · {hint}</span> : null}
    </p>
  );
}

// ─── style ───────────────────────────────────────────────────────────────

// The Style preview: a title card (the dark stage, logo colours) and a close-up on a real screen (page colours, text).
const sampleScenes = (kit, raw) => [
  { type: 'title', kicker: 'Style preview', headline: kit?.name || 'Your product', accent: [] },
  raw?.shots?.[0] ? { type: 'focus', shot: raw.shots[0].id, title: kit?.name || 'Your product', body: 'Your real screens, in your colours.', click: false } : { type: 'end', headline: kit?.name || 'Your product', cta: 'Get started' },
];

export function StyleCard({ job, raw, brand, kit, setKit, open, onOpen, onDone, compact, onCompose }) {
  if (!kit) return null;
  const set = (patch) => setKit((k) => ({ ...k, ...patch }));
  const summary = (
    <span className="inline-flex items-center gap-1.5">
      {['bg', 'ink', 'accent'].map((c) => (
        <span key={c} className="inline-block h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: kit.colors[c] }} />
      ))}
      <span className="ml-1">{kit.name}</span>
    </span>
  );
  const fonts = raw?.fonts || {};
  const differentFonts = fonts.body && fonts.display && fonts.body.files?.[0]?.file !== fonts.display.files?.[0]?.file;
  const samplePlan = { format: 'launch', title: 'Style', scenes: sampleScenes(kit, raw), pace: kit.rhythm, music: kit.music, motion: kit.motion };

  return (
    <Card title="Style" summary={summary} open={open} onOpen={onOpen} footer={onDone ? <Primary onClick={onDone}>Looks good</Primary> : null}>
      <div className={`grid gap-6 ${compact ? '' : 'md:grid-cols-[minmax(0,1fr)_240px]'}`}>
        <div className="space-y-5">
          <label className="block">
            <Label>Company name</Label>
            <input value={kit.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-[#0f1012] px-3 py-2 text-[14px] text-white focus:border-lime-300/50 focus:outline-none" />
          </label>

          <div>
            <Label>Logo</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['logo', 'Logo', job.brand?.logo],
                ['icon', 'Icon + name', job.brand?.icon],
                ['text', 'Name only', true],
              ]
                .filter(([, , ok]) => ok)
                .map(([id, label, file]) => (
                  <button key={id} type="button" onClick={() => set({ logo: id })} aria-pressed={kit.logo === id} className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 ${kit.logo === id ? 'border-lime-300/70 ring-1 ring-lime-300/40' : 'border-white/10 hover:border-white/20'}`} style={{ background: kit.colors.bg }}>
                    <span className="flex max-w-full items-center gap-1.5 overflow-hidden">
                      {id !== 'text' && typeof file === 'string' ? <img src={fileUrl(job, file)} alt="" className={id === 'icon' ? 'h-6 w-6 object-contain' : 'max-h-7 max-w-[110px] object-contain'} /> : null}
                      {id !== 'logo' ? (
                        <span className="truncate text-[14px] font-bold" style={{ color: id === 'text' ? kit.colors.accent : kit.colors.ink, fontFamily: fontFamily(kit.heading, fonts[kit.heading]) }}>
                          {kit.name}
                        </span>
                      ) : null}
                    </span>
                    <span className="rounded-full bg-black/50 px-1.5 text-[10px] text-zinc-200">{label}</span>
                  </button>
                ))}
            </div>
          </div>

          <div>
            <Label hint="from your site">Headline font</Label>
            <div className="grid grid-cols-2 gap-2">
              {(differentFonts ? ['display', 'body'] : ['display']).map((role) => (
                <button key={role} type="button" onClick={() => set({ heading: role })} aria-pressed={kit.heading === role} className={`rounded-xl border bg-[#0f1012] px-3 py-3 text-left ${kit.heading === role ? 'border-lime-300/70' : 'border-white/10 hover:border-white/20'}`}>
                  <span className="block truncate text-[22px] font-extrabold leading-tight text-white" style={{ fontFamily: fontFamily(role, fonts[role]) }}>
                    {kit.name || 'Aa'}
                  </span>
                  <span className="mt-1 block text-[11px] text-zinc-500">{fonts[role]?.family || 'Inter'}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Colours</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['bg', 'Background'],
                ['ink', 'Text'],
                ['accent', 'Accent'],
              ].map(([key, label]) => (
                <label key={key} className="block cursor-pointer">
                  <span className="relative block h-12 overflow-hidden rounded-xl border border-white/15" style={{ background: kit.colors[key] }}>
                    <input type="color" value={kit.colors[key]} onChange={(e) => set({ colors: { ...kit.colors, [key]: e.target.value } })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} />
                  </span>
                  <span className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-mono uppercase text-zinc-500">{kit.colors[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Rhythm</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['fluid', 'Swift and fluid', 'Scenes breathe'],
                ['snappy', 'Snappy and punchy', 'A beat shorter each'],
              ].map(([id, label, hint]) => (
                <button key={id} type="button" onClick={() => set({ rhythm: id })} aria-pressed={kit.rhythm === id} className={`rounded-xl border px-3 py-2.5 text-left ${kit.rhythm === id ? 'border-lime-300/70 bg-lime-300/[0.06]' : 'border-white/10 bg-[#0f1012] hover:border-white/20'}`}>
                  <span className="block text-[13px] font-medium text-white">{label}</span>
                  <span className="block text-[11px] text-zinc-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label hint="how one scene hands over to the next">Motion</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['smooth', 'Smooth', 'Soft ease and lift'],
                ['dynamic', 'Dynamic', 'Slides and colour wipes'],
                ['clean', 'Clean', 'Simple crossfades'],
              ].map(([id, label, hint]) => (
                <button key={id} type="button" onClick={() => set({ motion: id })} aria-pressed={(kit.motion || 'smooth') === id} className={`rounded-xl border px-3 py-2.5 text-left ${(kit.motion || 'smooth') === id ? 'border-lime-300/70 bg-lime-300/[0.06]' : 'border-white/10 bg-[#0f1012] hover:border-white/20'}`}>
                  <span className="block text-[13px] font-medium text-white">{label}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label hint="written from your site, voiced by Gemini">Voiceover</Label>
            <div className="grid grid-cols-4 gap-2">
              {VOICES.map(([id, label, hint]) => (
                <button key={id} type="button" onClick={() => set({ voice: id })} aria-pressed={(kit.voice || 'off') === id} className={`rounded-xl border px-2.5 py-2 text-left ${(kit.voice || 'off') === id ? 'border-lime-300/70 bg-lime-300/[0.06]' : 'border-white/10 bg-[#0f1012] hover:border-white/20'}`}>
                  <span className="block truncate text-[13px] font-medium text-white">{label}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <Sound job={job} value={kit.music || 'pulse'} onChange={(music) => set({ music })} onCompose={onCompose} />
        </div>

        {!compact ? (
          <div className="space-y-2">
            <Label>Preview</Label>
            {sampleScenes(kit, raw).map((s, i) => (
              <SceneFrame key={i} plan={samplePlan} scene={s} brand={brand} size="16:9" className="rounded-lg border border-white/10" />
            ))}
            <p className="text-[11px] leading-relaxed text-zinc-600">Live frames of your video, with these settings.</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

const VOICES = [
  ['off', 'None', 'Music only'],
  ['Charon', 'Charon', 'Informative'],
  ['Kore', 'Kore', 'Firm'],
  ['Puck', 'Puck', 'Upbeat'],
  ['Sulafat', 'Sulafat', 'Warm'],
  ['Aoede', 'Aoede', 'Breezy'],
  ['Iapetus', 'Iapetus', 'Clear'],
];

const MOODS = [
  { id: 'pulse', label: 'Pulse', hint: 'Upbeat electronic' },
  { id: 'calm', label: 'Calm', hint: 'Warm, unhurried keys' },
  { id: 'drive', label: 'Drive', hint: 'Energetic, four on the floor' },
  { id: 'minimal', label: 'Minimal', hint: 'Sparse and precise' },
];
const moodFile = (id) => `${audioBase}/${id === 'pulse' ? '' : `music/${id}/`}main.wav`;

/**
 * The music: four original scores, plus tracks composed for this video from the user's words (Google Lyria, aligned to
 * the same 120 bpm grid). Every option can be heard before it is picked.
 */
function Sound({ job, value, onChange, onCompose }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(null);
  const [describe, setDescribe] = useState('');
  useEffect(() => () => audio.current?.pause(), []);
  const listen = (id, src) => {
    audio.current?.pause();
    if (playing === id) return setPlaying(null);
    audio.current = new Audio(src);
    audio.current.volume = 0.6;
    audio.current.onended = () => setPlaying(null);
    audio.current.play().catch(() => setPlaying(null));
    setPlaying(id);
  };
  const options = [
    ...MOODS.map((m) => ({ ...m, src: moodFile(m.id) })),
    ...(job.tracks || []).map((t, i) => ({ id: t.id, label: `Composed ${i + 1}`, hint: t.description || 'Composed for this video', src: fileUrl(job, `capture/${t.file}`), composed: true })),
  ];
  const working = Boolean(job.composing);
  return (
    <div>
      <Label hint="cuts land on the beat, mastered for social">Music</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((m) => (
          <div key={m.id} className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${value === m.id ? 'border-lime-300/70 bg-lime-300/[0.06]' : 'border-white/10 bg-[#0f1012]'}`}>
            <button type="button" onClick={() => listen(m.id, m.src)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15" aria-label={playing === m.id ? `Stop ${m.label}` : `Play ${m.label}`}>
              {playing === m.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button type="button" onClick={() => onChange(m.id)} aria-pressed={value === m.id} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-white">
                {m.composed ? <Sparkles className="h-3 w-3 text-lime-300" /> : null}
                {m.label}
                {value === m.id ? <Music2 className="h-3 w-3 text-lime-300" /> : null}
              </span>
              <span className="block truncate text-[11px] text-zinc-500">{m.hint}</span>
            </button>
          </div>
        ))}
      </div>
      {onCompose ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!working) onCompose(describe.trim());
          }}
          className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-[#0f1012] px-2.5 py-2"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-lime-300" />
          <input value={describe} onChange={(e) => setDescribe(e.target.value)} maxLength={300} disabled={working} placeholder={working ? 'Composing your track… about a minute' : 'Compose a track: e.g. warm lo-fi with soft piano'} className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-zinc-600 focus:outline-none" />
          <button type="submit" disabled={working || (job.tracks || []).length >= 6} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-white/15 disabled:opacity-50">
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {working ? 'Composing' : 'Compose'}
          </button>
        </form>
      ) : null}
      {job.musicError ? <p className="mt-1.5 text-[11px] text-red-300">{job.musicError}</p> : null}
      {onCompose ? <p className="mt-1.5 text-[11px] text-zinc-600">Composed with Google’s Lyria at 120 bpm, then lined up so every cut lands on the beat.</p> : null}
    </div>
  );
}

// ─── questions ───────────────────────────────────────────────────────────

function BriefCard({ job, brief, setBrief, open, onOpen, onDone }) {
  const options = job.options || [];
  const option = options.find((o) => o.id === brief.option);
  const walkthrough = option?.kind === 'walkthrough';
  const other = brief.option === 'other';
  const toggleSize = (id) => setBrief((b) => ({ ...b, sizes: b.sizes.includes(id) ? b.sizes.filter((s) => s !== id) : [...b.sizes, id] }));
  const ready = (option || (other && brief.custom.trim())) && brief.sizes.length;
  const summary = `${other ? 'Your brief' : option?.title || ''} · ${brief.sizes.join(', ')}${walkthrough ? '' : ` · ${brief.length === 'short' ? 'Short' : 'Standard'}`}`;
  return (
    <Card title="Questions" summary={summary} open={open} onOpen={onOpen} footer={<Primary onClick={onDone} disabled={!ready}>Answer</Primary>}>
      <Label>What kind of video are we making?</Label>
      <div className="space-y-2">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => setBrief((b) => ({ ...b, option: o.id }))} aria-pressed={brief.option === o.id} className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left ${brief.option === o.id ? 'border-lime-300/60 bg-lime-300/[0.05]' : 'border-white/10 bg-[#0f1012] hover:border-white/20'}`}>
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${brief.option === o.id ? 'border-lime-300' : 'border-zinc-600'}`}>{brief.option === o.id ? <span className="h-2 w-2 rounded-full bg-lime-300" /> : null}</span>
            <span>
              <span className="block text-[14px] font-medium text-white">{o.title}</span>
              <span className="block text-[12px] leading-snug text-zinc-500">{o.detail}</span>
            </span>
          </button>
        ))}
        <div className={`rounded-xl border px-3.5 py-2.5 ${other ? 'border-lime-300/60 bg-lime-300/[0.05]' : 'border-white/10 bg-[#0f1012]'}`}>
          <input value={brief.custom} onFocus={() => setBrief((b) => ({ ...b, option: 'other' }))} onChange={(e) => setBrief((b) => ({ ...b, option: 'other', custom: e.target.value }))} maxLength={500} placeholder="Other… describe the video you want" className="w-full bg-transparent text-[14px] text-white placeholder:text-zinc-600 focus:outline-none" />
        </div>
      </div>

      <div className="mt-6">
        <Label hint="one storyboard, laid out for each">Sizes</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIZES.map((s) => {
            const on = brief.sizes.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleSize(s.id)} aria-pressed={on} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${on ? 'border-lime-300/60 bg-lime-300/[0.05]' : 'border-white/10 bg-[#0f1012] hover:border-white/20'}`}>
                <span className={`shrink-0 rounded-[3px] border ${on ? 'border-lime-300' : 'border-zinc-600'}`} style={{ width: s.ratio >= 1 ? 22 : 22 * s.ratio, height: s.ratio >= 1 ? 22 / s.ratio : 22 }} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-white">
                    {s.label} <span className="text-zinc-500">{s.id}</span>
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!walkthrough ? (
        <div className="mt-6">
          <Label>Length</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['short', 'Short', 'About 20 seconds: title, product, two close-ups'],
              ['standard', 'Standard', 'About 35 seconds: the full story to sign-up'],
            ].map(([id, label, hint]) => (
              <button key={id} type="button" onClick={() => setBrief((b) => ({ ...b, length: id }))} aria-pressed={brief.length === id} className={`rounded-xl border px-3 py-2.5 text-left ${brief.length === id ? 'border-lime-300/60 bg-lime-300/[0.05]' : 'border-white/10 bg-[#0f1012] hover:border-white/20'}`}>
                <span className="block text-[13px] font-medium text-white">{label}</span>
                <span className="block text-[11px] text-zinc-500">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ─── product screens ─────────────────────────────────────────────────────

function ScreensCard({ job, screens, setScreens, open, onOpen, onDone, onSignin, onUpload, sending }) {
  const list = job.brand?.screens || [];
  const [login, setLogin] = useState(null);
  const picker = useRef(null);
  const toggle = (id) => setScreens((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const working = busy(job);
  return (
    <Card
      title="Product screens"
      summary={`${screens.length} of ${list.length} picked`}
      open={open}
      onOpen={onOpen}
      footer={
        <Primary onClick={onDone} disabled={!screens.length || sending || working}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Write the storyboard
        </Primary>
      }
    >
      <p className="text-[13px] leading-relaxed text-zinc-400">
        Studio films your real screens, never mock-ups. Pick the ones to show{list.some((s) => s.kind === 'app') ? '; screens from inside your product come first' : ''}.
      </p>
      {job.warning ? <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">{job.warning}</p> : null}
      <div className="mt-4 flex items-center justify-between text-[12px]">
        <span className="text-zinc-500">{screens.length} selected</span>
        <span className="flex gap-3">
          <button type="button" onClick={() => setScreens(list.map((s) => s.id))} className="text-zinc-400 hover:text-white">
            All
          </button>
          <button type="button" onClick={() => setScreens([])} className="text-zinc-400 hover:text-white">
            None
          </button>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((s) => {
          const on = screens.includes(s.id);
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={on} className={`group relative overflow-hidden rounded-xl border text-left ${on ? 'border-lime-300/70' : 'border-white/10 opacity-60 hover:opacity-100'}`}>
              <img src={fileUrl(job, s.thumb)} alt="" className="aspect-[16/10] w-full bg-white/5 object-cover object-top" loading="lazy" />
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-400">
                {s.kind === 'app' ? <span className="rounded bg-lime-300/15 px-1 text-lime-300">In-app</span> : s.kind === 'upload' ? <span className="rounded bg-white/10 px-1 text-zinc-300">Uploaded</span> : null}
                <span className="truncate">{s.title || s.page}</span>
              </span>
              <span className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full ${on ? 'bg-lime-300 text-black' : 'border border-white/40 bg-black/40'}`}>{on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => picker.current?.click()} disabled={sending || working} className="grid min-h-[150px] place-items-center rounded-xl border border-dashed border-white/15 text-center text-zinc-500 hover:border-white/30 hover:text-zinc-300 disabled:opacity-40">
          <span>
            {sending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <ImagePlus className="mx-auto h-5 w-5" />}
            <span className="mt-2 block text-[12px] font-medium">Upload a screenshot</span>
            <span className="block text-[11px] text-zinc-600">PNG, JPEG or WebP, up to 8 MB</span>
          </span>
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...e.target.files];
            e.target.value = '';
            if (files.length) onUpload(files);
          }}
        />
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-[#0f1012]">
        <button type="button" onClick={() => setLogin((l) => (l ? null : { loginUrl: '', email: '', password: '' }))} className="flex w-full items-center gap-3 px-3.5 py-3 text-left" aria-expanded={Boolean(login)}>
          <KeyRound className="h-4 w-4 text-zinc-400" />
          <span className="flex-1">
            <span className="block text-[13px] font-medium text-white">Add screens from inside your product</span>
            <span className="block text-[11px] text-zinc-500">Sign in once with a demo account; Studio films the app itself.</span>
          </span>
        </button>
        {login ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSignin({ ...login, loginUrl: login.loginUrl.trim() || undefined });
              setLogin(null);
            }}
            className="grid gap-3 border-t border-white/[0.06] px-3.5 pb-3.5 pt-3 sm:grid-cols-3"
          >
            {[
              ['loginUrl', 'Login page (optional)', 'text'],
              ['email', 'Email', 'text'],
              ['password', 'Password', 'password'],
            ].map(([key, label, type]) => (
              <label key={key} className="block">
                <span className="text-[11px] text-zinc-500">{label}</span>
                <input type={type} value={login[key]} autoComplete={type === 'password' ? 'new-password' : 'off'} onChange={(e) => setLogin((l) => ({ ...l, [key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0d0f] px-2.5 py-1.5 text-[13px] text-white focus:border-lime-300/50 focus:outline-none" />
              </label>
            ))}
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500 sm:col-span-2">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" /> Used once to film your screens, then discarded: never saved or logged.
            </p>
            <button type="submit" disabled={!login.email || !login.password || working} className="justify-self-end rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/15 disabled:opacity-40">
              Sign in and film
            </button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

// ─── storyboard ──────────────────────────────────────────────────────────

const seconds = (plan) => Math.round(timeline(plan).total / 30);

function StoryboardCard({ job, plan, scenes, setScenes, brand, raw, brief, kit, onCreate, onRetry, sending }) {
  const writing = busy(job) && job.step === 'script';
  if (writing || (!job.storyboard && !job.error)) {
    return (
      <div className="mt-4">
        <Thinking text="Writing the storyboard from your site and screens" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid animate-pulse grid-cols-[200px_1fr] gap-4 rounded-2xl border border-white/[0.06] bg-[#141518] p-4">
              <div className="aspect-video rounded-lg bg-white/[0.05]" />
              <div className="space-y-2">
                <div className="h-3 w-24 rounded bg-white/[0.06]" />
                <div className="h-9 rounded-lg bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!job.storyboard) {
    return (
      <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-[13px] text-red-200">
        {job.error}
        <button onClick={onRetry} className="ml-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15">
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  }
  return (
    <Card
      title="Storyboard"
      summary=""
      open
      footer={
        <>
          <span className="mr-auto text-[12px] text-zinc-500">
            {scenes.length} scenes · about {seconds(plan)} s · {brief.sizes.join(', ')}
          </span>
          <Primary onClick={onCreate} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create video
          </Primary>
        </>
      }
    >
      <SceneList plan={plan} scenes={scenes} setScenes={setScenes} brand={brand} raw={raw} job={job} size={brief.sizes[0]} voiced={kit?.voice && kit.voice !== 'off'} />
    </Card>
  );
}

export function SceneList({ plan, scenes, setScenes, brand, raw, job, size, compact, voiced }) {
  const update = (i, scene) => setScenes((all) => all.map((s, j) => (j === i ? scene : s)));
  const move = (i, d) =>
    setScenes((all) => {
      const next = [...all];
      const j = i + d;
      if (j < 0 || j >= next.length || next[j].type === 'end' || next[i].type === 'end') return all;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i) => setScenes((all) => all.filter((_, j) => j !== i));
  const add = (type) =>
    setScenes((all) => {
      const shot = (job.screens || [])[0] || raw?.shots?.[0]?.id;
      const scene = type === 'focus' ? { type: 'focus', shot, title: 'Add a title', click: false } : { type: 'title', headline: 'Add a headline' };
      const end = all.findIndex((s) => s.type === 'end');
      return end < 0 ? [...all, scene] : [...all.slice(0, end), scene, ...all.slice(end)];
    });
  return (
    <div className="space-y-3">
      {scenes.map((scene, i) => (
        <SceneRow key={`${i}-${scene.type}`} index={i} scene={scene} plan={plan} brand={brand} raw={raw} size={size} compact={compact} voiced={voiced} onChange={(s) => update(i, s)} onMove={(d) => move(i, d)} onRemove={scenes.length > 3 && scene.type !== 'end' ? () => remove(i) : null} />
      ))}
      {scenes.length < 9 ? (
        <div className="flex items-center justify-center gap-2 pt-1 text-[12px]">
          <Plus className="h-3.5 w-3.5 text-zinc-500" />
          <button type="button" onClick={() => add('focus')} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/5 hover:text-white">
            Close-up
          </button>
          <button type="button" onClick={() => add('title')} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/5 hover:text-white">
            Title card
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SceneRow({ index, scene, plan, brand, raw, size, compact, voiced, onChange, onMove, onRemove }) {
  const shots = raw ? raw.shots : [];
  const shot = shots.find((s) => s.id === scene.shot);
  const elements = (shot?.elements || []).filter((e) => e.w >= 60 && e.h >= 24);
  const field = (key, value, list) => onChange(setPath(scene, key, list ? value.split('\n').map((l) => l.trim()).filter(Boolean) : value));
  return (
    <div className={`grid gap-4 rounded-xl border border-white/[0.07] bg-[#0f1012] p-3 ${compact ? '' : 'sm:grid-cols-[220px_minmax(0,1fr)]'}`}>
      <div>
        <SceneFrame plan={plan} scene={scene} brand={brand} size={size} className="rounded-lg border border-white/10" />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-1">
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {index + 1} · {SCENE_NAMES[scene.type]}
          </span>
          {scene.type !== 'end' ? (
            <>
              <IconButton label="Move up" onClick={() => onMove(-1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Move down" onClick={() => onMove(1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
            </>
          ) : null}
          {onRemove ? (
            <IconButton label="Remove scene" onClick={onRemove}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
        </div>
        {fieldsFor(scene).map((f) => {
          const value = getPath(scene, f.key);
          const text = f.list ? (value || []).join('\n') : value || '';
          const cls = 'w-full rounded-lg border border-white/10 bg-[#0c0d0f] px-2.5 py-1.5 text-[13px] text-white focus:border-lime-300/50 focus:outline-none';
          return (
            <label key={f.key} className="block">
              <span className="text-[11px] text-zinc-500">{f.label}</span>
              {f.list || f.long ? <textarea value={text} rows={f.list ? Math.max(2, (value || []).length) : 2} onChange={(e) => field(f.key, e.target.value, f.list)} className={`${cls} mt-0.5 resize-none`} /> : <input value={text} onChange={(e) => field(f.key, e.target.value)} className={`${cls} mt-0.5`} />}
            </label>
          );
        })}
        {voiced ? (
          <label className="block">
            <span className="text-[11px] text-zinc-500">Voiceover line {scene.say ? '' : '· written when you record'}</span>
            <textarea value={scene.say || ''} rows={2} maxLength={220} onChange={(e) => onChange({ ...scene, say: e.target.value || undefined })} placeholder="What the narrator says over this scene" className="mt-0.5 w-full resize-none rounded-lg border border-lime-300/20 bg-[#0c0d0f] px-2.5 py-1.5 text-[13px] text-white placeholder:text-zinc-600 focus:border-lime-300/50 focus:outline-none" />
          </label>
        ) : null}
        {scene.shot !== undefined ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] text-zinc-500">Screen</span>
              <select value={scene.shot} onChange={(e) => onChange({ ...scene, shot: e.target.value, element: undefined, ...(scene.type === 'focus' ? { click: false } : {}) })} className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#0c0d0f] px-2 py-1.5 text-[13px] text-white focus:outline-none">
                {shots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kind === 'app' ? 'In-app · ' : ''}
                    {s.title || s.page || s.id}
                  </option>
                ))}
              </select>
            </label>
            {scene.type === 'focus' ? (
              <label className="block">
                <span className="text-[11px] text-zinc-500">Close-up on</span>
                <select value={scene.element || ''} onChange={(e) => onChange({ ...scene, element: e.target.value || undefined, click: e.target.value ? scene.click : false })} className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#0c0d0f] px-2 py-1.5 text-[13px] text-white focus:outline-none">
                  <option value="">The whole screen</option>
                  {elements.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.role}
                      {e.text ? ` · ${e.text.slice(0, 40)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-white">
      {children}
    </button>
  );
}

// ─── the editor ──────────────────────────────────────────────────────────

function Editor({ job, raw, brand, kit, setKit, brief, plan, scenes, setScenes, actions, sending, error, onDelete }) {
  const sizes = job.brief?.sizes || ['16:9'];
  const [size, setSize] = useState(sizes[0]);
  const [panel, setPanel] = useState(null);
  const [message, setMessage] = useState('');
  const thread = useRef(null);
  const exporting = busy(job);
  const dirty = !same(strip(scenes), strip(job.storyboard.scenes)) || !same(kit, job.kit);
  const option = (job.options || []).find((o) => o.id === job.brief?.option);
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
  }, [job.messages?.length, sending]);

  const send = async (text) => {
    const t = (text ?? message).trim();
    if (!t || sending || exporting) return;
    setMessage('');
    const r = await actions.chat(t);
    if (!r) setMessage(t);
  };

  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:h-[calc(100dvh-56px)] lg:grid-cols-[420px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-white/[0.06] lg:border-r">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-[13px]">
          <span className="text-zinc-500">Brief</span>
          <span className="text-zinc-700">/</span>
          <span className="font-medium text-white">Editor</span>
          <span className="ml-2 truncate text-zinc-500">{kit?.name || host(job.url)}</span>
          <span className="flex-1" />
          {!exporting ? (
            <button onClick={onDelete} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-red-300" aria-label="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div ref={thread} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          <div className="flex justify-end pt-4">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-[13px] font-medium text-black">Make a video for {host(job.url)}</p>
          </div>
          {panel === 'style' ? (
            <StyleCard job={job} raw={raw} brand={brand} kit={kit} setKit={setKit} open onOpen={null} compact onDone={() => setPanel(null)} onCompose={actions.compose} />
          ) : (
            <StyleCard job={job} raw={raw} brand={brand} kit={kit} setKit={setKit} open={false} onOpen={exporting ? null : () => setPanel('style')} />
          )}
          <Card title="Questions" summary={`${option?.title || 'Your brief'} · ${sizes.join(', ')}`} open={false} onOpen={null} />
          <Card title="Product screens" summary={`${job.screens?.length || 0} screens`} open={false} onOpen={null} />
          {panel === 'storyboard' ? (
            <Card title="Storyboard" summary="" open footer={<button onClick={() => setPanel(null)} className="text-[13px] text-zinc-400 hover:text-white">Done</button>}>
              <SceneList plan={plan} scenes={scenes} setScenes={setScenes} brand={brand} raw={raw} job={job} size={size} compact voiced={kit?.voice && kit.voice !== 'off'} />
            </Card>
          ) : (
            <Card title="Storyboard" summary={`${scenes.length} scenes · ${seconds(plan)} s`} open={false} onOpen={exporting ? null : () => setPanel('storyboard')} />
          )}

          {(job.messages || []).map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end pt-3">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.08] px-3.5 py-2 text-[13px] text-zinc-100">{m.text}</p>
              </div>
            ) : (
              <p key={i} className="flex gap-2 pt-3 text-[13px] leading-relaxed text-zinc-300">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-300" />
                {m.text}
              </p>
            ),
          )}
          {sending ? <Thinking text="Working on it" /> : null}
          {error ? <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p> : null}
        </div>

        <div className="border-t border-white/[0.06] p-3">
          {kit?.voice && kit.voice !== 'off' && (job.voiceStale || job.kit?.voice !== kit.voice || dirty) ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-lime-300/[0.06] px-3 py-2 text-[12px] text-zinc-300">
              <span className="flex-1">{job.storyboard.voice?.lines?.length ? 'The voiceover is older than your edits.' : `Voiceover: ${kit.voice}. Studio writes the lines from your site and records them.`}</span>
              <button onClick={actions.voice} disabled={sending || exporting} className="inline-flex items-center gap-1.5 font-medium text-lime-300 hover:text-lime-200 disabled:opacity-40">
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Record
              </button>
            </div>
          ) : null}
          {dirty ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] text-zinc-400">
              <span className="flex-1">You have unsaved edits.</span>
              <button onClick={actions.save} disabled={sending || exporting} className="font-medium text-lime-300 hover:text-lime-200 disabled:opacity-40">
                Save
              </button>
            </div>
          ) : null}
          {!job.messages?.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={sending || exporting} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-white/20 hover:text-white disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 rounded-2xl border border-white/10 bg-[#141518] p-2 focus-within:border-lime-300/40"
          >
            <MessageSquare className="mb-2 ml-1 h-4 w-4 shrink-0 text-zinc-600" />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={600}
              disabled={exporting}
              placeholder={exporting ? 'Editing opens again when the export is done' : 'Tell Studio what to change…'}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none"
            />
            <button type="submit" disabled={!message.trim() || sending || exporting} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime-300 text-black disabled:opacity-30" aria-label="Send">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex rounded-lg bg-white/[0.04] p-0.5">
            {sizes.map((s) => (
              <button key={s} onClick={() => setSize(s)} className={`rounded-md px-3 py-1 text-[12px] font-medium ${size === s ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}>
                {s}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-zinc-500">{seconds(plan)} s · live preview</span>
          <span className="flex-1" />
          <Primary onClick={actions.export} disabled={exporting || sending}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Exporting' : job.videos.some((v) => v.file) ? 'Export again' : `Export ${sizes.length > 1 ? `${sizes.length} MP4s` : 'MP4'}`}
          </Primary>
        </div>
        <div className="grid flex-1 place-items-center overflow-auto bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),transparent_70%)] p-4 md:p-8">
          <VideoPlayer key={size} plan={plan} brand={brand} size={size} maxHeight="calc(100dvh - 260px)" />
        </div>
        <Exports job={job} />
      </main>
    </div>
  );
}

function Exports({ job }) {
  if (!job.videos.length && !job.error) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-4 py-3">
      {job.error ? <p className="w-full text-[12px] text-red-300">{job.error}</p> : null}
      {job.videos.map((v) => {
        const working = v.status !== 'done' && busy(job);
        return (
          <div key={v.id} className="flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border border-white/10 bg-[#141518] px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-white">{v.label}</span>
              <span className="block text-[11px] text-zinc-500">
                {working ? (v.status === 'rendering' ? `Rendering · ${v.progress || 0}%` : v.status === 'checking' ? 'Checking every scene' : 'Waiting') : v.file ? `${Math.round(v.duration || 0)} s${v.outdated ? ' · older than your edits' : ''}${v.fixes?.length ? ` · ${v.fixes.length} fix${v.fixes.length === 1 ? '' : 'es'} after checking` : ''}` : 'Not exported'}
              </span>
              {working && v.status === 'rendering' ? (
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full bg-lime-300 transition-[width]" style={{ width: `${v.progress || 0}%` }} />
                </span>
              ) : null}
            </span>
            {v.file && !working ? (
              <span className="flex gap-1.5">
                <a href={fileUrl(job, `videos/${v.file}`, `${(job.kit?.name || 'video').replace(/[^\w-]+/g, '-')}-${v.size.replace(':', 'x')}.mp4`)} download className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-white/15">
                  <Download className="h-3.5 w-3.5" /> MP4
                </a>
                {v.gif ? (
                  <a href={fileUrl(job, `videos/${v.gif}`, `${(job.kit?.name || 'video').replace(/[^\w-]+/g, '-')}-${v.size.replace(':', 'x')}.gif`)} download title="Silent GIF for docs, READMEs and email" className="inline-flex items-center rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-white/15">
                    GIF
                  </a>
                ) : null}
              </span>
            ) : working ? (
              <Loader2 className="h-4 w-4 animate-spin text-lime-300" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
