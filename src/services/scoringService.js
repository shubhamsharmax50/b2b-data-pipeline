/**
 * Lead Scoring Service — Powered by Groq AI + Heuristics Fallback
 *
 * We send the company's name and description to Groq (Llama 3) and ask it to:
 * 1. Decide if it's B2B (true/false)
 * 2. Assign a lead score (0-100) based on usefulness to enterprise sales
 * 3. Extract relevant tech/industry tags
 *
 * If Groq fails or the API key is missing, it falls back to the local Regex heuristic.
 */

const { Groq } = require('groq-sdk');

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// ── Heuristics Fallback (Used if Groq fails or no key) ────────────────────────
const B2B_TAGS = new Set([
  'saas', 'enterprise', 'b2b', 'api', 'developer tools', 'devtools',
  'security', 'fintech', 'hr tech', 'legaltech', 'marketing',
  'analytics', 'artificial intelligence', 'machine learning',
  'infrastructure', 'cloud computing', 'no-code', 'automation',
  'crm', 'erp', 'accounting', 'supply chain', 'logistics',
  'healthcare', 'biotech', 'edtech', 'proptech', 'insurtech',
  'cybersecurity', 'data engineering', 'observability',
]);

const RECENT_BATCHES = new Set(['W21','S21','W22','S22','W23','S23','W24','S24','W25','S25']);

function heuristicScore(company) {
  let score = 0;
  const hasB2BTags = company.tags?.some((t) => B2B_TAGS.has(t) || [...B2B_TAGS].some((b) => t.includes(b)));
  if (hasB2BTags) score += 30;
  if (RECENT_BATCHES.has((company.batch || '').toUpperCase())) score += 20;
  if (company.status === 'Active') score += 15;
  if (company.website) score += 10;
  if (company.description && company.description.length > 80) score += 10;
  if (company.teamSize && company.teamSize >= 10) score += 10;
  if (company.logoUrl) score += 5;

  score = Math.min(100, score);
  let leadTier = 'Cold';
  if (score >= 70) leadTier = 'Hot';
  else if (score >= 40) leadTier = 'Warm';

  return { leadScore: score, leadTier, isB2B: !!hasB2BTags, tags: company.tags || [] };
}

// ── Groq AI Scoring ────────────────────────────────────────────────────────────
async function scoreCompany(company) {
  if (!groq) {
    return heuristicScore(company); // Fallback if no key
  }

  const prompt = `
You are an expert B2B SaaS Sales Development Representative analyzing lead data.
Analyze this company:
Name: ${company.name}
Description: ${company.description || company.oneLiner || 'No description available.'}
Website: ${company.website || 'No website'}
Tags: ${(company.tags || []).join(', ')}

Your task:
1. Determine if this company is B2B (Business to Business). (true/false)
2. Predict a lead score from 0 to 100 on how likely a B2B sales team could sell them software (e.g. cloud tools, HR tech). 
   - 70-100: Hot (SaaS, developer tools, clear B2B model, tech company)
   - 40-69: Warm (General B2B, maybe early stage or ambiguous)
   - 0-39: Cold (B2C, consumer apps, games, crypto, social networks, unreachables)
3. Generate exactly 3 to 5 lowercase tags summarizing their industry (e.g. "saas", "fintech", "ai", "productivity").

Return ONLY a valid JSON object with EXACTLY these keys:
{
  "isB2B": boolean,
  "leadScore": number,
  "tags": [string]
}
`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama3-8b-8192',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const resultStr = chatCompletion.choices[0]?.message?.content;
    const aiData = JSON.parse(resultStr);

    const score = Math.max(0, Math.min(100, Number(aiData.leadScore) || 0));
    let leadTier = 'Cold';
    if (score >= 70) leadTier = 'Hot';
    else if (score >= 40) leadTier = 'Warm';

    // Merge AI tags with whatever heuristic tags we already had
    const mergedTags = [...new Set([...(company.tags || []), ...(aiData.tags || [])])];

    return {
      leadScore: score,
      leadTier: leadTier,
      isB2B: Boolean(aiData.isB2B),
      tags: mergedTags
    };
  } catch (err) {
    // If AI fails (rate limit, parsing error), silently fallback to heuristics
    return heuristicScore(company);
  }
}

module.exports = { scoreCompany };
