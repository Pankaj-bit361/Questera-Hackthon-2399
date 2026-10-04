import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import Sidebar from './Sidebar';
import ApprovalQueue from './autopilot/ApprovalQueue';
import { WeeklyReport, ReplyDrafts } from './autopilot/WeekPanels';
import { autopilotAPI, instagramAPI, linkedinAPI, twitterAPI } from '../lib/api';
import { getUserId } from '../lib/velosStorage';

const {
  FiChevronLeft, FiZap, FiGlobe, FiCheck, FiPlay, FiTrash2, FiRefreshCw, FiClock,
  FiImage, FiVideo, FiType, FiLayers, FiMessageSquare, FiAlertTriangle, FiChevronDown, FiPower, FiPlus, FiEdit2, FiLink, FiCpu,
  FiShield, FiPause,
} = FiIcons;

/* -------------------------------------------------------------------------
 * Autopilot
 *
 * One autopilot per platform, nothing to do with chats. Flow:
 *   1. pick the platform (must be connected in Settings)
 *   2. give the company website - the agent reads it and builds a brand profile
 *   3. the agent designs 4-5 recurring tasks, each with its own format and cadence
 *   4. tune each task: how many times a day, which days, run it now, see its history
 * ---------------------------------------------------------------------- */

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', glyph: 'IG', color: 'from-pink-500 to-orange-400', max: '3 posts/day' },
  { id: 'linkedin', label: 'LinkedIn', glyph: 'in', color: 'from-sky-600 to-blue-700', max: '2 posts/day' },
  { id: 'twitter', label: 'X', glyph: 'X', color: 'from-zinc-600 to-zinc-800', max: '4 posts/day' },
];

const FORMATS = {
  text: { label: 'Text', icon: FiType },
  thread: { label: 'Thread', icon: FiMessageSquare },
  image: { label: 'Image', icon: FiImage },
  multi_image: { label: 'Carousel', icon: FiLayers },
  video: { label: 'Video', icon: FiVideo },
};

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const fmtWhen = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rel =
    abs < 60000 ? 'now' :
    abs < 3600000 ? `${Math.round(abs / 60000)}m` :
    abs < 86400000 ? `${Math.round(abs / 3600000)}h` :
    `${Math.round(abs / 86400000)}d`;
  const label = diff > 0 ? `in ${rel}` : `${rel} ago`;
  return `${d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${label}`;
};

/* -------------------------------------------------------------------------
 * /autopilot            -> list of the user's autopilots (one per company)
 * /autopilot/:autopilotId -> that autopilot's platforms, website and tasks
 * ---------------------------------------------------------------------- */
const AutopilotPage = () => {
  const { autopilotId } = useParams();
  return autopilotId ? <AutopilotDetail autopilotId={autopilotId} /> : <AutopilotList />;
};

const Shell = ({ children, title, right }) => {
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <Sidebar isOpen={isSidebarOpen} onMouseEnter={() => setSidebarOpen(true)} onMouseLeave={() => setSidebarOpen(false)} />
      <div className="fixed top-0 left-0 w-4 h-full z-40" onMouseEnter={() => setSidebarOpen(true)} />
      <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate(title ? '/autopilot' : '/home')} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
            <SafeIcon icon={FiChevronLeft} className="w-5 h-5" />
            <span className="text-sm font-medium">{title ? 'All autopilots' : 'Back'}</span>
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <SafeIcon icon={FiZap} className="w-4 h-4 text-yellow-400" />
          <h1 className="text-lg font-bold truncate">{title || 'Autopilot'}</h1>
          <span className="ml-auto text-xs text-zinc-500 hidden sm:block">{right ?? 'Video by Gemini Omni 1.1 · Images by Gemini'}</span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">{children}</main>
    </div>
  );
};

const AutopilotList = () => {
  const navigate = useNavigate();
  const userId = getUserId();
  const [items, setItems] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const d = await autopilotAPI.list(userId).catch((e) => ({ error: e.message }));
    if (d.success) setItems(d.autopilots || []);
    else setError(d.error || 'Could not load autopilots');
  };
  useEffect(() => {
    if (!userId) { navigate('/login'); return; }
    load();
  }, [userId]);

  const create = async () => {
    setCreating(true);
    setError('');
    const d = await autopilotAPI.create(userId, { name: name.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch((e) => ({ error: e.message }));
    setCreating(false);
    if (d.success) navigate(`/autopilot/${d.autopilot.autopilotId}`);
    else setError(d.error || 'Could not create');
  };

  const remove = async (ap) => {
    if (!window.confirm(`Delete "${ap.name}"? Its brand profile, platform settings and tasks go with it. Posts already made are kept.`)) return;
    const d = await autopilotAPI.remove(ap.autopilotId);
    if (d.success) setItems((prev) => prev.filter((x) => x.autopilotId !== ap.autopilotId));
    else setError(d.error || 'Could not delete');
  };

  return (
    <Shell>
      <div>
        <h2 className="text-xl font-bold">Your autopilots</h2>
        <p className="text-sm text-zinc-500 mt-1">
          One per company or brand. Each reads its own website, connects one Instagram, one LinkedIn and one X, and runs its own tasks.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">{error}</div>}

      <button
        onClick={() => navigate('/first-week')}
        className="w-full text-left rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 flex items-center gap-3 hover:border-emerald-700 transition-colors"
      >
        <SafeIcon icon={FiZap} className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">See your first week before you connect anything</span>
          <span className="block text-xs text-zinc-400">Paste your website: seven posts and a product video, made from your own site.</span>
        </span>
        <SafeIcon icon={FiChevronLeft} className="w-4 h-4 rotate-180 text-zinc-500" />
      </button>

      <div className="rounded-xl border border-zinc-800/60 bg-[#141416] p-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="New autopilot name, e.g. Acme Inc"
          className="flex-1 rounded-lg border border-zinc-800 bg-[#0e0e10] px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600"
        />
        <button onClick={create} disabled={creating} className="rounded-lg bg-white text-black px-4 py-2 text-sm font-bold disabled:opacity-40 flex items-center gap-2">
          <SafeIcon icon={FiPlus} className="w-4 h-4" /> {creating ? 'Creating…' : 'New autopilot'}
        </button>
      </div>

      {items === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No autopilots yet - create one above.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((ap) => (
            <div key={ap.autopilotId} className="rounded-xl border border-zinc-800/60 bg-[#141416] p-4 hover:border-zinc-700 transition-colors">
              <button onClick={() => navigate(`/autopilot/${ap.autopilotId}`)} className="text-left w-full">
                <p className="font-semibold">{ap.name}</p>
                <p className="text-xs text-zinc-500 truncate">{ap.oneLiner || ap.websiteUrl || 'No website read yet'}</p>
              </button>
              <div className="mt-3 flex items-center gap-2 text-[11px]">
                {PLATFORMS.map((p) => (
                  <span key={p.id} className={`rounded px-1.5 py-0.5 ${ap.platformsOn?.includes(p.id) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>{p.label}</span>
                ))}
                <span className="text-zinc-500">· {ap.taskCount || 0} task{ap.taskCount === 1 ? '' : 's'}</span>
                <button onClick={() => remove(ap)} className="ml-auto text-zinc-600 hover:text-red-400" title="Delete">
                  <SafeIcon icon={FiTrash2} className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
};

const AutopilotDetail = ({ autopilotId }) => {
  const navigate = useNavigate();
  const userId = getUserId();
  const [autopilot, setAutopilot] = useState(null);
  const [accountsByPlatform, setAccountsByPlatform] = useState({ instagram: [], linkedin: [], twitter: [] });

  const [platform, setPlatform] = useState('');
  const [adding, setAdding] = useState(false); // integration picker open
  const [connected, setConnected] = useState({});
  const [configs, setConfigs] = useState({});
  const [brand, setBrand] = useState(null);
  const [website, setWebsite] = useState('');
  const [tasks, setTasks] = useState([]);
  const [reasoning, setReasoning] = useState('');
  const [insights, setInsights] = useState(null);
  const [testResult, setTestResult] = useState({}); // platform -> {ok, permalink, error}
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(''); // 'crawl' | 'plan' | 'toggle' | taskId
  const [error, setError] = useState('');
  const [trust, setTrust] = useState(null); // { platforms: [...], events: [...] } - the trust ladder
  const [pauses, setPauses] = useState({}); // platform -> a block or lost login the platform reported


  useEffect(() => {
    if (!userId) { navigate('/login'); return; }
    load();
  }, [userId, autopilotId]);

  useEffect(() => {
    if (userId) loadTasks();
  }, [userId, autopilotId, platform]);

  useEffect(() => {
    if (userId) loadTrust();
  }, [userId, autopilotId]);

  const loadTrust = async () => {
    const [t, p] = await Promise.all([
      autopilotAPI.getTrust(userId, autopilotId).catch(() => null),
      autopilotAPI.getPauses(userId).catch(() => null),
    ]);
    if (t?.success) setTrust(t);
    if (p?.success) setPauses(Object.fromEntries((p.pauses || []).map((x) => [x.platform, x])));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, ig, li, tw] = await Promise.all([
        autopilotAPI.getConfigs(userId, autopilotId),
        instagramAPI.getSocialAccounts(userId).catch(() => ({})),
        linkedinAPI.getInfo().catch(() => ({})),
        twitterAPI.getInfo().catch(() => ({})),
      ]);
      if (cfg.error && !cfg.success) { setError(cfg.error); navigate('/autopilot'); return; }
      if (cfg.success) {
        setConfigs(Object.fromEntries((cfg.configs || []).map((c) => [c.platform, c])));
        setBrand(cfg.brand || null);
        setAutopilot(cfg.autopilot || null);
        if (cfg.autopilot?.websiteUrl) setWebsite(cfg.autopilot.websiteUrl);
        const added = PLATFORMS.map((p) => p.id).filter((id) => cfg.autopilot?.accounts?.[id]);
        setPlatform((cur) => (added.includes(cur) ? cur : added[0] || ''));
      }
      const lists = {
        instagram: (ig?.accounts || []).map((a) => ({ id: a.accountId, label: a.instagramUsername ? `@${a.instagramUsername}` : a.pageName || a.accountId })),
        linkedin: (li?.accounts || []).filter((a) => a.isActive !== false).map((a) => ({ id: a.accountId, label: a.name || a.accountId })),
        twitter: (tw?.accounts || []).filter((a) => a.isActive !== false).map((a) => ({ id: a.accountId, label: a.username ? `@${a.username}` : a.name || a.accountId })),
      };
      setAccountsByPlatform(lists);
      setConnected({ instagram: lists.instagram.length > 0, linkedin: lists.linkedin.length > 0, twitter: lists.twitter.length > 0 });
      const mem = await autopilotAPI.getMemory(userId, autopilotId).catch(() => null);
      if (mem?.memory?.website?.url) setWebsite(mem.memory.website.url);
      else if (mem?.website?.url) setWebsite(mem.website.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    setInsights(null);
    if (!platform) { setTasks([]); return; }
    const data = await autopilotAPI.getTasks(userId, autopilotId, platform).catch(() => ({}));
    if (data.success) setTasks(data.tasks || []);
  };

  const guard = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      const data = await fn();
      if (data && data.success === false) setError(data.error || 'Something went wrong');
      return data;
    } catch (err) {
      setError(err.message);
      return { success: false };
    } finally {
      setBusy('');
    }
  };

  const handleCrawl = async () => {
    const url = website.trim();
    if (!url) return;
    const data = await guard('crawl', () => autopilotAPI.crawlWebsite(userId, autopilotId, url));
    if (data?.success) {
      setBrand(data.brand);
      setWebsite(data.website || url);
      // Name a fresh autopilot after the company it just read.
      const updates = { websiteUrl: data.website || url };
      if (autopilot && /^(My autopilot|Autopilot \d+)$/.test(autopilot.name) && data.brand?.companyName) updates.name = data.brand.companyName;
      const u = await autopilotAPI.update(autopilotId, updates).catch(() => null);
      if (u?.success) setAutopilot(u.autopilot);
    }
  };

  const handlePlan = async () => {
    if (tasks.length && !window.confirm('Replace the current task set with a freshly designed one?')) return;
    const data = await guard('plan', () =>
      autopilotAPI.generateTasks(userId, autopilotId, platform, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    );
    if (data?.success) {
      setTasks(data.tasks || []);
      setReasoning(data.reasoning || '');
    }
  };

  const handleToggleAutopilot = async () => {
    const data = await guard('toggle', () => autopilotAPI.toggle(userId, autopilotId, platform));
    if (data?.success) {
      const cfg = await autopilotAPI.getConfigs(userId, autopilotId);
      if (cfg.success) setConfigs(Object.fromEntries((cfg.configs || []).map((c) => [c.platform, c])));
    }
  };

  const patchTask = async (taskId, updates) => {
    const data = await guard(taskId, () => autopilotAPI.updateTask(taskId, updates));
    if (data?.success) setTasks((prev) => prev.map((t) => (t.taskId === taskId ? data.task : t)));
  };

  const runTask = async (taskId) => {
    const data = await guard(taskId, () => autopilotAPI.runTask(taskId));
    if (data?.success) {
      setTasks((prev) => prev.map((t) => (t.taskId === taskId ? data.task : t)));
      const r = data.result;
      if (r && !r.ok && r.reason) setError(`Run skipped: ${r.reason}`);
    }
  };

  const pickAccount = async (p, accountId) => {
    const data = await guard('account', () => autopilotAPI.update(autopilotId, { accounts: { [p]: accountId || null } }));
    if (data?.success) {
      setAutopilot(data.autopilot);
      setAdding(false);
      if (accountId) setPlatform(p);
      else if (platform === p) {
        const left = PLATFORMS.map((x) => x.id).filter((id) => data.autopilot?.accounts?.[id]);
        setPlatform(left[0] || '');
      }
    }
  };

  const askAgent = async () => {
    const data = await guard('insights', () => autopilotAPI.getInsights(userId, autopilotId, platform));
    if (data?.success) setInsights(data);
  };

  const applySuggestion = async (sg) => {
    if (!sg.taskId || !sg.patch || Object.keys(sg.patch).length === 0) return;
    await patchTask(sg.taskId, sg.patch);
    setInsights((prev) => prev && { ...prev, suggestions: prev.suggestions.map((x) => (x === sg ? { ...x, applied: true } : x)) });
  };

  const sendTestPost = async (p) => {
    const label = PLATFORMS.find((x) => x.id === p)?.label;
    if (!window.confirm(`Publish a real test post to your ${label} account now?`)) return;
    setTestResult((prev) => ({ ...prev, [p]: { pending: true } }));
    const data = await guard(`test-${p}`, () => autopilotAPI.testPost(userId, autopilotId, p));
    setTestResult((prev) => ({ ...prev, [p]: data?.success ? { ok: true, permalink: data.permalink } : { ok: false, error: data?.error || 'Failed' } }));
  };

  const setPublishRule = async (updates) => {
    const data = await guard('rule', () => autopilotAPI.updateConfig(userId, autopilotId, platform, { permissions: updates }));
    if (data?.success) {
      const c = await autopilotAPI.getConfigs(userId, autopilotId);
      if (c.success) setConfigs(Object.fromEntries((c.configs || []).map((x) => [x.platform, x])));
      loadTrust();
    }
  };

  const backToSupervised = async () => {
    if (!window.confirm('Switch back to supervised? Every post will wait for your approval until it earns trust again.')) return;
    await guard('rule', () => autopilotAPI.resetTrust(userId, autopilotId, platform));
    loadTrust();
  };

  const resumeAutopilot = async () => {
    await guard('rule', () => autopilotAPI.resume(userId, autopilotId, platform));
    loadTrust();
  };

  const resumePlatform = async () => {
    await guard('rule', () => autopilotAPI.resumePlatform(userId, platform));
    loadTrust();
  };

  const runSelfReview = async () => {
    const data = await guard('selfreview', () => autopilotAPI.selfReview(userId, autopilotId, platform));
    if (data?.success) {
      setAutopilot((prev) => (prev ? { ...prev, agentLog: data.agentLog } : prev));
      const t = await autopilotAPI.getTasks(userId, autopilotId, platform).catch(() => ({}));
      if (t.success) setTasks(t.tasks || []);
    }
  };

  const removeIntegration = (p) => {
    const label = PLATFORMS.find((x) => x.id === p)?.label;
    if (!window.confirm(`Remove ${label} from this autopilot? Its ${label} tasks will be switched off (not deleted).`)) return;
    pickAccount(p, null);
  };

  const rename = async () => {
    const next = window.prompt('Autopilot name', autopilot?.name || '');
    if (next === null || !next.trim()) return;
    const data = await guard('rename', () => autopilotAPI.update(autopilotId, { name: next.trim() }));
    if (data?.success) setAutopilot(data.autopilot);
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm('Delete this task? Its run history is kept.')) return;
    const data = await guard(taskId, () => autopilotAPI.deleteTask(taskId));
    if (data?.success) setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  };

  const addedIds = PLATFORMS.map((p) => p.id).filter((id) => autopilot?.accounts?.[id]);
  const addedPlatforms = PLATFORMS.filter((p) => addedIds.includes(p.id));
  const addablePlatforms = PLATFORMS.filter((p) => !addedIds.includes(p.id));
  const current = PLATFORMS.find((p) => p.id === platform) || null;
  const cfg = configs[platform];
  const enabled = Boolean(cfg?.config?.enabled);
  const brandReady = Boolean(brand?.companyName || brand?.oneLiner);
  const postsPerWeek = useMemo(
    () => tasks.filter((t) => t.enabled).reduce((n, t) => n + (t.schedule?.timesPerDay || 1) * (t.schedule?.daysOfWeek?.length || 7), 0),
    [tasks]
  );

  const step = addedIds.length === 0 ? 1 : !brandReady ? 2 : tasks.length === 0 ? 3 : 4;

  return (
    <Shell
      title={autopilot?.name || '…'}
      right={autopilot && (
        <button onClick={rename} className="flex items-center gap-1 text-zinc-400 hover:text-white">
          <SafeIcon icon={FiEdit2} className="w-3 h-3" /> Rename
        </button>
      )}
    >
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300 flex items-start gap-2">
            <SafeIcon icon={FiAlertTriangle} className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-white text-xs">dismiss</button>
          </div>
        )}

        {/* 1. Integrations added to this autopilot */}
        <section>
          <StepHeader n={1} title="Where this autopilot posts" done={step > 1} />
          <div className="grid gap-3 sm:grid-cols-3">
            {addedPlatforms.map((p) => {
              const active = p.id === platform;
              const on = configs[p.id]?.config?.enabled;
              const acct = accountsByPlatform[p.id].find((a) => a.id === autopilot?.accounts?.[p.id]);
              return (
                <div key={p.id} className="relative">
                  <button
                    onClick={() => setPlatform(p.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      active ? 'border-white bg-[#1c1c1e]' : 'border-zinc-800/60 bg-[#141416] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center font-bold text-sm`}>
                        {p.glyph}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{p.label}</p>
                        <p className="text-xs text-zinc-500 truncate">{acct?.label || autopilot?.accounts?.[p.id]}</p>
                      </div>
                      {on && <span className="w-2 h-2 rounded-full bg-emerald-400" title="Autopilot running" />}
                    </div>
                    <p className="mt-3 text-[11px] font-medium text-zinc-500">{p.max}</p>
                  </button>
                  {accountsByPlatform[p.id].length > 1 && (
                    <select
                      value={autopilot?.accounts?.[p.id] || ''}
                      onChange={(e) => pickAccount(p.id, e.target.value)}
                      className="absolute bottom-3 right-9 max-w-[45%] rounded-md border border-zinc-800 bg-[#0e0e10] px-2 py-1 text-[11px] text-zinc-300"
                      title="Switch account"
                    >
                      {accountsByPlatform[p.id].map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  )}
                  <button
                    onClick={() => removeIntegration(p.id)}
                    title={`Remove ${p.label}`}
                    className="absolute bottom-2.5 right-2 p-1 rounded text-zinc-600 hover:text-red-400"
                  >
                    <SafeIcon icon={FiTrash2} className="w-3.5 h-3.5" />
                  </button>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <button
                      onClick={() => sendTestPost(p.id)}
                      disabled={busy === `test-${p.id}`}
                      className="text-zinc-400 hover:text-white underline disabled:opacity-40"
                    >
                      {busy === `test-${p.id}` ? 'Posting…' : 'Send test post'}
                    </button>
                    {testResult[p.id]?.ok && (
                      testResult[p.id].permalink
                        ? <a href={testResult[p.id].permalink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Posted ✓ open</a>
                        : <span className="text-emerald-400">Posted ✓</span>
                    )}
                    {testResult[p.id]?.ok === false && <span className="text-red-400 truncate" title={testResult[p.id].error}>Failed: {testResult[p.id].error}</span>}
                  </div>
                </div>
              );
            })}

            {addablePlatforms.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setAdding((v) => !v)}
                  className="w-full h-full min-h-[104px] rounded-xl border border-dashed border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 flex items-center justify-center gap-2 text-sm"
                >
                  <SafeIcon icon={FiPlus} className="w-4 h-4" /> Add integration
                </button>
                <AnimatePresence>
                  {adding && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute z-20 left-0 right-0 top-full mt-2 rounded-xl border border-zinc-800 bg-[#141416] p-2 shadow-xl"
                    >
                      {addablePlatforms.map((p) => {
                        const list = accountsByPlatform[p.id];
                        return (
                          <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-900">
                            <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.color} flex items-center justify-center text-[10px] font-bold`}>{p.glyph}</div>
                            <span className="text-sm flex-1">{p.label}</span>
                            {list.length === 0 ? (
                              <button onClick={() => navigate('/settings')} className="text-[11px] text-zinc-400 hover:text-white underline">
                                Connect in Settings
                              </button>
                            ) : list.length === 1 ? (
                              <button
                                onClick={() => pickAccount(p.id, list[0].id)}
                                className="rounded-md bg-white text-black px-2.5 py-1 text-[11px] font-bold"
                              >
                                Add {list[0].label}
                              </button>
                            ) : (
                              <select
                                defaultValue=""
                                onChange={(e) => e.target.value && pickAccount(p.id, e.target.value)}
                                className="rounded-md border border-zinc-800 bg-[#0e0e10] px-2 py-1 text-[11px] text-zinc-300"
                              >
                                <option value="" disabled>Choose account…</option>
                                {list.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
          {!loading && addedIds.length === 0 && (
            <p className="mt-3 text-xs text-zinc-500">Nothing added yet. Add only the accounts this autopilot should post through.</p>
          )}
        </section>

        {/* 2. Website */}
        <section>
          <StepHeader n={2} title="Tell it about your company" done={step > 2} />
          <div className="rounded-xl border border-zinc-800/60 bg-[#141416] p-4 space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#0e0e10] px-3">
                <SafeIcon icon={FiGlobe} className="w-4 h-4 text-zinc-500" />
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCrawl()}
                  placeholder="yourcompany.com"
                  className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-600"
                />
              </div>
              <button
                onClick={handleCrawl}
                disabled={busy === 'crawl' || !website.trim()}
                className="rounded-lg bg-white text-black px-4 py-2 text-sm font-bold disabled:opacity-40 flex items-center gap-2"
              >
                {busy === 'crawl' ? <Spinner /> : <SafeIcon icon={FiGlobe} className="w-4 h-4" />}
                {busy === 'crawl' ? 'Reading…' : brandReady ? 'Re-read' : 'Read website'}
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              The agent reads your about, product, pricing and customer pages, then works out what your audience is, how you sound, and which proof points are worth posting about.
            </p>

            <AnimatePresence>
              {brandReady && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <BrandSummary brand={brand} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* 3/4. Tasks */}
        <section>
          <StepHeader n={3} title={current ? `${current.label} tasks` : 'Tasks'} done={tasks.length > 0} />
          <div className="rounded-xl border border-zinc-800/60 bg-[#141416] p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handlePlan}
                disabled={!brandReady || !current || busy === 'plan'}
                className="rounded-lg bg-white text-black px-4 py-2 text-sm font-bold disabled:opacity-40 flex items-center gap-2"
              >
                {busy === 'plan' ? <Spinner /> : <SafeIcon icon={FiZap} className="w-4 h-4" />}
                {busy === 'plan' ? 'Designing…' : tasks.length ? 'Redesign tasks' : 'Design my tasks'}
              </button>

              {tasks.length > 0 && (
                <>
                  <span className="text-xs text-zinc-500">
                    {tasks.filter((t) => t.enabled).length} active · ~{postsPerWeek} posts/week
                  </span>
                  <button
                    onClick={handleToggleAutopilot}
                    disabled={busy === 'toggle' || !current}
                    className={`ml-auto rounded-lg px-4 py-2 text-sm font-bold flex items-center gap-2 disabled:opacity-40 ${
                      enabled ? 'bg-emerald-600 text-white' : 'border border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <SafeIcon icon={FiPower} className="w-4 h-4" />
                    {enabled ? 'Autopilot on' : 'Turn autopilot on'}
                  </button>
                </>
              )}
            </div>

            {current && cfg?.config && (
              <TrustCard
                platformLabel={current.label}
                permissions={cfg?.config?.permissions}
                trust={trust?.platforms?.find((t) => t.platform === platform)}
                events={(trust?.events || []).filter((e) => e.platform === platform).slice(0, 4)}
                accountPause={pauses[platform]}
                busy={busy === 'rule'}
                onChange={setPublishRule}
                onReset={backToSupervised}
                onResume={resumeAutopilot}
                onResumePlatform={resumePlatform}
              />
            )}

            {!current && <p className="text-xs text-zinc-500">Add an integration above to design tasks for it.</p>}
            {current && !brandReady && <p className="text-xs text-zinc-500">Read your website first - the tasks are designed from what it finds.</p>}
            {reasoning && <p className="text-sm text-zinc-400 border-l-2 border-zinc-700 pl-3">{reasoning}</p>}

            {tasks.length > 0 && current && (
              <AgentPanel
                platform={current}
                insights={insights}
                agentLog={(autopilot?.agentLog || []).filter((l) => l.platform === platform)}
                busy={busy === 'insights'}
                reviewing={busy === 'selfreview'}
                onAsk={askAgent}
                onApply={applySuggestion}
                onSelfReview={runSelfReview}
              />
            )}

            <div className="space-y-3">
              <AnimatePresence>
                {tasks.map((task) => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    busy={busy === task.taskId}
                    onPatch={(u) => patchTask(task.taskId, u)}
                    onRun={() => runTask(task.taskId)}
                    onDelete={() => deleteTask(task.taskId)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {tasks.length > 0 && !enabled && (
              <p className="text-xs text-amber-300/80">Tasks only run once the autopilot is turned on for {current?.label}.</p>
            )}
          </div>
        </section>

        <ApprovalQueue userId={userId} autopilotId={autopilotId} platform={platform} onDecision={loadTrust} />
        <ReplyDrafts userId={userId} autopilotId={autopilotId} />
        <WeeklyReport userId={userId} autopilotId={autopilotId} />
    </Shell>
  );
};

/* ---------------------------------------------------------------------- */

const StepHeader = ({ n, title, done }) => (
  <div className="flex items-center gap-3 mb-3">
    <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${done ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-300'}`}>
      {done ? <SafeIcon icon={FiCheck} className="w-3.5 h-3.5" /> : n}
    </span>
    <h2 className="text-base font-semibold">{title}</h2>
  </div>
);

const Spinner = () => <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />;

const BrandSummary = ({ brand }) => (
  <div className="rounded-lg border border-zinc-800 bg-[#0e0e10] p-4 space-y-3">
    <div>
      <p className="font-semibold">{brand.companyName || 'Your company'}</p>
      {brand.oneLiner && <p className="text-sm text-zinc-400">{brand.oneLiner}</p>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 text-xs">
      {brand.targetAudience && <Field label="Audience" value={brand.targetAudience} />}
      {brand.tone && <Field label="Tone" value={brand.tone} />}
      {brand.visualStyle && <Field label="Visual style" value={brand.visualStyle} />}
      {brand.topicsAllowed?.length > 0 && <Field label="Topics" value={brand.topicsAllowed.join(', ')} />}
    </div>
    {brand.proofPoints?.length > 0 && (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Proof points it can use</p>
        <ul className="space-y-1">
          {brand.proofPoints.slice(0, 5).map((p, i) => (
            <li key={i} className="text-xs text-zinc-300 flex gap-2"><span className="text-zinc-600">•</span>{typeof p === 'string' ? p : p.text || p.claim}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const Field = ({ label, value }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
    <p className="text-zinc-300">{value}</p>
  </div>
);

const fmt = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * How a finished post gets out: the trust ladder (backend functions/TrustLadder.js). Every platform starts
 * supervised; five clean approvals in a row earn autopilot, where a post that passes the checks and scores at the
 * bar publishes on its own after a hold; one rejection sends it back. Also shows pauses and their reasons: the
 * supervisor's (Resume), and a platform block or lost login (AccountHealth).
 */
const TrustCard = ({ platformLabel, permissions, trust, events, accountPause, busy, onChange, onReset, onResume, onResumePlatform }) => {
  const always = permissions?.requireApproval === true;
  const min = Number.isFinite(permissions?.autoPublishMinScore) ? permissions.autoPublishMinScore : 75;
  const onAutopilot = trust?.mode === 'autopilot';
  const streak = Math.min(trust?.approvalStreak || 0, trust?.promoteAfter || 5);
  const need = trust?.promoteAfter || 5;

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#0e0e10] p-4 space-y-4">
      {accountPause && (
        <div className="rounded-lg border border-amber-800/70 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-start gap-2">
          <SafeIcon icon={FiAlertTriangle} className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              {accountPause.kind === 'reconnect'
                ? `Velos can no longer sign in to ${platformLabel}. Reconnect it in Settings; nothing posts there until then.`
                : `${platformLabel} limited this account, so posting is paused until ${fmt(accountPause.until)}.`}
            </p>
            {accountPause.reason && <p className="mt-1 text-amber-300/70">{platformLabel} said: {accountPause.reason}</p>}
          </div>
          {accountPause.kind !== 'reconnect' && (
            <button onClick={onResumePlatform} disabled={busy} className="shrink-0 rounded-md border border-amber-700 px-2 py-1 text-[11px] hover:bg-amber-900/40 disabled:opacity-40">
              Resume now
            </button>
          )}
        </div>
      )}

      {trust?.pausedUntil && (
        <div className="rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-xs text-red-200 flex items-start gap-2">
          <SafeIcon icon={FiPause} className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="flex-1">
            Paused until {fmt(trust.pausedUntil)}.
            {events.find((e) => e.action === 'paused') ? ` ${events.find((e) => e.action === 'paused').reason.split('. Paused until')[0]}.` : ''}
          </p>
          <button onClick={onResume} disabled={busy} className="shrink-0 rounded-md border border-red-800 px-2 py-1 text-[11px] hover:bg-red-900/40 disabled:opacity-40">
            Resume
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <SafeIcon icon={FiShield} className={`w-4 h-4 ${onAutopilot && !always ? 'text-emerald-400' : 'text-zinc-400'}`} />
            <p className="text-sm font-semibold">
              {always ? 'Always asks you first' : onAutopilot ? 'On autopilot' : 'Supervised'}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">
            {always
              ? 'Every post waits for your approval, whatever its score.'
              : onAutopilot
                ? `Posts that pass the checks and score ${min}+ publish on their own ${trust?.holdHours ?? 12} hours after they are made, so you can stop any of them first. Lower scores wait for you. One rejection switches it back to supervised.`
                : `Every post waits for your approval. ${need} approvals in a row, each scoring ${min}+, put it on autopilot; a rejection starts the count again.`}
          </p>
          {!always && !onAutopilot && (
            <div className="mt-2 flex items-center gap-1.5" aria-label={`${streak} of ${need} clean approvals`}>
              {Array.from({ length: need }, (_, i) => (
                <span key={i} className={`h-1.5 w-6 rounded-full ${i < streak ? 'bg-emerald-400' : 'bg-zinc-800'}`} />
              ))}
              <span className="ml-1 text-[11px] text-zinc-500">{streak} of {need}</span>
            </div>
          )}
          {!onAutopilot && trust?.demotedReason && !always && (
            <p className="mt-2 text-[11px] text-zinc-500">Back to supervised: {trust.demotedReason}.</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {!always && (
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Review score needed
              <input
                type="number" min={0} max={100} defaultValue={min} disabled={busy}
                onBlur={(e) => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); if (v !== min) onChange({ autoPublishMinScore: v }); }}
                className="w-16 rounded-md border border-zinc-800 bg-[#141416] px-2 py-1 text-sm text-white"
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <Switch on={always} disabled={busy} title={always ? 'Stop asking for every post' : 'Ask me before every post'} onChange={(v) => onChange({ requireApproval: v })} />
            Always ask me first
          </label>
          {onAutopilot && !always && (
            <button onClick={onReset} disabled={busy} className="text-[11px] text-zinc-500 hover:text-white disabled:opacity-40">
              Switch back to supervised
            </button>
          )}
        </div>
      </div>

      {events.length > 0 && (
        <ul className="border-t border-zinc-800/80 pt-3 space-y-1.5">
          {events.map((e, i) => (
            <li key={i} className="flex gap-2 text-[11px] text-zinc-500">
              <span className="shrink-0 text-zinc-600 tabular-nums">{fmt(e.createdAt)}</span>
              <span>{e.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * The platform agent's read on the task set. It looks at what was posted and,
 * where the platform exposes it, how those posts performed - then proposes
 * concrete changes the user can apply with one click.
 */
const AgentPanel = ({ platform, insights, agentLog = [], busy, reviewing, onAsk, onApply, onSelfReview }) => {
  const describePatch = (patch) => {
    const bits = [];
    if (patch.schedule?.timesPerDay) bits.push(`${patch.schedule.timesPerDay}×/day`);
    if (patch.schedule?.times) bits.push(`at ${patch.schedule.times.join(', ')}`);
    if (patch.schedule?.daysOfWeek) bits.push(patch.schedule.daysOfWeek.map((d) => DAYS[d]).join(' '));
    if (patch.format) bits.push(`→ ${FORMATS[patch.format]?.label || patch.format}`);
    if (patch.enabled === false) bits.push('pause');
    if (patch.enabled === true) bits.push('resume');
    if (patch.linkUrl) bits.push(`link ${patch.linkUrl.replace(/^https?:\/\/(www\.)?/, '')}`);
    return bits.join(' · ');
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#0e0e10] p-4">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
          <SafeIcon icon={FiCpu} className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{insights?.agent || `${platform.label} growth agent`}</p>
          <p className="text-[11px] text-zinc-500">
            {insights
              ? insights.metricsAvailable
                ? `${insights.performance?.measured || 0} of ${insights.performance?.published || 0} published posts have engagement data`
                : `${platform.label} doesn't share engagement metrics for this account - reasoning from the content mix`
              : 'Reviews your tasks against what you\'ve posted and how it performed'}
          </p>
        </div>
        <button
          onClick={onSelfReview}
          disabled={reviewing}
          title="The agent reviews on its own every 7 days and applies schedule/link changes. Run that now."
          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-40"
        >
          {reviewing ? 'Reviewing…' : 'Self-review now'}
        </button>
        <button
          onClick={onAsk}
          disabled={busy}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1.5"
        >
          {busy ? <span className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-white animate-spin" /> : <SafeIcon icon={FiRefreshCw} className="w-3 h-3" />}
          {insights ? 'Review again' : 'Ask the agent'}
        </button>
      </div>

      {agentLog.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">What the agent changed on its own</p>
          {agentLog.slice(0, 3).map((l, k) => (
            <div key={k} className="rounded-lg border border-zinc-800 bg-[#141416] p-3">
              <p className="text-[11px] text-zinc-500">{new Date(l.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-xs text-zinc-300 mt-0.5">{l.summary}</p>
              {l.applied?.length > 0
                ? <ul className="mt-1 space-y-0.5">{l.applied.map((a, i) => <li key={i} className="text-xs text-emerald-300">✓ {a}</li>)}</ul>
                : <p className="text-xs text-zinc-500 mt-1">No changes needed.</p>}
            </div>
          ))}
        </div>
      )}

      {insights && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-300">{insights.summary}</p>
          {insights.insights?.length > 0 && (
            <ul className="space-y-1">
              {insights.insights.map((i, k) => (
                <li key={k} className="text-xs text-zinc-400 flex gap-2"><span className="text-zinc-600">•</span>{i}</li>
              ))}
            </ul>
          )}
          {insights.suggestions?.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Suggested changes</p>
              {insights.suggestions.map((sg, k) => (
                <div key={k} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-[#141416] p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{sg.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{sg.reason}</p>
                    {sg.taskId && Object.keys(sg.patch || {}).length > 0 && (
                      <p className="text-[11px] text-zinc-400 mt-1">{describePatch(sg.patch)}</p>
                    )}
                  </div>
                  {sg.taskId && Object.keys(sg.patch || {}).length > 0 ? (
                    <button
                      onClick={() => onApply(sg)}
                      disabled={sg.applied}
                      className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold ${sg.applied ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white text-black'}`}
                    >
                      {sg.applied ? 'Applied' : 'Apply'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[11px] text-zinc-600">idea</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TaskCard = ({ task, busy, onPatch, onRun, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState(null);
  const fmt = FORMATS[task.format] || FORMATS.text;
  const sched = task.schedule || {};
  const times = sched.times || [];
  const days = sched.daysOfWeek || [];

  useEffect(() => {
    if (open && runs === null) {
      autopilotAPI.getTaskRuns(task.taskId, 10).then((d) => setRuns(d.runs || [])).catch(() => setRuns([]));
    }
  }, [open]);

  useEffect(() => {
    // A run just happened - refresh history if it is showing.
    if (open) autopilotAPI.getTaskRuns(task.taskId, 10).then((d) => setRuns(d.runs || [])).catch(() => {});
  }, [task.runCount]);

  const setTimesPerDay = (n) => {
    const t = [...times];
    while (t.length < n) t.push(t.length ? addHours(t[t.length - 1], 4) : '09:00');
    onPatch({ schedule: { timesPerDay: n, times: t.slice(0, n) } });
  };

  const setTime = (i, value) => {
    const t = [...times];
    t[i] = value;
    onPatch({ schedule: { times: t } });
  };

  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    if (next.length === 0) return;
    onPatch({ schedule: { daysOfWeek: next } });
  };

  const perWeek = (sched.timesPerDay || 1) * (days.length || 7);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={`rounded-xl border bg-[#0e0e10] ${task.needsReview ? 'border-amber-800' : task.enabled ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}
    >
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
          <SafeIcon icon={fmt.icon} className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{task.name}</p>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{fmt.label}</span>
            {task.theme && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{task.theme}</span>}
          </div>
          {task.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{task.description}</p>}
          <p className="text-xs text-zinc-400 mt-2 flex items-center gap-1.5">
            <SafeIcon icon={FiClock} className="w-3 h-3" />
            {sched.timesPerDay || 1}×/day at {times.join(', ')} · {days.length === 7 ? 'every day' : days.map((d) => DAYS[d]).join(' ')} · {perWeek}/week
          </p>
          {task.linkUrl && (
            <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1 truncate">
              <SafeIcon icon={FiLink} className="w-3 h-3 shrink-0" />{task.cta ? `${task.cta} → ` : ''}{task.linkUrl.replace(/^https?:\/\/(www\.)?/, '')}
            </p>
          )}
          {task.enabled && task.nextRunAt && <p className="text-[11px] text-zinc-600 mt-0.5">Next: {fmtWhen(task.nextRunAt)}</p>}
          {task.needsReview && (
            <p className="text-xs text-amber-300 mt-1 flex items-center gap-1">
              <SafeIcon icon={FiAlertTriangle} className="w-3 h-3" /> Paused: {task.needsReviewReason || 'needs review'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onRun} disabled={busy} title="Run now" className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40">
            {busy ? <span className="block w-4 h-4 rounded-full border-2 border-zinc-600 border-t-white animate-spin" /> : <SafeIcon icon={FiPlay} className="w-4 h-4" />}
          </button>
          <Switch on={task.enabled} onChange={(v) => onPatch({ enabled: v })} disabled={busy} />
          <button onClick={() => setOpen((o) => !o)} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <SafeIcon icon={FiChevronDown} className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-zinc-800 p-4 grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Runs per day</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setTimesPerDay(n)}
                        className={`w-9 h-8 rounded-lg text-sm font-medium ${sched.timesPerDay === n ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">At</p>
                  <div className="flex flex-wrap gap-2">
                    {times.map((t, i) => (
                      <input
                        key={i}
                        type="time"
                        value={t}
                        onChange={(e) => setTime(i, e.target.value)}
                        className="rounded-lg border border-zinc-800 bg-[#141416] px-2 py-1 text-sm"
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Days</p>
                  <div className="flex gap-1">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(i)}
                        className={`w-9 h-8 rounded-lg text-xs font-medium ${days.includes(i) ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Format</p>
                  <select
                    value={task.format}
                    onChange={(e) => onPatch({ format: e.target.value })}
                    className="rounded-lg border border-zinc-800 bg-[#141416] px-2 py-1.5 text-sm"
                  >
                    {Object.entries(FORMATS)
                      .filter(([k]) => k !== 'thread' || task.platform === 'twitter')
                      .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Product link in posts</p>
                  <div className="flex gap-2">
                    <input
                      defaultValue={task.linkUrl || ''}
                      placeholder="https://yoursite.com/pricing"
                      onBlur={(e) => e.target.value !== (task.linkUrl || '') && onPatch({ linkUrl: e.target.value.trim() })}
                      className="flex-1 rounded-lg border border-zinc-800 bg-[#141416] px-2 py-1.5 text-sm"
                    />
                    <input
                      defaultValue={task.cta || ''}
                      placeholder="CTA"
                      onBlur={(e) => e.target.value !== (task.cta || '') && onPatch({ cta: e.target.value.trim() })}
                      className="w-28 rounded-lg border border-zinc-800 bg-[#141416] px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <button onClick={onDelete} className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1">
                  <SafeIcon icon={FiTrash2} className="w-3 h-3" /> Delete task
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    History · {task.postsCreated || 0} post{task.postsCreated === 1 ? '' : 's'} from {task.runCount || 0} run{task.runCount === 1 ? '' : 's'}
                  </p>
                  <button onClick={() => autopilotAPI.getTaskRuns(task.taskId, 10).then((d) => setRuns(d.runs || []))} className="text-zinc-500 hover:text-white">
                    <SafeIcon icon={FiRefreshCw} className="w-3 h-3" />
                  </button>
                </div>
                {runs === null ? (
                  <p className="text-xs text-zinc-600">Loading…</p>
                ) : runs.length === 0 ? (
                  <p className="text-xs text-zinc-600">Hasn't run yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {runs.map((r) => (
                      <li key={r.runId || r._id} className="text-xs flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          ['created', 'published'].includes(r.status) ? 'bg-emerald-400' :
                          r.status === 'failed' || r.status === 'zombie' ? 'bg-red-400' :
                          r.status === 'started' ? 'bg-sky-400 animate-pulse' : 'bg-zinc-600'
                        }`} />
                        <span className="text-zinc-400 w-28 shrink-0">{new Date(r.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-zinc-300">{r.status.replace(/_/g, ' ')}</span>
                        {r.error && <span className="text-red-400 truncate" title={r.error}>· {r.error}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Switch = ({ on, onChange, disabled, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    disabled={disabled}
    title={title || (on ? 'Disable task' : 'Enable task')}
    className={`relative shrink-0 w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-zinc-700'}`}
  >
    <span className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>
);

const addHours = (hhmm, h) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return `${String((hh + h) % 24).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}`;
};

export default AutopilotPage;
