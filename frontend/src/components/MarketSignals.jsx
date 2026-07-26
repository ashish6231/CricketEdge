import { AlertTriangle, ShieldCheck, Target, TrendingUp } from 'lucide-react'

export default function MarketSignals({ signals, team1, team2 }) {
  const pred = signals.prediction || {}
  const trap = signals.trap || {}
  
  const trapColor = trap.level === 'high' ? 'text-loss' : trap.level === 'medium' ? 'text-yellow-400' : 'text-text-muted'
  const predColor = pred.prediction === team1 ? 'text-primary' : 'text-primary-light'

  return (
    <div className="glass-card rounded-xl p-5 mb-6 glow-blue">
      <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
        <TrendingUp size={14} /> Market Signals & Prediction
      </h3>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-bg-card rounded-lg px-3 py-2">
          <div className="text-xs text-text-muted">Most Betted</div>
          <div className="text-sm font-bold text-text-primary">{signals.moreBettedTeam}</div>
        </div>
        <div className="bg-bg-card rounded-lg px-3 py-2">
          <div className="text-xs text-text-muted">Bookie Fav</div>
          <div className="text-sm font-bold text-profit">{signals.bookieFavouriteOutcome}</div>
        </div>
        <div className="bg-bg-card rounded-lg px-3 py-2">
          <div className="text-xs text-text-muted">Risk Team</div>
          <div className="text-sm font-bold text-loss">{signals.riskTeam}</div>
        </div>
        <div className="bg-bg-card rounded-lg px-3 py-2">
          <div className="text-xs text-text-muted">Support Confidence</div>
          <div className="text-sm font-bold text-text-secondary">{signals.supportConfidence?.toFixed(2) || '—'}</div>
        </div>
      </div>

      {/* Prediction */}
      {pred.prediction && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-primary" />
            <span className="text-sm font-bold text-primary">Prediction: {pred.prediction}</span>
          </div>
          <div className="flex items-center gap-2 mb-1 text-xs text-text-secondary">
            <span>Pattern: <span className="font-bold text-text-primary">{pred.pattern}</span></span>
          </div>
          <p className="text-xs text-text-muted">{pred.reason}</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-xs">
              <span className="text-text-muted">True Support:</span>
              <div className="text-text-secondary font-medium">{team1}: {pred.team1TrueSupport?.toFixed(0) || '—'}</div>
              <div className="text-text-secondary font-medium">{team2}: {pred.team2TrueSupport?.toFixed(0) || '—'}</div>
            </div>
            <div className="text-xs">
              <span className="text-text-muted">Ratio:</span>
              <div className="text-text-secondary font-medium">{pred.ratio?.toFixed(2) || '—'}</div>
            </div>
            <div className="text-xs">
              <span className="text-text-muted">Bookie P/L:</span>
              <div className="text-loss font-medium">{team1}: {pred.bookiePnlTeam1?.toFixed(0) || '—'}</div>
              <div className="text-profit font-medium">{team2}: {pred.bookiePnlTeam2?.toFixed(0) || '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Trap */}
      {trap.level && (
        <div className={`border rounded-xl p-3 ${trap.level === 'none' ? 'bg-bg-card border-border' : 'bg-loss/10 border-loss/30'}`}>
          <div className="flex items-center gap-2">
            {trap.level === 'none' ? <ShieldCheck size={14} className="text-profit" /> : <AlertTriangle size={14} className="text-loss" />}
            <span className="text-xs font-bold uppercase tracking-wider">Trap Level: </span>
            <span className={`text-sm font-bold ${trapColor}`}>{trap.level}</span>
          </div>
          {trap.reason && <p className="text-xs text-text-muted mt-1">{trap.reason}</p>}
        </div>
      )}
    </div>
  )
}
