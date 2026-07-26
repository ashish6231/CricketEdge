export default function DeepMetrics({ deepMetrics, team1, team2 }) {
  if (!deepMetrics) return null
  
  const raw = deepMetrics.raw || {}
  const totals = deepMetrics.totals || {}
  const simplePL = deepMetrics.simplePL || {}

  const formatNum = (n) => {
    if (n === null || n === undefined) return '—'
    if (Math.abs(n) >= 1000) return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    return typeof n === 'number' ? n.toFixed(2) : String(n)
  }

  return (
    <div className="glass-card rounded-xl p-5 mb-6">
      <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">Deep Metrics</h3>
      
      {/* Raw Exposure */}
      {raw && Object.keys(raw).length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-text-muted mb-2">Raw Exposure Data</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(raw).map(([key, val]) => (
              <div key={key} className="bg-bg-card rounded-lg px-3 py-2 text-xs">
                <div className="text-text-muted">{key}</div>
                <div className="text-text-secondary font-medium">{formatNum(val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total Bets */}
      {totals && Object.keys(totals).length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-text-muted mb-2">Total Bets</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(totals).map(([key, val]) => (
              <div key={key} className="bg-bg-card rounded-lg px-3 py-2 text-xs">
                <div className="text-text-muted">{key}</div>
                <div className="text-text-primary font-bold">{formatNum(val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Simple P/L */}
      {simplePL && Object.keys(simplePL).length > 0 && (
        <div>
          <div className="text-xs text-text-muted mb-2">Simple P/L Scenarios</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(simplePL).map(([key, val]) => (
              <div key={key} className="bg-bg-card rounded-lg px-3 py-2 text-xs">
                <div className="text-text-muted">{key}</div>
                <div className={`font-bold ${val >= 0 ? 'text-profit' : 'text-loss'}`}>{formatNum(val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
