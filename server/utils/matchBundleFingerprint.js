const crypto = require('crypto');

// Polling adds fresh transport timestamps even when the useful match data did not
// change. Exclude only those top-level fields; nested trade timestamps remain part
// of the fingerprint so a new trade always reaches connected clients.
const VOLATILE_ROOT_FIELDS = new Set([
  'updatedAt',
  'serverTime',
  'fetchedAt',
  'scrapedAt',
  'timestamp',
]);

function stripVolatileRootFields(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !VOLATILE_ROOT_FIELDS.has(key)),
  );
}

function fingerprintMatchBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return '';

  const stableBundle = {
    matchId: String(bundle.matchId || ''),
    sport: bundle.sport || 'cricket',
    cricket: stripVolatileRootFields(bundle.cricket),
    toss: stripVolatileRootFields(bundle.toss),
    session: stripVolatileRootFields(bundle.session),
    crex: stripVolatileRootFields(bundle.crex),
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableBundle))
    .digest('hex');
}

module.exports = {
  fingerprintMatchBundle,
  stripVolatileRootFields,
};
