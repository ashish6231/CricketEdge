import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Lock } from 'lucide-react'
import { getSessionTrades } from '../api'

function parseSession(name) {
  const inningMatch = name.match(/(\d+)(st|nd|rd|th)\s+innings/i)
  const overMatch   = name.match(/(\d+)\s+overs?\s+line/i)
  const isRunsLine  = /runs\s+line/i.test(name)
  return {
    inning: inningMatch ? parseInt(inningMatch[1]) : 1,
    over:   overMatch   ? parseInt(overMatch[1])   : (isRunsLine ? 999 : 0),
    isRunsLine,
  }
}

function OddsCard({ item }) {
  const { marketName, bestYes, bestNo } = item
  const parsed = parseSession(marketName)
  const label  = parsed.isRunsLine ? 'Total Runs Line' : `${parsed.over} Overs Line`

  const predicted = bestYes != null && bestNo != null
    ? Math.round((bestYes + bestNo) / 2 * 2) / 2
    : bestYes ?? bestNo ?? '—'

  const gap = bestYes != null && bestNo != null ? (bestNo - bestYes).toFixed(1) : null
  const gapNum = gap ? parseFloat(gap) : null
  const gapColor = gapNum == null ? '' : gapNum < 20 ? 'text-profit' : gapNum < 50 ? 'text-yellow-500' : 'text-loss'

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Card Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
        <span className="font-bold text-text-primary text-sm">{label}</span>
        {gap && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-border ${gapColor}`}>
            Gap: {gap} {gapNum < 20 ? '🟢' : gapNum < 50 ? '🟡' : '🔴'}
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Predicted Score — center hero */}
        <div className="text-center py-3 mb-4 rounded-xl" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.1)' }}>
          <div className="text-xs text-text-muted uppercase tracking-widest mb-1">Market Predicted Score</div>
          <div className="text-5xl font-black text-primary leading-none">~{predicted}</div>
          <div className="text-xs text-text-muted mt-1.5 font-medium">runs</div>
        </div>

        {/* Yes / No cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3.5 text-center" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <div className="text-xs text-text-muted font-medium mb-1.5">Best Yes (Back)</div>
            <div className="text-3xl font-black text-back">{bestYes ?? '—'}</div>
            <div className="text-xs text-back/70 mt-1.5 font-medium">📈 Score UPAR jayega</div>
          </div>
          <div className="rounded-xl p-3.5 text-center" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <div className="text-xs text-text-muted font-medium mb-1.5">Best No (Lay)</div>
            <div className="text-3xl font-black text-loss">{bestNo ?? '—'}</div>
            <div className="text-xs text-loss/70 mt-1.5 font-medium">📉 Score NEECHE rahega</div>
          </div>
        </div>

        {gap && (
          <div className="mt-3 text-center text-xs text-text-muted">
            Market range: <span className="text-text-secondary font-semibold">{bestYes} – {bestNo} runs</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SessionDetail() {
  const { matchId } = useParams()
  const navigate    = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [activeInning, setActiveInning]   = useState(1)

  useEffect(() => {
    const fetch = (isInitial = false) => {
      if (isInitial) { setLoading(true); setRequiresLogin(false); setRequiresPro(false) }
      getSessionTrades(matchId).then(res => {
        if (res?.error === 'login_required') setRequiresLogin(true)
        else if (res) setData(res)
        if (isInitial) setLoading(false)
      }).catch(err => {
        if (err?.code === 'SUBSCRIPTION_REQUIRED' || err?.status === 403) setRequiresPro(true)
        if (isInitial) setLoading(false)
      })
    }
    fetch(true)
    const interval = setInterval(() => fetch(false), 3000)
    return () => clearInterval(interval)
  }, [matchId, isLoggedIn])

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (requiresPro) return (
    <div className="flex h-[80vh] items-center justify-center p-4">
      <div className="rounded-2xl p-8 max-w-sm w-full text-center" style={{ background: '#fff', border: '2px solid #fbbf24', boxShadow: '0 4px 32px rgba(251,191,36,0.15)' }}>
        <div className="text-5xl mb-4">⭐</div>
        <h2 className="text-xl font-black text-text-primary mb-2">Pro Plan Needed</h2>
        <p className="text-text-secondary text-sm mb-2">Yeh match sirf <b>Pro subscribers</b> ke liye available hai.</p>
        <p className="text-text-muted text-xs mb-6">Live session data dekhne ke liye Pro plan lo.</p>
        <a href="https://t.me/cricket_edgeonline" target="_blank" rel="noopener noreferrer"
          className="block w-full py-3 rounded-xl font-bold text-white text-sm mb-3"
          style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
          🚀 Buy Pro — Telegram pe Contact Karo
        </a>
        <p className="text-xs text-text-muted mb-4">Telegram: <span className="font-bold text-[#229ED9]">@cricket_edgeonline</span></p>
        <button onClick={() => navigate(-1)} className="text-sm text-text-muted hover:text-primary">← Back</button>
      </div>
    </div>
  )

  if (requiresLogin) return (
    <div className="flex h-[80vh] items-center justify-center px-4">
      <div className="glass-card rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="inline-flex p-4 rounded-2xl mb-4" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">🔒 Login Zaruri Hai</h2>
        <p className="text-text-secondary text-sm mb-6">Live/upcoming session data dekhne ke liye login karo.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary" style={{ background: '#fff0f0', border: '1px solid #fecaca' }}>← Wapas</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-login-modal'))} className="px-6 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>🔑 Login karo</button>
        </div>
      </div>
    </div>
  )

  if (!data) return null

  const odds = data.odds || []
  const parsed = odds.map(o => ({ ...o, ...parseSession(o.marketName) }))
    .sort((a, b) => a.inning - b.inning || a.over - b.over)

  const innings = [...new Set(parsed.map(s => s.inning))].sort()
  const filtered = parsed.filter(s => s.inning === activeInning)

  return (
    <div className="p-4 max-w-3xl mx-auto fade-in space-y-4">

      {/* Back button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-text-muted hover:text-primary text-sm font-medium transition-colors">
        <ArrowLeft size={15} /> Back
      </button>

      {/* Match header */}
      <div className="glass-card rounded-2xl p-5">
        <h1 className="text-xl font-bold text-text-primary leading-tight">{data.matchName || 'Session Analysis'}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-text-muted">📊</span>
          <span className="text-xs font-medium text-text-muted">{odds.length} session markets</span>
        </div>
      </div>

      {/* Inning tabs */}
      {innings.length > 1 && (
        <div className="flex gap-2 p-1 rounded-xl" style={{ background: '#fee2e2' }}>
          {innings.map(inn => (
            <button
              key={inn}
              onClick={() => setActiveInning(inn)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                activeInning === inn
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              {inn === 1 ? '1st' : '2nd'} Innings
            </button>
          ))}
        </div>
      )}

      {/* Session cards */}
      <div className="space-y-3">
        {filtered.map(item => (
          <OddsCard key={item.marketName} item={item} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-text-muted text-sm">
          Is innings ka koi session data nahi mila
        </div>
      )}

      {/* Legend */}
      <div className="glass-card rounded-2xl p-4">
        <div className="text-xs font-bold text-text-secondary mb-3">📖 Kaise padhein ye data?</div>
        <div className="grid grid-cols-1 gap-2">
          {[
            { color: 'text-back', label: 'Best Yes', desc: 'is price se UPAR score jayega — back karo' },
            { color: 'text-loss', label: 'Best No', desc: 'is price se NEECHE rahega — lay karo' },
            { color: 'text-primary', label: 'Predicted Score', desc: 'Yes aur No ka midpoint — market ka estimate' },
            { color: 'text-text-secondary', label: 'Gap', desc: 'chota gap = zyada liquid market 🟢' },
          ].map(({ color, label, desc }) => (
            <div key={label} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5">•</span>
              <span><span className={`font-semibold ${color}`}>{label}</span> <span className="text-text-muted">= {desc}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
