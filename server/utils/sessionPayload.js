const SESSION_TRADE_BUCKET_MS = 5 * 60 * 1000;

function tradeTimestamp(value) {
  if (value == null || value === '') return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Session providers return the complete trade history on every poll. The UI's
 * volume and P/L calculations only need the summed size for each
 * market/side/price/time bucket, so compact those equivalent rows before the
 * payload reaches Redis or a browser.
 */
function compactSessionPayload(payload, bucketMs = SESSION_TRADE_BUCKET_MS) {
  if (!payload || !Array.isArray(payload.trades) || payload.trades.length < 2) return payload;

  const groups = new Map();
  for (const trade of payload.trades) {
    const marketName = String(trade?.team || trade?.marketName || trade?.market || '').trim();
    const side = String(trade?.type || trade?.side || '').trim().toLowerCase();
    const price = Number(trade?.price);
    const size = Number(trade?.size);
    const updatedAtMs = tradeTimestamp(trade?.updatedAt);

    if (!marketName || !side || !Number.isFinite(price) || !Number.isFinite(size)) continue;

    const bucket = updatedAtMs > 0 ? Math.floor(updatedAtMs / bucketMs) : 0;
    const key = `${marketName.toLowerCase()}\u0000${side}\u0000${price}\u0000${bucket}`;
    const existing = groups.get(key);
    if (existing) {
      existing.size += size;
      existing.tradeCount += Number(trade.tradeCount) || 1;
      if (updatedAtMs >= existing._updatedAtMs) {
        existing.updatedAt = trade.updatedAt;
        existing._updatedAtMs = updatedAtMs;
      }
      continue;
    }

    groups.set(key, {
      ...trade,
      team: marketName,
      type: side,
      price,
      size,
      tradeCount: Number(trade.tradeCount) || 1,
      _updatedAtMs: updatedAtMs,
    });
  }

  const trades = Array.from(groups.values())
    .map(({ _updatedAtMs, ...trade }) => trade)
    .sort((a, b) => tradeTimestamp(a.updatedAt) - tradeTimestamp(b.updatedAt));

  return {
    ...payload,
    trades,
    rawTradeCount: payload.trades.reduce((sum, trade) => sum + (Number(trade?.tradeCount) || 1), 0),
    compacted: trades.length < payload.trades.length,
  };
}

module.exports = {
  SESSION_TRADE_BUCKET_MS,
  compactSessionPayload,
  tradeTimestamp,
};
