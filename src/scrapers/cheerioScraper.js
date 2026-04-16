/**
 * Scraper — Hacker News Firebase API  +  Cheerio Meta Enrichment
 *
 * Phase 1 (Axios):
 *   Call the official HN Firebase REST API — public, free, no auth, no rate limits.
 *   GET /v0/showstories.json  → list of up to 200 "Show HN" story IDs
 *   GET /v0/item/{id}.json    → story details (title, url, text)
 *
 * Phase 2 (Cheerio):
 *   For each company that has a website URL, fetch its homepage with Axios
 *   and use Cheerio to extract <meta name="description"> / og:description.
 *   This enriches the description field beyond what the HN title gives us.
 *   Individual enrichments fail gracefully — no company record is lost.
 *
 * Data flow:
 *   HN API (Axios) → parse story titles → Cheerio meta enrichment → clean → score → upsert DB
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const Company = require('../models/Company');
const { scoreCompany } = require('../services/scoringService');

const HN_API_BASE  = 'https://hacker-news.firebaseio.com/v0';
const MAX_STORIES  = 150;   // story IDs to process
const BATCH_SIZE   = 10;    // parallel HN API requests per batch
const BATCH_DELAY  = 300;   // ms between batches (polite to Firebase)
const ENRICH_LIMIT = 30;    // max pages to Cheerio-scrape for descriptions

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Tag detection ─────────────────────────────────────────────────────────────
const TAG_RULES = [
  ['saas',             /saas|subscription|monthly plan/i],
  ['b2b',              /b2b|business|enterprise|team|company/i],
  ['developer tools',  /\bapi\b|sdk|cli|developer|devtool|open.?source/i],
  ['ai',               /\bai\b|gpt|llm|machine learning|artificial intelligence|neural/i],
  ['analytics',        /analytics|dashboard|metrics|reporting|insights/i],
  ['automation',       /automat|workflow|no.?code|low.?code/i],
  ['security',         /secur|auth|oauth|password|encrypt|2fa/i],
  ['fintech',          /fintech|payment|invoice|billing|finance|accounting/i],
  ['marketing',        /marketing|seo|email|campaign|crm|lead gen/i],
  ['productivity',     /productiv|task|project|manage|todo/i],
  ['infrastructure',   /infrastructure|cloud|server|deploy|devops|kubernetes/i],
  ['data engineering', /data pipeline|etl|data engineer|warehouse/i],
];

function detectTags(name = '', desc = '') {
  const text = `${name} ${desc}`.toLowerCase();
  return TAG_RULES.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

// ── Phase 1 — Fetch Show HN story IDs + details via HN Firebase API ───────────
async function fetchShowHNStories() {
  console.log('  📡 Fetching Show HN story IDs from HN Firebase API…');

  const { data: allIds } = await axios.get(
    `${HN_API_BASE}/showstories.json`,
    { timeout: 12000 }
  );

  const ids = (allIds || []).slice(0, MAX_STORIES);
  console.log(`  📋 Got ${ids.length} story IDs. Fetching details in batches of ${BATCH_SIZE}…`);

  const stories    = [];
  const totalBatch = Math.ceil(ids.length / BATCH_SIZE);

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch    = ids.slice(i, i + BATCH_SIZE);

    process.stdout.write(`\r  📄 Batch ${batchNum}/${totalBatch}…`);

    const results = await Promise.allSettled(
      batch.map((id) =>
        axios
          .get(`${HN_API_BASE}/item/${id}.json`, { timeout: 8000 })
          .then((r) => r.data)
      )
    );

    stories.push(
      ...results
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value)
    );

    if (i + BATCH_SIZE < ids.length) await delay(BATCH_DELAY);
  }

  process.stdout.write('\n');
  return stories;
}

// ── Phase 2 — Cheerio meta-description enrichment ────────────────────────────
async function scrapeMetaDescription(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; B2B-Pipeline-Bot/1.0)',
        'Accept':     'text/html,application/xhtml+xml',
      },
      maxRedirects: 3,
    });

    const $       = cheerio.load(data);
    const metaDesc =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      null;

    return metaDesc ? metaDesc.replace(/\s+/g, ' ').trim().substring(0, 500) : null;
  } catch (_) {
    return null; // silently skip — never crash the pipeline over one page
  }
}

// ── Parse a raw HN story into a company object ────────────────────────────────
function parseStory(story) {
  if (!story || !story.title) return null;

  // Only process "Show HN:" posts — these are always creator showcases
  const match = story.title.match(/^Show HN:\s+(.+?)(?:\s*[–—\-]{1,2}\s*(.+))?$/i);
  if (!match) return null;

  const name            = (match[1] || story.title).trim().substring(0, 150);
  const descFromTitle   = match[2] ? match[2].trim().substring(0, 500) : null;
  const descFromText    = story.text
    ? story.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 300)
    : null;

  const website = story.url && !story.url.includes('news.ycombinator.com')
    ? story.url.replace(/\/$/, '')
    : null;

  if (!name || name.length < 2) return null;

  return {
    name,
    website,
    descFromTitle,
    descFromText,
  };
}

// ── Main scraper ──────────────────────────────────────────────────────────────
async function runCheerioScraper() {
  console.log('🕷️  [Scraper] HN Firebase API + Cheerio enrichment starting…');
  const stats = { scraped: 0, enriched: 0, saved: 0, skipped: 0, errors: 0 };

  // ── Step 1: Fetch stories from HN API ────────────────────────────────────
  let stories;
  try {
    stories = await fetchShowHNStories();
  } catch (err) {
    console.error('❌ HN Firebase API unavailable:', err.message);
    throw err;
  }

  // ── Step 2: Parse into raw company records ────────────────────────────────
  const rawCompanies = stories.map(parseStory).filter(Boolean);
  stats.scraped      = rawCompanies.length;
  console.log(`  ✅ Parsed ${stats.scraped} Show HN company records from ${stories.length} stories`);

  // ── Step 3: Deduplicate by name (case-insensitive) ────────────────────────
  const seen   = new Set();
  const unique = rawCompanies.filter((r) => {
    const key = r.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const dupes = rawCompanies.length - unique.length;
  if (dupes > 0) console.log(`  🧹 Removed ${dupes} duplicates → ${unique.length} unique`);

  // ── Step 4: Cheerio enrichment — scrape meta descriptions ────────────────
  const withWebsite = unique.filter((c) => c.website && !c.descFromTitle);
  const toEnrich    = withWebsite.slice(0, ENRICH_LIMIT);

  if (toEnrich.length > 0) {
    console.log(`\n  🔍 Cheerio-enriching ${toEnrich.length} company pages for meta descriptions…`);

    const enrichMap = new Map();
    const enrichResults = await Promise.allSettled(
      toEnrich.map(async (raw) => {
        const desc = await scrapeMetaDescription(raw.website);
        if (desc) {
          enrichMap.set(raw.name, desc);
          stats.enriched++;
        }
      })
    );

    void enrichResults; // results already processed via enrichMap

    // Merge enriched descriptions back
    for (const entry of unique) {
      if (enrichMap.has(entry.name)) {
        entry.descFromMeta = enrichMap.get(entry.name);
      }
    }

    console.log(`  ✅ Enriched ${stats.enriched}/${toEnrich.length} companies with page metadata`);
  }

  // ── Step 5: Clean → Score → Upsert to MongoDB ────────────────────────────
  console.log(`\n📦 Saving ${unique.length} companies to MongoDB…`);

  for (const raw of unique) {
    try {
      // Priority: meta description > title description > HN post text
      const description = raw.descFromMeta || raw.descFromTitle || raw.descFromText || null;

      const cleaned = {
        name:        raw.name,
        slug:        null,
        website:     raw.website,
        oneLiner:    description ? description.substring(0, 200) : null,
        description: description,
        batch:       'HN',
        tags:        detectTags(raw.name, description),
        status:      'Active',
        teamSize:    null,
        location:    null,
        country:     null,
        logoUrl:     raw.website
          ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(raw.website)}&sz=64`
          : null,
        ycUrl:       null,
      };

      const scored = await scoreCompany(cleaned);
      const doc    = { ...cleaned, ...scored };

      await Company.findOneAndUpdate(
        { name: doc.name },
        { $set: doc, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );
      stats.saved++;
    } catch (err) {
      console.warn(`  ⚠️  Save failed for "${raw.name}": ${err.message}`);
      stats.errors++;
      stats.skipped++;
    }
  }

  console.log(
    `✅ [Scraper] Done — scraped: ${stats.scraped}, enriched: ${stats.enriched}, ` +
    `saved: ${stats.saved}, skipped: ${stats.skipped}, errors: ${stats.errors}`
  );
  return stats;
}

module.exports = { runCheerioScraper };
