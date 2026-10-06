let started = false;

// Engagement moves slowly and X's free tier is stingy with reads, so this runs
// far less often than the publishing cron.
const INTERVAL_MS = 30 * 60 * 1000;

/**
 * Periodically pulls engagement back from the platforms so the autopilot's
 * "top performing posts" signal is based on real numbers.
 */
function startEngagementCron() {
  if (started) return;
  started = true;

  setInterval(async () => {
    try {
      const EngagementSync = require('./EngagementSync');
      const r = await new EngagementSync().syncAll();
      if (r.instagram + r.linkedin + r.twitter > 0) {
        console.log(`📊 [CRON] Engagement refreshed: ${r.instagram} Instagram, ${r.linkedin} LinkedIn, ${r.twitter} X`);
      }
    } catch (err) {
      console.error('❌ [CRON] Engagement sync failed:', err.message);
    }
  }, INTERVAL_MS);

  console.log('📊 [CRON] Engagement sync started - every 30 minutes');
}

module.exports = { startEngagementCron };
