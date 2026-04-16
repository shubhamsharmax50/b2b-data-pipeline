/**
 * Seed Companies — Static B2B company dataset
 *
 * Used as a guaranteed fallback when ALL live scrapers fail
 * (network issues, blocked IPs, API outages, etc.).
 *
 * These are real, publicly-known B2B SaaS companies. Running the
 * seed function won't overwrite live-scraped data — it uses upsert
 * with $setOnInsert so existing records are preserved.
 */

const Company = require('../models/Company');
const { scoreCompany } = require('./scoringService');

const SEED_COMPANIES = [
  { name: 'Stripe',      website: 'https://stripe.com',    oneLiner: 'Payment infrastructure for the internet.',                                    tags: ['fintech','saas','developer tools','b2b','api'],        batch: 'S09', teamSize: 5000, status: 'Active' },
  { name: 'Notion',      website: 'https://notion.so',     oneLiner: 'All-in-one workspace for notes, docs, wikis, and projects.',                  tags: ['productivity','saas','b2b'],                           batch: 'W18', teamSize: 400,  status: 'Active' },
  { name: 'Linear',      website: 'https://linear.app',    oneLiner: 'The issue tracking tool you\'ll enjoy using.',                                 tags: ['developer tools','saas','b2b','productivity'],         batch: 'W19', teamSize: 50,   status: 'Active' },
  { name: 'Vercel',      website: 'https://vercel.com',    oneLiner: 'Deploy web projects with the best frontend developer experience.',            tags: ['infrastructure','developer tools','saas','b2b'],       batch: 'S16', teamSize: 500,  status: 'Active' },
  { name: 'Supabase',    website: 'https://supabase.com',  oneLiner: 'The open source Firebase alternative. Build in a weekend, scale to millions.',tags: ['developer tools','saas','b2b','infrastructure'],       batch: 'S20', teamSize: 80,   status: 'Active' },
  { name: 'Retool',      website: 'https://retool.com',    oneLiner: 'Build internal tools, remarkably fast.',                                      tags: ['developer tools','saas','b2b','automation','no-code'],batch: 'W17', teamSize: 300,  status: 'Active' },
  { name: 'Segment',     website: 'https://segment.com',   oneLiner: 'Customer data infrastructure — collect, clean, and control your data.',       tags: ['analytics','saas','b2b','data engineering'],          batch: 'W11', teamSize: 600,  status: 'Active' },
  { name: 'PostHog',     website: 'https://posthog.com',   oneLiner: 'Open-source product analytics, feature flags, session recordings.',           tags: ['analytics','developer tools','saas','b2b'],           batch: 'W20', teamSize: 50,   status: 'Active' },
  { name: 'Loom',        website: 'https://loom.com',      oneLiner: 'Record and share video messages of your screen, cam, or both.',               tags: ['productivity','saas','b2b'],                           batch: 'W16', teamSize: 200,  status: 'Active' },
  { name: 'Brex',        website: 'https://brex.com',      oneLiner: 'Business credit cards and spend management for startups.',                    tags: ['fintech','saas','b2b'],                               batch: 'W17', teamSize: 1200, status: 'Active' },
  { name: 'Gusto',       website: 'https://gusto.com',     oneLiner: 'Payroll, benefits, and HR for small businesses.',                             tags: ['fintech','saas','b2b','hr tech'],                     batch: 'W12', teamSize: 2000, status: 'Active' },
  { name: 'Mixpanel',    website: 'https://mixpanel.com',  oneLiner: 'Powerful, self-serve product analytics to help you convert, engage, and retain.', tags: ['analytics','saas','b2b'],                        batch: 'S09', teamSize: 400,  status: 'Active' },
  { name: 'Deel',        website: 'https://deel.com',      oneLiner: 'Global payroll and compliance for remote teams.',                             tags: ['fintech','saas','b2b','hr tech'],                     batch: 'W19', teamSize: 3000, status: 'Active' },
  { name: 'Pagerduty',   website: 'https://pagerduty.com', oneLiner: 'Real-time operations and incident management platform.',                      tags: ['infrastructure','saas','b2b','developer tools'],      batch: 'W10', teamSize: 1000, status: 'Public' },
  { name: 'Datadog',     website: 'https://datadoghq.com', oneLiner: 'Monitoring and security for cloud applications.',                             tags: ['analytics','infrastructure','saas','b2b'],            batch: 'S10', teamSize: 5000, status: 'Public' },
  { name: 'Clerk',       website: 'https://clerk.com',     oneLiner: 'Drop-in authentication and user management for React.',                       tags: ['developer tools','security','saas','b2b'],            batch: 'W22', teamSize: 40,   status: 'Active' },
  { name: 'Resend',      website: 'https://resend.com',    oneLiner: 'Email API for developers. Build, test, and send transactional emails.',       tags: ['developer tools','saas','b2b','api'],                 batch: 'W23', teamSize: 20,   status: 'Active' },
  { name: 'Neon',        website: 'https://neon.tech',     oneLiner: 'Serverless Postgres — the database that scales to zero.',                     tags: ['infrastructure','developer tools','saas','b2b'],      batch: 'W21', teamSize: 60,   status: 'Active' },
  { name: 'Dub',         website: 'https://dub.co',        oneLiner: 'Open-source link management infrastructure for modern marketing teams.',      tags: ['marketing','saas','b2b','developer tools'],           batch: 'W23', teamSize: 10,   status: 'Active' },
  { name: 'Cal.com',     website: 'https://cal.com',       oneLiner: 'Open-source scheduling infrastructure for everyone.',                         tags: ['productivity','saas','b2b','developer tools'],        batch: 'W22', teamSize: 40,   status: 'Active' },
  { name: 'Planetscale', website: 'https://planetscale.com',oneLiner:'The world\'s most advanced serverless MySQL platform.',                        tags: ['infrastructure','developer tools','saas','b2b'],      batch: 'S18', teamSize: 80,   status: 'Active' },
  { name: 'Temporal',    website: 'https://temporal.io',   oneLiner: 'An open source workflow-as-code platform.',                                   tags: ['developer tools','infrastructure','saas','b2b'],      batch: 'W19', teamSize: 200,  status: 'Active' },
  { name: 'Modal',       website: 'https://modal.com',     oneLiner: 'Run your code in the cloud. Scale GPUs on demand.',                           tags: ['infrastructure','ai','developer tools','saas','b2b'],batch: 'W21', teamSize: 30,   status: 'Active' },
  { name: 'Fly.io',      website: 'https://fly.io',        oneLiner: 'Deploy app servers close to your users globally.',                            tags: ['infrastructure','saas','developer tools','b2b'],      batch: 'W21', teamSize: 50,   status: 'Active' },
  { name: 'Mintlify',    website: 'https://mintlify.com',  oneLiner: 'The documentation platform loved by developers.',                             tags: ['developer tools','saas','b2b'],                       batch: 'W22', teamSize: 15,   status: 'Active' },
  { name: 'Langchain',   website: 'https://langchain.com', oneLiner: 'Build context-aware, reasoning applications with LangChain.',                 tags: ['ai','developer tools','saas','b2b'],                  batch: 'HN',  teamSize: 40,   status: 'Active' },
  { name: 'Pinecone',    website: 'https://pinecone.io',   oneLiner: 'The vector database for building knowledgeable AI.',                          tags: ['ai','infrastructure','saas','b2b'],                   batch: 'W21', teamSize: 100,  status: 'Active' },
  { name: 'Inngest',     website: 'https://inngest.com',   oneLiner: 'Build and ship reliable workflows with zero infrastructure.',                  tags: ['developer tools','automation','saas','b2b'],          batch: 'W23', teamSize: 20,   status: 'Active' },
  { name: 'Trigger.dev', website: 'https://trigger.dev',  oneLiner: 'Open-source background jobs and workflows for your app.',                      tags: ['developer tools','automation','saas','b2b'],          batch: 'W23', teamSize: 15,   status: 'Active' },
  { name: 'Activepieces',website: 'https://activepieces.com', oneLiner:'Open-source no-code business automation tool.',                             tags: ['automation','no-code','saas','b2b'],                  batch: 'HN',  teamSize: 12,   status: 'Active' },
  { name: 'Google Cloud',website: 'https://cloud.google.com', oneLiner: 'Cloud computing services for developers and enterprises.',               tags: ['infrastructure','saas','b2b','cloud computing'],      batch: 'ENT', teamSize: 50000,status: 'Active' },
  { name: 'Meta for Bus.',website: 'https://business.facebook.com', oneLiner: 'Advertising, marketing, and business tools across Meta platforms.',  tags: ['marketing','b2b','crm'],                              batch: 'ENT', teamSize: 40000,status: 'Active' },
  { name: 'AWS',         website: 'https://aws.amazon.com',   oneLiner: 'Comprehensive cloud computing platform.',                                tags: ['infrastructure','saas','b2b','cloud computing'],      batch: 'ENT', teamSize: 60000,status: 'Active' },
  { name: 'Microsoft',   website: 'https://microsoft.com',    oneLiner: 'Enterprise software, services, and cloud platform.',                     tags: ['enterprise','saas','b2b','developer tools'],          batch: 'ENT', teamSize: 100000,status:'Active' },
  { name: 'Apple Bus.',  website: 'https://apple.com/business',oneLiner: 'Apple hardware, software, and services for business.',                  tags: ['enterprise','b2b'],                                   batch: 'ENT', teamSize: 80000,status: 'Active' },
];

/**
 * Seed the database with the static company list.
 * Uses upsert so it never overwrites data from live scrapers.
 * Returns { seeded, skipped, errors } stats.
 */
async function seedDatabase() {
  console.log(`🌱 [Seed] Seeding ${SEED_COMPANIES.length} B2B companies into MongoDB…`);
  const stats = { seeded: 0, skipped: 0, errors: 0 };

  for (const raw of SEED_COMPANIES) {
    try {
      const doc    = { ...raw, logoUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(raw.website)}&sz=64`, description: raw.oneLiner };
      const scored = await scoreCompany(doc);
      const final  = { ...doc, ...scored };

      const result = await Company.findOneAndUpdate(
        { name: final.name },
        { $setOnInsert: { ...final, createdAt: new Date() } }, // only inserts if new
        { upsert: true, new: false } // returns original doc (null if inserted)
      );

      if (result === null) stats.seeded++;   // was inserted (new record)
      else                 stats.skipped++;  // already existed — not overwritten
    } catch (err) {
      console.warn(`  ⚠️  Seed failed for "${raw.name}": ${err.message}`);
      stats.errors++;
    }
  }

  console.log(
    `✅ [Seed] Done — seeded: ${stats.seeded}, already existed: ${stats.skipped}, errors: ${stats.errors}`
  );
  return stats;
}

module.exports = { seedDatabase, SEED_COMPANIES };
