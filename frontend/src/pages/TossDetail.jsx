import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Lock, TrendingUp, BarChart3, Shield } from 'lucide-react'
import { getTossSnapshot } from '../api'

const fmt    = (n) => n == null ? '—' : Math.round(n).toLocaleString('en-IN')
const fmtRs  = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}₹${fmt(n)}`
const pnlCls = (n) => n >= 0 ? 'text-profit' : 'text-loss'

export default function TossDetail() {
  const { matchId } = useParams()
  const navigate    = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [snap, setSnap]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)

  useEffect(() => {
    const fetch = (isInitial = false) => {
      if (isInitial) { setLoading(true); setRequiresLogin(false); setSnap(null) }
      getTossSnapshot(matchId).then(res => {
        if (res?.error === 'login_required') setRequiresLogin(true)
        else if (res && !res.error) setSnap(res)
        if (isInitial) setLoading(false)
      }).catch(() => { if (isInitial) setLoading(false) })
    }
    fetch(true)
    const interval = setInterval(() => fetch(false), 1500)
    return () => clearInterval(interval)
  }, [matchId, isLoggedIn])

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (requiresLogin) return (
    <div className="flex h-[80vh] items-center justify-center px-4">
      <div className="glass-card rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="inline-flex p-4 rounded-2xl mb-4" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">🔒 Login Zaruri Hai</h2>
        <p className="text-text-secondary text-sm mb-6">Live/upcoming toss data dekhne ke liye login karo.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary" style={{ background: '#fff0f0', border: '1px solid #fecaca' }}>← Wapas</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-login-modal'))} className="px-6 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>🔑 Login karo</button>
        </div>
      </div>
    </div>
  )

  if (!snap) return null

  const t1  = snap.teamNames?.[0] || 'Team 1'
  const t2  = snap.teamNames?.[1] || 'Team 2'
  const raw = snap.deepMetrics?.raw    || {}
  const tot = snap.deepMetrics?.totals || {}
  const sp  = snap.deepMetrics?.simplePL || {}
  const sup = snap.supportMetrics || {}
  const am1 = snap.advancedMetricsV2?.team1 || {}
  const am2 = snap.advancedMetricsV2?.team2 || {}

  // Back/Lay ratio prediction
  const aBack = raw.A_back_expo || am1.back || 0
  const aLay  = raw.A_lay_stake || am1.lay  || 0
  const bBack = raw.B_back_expo || am2.back || 0
  const bLay  = raw.B_lay_stake || am2.lay  || 0
  const pl1 = sp.team1_win
  const pl2 = sp.team2_win
  const t1Bets = tot.totalBetTeam1 || tot.team1 || 0
  const t2Bets = tot.totalBetTeam2 || tot.team2 || 0
  const maxBets = Math.max(t1Bets, t2Bets)
  const minBets = Math.min(t1Bets, t2Bets)
  const betsGap = minBets > 0 ? maxBets / minBets : 0
  const bookieTeam = betsGap >= 3
    ? (t1Bets <= t2Bets ? t1 : t2)
    : (t1Bets >= t2Bets ? t1 : t2)
  const publicTeam = bookieTeam === t1 ? t2 : t1
  const signalStr = betsGap >= 3 ? 'Strong 🔥 (Contra)' : betsGap >= 1.5 ? 'Moderate' : 'Weak'
  const signalCls = betsGap >= 3 ? 'text-profit' : betsGap >= 1.5 ? 'text-yellow-500' : 'text-text-muted'
  const hasBLData = t1Bets > 0 || t2Bets > 0

  return (
    <div className="p-4 max-w-3xl mx-auto fade-in space-y-4">

      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-text-muted hover:text-primary text-sm font-medium transition-colors">
        <ArrowLeft size={15} /> Back
      </button>

      {/* Header */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t1} vs {t2}</h1>
            <div className="text-xs text-text-muted mt-1">🪙 Toss Market • {snap.serverTime?.split('T')[0]}</div>
          </div>
          {snap.inPlay && (
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: '#dc2626' }} /> LIVE
            </span>
          )}
        </div>
      </div>

      {/* Back/Lay Toss Prediction */}
      {hasBLData && (
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)', border: '2px solid #fecaca' }}>
          <div className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={16} /> 🧠 Back/Lay Toss Prediction
          </div>

          <div className="rounded-xl p-4 text-center mb-4" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)' }}>
            <div className="text-xs text-text-muted uppercase tracking-widest mb-1">Predicted Toss Winner</div>
            <div className="text-2xl font-black text-profit">{bookieTeam}</div>
            <div className="text-xs mt-1 text-text-muted">Bookie is team ki jeet chahta hai</div>
          </div>

          <div className="space-y-3 mb-4">
            {[{ team: t1, bets: t1Bets, isBookie: bookieTeam === t1 },
              { team: t2, bets: t2Bets, isBookie: bookieTeam === t2 }]
              .map(({ team, bets, isBookie }) => (
              <div key={team}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-text-secondary">{team}</span>
                  <div className="flex items-center gap-2">
                    {isBookie && <span className="text-xs font-bold text-profit bg-profit/10 px-2 py-0.5 rounded-full">Predicted Winner</span>}
                    <span className="text-xs text-text-muted">Total Bets: <b className={isBookie ? 'text-profit' : 'text-text-muted'}>₹{fmt(bets)}</b></span>
                  </div>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden" style={{ background: '#fee2e2' }}>
                  <div className={`h-full rounded-full ${isBookie ? 'bg-profit' : 'bg-loss/70'}`} style={{ width: `${t1Bets + t2Bets > 0 ? (bets / (t1Bets + t2Bets) * 100) : 50}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
              <div className="text-xs text-text-muted mb-1">Signal Strength</div>
              <div className={`text-sm font-bold ${signalCls}`}>{signalStr}</div>
              <div className="text-xs text-text-muted mt-0.5">Bets gap: {betsGap.toFixed(1)}x</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
              <div className="text-xs text-text-muted mb-1">Public Favourite</div>
              <div className="text-sm font-bold text-loss">{publicTeam}</div>
              <div className="text-xs text-text-muted mt-0.5">Log is team pe back kar rahe hain</div>
            </div>
          </div>
        </div>
      )}

      {/* Deep Betting Metrics */}
      {(Object.keys(raw).length > 0 || Object.keys(tot).length > 0) && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
            <BarChart3 size={15} className="text-primary" />
            <span className="text-sm font-bold text-primary">Deep Betting Metrics</span>
          </div>
          <div className="p-4 space-y-4">
            {Object.keys(raw).length > 0 && (
              <div>
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Raw Accumulated Values</div>
                <div className="space-y-1.5">
                  {[
                    { key: 'A_back_expo', label: `${t1} Back Expo` },
                    { key: 'A_lay_stake', label: `${t1} Lay Stake` },
                    { key: 'B_back_expo', label: `${t2} Back Expo` },
                    { key: 'B_lay_stake', label: `${t2} Lay Stake` },
                  ].filter(({ key }) => raw[key] != null).map(({ key, label }) => (
                    <div key={key} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-xs text-text-secondary font-medium">{label}</span>
                      <span className="text-xs font-bold text-text-primary">{Number(raw[key]).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(tot).length > 0 && (
              <div>
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Total Bets</div>
                <div className="space-y-1.5">
                  {Object.entries(tot).map(([key, val]) => {
                    const name = key === 'team1' ? t1 : key === 'team2' ? t2 : key === 'totalBetTeam1' ? t1 : key === 'totalBetTeam2' ? t2 : key
                    return (
                      <div key={key} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-xs text-text-secondary font-medium">{name}</span>
                        <span className="text-xs font-bold text-text-primary">{Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bookie P/L */}
      <div className="glass-card rounded-2xl p-4">
        <div className="text-xs font-bold text-text-muted uppercase mb-3">Bookie P/L — Kaun jeete to kya hoga?</div>
        <div className="grid grid-cols-2 gap-3">
          {[{ team: t1, pl: pl1 }, { team: t2, pl: pl2 }].map(({ team, pl }) => (
            <div key={team} className="rounded-xl p-3 border" style={{ background: (pl ?? 0) >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', borderColor: (pl ?? 0) >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)' }}>
              <div className="text-xs text-text-muted mb-1">Agar {team} jeete</div>
              <div className={`text-xl font-bold ${pnlCls(pl)}`}>{fmtRs(pl)}</div>
              <div className={`text-xs mt-0.5 ${pnlCls(pl)}`}>{(pl ?? 0) >= 0 ? '✅ Bookie profit' : '❌ Bookie loss'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Public Support */}
      <div className="glass-card rounded-2xl p-4">
        <div className="text-xs font-bold text-text-muted uppercase mb-3 flex items-center gap-2">
          <Shield size={14} /> Public Support
        </div>
        {[{ team: t1, key: 'team1' }, { team: t2, key: 'team2' }].map(({ team, key }) => {
          const s = sup[key] || {}
          const pct = s.support || 0
          return (
            <div key={key} className="mb-3 last:mb-0">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text-primary">{team}</span>
                <span className={`font-bold ${pct >= 50 ? 'text-profit' : 'text-text-muted'}`}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#fee2e2' }}>
                <div className={`h-full rounded-full ${pct >= 50 ? 'bg-profit' : 'bg-primary/40'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-text-muted mt-0.5">₹{fmt(s.supportMoney)} laga</div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
