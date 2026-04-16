require('dotenv').config();
const express        = require('express');
const path           = require('path');
const connectDB      = require('./config/db');
const leadsRouter    = require('./routes/leads');
const { startScheduler } = require('./scheduler/cronJob');
const { runPipeline }    = require('./services/pipelineService');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/leads', leadsRouter);

// ── Top-level scrape shortcut (POST /api/scrape) ──────────────────────────────
// Mirrors POST /api/leads/scrape so both URLs work
app.post('/api/scrape', async (req, res) => {
  const source = req.body?.source || 'auto';
  res.json({ message: `🕷️  Scrape started (source: ${source})` });
  runPipeline(source).catch((err) =>
    console.error('[POST /api/scrape] Pipeline error:', err.message)
  );
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Serve dashboard for all non-API routes ────────────────────────────────────
app.get('/{*path}', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
);

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();
  startScheduler();

  app.listen(PORT, () => {
    console.log(`🚀 B2B Pipeline running → http://localhost:${PORT}`);
    console.log('');
    console.log('   Endpoints:');
    console.log(`   GET  http://localhost:${PORT}/api/leads          — paginated leads`);
    console.log(`   GET  http://localhost:${PORT}/api/leads/stats    — dashboard stats`);
    console.log(`   GET  http://localhost:${PORT}/api/leads/export   — CSV export`);
    console.log(`   POST http://localhost:${PORT}/api/leads/scrape   — trigger pipeline`);
    console.log(`   GET  http://localhost:${PORT}/api/leads/scrape/status — pipeline status`);
    console.log('');

    // ── Auto-run pipeline on first boot if DB is empty ────────────────────
    const Company = require('./models/Company');
    Company.estimatedDocumentCount().then((count) => {
      if (count === 0) {
        console.log('📭 Database is empty — running initial pipeline automatically…');
        runPipeline('auto').catch((err) =>
          console.error('❌ Initial pipeline failed:', err.message)
        );
      } else {
        console.log(`📦 Database has ${count} companies. Pipeline will run on schedule.`);
        console.log('   Hit POST /api/leads/scrape to refresh manually.');
      }
    });
  });
})();
