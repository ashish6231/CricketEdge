export default function MetricCard({ title, team1Label, team1Value, team1Color, team2Label, team2Value, team2Color, icon }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-primary">{icon}</span>}
        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{title}</h4>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">{team1Label}</span>
          <span className={`text-sm font-bold ${team1Color || 'text-text-primary'}`}>{team1Value}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">{team2Label}</span>
          <span className={`text-sm font-bold ${team2Color || 'text-text-primary'}`}>{team2Value}</span>
        </div>
      </div>
    </div>
  )
}
