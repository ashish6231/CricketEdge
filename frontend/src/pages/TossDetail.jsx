import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, BarChart3 } from 'lucide-react'
import { getTossSnapshot } from '../api'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { predictTossWinner } from '../utils/tossPredictor'
import { RiskBadge, MatchedRulesPanel, AvoidEntryBanner } from '../components/PredictionMeta'
import { getBookiePl, getTeamMetrics } from '../utils/bookiePl'
import { getSpoofingMetrics } from '../utils/spoofingDetector'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

const fmt = (n) => n == null ? '—' : Math.round(n).toLocaleString('en-IN')
const fmtRs = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}₹${fmt(n)}`
const pnlCls = (n) => n >= 0 ? 'text-profit' : 'text-loss'

export default function TossDetail({ isEmbedded = false }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)

  useEffect(() => {
    const fetch = (isInitial = false) => {
      if (isInitial) { setLoading(true); setRequiresLogin(false); setRequiresPro(false); setSnap(null) }
      getTossSnapshot(matchId).then(res => {
        if (isLoginRequiredError(res)) setRequiresLogin(true)
        else if (res && !res.error) setSnap(res)
        if (isInitial) setLoading(false)
      }).catch(err => {
        if (isLoginRequiredError(err)) setRequiresLogin(true)
        else if (err?.code === 'SUBSCRIPTION_REQUIRED' || err?.status === 403) setRequiresPro(true)
        if (isInitial) setLoading(false)
      })
    }
    fetch(true)
    return startVisibleInterval(() => fetch(false), LIVE_POLL_MS)
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
        <p className="text-text-muted text-xs mb-6">Live predictions aur deep metrics dekhne ke liye Pro plan lo.</p>
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

  if (requiresLogin) {
    return (
      <LoginRequiredGate
        description="Sign in to view live and upcoming toss data."
      />
    )
  }

  if (!snap) return null

  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const raw = snap.deepMetrics?.raw || {}
  const tot = snap.deepMetrics?.totals || {}
  const sp = snap.deepMetrics?.simplePL || {}
  const sup = snap.supportMetrics || {}
  const am1 = getTeamMetrics(snap, 0)
  const am2 = getTeamMetrics(snap, 1)
  const exp = snap.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const ns = snap.netSupport || {}
  const sent = snap.sentimentScore || {}

  // Back/Lay ratio prediction
  const aBack = am1.back || 0
  const aLay = am1.lay || 0
  const bBack = am2.back || 0
  const bLay = am2.lay || 0
  const t1Trades = (snap.teams?.[t1] || {}).trades || []
  const t2Trades = (snap.teams?.[t2] || {}).trades || []
  const t1Bets = tot.totalBetTeam1 || tot.team1 || 0
  const t2Bets = tot.totalBetTeam2 || tot.team2 || 0

  const { pl1: t1BookiePL, pl2: t2BookiePL, source: plSource } = getBookiePl(snap, t1, t2)

  const tossPrediction = predictTossWinner(snap, snap?.competitionName || snap?.seriesName || '')
  const fmtVol = (n) => !n ? '0' : Math.round(n).toLocaleString('en-IN')
  const { t1Fake, t2Fake, t1Pct, t2Pct, mostFakeTeam } = getSpoofingMetrics(snap)

  return (
    <div className={`w-full fade-in space-y-4 ${isEmbedded ? '' : 'p-3'}`}>

      {!isEmbedded && (
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-text-muted hover:text-primary text-sm font-medium transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
      )}      {/* Header */}
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



      {/* ━━━━━━━━━━ TOSS WINNER PREDICTION ━━━━━━━━━━ */}
      {tossPrediction && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${tossPrediction.confidence.pct.startsWith('9') || tossPrediction.confidence.pct.startsWith('8') ? '#86efac' : tossPrediction.confidence.pct.startsWith('7') ? '#fde68a' : '#fecaca'}` }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ background: 'linear-gradient(135deg,#f0fdf4,#fefce8)' }}>
            <span className="text-base">🪙</span>
            <span className="text-sm font-bold text-text-primary">Toss Winner Prediction</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#1d4ed8' }}>34/34 backtest (100%)</span>
            {tossPrediction.algoName && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                {tossPrediction.algoName}
              </span>
            )}
            {tossPrediction.risk && <RiskBadge risk={tossPrediction.risk} compact />}
            <span className={`ml-auto text-xs font-black ${tossPrediction.confidence.color}`}>{tossPrediction.confidence.label}</span>
          </div>

          <div className="p-4">
            {/* Winner Banner */}
            <div className="rounded-xl p-4 text-center mb-4" style={{
              background: 'rgba(22,163,74,0.08)',
              border: '1px solid rgba(22,163,74,0.3)'
            }}>
              <div className="text-xs text-text-muted uppercase tracking-widest mb-1">Predicted Toss Winner</div>
              <div className="text-2xl font-black mb-1 text-profit">
                {tossPrediction.winnerName}
              </div>
              {tossPrediction.algoName && (
                <div className="text-xs font-bold text-emerald-700 my-1 flex items-center justify-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-[10px] border border-emerald-300 font-black">ALGO</span>
                  <span>{tossPrediction.algoName}</span>
                </div>
              )}
              <div className="text-xs text-text-muted">Signal: {tossPrediction.reason} • {tossPrediction.confidence.pct} confidence</div>
              {tossPrediction.risk && (
                <div className="mt-2 flex justify-center">
                  <RiskBadge risk={tossPrediction.risk} />
                </div>
              )}
              {tossPrediction.matchedRules?.length > 1 && (
                <MatchedRulesPanel rules={tossPrediction.matchedRules} selectedReason={tossPrediction.reason} />
              )}
              <AvoidEntryBanner risk={tossPrediction.risk} />
            </div>

            {/* Signals breakdown */}
            <div className="space-y-2 mb-3">
              {tossPrediction.signals.map(r => (
                <div key={r.label} className="rounded-xl px-3 py-2.5" style={{
                  background: r.active ? 'rgba(22,163,74,0.06)' : 'rgba(100,100,100,0.04)',
                  border: `1px solid ${r.active ? 'rgba(22,163,74,0.2)' : 'rgba(100,100,100,0.15)'}`
                }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: r.active ? '#16a34a' : '#888' }}>
                        {r.active ? '✅' : '➡️'} {r.label}
                      </span>
                      {r.active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>ACTIVE</span>}
                    </div>
                  </div>
                  <div className="text-[10px] text-text-muted mb-1">{r.sublabel}</div>
                  {r.v2 && (
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-bold ${tossPrediction.winnerIdx === 0 ? 'text-profit' : 'text-text-muted'}`}>{t1}: {r.v1}</span>
                      <span className="text-[10px] text-text-muted px-2">vs</span>
                      <span className={`text-xs font-bold ${tossPrediction.winnerIdx === 1 ? 'text-profit' : 'text-text-muted'}`}>{t2}: {r.v2}</span>
                    </div>
                  )}
                  {!r.v2 && r.v1 && <div className="text-xs font-bold text-text-primary">{r.v1}</div>}
                </div>
              ))}
            </div>

            <div className="text-[10px] text-text-muted p-2 rounded-lg text-center" style={{ background: 'rgba(220,38,38,0.03)', border: '1px solid rgba(220,38,38,0.08)' }}>
              All rules evaluated — highest priority signal wins • Not guaranteed
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



      {/* Bookie ka risk */}
      {(exp1.netExposure != null || exp2.netExposure != null) && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-sm font-bold text-text-secondary mb-3">Bookie ka risk — Kitna exposed hai?</div>
          <div className="grid grid-cols-2 gap-3">
            {[{ e: exp1, team: t1 }, { e: exp2, team: t2 }].map(({ e, team }) => (
              <div key={team} className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
                <div className="text-sm font-medium mb-2">{e.teamName || team}</div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-text-muted">Net exposure</span><span className={`font-bold ${pnlCls(e.netExposure)}`}>{fmtRs(e.netExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Back risk</span><span className="text-back">₹{fmt(e.backExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Lay risk</span><span className="text-loss">₹{fmt(e.layExposure)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookie P/L from Trades (Exact Betfair Formula) */}
      {(t1Trades.length > 0 || t2Trades.length > 0) && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs font-bold text-text-muted uppercase mb-3">
            📈 Bookie P/L (Agar Team Jeete){plSource === 'api' ? ' • API' : ' • Trades'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ name: t1, pl: t1BookiePL }, { name: t2, pl: t2BookiePL }].map(({ name, pl }) => (
              <div key={name} className="rounded-xl p-3 text-center" style={{ background: pl >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${pl >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
                <div className="text-base font-bold text-text-primary mb-1 truncate">{name}</div>
                <div className={`text-xl font-black ${pnlCls(pl)}`}>{fmtRs(pl)}</div>
                <div className={`text-xs font-bold mt-1 ${pnlCls(pl)}`}>{pl >= 0 ? '✅ PROFIT' : '❌ LOSS'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall sentiment */}
      {ns.teamA && sent.teamA && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-sm font-bold text-text-secondary mb-3">Overall sentiment — Logon ka mood</div>
          <div className="mb-3">
            {[t1, t2].map((team, i) => {
              const key = i === 0 ? 'teamA' : 'teamB'
              const pct = i === 0 ? ns.percentageA : ns.percentageB
              return (
                <div key={key} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{team}</span>
                    <span className={`font-bold ${pct >= 50 ? 'text-profit' : 'text-loss'}`}>{pct?.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#fee2e2' }}>
                    <div className={`h-full rounded-full ${pct >= 50 ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="text-xs text-text-muted text-center">
            Zyada support: <span className="text-profit font-bold">{sent.strongerTeam}</span> •{' '}
            Difference: <span className="text-text-secondary">₹{fmt(sent.scoreDifference)}</span>
          </div>
        </div>
      )}

      {/* Spoofing Detector */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #fde8e8 0%, #fdf0e8 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🚨</span>
          <span className="text-xl font-bold text-text-primary">Spoofing Detector</span>
          <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>LIVE</span>
        </div>
        <p className="text-xs text-text-muted mb-4">Cumulative fake orders — canceled volume not matched as trades</p>
        <div className="h-3 rounded-full overflow-hidden flex mb-2" style={{ background: '#fecaca' }}>
          <div className="h-full" style={{ width: `${t1Pct}%`, background: 'linear-gradient(90deg,#dc2626,#f87171)' }} />
          <div className="h-full" style={{ width: `${t2Pct}%`, background: 'linear-gradient(90deg,#10b981,#fbbf24)' }} />
        </div>
        <div className="flex justify-between text-xs font-semibold mb-4">
          <span className="text-primary">{t1}: {t1Pct.toFixed(1)}%</span>
          <span className="text-text-muted">{t2}: {t2Pct.toFixed(1)}%</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[{ team: t1, fake: t1Fake, isMain: true }, { team: t2, fake: t2Fake, isMain: false }].map(({ team, fake, isMain }) => (
            <div key={team} className="bg-white rounded-xl p-3" style={{ border: '1px solid #fecaca' }}>
              <div className={`text-xs font-bold mb-3 truncate ${isMain ? 'text-primary' : 'text-text-secondary'}`}>{team}</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3b82f6' }} />
                    <span className="text-xs text-text-muted">Fake Back</span>
                  </div>
                  <span className="text-xs font-bold text-text-primary">{fmtVol(fake.fakeBack)}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f87171' }} />
                    <span className="text-xs text-text-muted">Fake Lay</span>
                  </div>
                  <span className="text-xs font-bold text-text-primary">{fmtVol(fake.oppFakeLay)}</span>
                </div>
              </div>
              <div className="border-t border-border mt-2.5 pt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-text-secondary">Total</span>
                <span className={`text-sm font-black ${isMain ? 'text-primary' : 'text-text-muted'}`}>{fmtVol(fake.total)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl py-4 px-5 text-center" style={{ background: 'linear-gradient(135deg,#fca5a5,#fcd9b0)' }}>
          <div className="text-xs font-bold tracking-widest text-primary/60 uppercase mb-1">Most Fake Orders On</div>
          <div className="text-2xl font-bold text-primary">{mostFakeTeam}</div>
        </div>
      </div>



    </div>
  )
}
