const cron = require('node-cron');
const { runPipeline } = require('../services/pipelineService');

/**
 * Scheduler — runs the full data pipeline automatically every 6 hours.
 *
 * Cron syntax:  minute  hour   day  month  weekday
 *               0       0,6,12,18  *    *      *
 *
 * On each run the pipeline will:
 *   1. Try the Algolia/YC scraper (fast, rich data)
 *   2. Fall back to the Cheerio/HN scraper if Algolia fails
 *
 * The pipeline is idempotent — running it multiple times won't create
 * duplicate records (upsert by ycId / company name).
 */
function startScheduler() {
  console.log('⏰ Scheduler started — pipeline will run every 6 hours (00:00, 06:00, 12:00, 18:00)');

  cron.schedule('0 */6 * * *', async () => {
    console.log(`\n🔄 [Scheduler] Triggered at ${new Date().toISOString()}`);
    try {
      const result = await runPipeline('auto');
      console.log('✅ [Scheduler] Pipeline complete:', JSON.stringify({
        source:    result.source,
        saved:     result.saved ?? result.inserted,
        errors:    result.errors,
        durationMs: result.durationMs,
      }));
    } catch (err) {
      console.error('❌ [Scheduler] Pipeline failed:', err.message);
      // Pipeline stays alive — error is logged, next scheduled run will retry
    }
  });
}

module.exports = { startScheduler };
