const AutopilotTask = require('../models/autopilotTask');
const { activePause } = require('./AccountHealth');
const ScheduledPost = require('../models/scheduledPost');
const { OpenRouterProvider } = require('../agent/LLMProvider');
const AutopilotTaskRun = require('../models/autopilotTaskRun');
const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');

/** How many due tasks one tick will pick up. */
const CLAIM_BATCH_SIZE = 25;

/** A running task with no heartbeat for this long is presumed dead. */
const STALE_MS = 10 * 60 * 1000;

/**
 * Refuse to fire a task twice inside this window.
 *
 * Belt and braces against a clock change or a mis-scheduled nextRunAt landing
 * two firings on top of each other. The tightest legitimate cadence is a few
 * hours apart, so 30 minutes is safely below it.
 */
const REVIEW_EVERY_DAYS = 7;
const MIN_GAP_MS = 30 * 60 * 1000;

const SKIP_STATUSES = new Set(['skipped_mingap', 'skipped_budget', 'skipped_quiet', 'skipped_disabled', 'skipped_paused']);

let ticking = false;

/**
 * Runs autopilot tasks on their schedules.
 *
 * The design follows the pattern proven in the self-growing-site scheduler:
 * the task document is the CONFIG and carries the claim in its `status` field;
 * AutopilotTaskRun is the HISTORY and is keyed on the scheduled slot, which is
 * what makes a retry after a crash safe rather than duplicating work.
 */
class TaskRunner {
  constructor() {
    const AutopilotService = require('./AutopilotService');
    this.autopilot = new AutopilotService();
  }

  /** Everything due right now. Each is claimed independently. */
  async tick() {
    const now = new Date();
    const due = await AutopilotTask.find({
      enabled: true,
      status: 'idle',
      $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }],
    })
      .limit(CLAIM_BATCH_SIZE)
      .select('_id taskId')
      .lean();

    for (const t of due) {
      this.claimAndRun(t.taskId).catch((e) =>
        console.error(`❌ [TASKS] run crashed for ${t.taskId}:`, e.message)
      );
    }
    return due.length;
  }

  /**
   * Put back work a dead worker left behind.
   *
   * A task stuck at `running` with a stale heartbeat returns to `idle` so the
   * next tick can claim it - the slot-keyed ledger row is what makes that
   * retry safe. Its run row is marked `zombie` rather than deleted, so the
   * history stays honest about what happened.
   */
  async zombieSweep() {
    const stale = new Date(Date.now() - STALE_MS);

    const tasks = await AutopilotTask.updateMany(
      { status: 'running', heartbeatAt: { $lt: stale } },
      { $set: { status: 'idle' } }
    );
    const runs = await AutopilotTaskRun.updateMany(
      { status: 'started', heartbeatAt: { $lt: stale } },
      { $set: { status: 'zombie', finishedAt: new Date() } }
    );

    if (tasks.modifiedCount) {
      console.log(`🧟 [TASKS] reclaimed ${tasks.modifiedCount} stuck task(s), ${runs.modifiedCount} run(s) marked zombie`);
    }
  }

  /** Runs already recorded for this task today, in its own timezone. */
  async dailyCapExceeded(task) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Counts posts actually produced, not attempts. A cap on attempts would
    // let a failing task burn its whole quota on errors and go quiet before
    // it could trip auto-disable; failures are already rate-limited by the
    // exponential backoff instead.
    const count = await AutopilotTaskRun.countDocuments({
      taskId: task.taskId,
      startedAt: { $gte: since },
      status: { $in: ['created', 'published'] },
    });
    return count >= (task.dailyRunCap || 4);
  }

  async touch(task, run) {
    const now = new Date();
    await AutopilotTask.updateOne({ _id: task._id }, { $set: { heartbeatAt: now } });
    if (run?._id) await AutopilotTaskRun.updateOne({ _id: run._id }, { $set: { heartbeatAt: now } });
  }

  async setStep(run, step) {
    if (!run?._id) return;
    await AutopilotTaskRun.updateOne({ _id: run._id }, { $set: { step, heartbeatAt: new Date() } });
  }

  /**
   * Claim one task and run it. Everything below the claim is guarded so a
   * crash leaves recoverable state rather than a wedged task.
   */
  async claimAndRun(taskId, opts = {}) {
    const now = new Date();

    const task = await AutopilotTask.findOneAndUpdate(
      {
        taskId,
        status: 'idle',
        enabled: true,
        $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }],
      },
      { $set: { status: 'running', heartbeatAt: now } },
      { new: true }
    );
    // Lost the race, disabled, or retimed out from under us.
    if (!task) return;

    if (task.lastFiredAt && now - task.lastFiredAt < MIN_GAP_MS) {
      return this.finish(task, null, 'skipped_mingap', 'Fired too recently - refusing to double-fire');
    }

    // The slot, not wall-clock now, is the idempotency key: a retry after a
    // crash reuses it and finds the same ledger row.
    const slot = task.nextRunAt || now;
    let run = await AutopilotTaskRun.findOne({ taskId: task.taskId, slot });
    const isResume = Boolean(run);

    if (run && ['created', 'published'].includes(run.status)) {
      // Already done. A stray retry closes the loop without redoing the work.
      return this.finish(task, run, run.status, run.detail || 'Already resolved');
    }

    if (!isResume) {
      // Gate NEW work only. A resumed run must be allowed to finish even if
      // the day's quota filled while it was interrupted.
      if (await this.dailyCapExceeded(task)) {
        return this.finish(task, null, 'skipped_budget', 'Daily run cap reached for this task');
      }
    }

    if (run) {
      run.status = 'started';
      run.heartbeatAt = now;
      await run.save();
    } else {
      run = await AutopilotTaskRun.create({
        taskId: task.taskId,
        userId: task.userId,
        platform: task.platform,
        slot,
        step: 'claim',
        status: 'started',
      });
    }

    // A product video can take many minutes; keep the heartbeat fresh so the zombie sweep never takes a run that
    // is still working (it would run again and post twice).
    const beat = setInterval(() => this.touch(task, run).catch(() => {}), 60 * 1000);
    try {
      const result = await this.execute(task, run, opts);
      return this.finish(task, run, 'created', result.detail, result);
    } catch (err) {
      // Quiet hours or a paused platform: not tried, so neither a failure nor a reason to back off.
      if (err.skip) return this.finish(task, run, err.skip, err.message);
      console.error(`❌ [TASKS] ${task.name}:`, err.message);
      return this.finish(task, run, 'failed', err.message, {
        // Credits and provider outages are infrastructure, not this task being
        // broken - they must not count toward auto-disabling it.
        infra: /credit|quota|rate limit|ECONN|ETIMEDOUT|503|502/i.test(err.message),
        needsReview: /no results|no usable|returned no/i.test(err.message),
      });
    } finally {
      clearInterval(beat);
    }
  }

  /**
   * Produce one post for this task.
   */
  async execute(task, run, opts = {}) {
    await this.setStep(run, 'plan');
    if (task.kind === 'daily_plan') return this.executeDailyPlan(task, run, opts);

    // Scope to the task's autopilot; legacy tasks without one fall back to the user.
    const scope = task.autopilotId ? { autopilotId: task.autopilotId } : { userId: task.userId };
    const config = await AutopilotConfig.findOne({ ...scope, platform: task.platform });
    const memory = await AutopilotMemory.findOne(scope);

    if (!memory) throw new Error('No brand profile - crawl the website first');

    // Quiet hours belong to the integration, not the individual task.
    // A manual "Run now" is the user overriding the schedule - honour it.
    if (!opts.force && config?.isQuietHours?.()) {
      const err = new Error('Quiet hours');
      err.skip = 'skipped_quiet';
      throw err;
    }

    // Paused by the user or by the supervisor.
    if (config?.pausedUntil && config.pausedUntil > new Date()) {
      const err = new Error(`Autopilot is paused until ${config.pausedUntil.toISOString()}`);
      err.skip = 'skipped_paused';
      throw err;
    }

    // The platform blocked or flagged the account, or its login broke (AccountHealth): make nothing for it.
    const pause = await activePause(task.userId, task.platform);
    if (pause) {
      const err = new Error(`Posting to ${task.platform} is paused until ${pause.until.toISOString()}: ${pause.reason}`);
      err.skip = 'skipped_paused';
      throw err;
    }

    // Pick a fact this task has not leaned on recently.
    const fresh = memory.freshProofPoints?.(14, task.platform) || [];
    const proofPoint = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : '';

    // Decide what THIS run posts: the task is a standing beat, the run is one
    // concrete idea that has not been done recently.
    const brief = await this.planRun(task, memory, proofPoint);

    // A task maps onto the same shape the per-post generator already takes.
    const postPlan = {
      time: task.schedule?.times?.[0] || '09:00',
      format: task.format,
      theme: task.theme || task.name,
      hookStyle: brief.hookStyle || task.hookStyle,
      goal: task.goal,
      proofPoint: brief.useProofPoint === false ? '' : proofPoint,
      promptSuggestion: brief.prompt,
      linkUrl: task.linkUrl || '',
      cta: task.cta || '',
    };

    // The generator expects a config-shaped object; give it the integration's
    // settings with this task's platform.
    const effectiveConfig = config || {
      userId: task.userId,
      platform: task.platform,
      permissions: { requireApproval: true },
      contentPreferences: {},
      timezone: () => task.timezone(),
    };

    await this.setStep(run, task.format === 'video' ? 'media' : 'copy');
    const result = await this.autopilot.createFeedPost(postPlan, effectiveConfig, memory);

    await this.setStep(run, 'save');

    // Record the fact as used and log what this task produced.
    memory.addContentHistory?.({
      date: new Date(),
      postId: result.postId,
      platform: task.platform,
      type: 'feed',
      format: result.postType,
      caption: result.caption || '',
      theme: task.theme,
      hookStyle: task.hookStyle,
      performance: {},
    });
    await memory.save();

    const score = result.review?.score;
    const verdict = result.status === 'pending_approval'
      ? (typeof score === 'number' ? `Held for approval - review score ${score}/100` : 'Held for approval')
      : `Auto-scheduled - review score ${score}/100`;
    return {
      detail: `${verdict}: ${result.postType} post`,
      reviewScore: typeof score === 'number' ? score : null,
      postId: result.postId,
      postType: result.postType,
      imageUrl: result.imageUrl,
      videoUrl: result.videoUrl,
      proofPointUsed: proofPoint,
    };
  }

  /**
   * The platform's daily plan: the planner decides today's posts and the autopilot makes them
   * (AutopilotService.runForChat). Skips map onto the run ledger like any task's.
   */
  async executeDailyPlan(task, run, opts = {}) {
    const scope = task.autopilotId ? { autopilotId: task.autopilotId } : { userId: task.userId };
    const config = await AutopilotConfig.findOne({ ...scope, platform: task.platform });
    if (!config || !config.enabled || config.permissions?.autoPost === false) {
      const err = new Error('The daily plan is switched off');
      err.skip = 'skipped_disabled';
      throw err;
    }
    if (config.pausedUntil && config.pausedUntil > new Date()) {
      const err = new Error(`Autopilot is paused until ${config.pausedUntil.toISOString()}`);
      err.skip = 'skipped_paused';
      throw err;
    }
    await this.setStep(run, 'copy');
    const result = await this.autopilot.runForChat(config, { force: opts.force });
    if (result?.skipped) {
      const err = new Error(result.reason === 'quiet_hours' ? 'Quiet hours' : `Skipped: ${result.reason}`);
      err.skip = { quiet_hours: 'skipped_quiet', account_paused: 'skipped_paused' }[result.reason] || 'skipped_budget';
      throw err;
    }
    if (result?.plan?.failed) throw new Error(result.plan.reasoning);
    const made = (result?.execution?.feedPosts || []).filter((p) => p.postId);
    const skippedBudget = (result?.execution?.feedPosts || []).find((p) => p.skip);
    if (!made.length && skippedBudget) {
      const err = new Error(skippedBudget.error);
      err.skip = 'skipped_budget';
      throw err;
    }
    const first = made[0] || {};
    return {
      detail: made.length
        ? `Daily plan: ${made.length} post${made.length > 1 ? 's' : ''} (${made.map((p) => p.status === 'pending_approval' ? 'waiting for approval' : p.status).join(', ')})`
        : `Daily plan: nothing to post today. ${result?.plan?.reasoning || ''}`.trim(),
      reviewScore: typeof first.review?.score === 'number' ? first.review.score : null,
      postId: first.postId || null,
      postType: first.postType || null,
      imageUrl: first.imageUrl || null,
      videoUrl: first.videoUrl || null,
    };
  }

  /**
   * Keep the config's daily-plan task in step with it: one per autopilot and platform, running at the config's
   * daily run time in its timezone, switched on while the config is.
   */
  static async syncDailyPlan(config) {
    const scope = config.autopilotId ? { autopilotId: config.autopilotId } : { userId: config.userId, autopilotId: null };
    const want = {
      enabled: !!config.enabled && config.permissions?.autoPost !== false,
      times: [config.dailyRunTime || '08:00'],
      timezone: typeof config.timezone === 'function' ? config.timezone() : 'UTC',
    };
    let task = await AutopilotTask.findOne({ ...scope, platform: config.platform, kind: 'daily_plan' });
    if (!task) {
      task = new AutopilotTask({
        ...scope,
        userId: config.userId,
        platform: config.platform,
        kind: 'daily_plan',
        name: 'Daily plan',
        description: "The planner decides the day's posts from the brand, recent posts and results",
        source: 'manual',
        dailyRunCap: 1,
        schedule: { timesPerDay: 1, times: want.times, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: want.timezone },
        enabled: want.enabled,
      });
      if (want.enabled) task.scheduleNextRun();
      await task.save();
      return task;
    }
    const retimed = task.schedule?.times?.[0] !== want.times[0] || task.schedule?.timezone !== want.timezone;
    const switchedOn = want.enabled && !task.enabled;
    task.enabled = want.enabled;
    task.schedule.times = want.times;
    task.schedule.timezone = want.timezone;
    if (retimed || switchedOn) {
      task.configVersion = (task.configVersion || 0) + 1;
      if (want.enabled) task.scheduleNextRun();
    }
    await task.save();
    return task;
  }

  /** Every config gets its daily-plan task (configs from before the merge included). */
  static async syncAllDailyPlans() {
    const configs = await AutopilotConfig.find({});
    for (const config of configs) {
      await TaskRunner.syncDailyPlan(config).catch((e) => console.error(`❌ [TASKS] daily plan sync for ${config._id}:`, e.message));
    }
    return configs.length;
  }

  /**
   * What this run should post. Looks at the task's angle, the brand, the
   * fact chosen for today and the last few posts THIS task produced (with
   * their engagement when the platform reports it), and returns one concrete
   * idea plus the visual concept for the image/video model. Falls back to the
   * bare angle if the model is unavailable, so a run never fails on this.
   */
  async planRun(task, memory, proofPoint) {
    const fallback = { prompt: task.angle || task.description, hookStyle: task.hookStyle, useProofPoint: true };
    try {
      const runs = await AutopilotTaskRun.find({ taskId: task.taskId, postId: { $ne: null } }).sort({ startedAt: -1 }).limit(6).select('postId');
      const posts = runs.length
        ? await ScheduledPost.find({ postId: { $in: runs.map((r) => r.postId) } }).select('caption postType engagement status')
        : [];
      const recent = posts.map((p) => {
        const e = p.engagement || {};
        const metrics = e.lastUpdated ? ` (${e.likes || 0} likes, ${e.comments || 0} comments, ${e.impressions || e.reach || 0} impr)` : '';
        return `- [${p.postType}]${metrics} ${(p.caption || '').replace(/\s+/g, ' ').slice(0, 160)}`;
      });
      const brand = memory.brand || {};

      const llm = this.llm || (this.llm = new OpenRouterProvider({ model: process.env.AUTOPILOT_LLM_MODEL || 'google/gemini-3.7-flash' }));
      const out = await llm.chatJSON([
        { role: 'system', content: `You decide the single post an autonomous ${task.platform} account publishes right now for one recurring task. Text and images are generated from a prompt; a video is recorded from the company's real website and screens when it has a website, otherwise generated. There are no photos or customer footage. Be concrete and different from what this task already posted. Respond with ONLY JSON: {"idea":"one sentence, the specific post","hookStyle":"one word","visualConcept":"one or two sentences the image/video model can render, or empty for text posts","useProofPoint":true}` },
        { role: 'user', content: `## Task
${task.name} [${task.format}]
Standing angle: ${task.angle || task.description}
Goal: ${task.goal || 'reach'}

## Company
${brand.companyName || ''} - ${brand.oneLiner || ''}
Audience: ${brand.targetAudience || 'n/a'}. Tone: ${brand.tone || 'n/a'}. Visual style: ${brand.visualStyle || 'n/a'}.
Topics: ${(brand.topicsAllowed || []).join(', ')}

## Fact available for today
${proofPoint || '(none - do not invent one)'}

## What this task already posted (newest first)
${recent.join('\n') || '(nothing yet)'}

## What worked on ${task.platform} (all tasks)
${require('./Performance').describe(memory.stats, task.platform)}

## Posts the user rejected (do not make these mistakes again)
${(memory.rejections || []).slice(0, 10).map((r) => `- ${String(r.reason || 'other').replace('_', ' ')}${r.note ? `: "${r.note}"` : ''}${r.caption ? ` - "${r.caption.slice(0, 100)}"` : ''}`).join('\n') || '(none)'}

Pick today's post. Do not repeat an idea above; if the metrics show a clear winner, build on what made it work.` },
      ], { temperature: 0.8, fallback: null });

      if (!out?.idea) return fallback;
      const visual = task.format === 'text' || task.format === 'thread' ? '' : (out.visualConcept || '');
      return {
        prompt: visual ? `${out.idea} Visual: ${visual}` : out.idea,
        hookStyle: out.hookStyle || task.hookStyle,
        useProofPoint: out.useProofPoint !== false,
      };
    } catch (err) {
      console.warn(`[TASKS] planRun fell back for ${task.taskId}: ${err.message}`);
      return fallback;
    }
  }

  /**
   * Weekly self-review. For every enabled autopilot platform whose last review
   * is older than REVIEW_EVERY_DAYS, ask the platform agent to review the task
   * set and apply the safe part of its suggestions on its own - schedule,
   * link and CTA changes. Format changes and pausing a task are left for the
   * human, and everything applied is written to the autopilot's agentLog.
   */
  async selfReview() {
    const AutopilotConfig = require('../models/autopilotConfig');
    const AutopilotMemory = require('../models/autopilotMemory');
    const Autopilot = require('../models/autopilot');
    const TaskPlanner = require('./TaskPlanner');

    const cutoff = new Date(Date.now() - REVIEW_EVERY_DAYS * 86400000);
    const due = await AutopilotConfig.find({
      enabled: true,
      autopilotId: { $type: 'string' },
      $or: [{ lastReviewAt: null }, { lastReviewAt: { $lt: cutoff } }],
    }).limit(3);

    for (const config of due) {
      // Claim so two instances do not review the same autopilot at once.
      const claimed = await AutopilotConfig.findOneAndUpdate(
        { _id: config._id, $or: [{ lastReviewAt: null }, { lastReviewAt: { $lt: cutoff } }] },
        { $set: { lastReviewAt: new Date() } },
        { new: true }
      );
      if (!claimed) continue;

      try {
        const taskCount = await AutopilotTask.countDocuments({ autopilotId: config.autopilotId, platform: config.platform, kind: { $ne: 'daily_plan' } });
        if (taskCount === 0) continue;
        const memory = await AutopilotMemory.findOne({ autopilotId: config.autopilotId });
        if (!memory?.brand) continue;

        const review = await new TaskPlanner().review({
          userId: config.userId, autopilotId: config.autopilotId, platform: config.platform, brand: memory.brand, website: memory.website,
        });
        if (!review.success) continue;

        const applied = [];
        for (const sg of review.suggestions) {
          if (!sg.taskId) continue;
          const safe = {};
          if (sg.patch.schedule) safe.schedule = sg.patch.schedule;
          if ('linkUrl' in sg.patch) safe.linkUrl = sg.patch.linkUrl;
          if (sg.patch.cta) safe.cta = sg.patch.cta;
          if (Object.keys(safe).length === 0) continue;
          const task = await AutopilotTask.findOne({ taskId: sg.taskId });
          if (!task) continue;
          if (safe.schedule) {
            task.schedule = { ...task.schedule.toObject(), ...safe.schedule };
            const t = [...task.schedule.times];
            while (t.length < task.schedule.timesPerDay) t.push('09:00');
            task.schedule.times = t.slice(0, task.schedule.timesPerDay);
            if (task.enabled) task.scheduleNextRun();
          }
          if ('linkUrl' in safe) task.linkUrl = safe.linkUrl;
          if (safe.cta) task.cta = safe.cta;
          task.configVersion += 1;
          await task.save();
          applied.push(`${task.name}: ${sg.title}`);
        }

        await Autopilot.updateOne(
          { autopilotId: config.autopilotId },
          { $push: { agentLog: { $each: [{ date: new Date(), platform: config.platform, summary: review.summary, insights: review.insights, applied }], $position: 0, $slice: 20 } } }
        );
        console.log(`🧠 [TASKS] ${config.platform} agent reviewed ${config.autopilotId}: ${applied.length} change(s) applied`);
      } catch (err) {
        console.error(`❌ [TASKS] self-review failed for ${config.autopilotId}/${config.platform}:`, err.message);
      }
    }
  }

  /**
   * Close out a run: write the ledger row, then reschedule the task.
   *
   * The task write is conditioned on `configVersion` still matching what it
   * was at claim time. If the user retimed the task while this run was in
   * flight, we leave their change alone rather than overwriting nextRunAt with
   * one computed from stale settings.
   */
  async finish(task, run, status, detail, extra = {}) {
    const isSkip = SKIP_STATUSES.has(status);
    const isFailure = status === 'failed' && !extra.infra;

    // Only a genuine success clears the failure record. A skip means "we did
    // not try", and an infra failure means "not this task's fault" - neither
    // is evidence the task is healthy. Resetting on a skip made auto-disable
    // unreachable: a task that failed up to its daily cap got its history
    // wiped by the resulting skip and could fail forever.
    const succeeded = status === 'created' || status === 'published';
    const failures = isFailure
      ? (task.consecutiveFailures || 0) + 1
      : succeeded
        ? 0
        : task.consecutiveFailures || 0;
    const exhausted = failures >= AutopilotTask.MAX_CONSECUTIVE_FAILURES;

    if (run?._id) {
      await AutopilotTaskRun.updateOne(
        { _id: run._id },
        {
          $set: {
            status,
            step: 'done',
            detail: String(detail || '').slice(0, 500),
            finishedAt: new Date(),
            postId: extra.postId || null,
            postType: extra.postType || null,
            imageUrl: extra.imageUrl || null,
            videoUrl: extra.videoUrl || null,
            proofPointUsed: extra.proofPointUsed || null,
          },
        }
      );
    }

    // Skipped for running too soon: the same slot comes round again once the gap has passed. Any other skip
    // (quiet hours, paused, cap reached) moves on to the next slot instead of retrying every minute.
    const normalNext = status === 'skipped_mingap' ? task.nextRunAt : task.scheduleNextRun();
    const backoffMins = isFailure
      ? AutopilotTask.BACKOFF_MINUTES[Math.min(failures - 1, AutopilotTask.BACKOFF_MINUTES.length - 1)]
      : 0;
    const nextRunAt = backoffMins ? new Date(Date.now() + backoffMins * 60000) : normalNext;

    const set = {
      status: 'idle',
      consecutiveFailures: failures,
      lastRunAt: new Date(),
      lastRunResult: isSkip ? 'skipped' : status === 'created' || status === 'published' ? 'success' : 'failed',
      lastRunSummary: String(detail || '').slice(0, 300),
    };
    if (!isSkip) set.lastFiredAt = new Date();
    if (status !== 'skipped_mingap') set.nextRunAt = nextRunAt;
    if (extra.needsReview) {
      set.needsReview = true;
      set.needsReviewReason = String(detail || '').slice(0, 300);
    }
    if (exhausted) {
      set.enabled = false;
      set.needsReview = true;
      set.needsReviewReason = `Disabled after ${failures} consecutive failures: ${detail}`;
      console.warn(`🛑 [TASKS] "${task.name}" disabled after ${failures} failures`);
    }

    const inc = isSkip ? {} : { runCount: 1 };
    if (status === 'created' || status === 'published') inc.postsCreated = 1;

    const res = await AutopilotTask.updateOne(
      { taskId: task.taskId, configVersion: task.configVersion },
      { $set: set, $inc: inc }
    );

    if (res.matchedCount === 0) {
      // The user edited this task mid-run. Release the claim and leave their
      // schedule as they set it.
      await AutopilotTask.updateOne({ taskId: task.taskId }, { $set: { status: 'idle' } });
      console.log(`↩️  [TASKS] "${task.name}" was edited during the run - kept the user's schedule`);
    }

    return { status, detail };
  }
}

/** Wire the tick and the sweep. Idempotent. */
function startTaskCron() {
  if (ticking) return;
  ticking = true;

  const runner = new TaskRunner();

  // The daily plans run on this engine too (they used to have a cron of their own); make sure every config has its
  // task before the first tick, and again hourly in case a config changed outside the routes.
  TaskRunner.syncAllDailyPlans().catch((e) => console.error('❌ [TASKS] daily plan sync failed:', e.message));
  setInterval(() => {
    TaskRunner.syncAllDailyPlans().catch((e) => console.error('❌ [TASKS] daily plan sync failed:', e.message));
  }, 60 * 60 * 1000);

  setInterval(() => {
    runner.tick().catch((e) => console.error('❌ [TASKS] tick failed:', e.message));
  }, 60 * 1000);

  // Each site's facts are read again weekly, which is also how new pages and posts are found (functions/SiteFacts.js).
  setInterval(() => {
    require('./SiteFacts').refreshDue().catch((e) => console.error('❌ [FACTS] refresh failed:', e.message));
    // Blog to social: new articles in each site's feed, daily.
    require('./SiteFacts').checkFeedsDue().catch((e) => console.error('❌ [FEED] check failed:', e.message));
    // Replies to new comments, drafted for the user to approve (functions/ReplyDrafts.js).
    require('./ReplyDrafts').collectDue().catch((e) => console.error('❌ [REPLIES] failed:', e.message));
    // The weekly report, Monday morning in each autopilot's timezone.
    require('./WeeklyReport').sendDue().catch((e) => console.error('❌ [REPORT] failed:', e.message));
  }, 60 * 60 * 1000);

  // The supervisor watches every autopilot for trouble (functions/Supervisor.js).
  setInterval(() => {
    require('./Supervisor').run().catch((e) => console.error('❌ [SUPERVISOR] run failed:', e.message));
  }, 15 * 60 * 1000);

  // The agents review their own task sets weekly; check hourly for due ones.
  setInterval(() => {
    runner.selfReview().catch((e) => console.error('❌ [TASKS] self-review failed:', e.message));
  }, 60 * 60 * 1000);

  setInterval(() => {
    runner.zombieSweep().catch((e) => console.error('❌ [TASKS] sweep failed:', e.message));
  }, 5 * 60 * 1000);

  console.log('🗂️  [CRON] Autopilot task runner started - checking every minute');
}

module.exports = TaskRunner;
module.exports.startTaskCron = startTaskCron;
module.exports.MIN_GAP_MS = MIN_GAP_MS;
module.exports.SKIP_STATUSES = SKIP_STATUSES;
