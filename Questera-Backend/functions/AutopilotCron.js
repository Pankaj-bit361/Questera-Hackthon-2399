const AutopilotConfig = require('../models/autopilotConfig');

let started = false;

const TICK_INTERVAL_MS = 60 * 1000;

// Cap work per tick so one user with many configs cannot starve the others.
const MAX_PER_TICK = 5;

/**
 * Autopilot scheduling cron.
 *
 * Replaces the previous approach - an hourly interval that fired when
 * `new Date().getHours() === 8`, guarded by a module-scope "have I run today"
 * string. That guard reset on every pm2 restart (so a restart near 08:00 could
 * double-run), evaluated the hour in the server's timezone rather than the
 * user's, and offered no protection at all across multiple instances.
 *
 * Instead each config carries its own `nextRunAt`. This ticks every minute,
 * claims due configs with an atomic findOneAndUpdate, and runs them.
 */
function startAutopilotCron() {
  if (started) return;
  started = true;

  setInterval(async () => {
    try {
      // Lazily required inside the tick to avoid a require cycle at boot.
      const AutopilotService = require('./AutopilotService');
      const autopilotService = new AutopilotService();

      const now = new Date();
      const due = await AutopilotConfig.findDueConfigs(now).limit(MAX_PER_TICK);
      if (due.length === 0) return;

      console.log(`🤖 [AUTOPILOT] ${due.length} config(s) due`);

      for (const candidate of due) {
        // Atomically claim this config by pushing nextRunAt forward before
        // doing any work. If another instance got here first its nextRunAt is
        // already in the future and this update matches nothing, so we skip.
        const claimUntil = new Date(now.getTime() + 60 * 60 * 1000);
        const config = await AutopilotConfig.findOneAndUpdate(
          {
            _id: candidate._id,
            $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }],
          },
          { $set: { nextRunAt: claimUntil } },
          { new: true }
        );

        if (!config) {
          console.log(`🤖 [AUTOPILOT] ${candidate.chatId} claimed elsewhere, skipping`);
          continue;
        }

        try {
          console.log(`🤖 [AUTOPILOT] Running ${config.platform} autopilot for chat ${config.chatId}`);
          const result = await autopilotService.runForChat(config);

          if (result?.skipped) {
            console.log(`🤖 [AUTOPILOT] ${config.chatId} skipped: ${result.reason}`);
          } else {
            const posts = result?.execution?.feedPosts?.length || 0;
            console.log(`🤖 [AUTOPILOT] ${config.chatId} produced ${posts} post(s)`);
          }
        } catch (error) {
          console.error(`❌ [AUTOPILOT] Run failed for ${config.chatId}:`, error.message);

          // runForChat sets nextRunAt on its own happy path; on failure it may
          // not have, so make sure we do not retry in a tight loop.
          try {
            const fresh = await AutopilotConfig.findById(config._id);
            if (fresh) {
              fresh.lastRunAt = new Date();
              fresh.lastRunResult = 'failed';
              fresh.lastRunSummary = error.message;
              fresh.scheduleNextRun();
              await fresh.save();
            }
          } catch (saveErr) {
            console.error('❌ [AUTOPILOT] Could not record failure:', saveErr.message);
          }
        }
      }
    } catch (err) {
      console.error('❌ [AUTOPILOT] Cron tick failed:', err.message);
    }
  }, TICK_INTERVAL_MS);

  console.log('🤖 [CRON] Autopilot cron started - checking every minute for due configs');
}

module.exports = { startAutopilotCron };
