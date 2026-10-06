const { resumeStuckJobs } = require('./videoJobRunner');

let started = false;

function startMediaJobCron() {
  if (started) return;
  started = true;
  setInterval(async () => {
    try {
      const { VideoController, KieVideoController, SeedanceVideoController, OmniVideoController } = require('./Video');
      const resumed = await resumeStuckJobs({
        veo: new VideoController(),
        kie: new KieVideoController(),
        seedance: new SeedanceVideoController(),
        omni: new OmniVideoController(),
      });
      if (resumed > 0) console.log(`🎬 [CRON] Resumed ${resumed} stuck video jobs`);
    } catch (err) {
      console.error('❌ [CRON] Media job resume failed:', err.message);
    }
  }, 60 * 1000);
  console.log('🎬 [CRON] Media job resume cron started - checking every minute');
}

module.exports = { startMediaJobCron };
