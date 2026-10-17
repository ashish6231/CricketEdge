const { captureWomensSpring } = require('./womensSpringCapture');
function startWomensSpringWorker({ intervalMs = Number(process.env.SPRING_T20_CAPTURE_INTERVAL_MS || 60000), capture = captureWomensSpring } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new Error('Invalid Spring capture interval');
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await capture(); }
    catch (error) { console.error('Spring T20 capture failed:', error.message); }
    finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}
module.exports = { startWomensSpringWorker };
