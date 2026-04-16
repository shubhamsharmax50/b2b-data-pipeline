const express  = require('express');
const router   = express.Router();
const { stringify } = require('csv-stringify/sync');
const Company  = require('../models/Company');
const { runPipeline, getPipelineStatus } = require('../services/pipelineService');

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Scrape routes MUST come before /:id  to prevent Express from
// treating the literal string "scrape" as a MongoDB ObjectId and throwing
// a CastError.
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /api/leads/scrape ───────────────────────────────────────────────────
// Manually trigger the pipeline. Accepts optional body { source: 'auto'|'algolia'|'cheerio' }
router.post('/scrape', async (req, res) => {
  const { running } = getPipelineStatus();
  if (running) {
    return res.status(409).json({ error: 'Scrape already running — please wait for it to finish.' });
  }

  const source = req.body?.source || 'auto'; // auto | algolia | cheerio
  res.json({ message: `🕷️  Scrape started (source: ${source}). Check /api/leads/scrape/status for progress.` });

  // Fire-and-forget — pipeline runs in background, response already sent
  runPipeline(source).catch((err) =>
    console.error('[POST /scrape] Pipeline error:', err.message)
  );
});

// ── GET /api/leads/scrape/status ─────────────────────────────────────────────
router.get('/scrape/status', (_req, res) => {
  res.json(getPipelineStatus());
});

// ── GET /api/leads/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, hot, warm, cold, b2b, recentScrape, batches] = await Promise.all([
      Company.countDocuments(),
      Company.countDocuments({ leadTier: 'Hot' }),
      Company.countDocuments({ leadTier: 'Warm' }),
      Company.countDocuments({ leadTier: 'Cold' }),
      Company.countDocuments({ isB2B: true }),
      Company.findOne().sort({ createdAt: -1 }).select('createdAt').lean(),
      Company.aggregate([
        { $group: { _id: '$batch', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      total, hot, warm, cold, b2b,
      lastScraped: recentScrape?.createdAt || null,
      topBatches:  batches,
      pipeline:    getPipelineStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/export ────────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const filter = {};
    if (req.query.tier)  filter.leadTier = req.query.tier;
    if (req.query.batch) filter.batch    = req.query.batch.toUpperCase();

    const companies = await Company.find(filter).sort({ leadScore: -1 }).limit(5000).lean();

    const csv = stringify(companies.map((c) => ({
      Name:          c.name,
      Website:       c.website     || '',
      'One Liner':   c.oneLiner    || '',
      Description:   c.description || '',
      Batch:         c.batch       || '',
      Tags:          (c.tags || []).join(', '),
      Status:        c.status      || '',
      'Team Size':   c.teamSize    || '',
      Location:      c.location    || '',
      'Lead Score':  c.leadScore,
      'Lead Tier':   c.leadTier,
      'YC URL':      c.ycUrl       || '',
    })), { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="b2b-leads.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads ───────────────────────────────────────────────────────────
// Query params: page, limit, search, batch, tier, minScore, b2b, sort
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};

    if (req.query.search) {
      filter.$or = [
        { name:        { $regex: req.query.search, $options: 'i' } },
        { oneLiner:    { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { tags:        { $regex: req.query.search, $options: 'i' } },
      ];
    }
    if (req.query.batch)    filter.batch     = req.query.batch.toUpperCase();
    if (req.query.tier)     filter.leadTier  = req.query.tier;
    if (req.query.minScore) filter.leadScore = { $gte: parseInt(req.query.minScore) };
    if (req.query.b2b === 'true') filter.isB2B = true;

    const sortField = req.query.sort === 'name' ? 'name' : 'leadScore';
    const sortOrder = req.query.sort === 'name' ? 1     : -1;

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments(filter),
    ]);

    res.json({
      data:       companies,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads/:id ───────────────────────────────────────────────────────
// NOTE: This MUST stay last — it matches any string as a MongoDB ObjectId.
router.get('/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
