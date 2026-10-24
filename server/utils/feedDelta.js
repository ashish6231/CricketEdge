const { createHash } = require('node:crypto');

// Snapshot signatures, rather than mutable cache objects, so an ingestion update
// cannot silently change the baseline already delivered to a browser.
function snapshotFeed(payload) {
  const matches = payload.matches || [];
  const { matches: _, updatedAt: __, ...metadata } = payload;
  return {
    payload,
    order: matches.map(match => String(match.matchId)),
    signatures: new Map(matches.map(match => [String(match.matchId),
      createHash('sha256').update(JSON.stringify(match)).digest('base64')])),
    metadata: JSON.stringify(metadata),
  };
}

function diffFeed(previous, next) {
  const changed = next.payload.matches.filter(match =>
    previous.signatures.get(String(match.matchId)) !== next.signatures.get(String(match.matchId)));
  const removed = previous.order.filter(id => !next.signatures.has(id));
  const reordered = JSON.stringify(previous.order) !== JSON.stringify(next.order);
  if (!changed.length && !removed.length && !reordered && previous.metadata === next.metadata) return null;
  const { matches: _, ...metadata } = next.payload;
  return { ...metadata, changed, removed, ...(reordered ? { order: next.order } : {}) };
}

module.exports = { snapshotFeed, diffFeed };
