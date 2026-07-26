export default function PnlBar({ team1, team2, pnl1, pnl2, label = 'In-Play' }) {
  const total = Math.abs(pnl1) + Math.abs(pnl2)
  const pct1 = total > 0 ? (Math.abs(pnl1) / total) * 100 : 50
  const pct2 = total > 0 ? (Math.abs(pnl2) / total) * 100 : 50

  return (
    <div>
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold ${pnl1 >= 0 ? 'text-profit' : 'text-loss'} w-16 text-right`}>
          {pnl1 >= 0 ? '+' : ''}{pnl1?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}
        </span>
        <div className="flex-1 h-3 rounded-full overflow-hidden bg-bg-card flex">
          <div
            className={`h-full rounded-l-full ${pnl1 >= 0 ? 'bg-profit' : 'bg-loss'} transition-all`}
            style={{ width: `${pct1}%` }}
          />
          <div
            className={`h-full rounded-r-full ${pnl2 >= 0 ? 'bg-profit' : 'bg-loss'} transition-all`}
            style={{ width: `${pct2}%` }}
          />
        </div>
        <span className={`text-xs font-bold ${pnl2 >= 0 ? 'text-profit' : 'text-loss'} w-16`}>
          {pnl2 >= 0 ? '+' : ''}{pnl2?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted mt-1">
        <span>{team1}</span>
        <span>{team2}</span>
      </div>
    </div>
  )
}
