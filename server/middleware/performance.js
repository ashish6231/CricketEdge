const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');

function requestTiming(req, res, next) {
  const start = performance.now();
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    res.setHeader('Server-Timing', `app;dur=${(performance.now()-start).toFixed(1)}`);
    return writeHead.apply(this, args);
  };
  res.once('finish', () => {
    const durationMs = Math.round(performance.now()-start);
    if (durationMs >= 1000) console.warn(JSON.stringify({ event: 'slow_request', requestId,
      method: req.method, route: req.route?.path || 'unmatched', status: res.statusCode, durationMs }));
  });
  next();
}

const names = new Set(['LCP','INP','CLS','FCP','TTFB']);
const ratings = new Set(['good','needs-improvement','poor']);
function parseVital(body) {
  if (!body || !names.has(body.name) || !ratings.has(body.rating)
    || !Number.isFinite(body.value) || body.value < 0 || body.value > 3600000) return null;
  const page = typeof body.page==='string' && /^\/(?:cricket|toss|session|subscription|profile|admin)(?:\/match\/:id)?$/.test(body.page) ? body.page : '/other';
  return { event:'web_vital', name:body.name, value:body.value, rating:body.rating, page,
    connection: ['slow-2g','2g','3g','4g'].includes(body.connection) ? body.connection : 'unknown' };
}
function recordVital(req,res) {
  const vital=parseVital(req.body);
  if (!vital) return res.sendStatus(400);
  console.info(JSON.stringify(vital));
  return res.sendStatus(204);
}
module.exports={requestTiming,parseVital,recordVital};
