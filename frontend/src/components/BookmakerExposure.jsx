import { Shield } from 'lucide-react'

export default function BookmakerExposure({ exposure }) {
  return (
    <div className="glass-card rounded-xl p-5 mb-6">
      <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
        <Shield size={14} /> Bookmaker Exposure
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {['team1', 'team2'].map(key => {
          const e = exposure[key] || {}
          const teamName = e.teamName || key
          const isProfit = e.netExposure >= 0
          return (
            <div key={key} className="bg-bg-card rounded-lg p-4">
              <div className="text-sm font-bold text-text-primary mb-3">{teamName}</div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Net Exposure</span>
                  <span className={`font-bold ${isProfit ? 'text-profit' : 'text-loss'}`}>
                    {isProfit ? '+' : ''}{e.netExposure?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Back Exposure</span>
                  <span className="text-back font-medium">{e.backExposure?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Lay Exposure</span>
                  <span className="text-loss font-medium">{e.layExposure?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || 0}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
