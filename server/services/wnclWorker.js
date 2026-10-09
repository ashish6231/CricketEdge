const { captureWNCL } = require('./wnclCapture');
function startWNCLWorker({ intervalMs = Number(process.env.WNCL_CAPTURE_INTERVAL_MS || 15 * 60 * 1000), capture = captureWNCL } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new Error('Invalid WNCL capture interval');
  let running = false, stopped = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try { await capture(); }
    catch (error) { console.error('WNCL capture failed:',error.message); }
    finally { running = false; }
  };
  const timer = setInterval(tick,intervalMs);
  tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}
module.exports = { startWNCLWorker };
