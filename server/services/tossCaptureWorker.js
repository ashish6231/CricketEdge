function startTossCaptureWorker({
  intervalMs = Number(process.env.TOSS_CAPTURE_INTERVAL_MS || 60000),
  captureEndedTosses = require('./tossCapture').captureEndedTosses,
} = {}) {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await captureEndedTosses();
    } catch (err) {
      console.error('Toss capture tick failed:', err.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function runTossCaptureNow(deps) {
  const { captureEndedTosses } = require('./tossCapture');
  return (deps?.captureEndedTosses || captureEndedTosses)(deps || {});
}

module.exports = {
  startTossCaptureWorker,
  runTossCaptureNow,
};
