const { captureEmiratesD10 } = require('./emiratesD10Capture');
function startEmiratesD10Worker({ intervalMs = Number(process.env.EMIRATES_D10_CAPTURE_INTERVAL_MS || 30000), capture = captureEmiratesD10 } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new Error('Invalid D10 capture interval');
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await capture(); }
    catch (error) { console.error('Emirates D10 capture failed:', error.message); }
    finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}
module.exports = { startEmiratesD10Worker };
