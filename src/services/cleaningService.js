// Cleans and normalises raw data from the YC Algolia API

function cleanWebsite(url) {
  if (!url) return null;
  url = url.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  return url.replace(/\/$/, '');
}

function normalizeBatch(batch) {
  if (!batch) return 'Unknown';
  return batch.trim().toUpperCase();
}

function normalizeTags(rawTags = [], rawIndustries = []) {
  const combined = [...rawTags, ...rawIndustries];
  return [
    ...new Set(
      combined
        .filter(Boolean)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    ),
  ];
}

function normalizeStatus(status) {
  const map = {
    active:   'Active',
    acquired: 'Acquired',
    inactive: 'Inactive',
    public:   'Public',
  };
  return map[status?.toLowerCase()] || 'Unknown';
}

/**
 * Transforms a raw Algolia hit into a clean Company document.
 * Decisions:
 *  - Missing website → null  (don't store empty strings)
 *  - Tags merged with industries and de-duplicated
 *  - Batch normalised to uppercase  (W24, S23 …)
 *  - Status mapped to a controlled vocabulary
 */
function cleanCompany(raw) {
  return {
    ycId:        String(raw.objectID || raw.id || ''),
    name:        (raw.name || '').trim(),
    slug:        raw.slug || null,
    website:     cleanWebsite(raw.website),
    oneLiner:    (raw.short_description || '').trim() || null,
    description: (raw.long_description || '').trim() || null,
    batch:       normalizeBatch(raw.batch),
    tags:        normalizeTags(raw.tags, raw.industries),
    status:      normalizeStatus(raw.status),
    teamSize:    raw.team_size || null,
    location:    (raw.all_locations || raw.location || '').trim() || null,
    country:     raw.country || null,
    logoUrl:     raw.small_logo_thumb_url || raw.logo_url || null,
    ycUrl:       raw.slug
      ? `https://www.ycombinator.com/companies/${raw.slug}`
      : null,
  };
}

module.exports = { cleanCompany };
