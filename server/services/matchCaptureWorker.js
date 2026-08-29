function startMatchCaptureWorker({
  intervalMs = Number(process.env.MATCH_CAPTURE_INTERVAL_MS || 60000),
  captureEndedMatches = require('./matchCapture').captureEndedMatches,
} = {}) {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await captureEndedMatches();
    } catch (err) {
      console.error('Match capture tick failed:', err.message);
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

async function runMatchCaptureNow(deps) {
  const { captureEndedMatches } = require('./matchCapture');
  return (deps?.captureEndedMatches || captureEndedMatches)(deps || {});
}

module.exports = {
  startMatchCaptureWorker,
  runMatchCaptureNow,
};
