const SESSION_TRADE_BUCKET_MS = 5 * 60 * 1000;

const numeric = value => value != null && ['number','string'].includes(typeof value) && String(value).trim() !== '' ? Number(value) : NaN;

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
  const ungrouped = [];
  for (const trade of payload.trades) {
    const marketName = String(trade?.team || trade?.marketName || trade?.market || '').trim();
    const side = String(trade?.type || trade?.side || '').trim().toLowerCase();
    const price = numeric(trade?.price);
    const size = numeric(trade?.size);
    const count = trade?.tradeCount == null ? 1 : numeric(trade.tradeCount);
    const updatedAtMs = tradeTimestamp(trade?.updatedAt);

    if (!marketName || !['back','b','yes','lay','l','no'].includes(side) || !Number.isFinite(price) || price < 0
      || !Number.isFinite(size) || size < 0 || !Number.isSafeInteger(count) || count <= 0) {
      // Keep malformed rows visible so the UI cannot certify a partial ledger.
      ungrouped.push(trade);
      continue;
    }

    const bucket = updatedAtMs > 0 ? Math.floor(updatedAtMs / bucketMs) : 0;
    const key = `${marketName.toLowerCase().replace(/\s+/g, ' ')}\u0000${side}\u0000${price}\u0000${bucket}`;
    const existing = groups.get(key);
    if (existing) {
      existing.size += size;
      existing.tradeCount += count;
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
      tradeCount: count,
      _updatedAtMs: updatedAtMs,
    });
  }

  const trades = Array.from(groups.values())
    .map(({ _updatedAtMs, ...trade }) => trade)
    .concat(ungrouped)
    .sort((a, b) => tradeTimestamp(a?.updatedAt) - tradeTimestamp(b?.updatedAt));

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
