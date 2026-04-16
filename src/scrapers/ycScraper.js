/**
 * YC Company Scraper
 *
 * YC's public company directory (ycombinator.com/companies) is a React SPA
 * powered by Algolia search. Instead of browser automation, we talk directly
 * to the same Algolia endpoint the UI uses — faster, reliable, and paginated.
 *
 * How to get/update the API key:
 *  1. Open https://www.ycombinator.com/companies in Chrome
 *  2. DevTools → Network → filter "algolia"
 *  3. Copy the x-algolia-api-key header value
 *  4. Set it as ALGOLIA_API_KEY in your .env
 */

const axios = require('axios');
const { cleanCompany }  = require('../services/cleaningService');
const { scoreCompany }  = require('../services/scoringService');
const Company           = require('../models/Company');

const APP_ID  = process.env.ALGOLIA_APP_ID  || '45BWZJ1SGC';
const API_KEY = process.env.ALGOLIA_API_KEY || 'MjBjYjRiMzY0NzdhZWY0NjExYjU2NTc2NTZhOTkzNQ==';
const URL     = `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;

const HITS_PER_PAGE = 100;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fetch a single page from Algolia ────────────────────────────────────────
async function fetchPage(page = 0) {
  const payload = {
    requests: [
      {
        indexName: 'companies',
        params: `hitsPerPage=${HITS_PER_PAGE}&page=${page}&query=&filters=`,
      },
    ],
  };

  const { data } = await axios.post(URL, payload, {
    headers: {
      'X-Algolia-Application-Id': APP_ID,
      'X-Algolia-API-Key':        API_KEY,
      'Content-Type':             'application/json',
    },
    timeout: 20000,
  });

  return data.results[0]; // { hits, nbPages, nbHits, page }
}

// ── Main scrape function ─────────────────────────────────────────────────────
async function runScraper() {
  console.log('🕷️  Starting YC scrape …');
  const results = { inserted: 0, updated: 0, errors: 0, total: 0 };

  let page = 0;
  let totalPages = 1;

  try {
    do {
      const result = await fetchPage(page);
      totalPages = result.nbPages;

      console.log(
        `  📄 Page ${page + 1}/${totalPages}  (${result.hits.length} hits)`
      );

      for (const hit of result.hits) {
        try {
          const cleaned = cleanCompany(hit);
          const scored  = await scoreCompany(cleaned);
          const doc     = { ...cleaned, ...scored };

          await Company.findOneAndUpdate(
            { ycId: doc.ycId },
            { $set: doc },
            { upsert: true, new: true }
          );

          if (await Company.exists({ ycId: doc.ycId })) results.updated++;
          else results.inserted++;
        } catch (err) {
          console.warn(`  ⚠️  Skipping ${hit.name}: ${err.message}`);
          results.errors++;
        }
      }

      results.total += result.hits.length;
      page++;

      // Polite delay between pages
      if (page < totalPages) await delay(250);
    } while (page < totalPages);

    console.log(
      `✅ Scrape done — total: ${results.total}, ` +
      `upserted: ${results.inserted + results.updated}, errors: ${results.errors}`
    );
    return results;
  } catch (err) {
    if (err.response?.status === 403) {
      const msg =
        'Algolia API key rejected (403). ' +
        'Get the live key from ycombinator.com/companies → network tab → ' +
        'x-algolia-api-key header, then set ALGOLIA_API_KEY in .env';
      console.error('❌', msg);
      throw new Error(msg);
    }
    console.error('❌ Scraper error:', err.message);
    throw err;
  }
}

module.exports = { runScraper };
