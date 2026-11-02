export function startPerformanceMonitoring() {
  if (import.meta.env?.MODE === 'test' || navigator.doNotTrack === '1') return
  const sample = Number(import.meta.env?.VITE_RUM_SAMPLE_RATE ?? 0.2)
  if (!Number.isFinite(sample) || Math.random() >= Math.max(0, Math.min(1, sample))) return
  const endpoint = `${import.meta.env?.VITE_API_URL || ''}/api/performance`
  const report = metric => {
    const page = location.pathname.replace(/\/match\/[^/]+/, '/match/:id')
    const body = JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating,
      page, connection: navigator.connection?.effectiveType })
    // No identity, query string, auth headers, or user-entered text is sent.
    const payload = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.(endpoint, payload)) {
      fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json' }, body,
        keepalive:true, credentials:'omit', signal:AbortSignal.timeout(3000) }).catch(()=>{})
    }
  }
  import('web-vitals').then(({ onCLS,onINP,onLCP,onFCP,onTTFB }) => {
    [onCLS,onINP,onLCP,onFCP,onTTFB].forEach(observe=>observe(report))
  }).catch(()=>{})
}
