import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, BarChart3 } from 'lucide-react'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { predictTossWinner } from '../utils/tossPredictor'
import { RiskBadge, MatchedRulesPanel, AvoidEntryBanner } from '../components/PredictionMeta'
import { getBookiePl, getSelectionStakes, latestMatchedPrice, timestamp } from '../utils/bookiePl'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle } from '../socket'
import { getCricketMatchBundle, getTossSnapshot } from '../api'
import { hasTossSnapshot, isCompleteMatchBundle } from '../utils/matchBundle'

const fmt = (n) => n == null ? '—' : Math.round(n).toLocaleString('en-IN')
const fmtRs = (n) => n == null ? '—' : `${n >= 0 ? '+' : '−'}€${fmt(Math.abs(n))}`
const pnlCls = (n) => n == null ? 'text-text-muted' : n >= 0 ? 'text-profit' : 'text-loss'

const formatVolStr = (val) => {
  if (val === null || val === undefined) return '—'
  if (val === 0 || val === '0') return '0.00'
  const num = Number(val)
  if (isNaN(num)) return val.toString()
  const abs = Math.abs(num)
  if (abs >= 10000000) return `${num < 0 ? '-' : ''}${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `${num < 0 ? '-' : ''}${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${num < 0 ? '-' : ''}${(abs / 1000).toFixed(2)}k`
  return num.toFixed(2)
}

const formatOdds = (val) => {
  if (val === null || val === undefined || val === 0 || isNaN(Number(val))) return '—'
  return Number(val).toFixed(2)
}

export default function TossDetail({ isEmbedded = false }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn } = useOutletContext()
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const socket = getSocket()
    let cancelled = false
    let resolved = false

    setLoading(true)
    setSnap(null)
    setLoadError('')
    setRequiresLogin(false)
    setRequiresPro(false)

    const handleBundle = (bundle) => {
      if (cancelled || !bundle) return false
      if (isLoginRequiredError(bundle) || bundle?.error === 'login_required') {
        setRequiresLogin(true)
        setLoading(false)
        resolved = true
        return true
      }
      if (bundle?.code === 'SUBSCRIPTION_REQUIRED' || bundle?.status === 403) {
        setRequiresPro(true)
        setLoading(false)
        resolved = true
        return true
      }
      const tossData = bundle?.toss
      if (tossData && !tossData.error) {
        setSnap(tossData)
        setLoadError('')
        setLoading(false)
        resolved = true
        return true
      }
      return false
    }

    const handleSnapshot = snapshot => {
      if (cancelled || !snapshot || snapshot.error) return false
      setSnap(snapshot)
      setLoadError('')
      setLoading(false)
      resolved = true
      return true
    }
    const handleRequestError = error => {
      if (cancelled) return true
      if (isLoginRequiredError(error)) {
        setRequiresLogin(true)
        setLoading(false)
        resolved = true
        return true
      }
      if (error?.status === 403 || error?.code === 'SUBSCRIPTION_REQUIRED') {
        setRequiresPro(true)
        setLoading(false)
        resolved = true
        return true
      }
      return false
    }

    const onBundle = bundle => {
      if (isCompleteMatchBundle(bundle)) handleBundle(bundle)
    }
    const onGenericBundle = bundle => {
      if (String(bundle?.matchId) === String(matchId) && isCompleteMatchBundle(bundle)) onBundle(bundle)
    }
    const onConnect = () => subscribeMatch(matchId, 'toss')
    const cached = getMatchBundle(matchId)
    if (hasTossSnapshot(cached)) handleBundle(cached)

    const loadFromHttp = async () => {
      try {
        const bundle = await getCricketMatchBundle(matchId)
        if (handleBundle(bundle)) return
      } catch (error) {
        if (handleRequestError(error)) return
      }
      try {
        const snapshot = await getTossSnapshot(matchId)
        if (handleSnapshot(snapshot)) return
      } catch (error) {
        if (handleRequestError(error)) return
        if (!cancelled) setLoadError(error?.detail || 'Toss data is not available for this match yet.')
      }
      if (!cancelled) setLoading(false)
    }
    loadFromHttp()
    socket.on(`match:bundle:${matchId}`, onBundle)
    socket.on('match:bundle', onGenericBundle)

    if (socket.connected) {
      subscribeMatch(matchId, 'toss')
    } else {
      socket.once('connect', onConnect)
    }

    const loadingTimeout = setTimeout(() => {
      if (!cancelled && !resolved) {
        setLoading(false)
        setLoadError(current => current || 'Toss data is taking longer than expected. Please retry.')
      }
    }, 12000)

    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
      unsubscribeMatch(matchId)
      socket.off(`match:bundle:${matchId}`, onBundle)
      socket.off('match:bundle', onGenericBundle)
      socket.off('connect', onConnect)
    }
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

  if (!snap) return (
    <div className="detail-page flex min-h-[65vh] items-center justify-center p-4">
      <div className="glass-card max-w-md w-full rounded-2xl p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Toss data unavailable</h2>
        <p className="mt-2 text-sm text-text-muted">{loadError || 'The market opened, but its detailed snapshot has not arrived yet.'}</p>
        {location.state?.matchData?.matchName && <p className="mt-3 text-sm font-semibold text-text-secondary">{location.state.matchData.matchName}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="ui-button-primary rounded-lg px-4 py-2 text-sm font-semibold">Retry</button>
          <button type="button" onClick={() => navigate('/toss')} className="ui-button-secondary rounded-lg border px-4 py-2 text-sm font-semibold">Back to matches</button>
        </div>
      </div>
    </div>
  )

  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const raw = snap.deepMetrics?.raw || {}
  const tot = snap.deepMetrics?.totals || {}
  const am1 = getSelectionStakes(snap, t1)
  const am2 = getSelectionStakes(snap, t2)
  const exp = snap.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const ns = snap.netSupport || {}
  const sent = snap.sentimentScore || {}

  // Back/Lay ratio prediction
  const t1Trades = (snap.teams?.[t1] || {}).trades || []
  const t2Trades = (snap.teams?.[t2] || {}).trades || []

  const { pl1: t1BookiePL, pl2: t2BookiePL, source: plSource } = getBookiePl(snap, t1, t2)


  const vol1 = am1.totalBet
  const vol2 = am2.totalBet

  const tossOdds1 = latestMatchedPrice(t1Trades)
  const tossOdds2 = latestMatchedPrice(t2Trades)

  const totVol = vol1 != null && vol2 != null ? vol1 + vol2 : null
  const pct1 = totVol > 0 ? Math.round((vol1 / totVol) * 100) : null
  const pct2 = pct1 == null ? null : 100 - pct1

  const tossPrediction = predictTossWinner(snap, snap?.competitionName || snap?.seriesName || '')

  return (
    <div className={`w-full fade-in space-y-4 ${isEmbedded ? '' : 'detail-page'}`}>

      {!isEmbedded && (
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-text-muted hover:text-primary text-sm font-medium transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
      )}      {/* Header */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t1} vs {t2}</h1>
            <div className="text-xs text-text-muted mt-1">🪙 Toss Market • {timestamp(snap.serverTime) == null ? 'Capture time unavailable' : new Date(timestamp(snap.serverTime)).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          </div>
          {snap.inPlay && (
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: '#dc2626' }} /> LIVE
            </span>
          )}
        </div>
      </div>

      {/* Toss Team Comparison Card (100% Width) */}
      <div className="w-full rounded-xl border border-[#1e2536] bg-[#0c1018] py-2.5 px-4 sm:px-6 shadow-md mb-3">
        <div className="flex items-center justify-around gap-4 sm:gap-12 w-full">
          {/* Team 1 Column */}
          <div className="flex flex-col items-center flex-1 min-w-0 text-center">
            <span className="text-xs sm:text-sm font-semibold text-slate-300 truncate max-w-full leading-tight">
              {t1}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug my-0.5" title="Traded volume on this selection">
              {formatVolStr(vol1)}
            </span>
            {/* Percentage Badge */}
            <span
              className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full inline-block leading-none my-0.5 ${
                pct1 >= 50
                  ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                  : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
              }`}
            >
              {pct1 == null ? '—' : `${pct1}%`}
            </span>
            {/* Odds */}
            <div className="flex items-center justify-center gap-0.5 text-[11px] sm:text-xs font-bold text-[#10b981] leading-tight mt-0.5" title="Last price matched">
              <span className="text-[9px]">▲</span>
              <span>{formatOdds(tossOdds1)}</span>
            </div>
          </div>

          {/* Team 2 Column */}
          <div className="flex flex-col items-center flex-1 min-w-0 text-center">
            <span className="text-xs sm:text-sm font-semibold text-slate-300 truncate max-w-full leading-tight">
              {t2}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug my-0.5" title="Traded volume on this selection">
              {formatVolStr(vol2)}
            </span>
            {/* Percentage Badge */}
            <span
              className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full inline-block leading-none my-0.5 ${
                pct2 >= 50
                  ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                  : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
              }`}
            >
              {pct2 == null ? '—' : `${pct2}%`}
            </span>
            {/* Odds */}
            <div className="flex items-center justify-center gap-0.5 text-[11px] sm:text-xs font-bold text-[#10b981] leading-tight mt-0.5" title="Last price matched">
              <span className="text-[9px]">▲</span>
              <span>{formatOdds(tossOdds2)}</span>
            </div>
          </div>
        </div>

        {/* Micro Inflow Bar */}
        <div className="mt-2 h-1.5 w-full bg-[#1b2234] rounded-full overflow-hidden flex">
          <div
            style={{ width: `${pct1 ?? 0}%` }}
            className={`h-full transition-all duration-300 ${
              pct1 >= pct2
                ? 'bg-gradient-to-r from-emerald-700 to-green-600'
                : 'bg-gradient-to-r from-red-600 to-rose-600'
            }`}
          />
          <div
            style={{ width: `${pct2 ?? 0}%` }}
            className={`h-full transition-all duration-300 ${
              pct2 > pct1
                ? 'bg-gradient-to-r from-emerald-700 to-green-600'
                : 'bg-gradient-to-r from-red-600 to-rose-600'
            }`}
          />
        </div>
      </div>
      {/* ━━━━━━━━━━ TOSS WINNER PREDICTION ━━━━━━━━━━ */}
      {tossPrediction && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #d1d5db' }}>
          {/* Header */}
          <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap" style={{ background: 'linear-gradient(135deg,#f0fdf4,#fefce8)' }}>
            <span className="text-sm">🪙</span>
            <span className="text-xs font-bold text-text-primary">Toss Winner Prediction</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#1d4ed8' }}>Historical rules · live accuracy unvalidated</span>
            {tossPrediction.algoName && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                {tossPrediction.algoName}
              </span>
            )}
            {tossPrediction.risk && <RiskBadge risk={tossPrediction.risk} compact />}
            <span className={`ml-auto text-xs font-black ${tossPrediction.confidence.color}`}>{tossPrediction.confidence.label}</span>
          </div>

          <div className="p-3">
            {/* Winner Banner */}
            <div className="rounded-lg px-3 py-2.5 text-center mb-3" style={{
              background: 'rgba(22,163,74,0.08)',
              border: '1px solid rgba(22,163,74,0.3)'
            }}>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Predicted Toss Winner</div>
              <div className="text-lg font-black leading-tight text-profit">
                {tossPrediction.winnerName}
              </div>
              {tossPrediction.algoName && (
                <div className="text-xs font-bold text-emerald-700 my-1 flex items-center justify-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-[10px] border border-emerald-300 font-black">ALGO</span>
                  <span>{tossPrediction.algoName}</span>
                </div>
              )}
              <div className="text-[10px] text-text-muted mt-1">Signal: {tossPrediction.reason} • Confidence is uncalibrated</div>
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
              {tossPrediction.signals.filter(r => r.label !== 'Bookie Pre-P/L').map(r => (
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
                  <div className="text-[10px] text-text-muted mb-1">{r.label === 'Pre-Match Lay' ? 'Matched lay stakes' : r.sublabel}</div>
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
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Provider reported total</div>
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
                  <div className="flex justify-between"><span className="text-text-muted">Back risk</span><span className="text-back">€{fmt(e.backExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Lay risk</span><span className="text-loss">€{fmt(e.layExposure)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Original provider Bookie P/L, with trades fallback */}
      {(t1BookiePL != null || t2BookiePL != null || t1Trades.length > 0 || t2Trades.length > 0) && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs font-bold text-text-muted uppercase mb-3">
            📈 Bookie P/L (Agar Team Jeete){plSource === 'api' ? ' • API' : ' • Trades'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ name: t1, pl: t1BookiePL }, { name: t2, pl: t2BookiePL }].map(({ name, pl }) => (
              <div key={name} className="rounded-xl p-3 text-center" style={{ background: pl >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${pl >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
                <div className="text-base font-bold text-text-primary mb-1 truncate">{name}</div>
                <div className={`text-xl font-black ${pnlCls(pl)}`}>{fmtRs(pl)}</div>
                <div className={`text-xs font-bold mt-1 ${pnlCls(pl)}`}>{pl == null ? 'Unavailable' : pl >= 0 ? '✅ PROFIT' : '❌ LOSS'}</div>
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
            Difference: <span className="text-text-secondary">€{fmt(sent.scoreDifference)}</span>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-text-primary">Order cancellation data</h3>
        <p className="text-xs text-text-muted mt-2">Unavailable. The feed does not include verified order cancellations. Back/lay imbalance alone cannot establish fake orders or spoofing.</p>
      </div>


    </div>
  )
}
