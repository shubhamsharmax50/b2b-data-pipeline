/**
 * Pipeline Service — runPipeline()
 *
 * Full data pipeline: Scrape → Clean → Score → Save to MongoDB
 *
 * Execution order (source = 'auto'):
 *   1. Algolia/YC API    — fast, rich data; needs a live ALGOLIA_API_KEY
 *   2. HN Firebase API   — always free; uses Cheerio to enrich descriptions
 *   3. Seed data         — 30 curated B2B companies; guaranteed to work
 *
 * The pipeline stops at the first source that saves ≥ 1 record.
 * Subsequent sources are skipped unless forced via the `source` parameter.
 *
 * Manual source override:
 *   runPipeline('algolia')  — force Algolia only
 *   runPipeline('cheerio')  — force HN API + Cheerio
 *   runPipeline('seed')     — force seed data only
 *   runPipeline('auto')     — full cascade (default)
 */

const { runScraper: runAlgoliaScraper } = require('../scrapers/ycScraper');
const { runCheerioScraper }             = require('../scrapers/cheerioScraper');
const { seedDatabase }                  = require('./seedService');

let pipelineRunning = false;
let lastRunAt       = null;
let lastRunResult   = null;
let lastSource      = null;

// ── Main pipeline function ────────────────────────────────────────────────────
async function runPipeline(source = 'auto') {
  if (pipelineRunning) {
    console.log('⚠️  [Pipeline] Already running — skipping duplicate trigger');
    return { skipped: true, reason: 'already_running' };
  }

  pipelineRunning = true;
  const startedAt = new Date();
  console.log(`\n🚀 [Pipeline] Started at ${startedAt.toISOString()} (source: ${source})`);

  try {
    let result;
    let usedSource = source;

    // ── Forced single sources ─────────────────────────────────────────────
    if (source === 'algolia') {
      console.log('🔌 [Pipeline] Algolia / YC API');
      result     = await runAlgoliaScraper();
      usedSource = 'algolia';

    } else if (source === 'cheerio') {
      console.log('🕷️  [Pipeline] HN Firebase API + Cheerio');
      result     = await runCheerioScraper();
      usedSource = 'cheerio';

    } else if (source === 'seed') {
      console.log('🌱 [Pipeline] Seed data');
      result     = await seedDatabase();
      usedSource = 'seed';

    } else {
      // ── Auto cascade: Algolia → Cheerio/HN → Seed ─────────────────────
      console.log('🔌 [Pipeline] Trying Algolia (YC API) first…');

      // 1️⃣ Algolia
      try {
        result     = await runAlgoliaScraper();
        usedSource = 'algolia';
        console.log(`   ↳ Algolia saved: ${result.inserted + result.updated ?? 0} records`);
      } catch (algoliaErr) {
        console.warn(`⚠️  [Pipeline] Algolia failed: "${algoliaErr.message}"`);
      }

      // 2️⃣ HN Firebase API + Cheerio (if Algolia saved nothing)
      if (!result || (result.inserted + result.updated === 0 && result.errors > 0)) {
        console.log('🕷️  [Pipeline] Trying HN Firebase API + Cheerio…');
        try {
          result     = await runCheerioScraper();
          usedSource = 'cheerio';
          console.log(`   ↳ Cheerio saved: ${result.saved ?? 0} records`);
        } catch (cheerioErr) {
          console.warn(`⚠️  [Pipeline] HN scraper failed: "${cheerioErr.message}"`);
        }
      }

      // 3️⃣ Seed data (guaranteed fallback — always works)
      const savedCount = result?.saved ?? result?.inserted ?? 0;
      if (!result || savedCount === 0) {
        console.log('🌱 [Pipeline] All live scrapers yielded 0 results — using seed data…');
        result     = await seedDatabase();
        usedSource = 'seed';
      }
    }

    lastRunAt     = new Date();
    lastSource    = usedSource;
    lastRunResult = {
      ...result,
      source:     usedSource,
      startedAt,
      finishedAt: lastRunAt,
      durationMs: lastRunAt - startedAt,
    };

    const secs = (lastRunResult.durationMs / 1000).toFixed(1);
    const saved = result.saved ?? ((result.inserted ?? 0) + (result.updated ?? 0)) ?? 0;
    console.log(`✅ [Pipeline] Finished in ${secs}s via "${usedSource}" — saved: ${saved}`);

    return lastRunResult;

  } catch (err) {
    console.error('❌ [Pipeline] Fatal error:', err.message);
    lastRunResult = { error: err.message, startedAt, finishedAt: new Date() };
    throw err;

  } finally {
    pipelineRunning = false;
  }
}

// ── Status — used by GET /api/leads/scrape/status ────────────────────────────
function getPipelineStatus() {
  return {
    running:      pipelineRunning,
    lastRunAt,
    lastSource,
    lastRunResult,
  };
}

module.exports = { runPipeline, getPipelineStatus };
