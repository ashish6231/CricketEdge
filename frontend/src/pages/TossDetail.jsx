import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, BarChart3, Trophy } from 'lucide-react'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { predictTossWinner } from '../utils/tossPredictor'
import { MatchedRulesPanel, AvoidEntryBanner } from '../components/PredictionMeta'
import { isWorldLegendsTossLeague } from '../../../server/utils/worldLegendsTossAlgorithm'
import { getBookiePlFromMatchedTrades, getMarketExposureFromTrades, getSelectionStakes, latestMatchedPrice, timestamp } from '../utils/bookiePl'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle } from '../socket'
import { getCricketMatchBundle, getTossSnapshot } from '../api'
import { hasTossSnapshot, isCompleteMatchBundle } from '../utils/matchBundle'
import LegendsTossMarketEvidence from '../components/LegendsTossMarketEvidence'

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

  return <TossSnapshotDetails snap={snap} isEmbedded={isEmbedded} onBack={() => navigate(-1)} />
}

// Shared by the dedicated toss page and Match Detail's toss section.
export function TossSnapshotDetails({ snap, isEmbedded = false, onBack }) {
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const raw = snap.deepMetrics?.raw || {}
  const tot = snap.deepMetrics?.totals || {}
  const am1 = getSelectionStakes(snap, t1)
  const am2 = getSelectionStakes(snap, t2)
  const exp = getMarketExposureFromTrades(snap, t1, t2)
  const exp1 = exp.team1 || {}, exp2 = exp.team2 || {}
  const ns = snap.netSupport || {}, sent = snap.sentimentScore || {}
  const t1Trades = snap.teams?.[t1]?.trades || []
  const t2Trades = snap.teams?.[t2]?.trades || []
  const { pl1, pl2 } = getBookiePlFromMatchedTrades(snap, t1, t2)
  const totVol = am1.totalBet != null && am2.totalBet != null ? am1.totalBet + am2.totalBet : null
  const pct1 = totVol > 0 ? Math.round(am1.totalBet / totVol * 100) : null
  const pct2 = pct1 == null ? null : 100 - pct1
  const competition = snap.competitionName || snap.seriesName || ''
  const isLegends = isWorldLegendsTossLeague(competition)
  const prediction = predictTossWinner(snap, competition)
  const teams = [
    { name: t1, volume: am1.totalBet, percentage: pct1, odds: latestMatchedPrice(t1Trades) },
    { name: t2, volume: am2.totalBet, percentage: pct2, odds: latestMatchedPrice(t2Trades) },
  ]
  const metricRows = [
    { label: 'Back exposure', values: [raw.A_back_expo, raw.B_back_expo] },
    { label: 'Lay stake', values: [raw.A_lay_stake, raw.B_lay_stake] },
  ].filter(row => row.values.some(value => value != null))
  const exposureRows = [
    { label: 'Net exposure', values: [exp1.netExposure, exp2.netExposure], signed: true },
    { label: 'Back risk', values: [exp1.backExposure, exp2.backExposure] },
    { label: 'Lay risk', values: [exp1.layExposure, exp2.layExposure] },
  ]
  const hasExposure = [exp1.netExposure, exp2.netExposure].some(value => value != null)
  const hasLedger = pl1 != null || pl2 != null || t1Trades.length > 0 || t2Trades.length > 0
  const signals = prediction?.signals?.filter(signal => signal.label !== 'Bookie Pre-P/L') || []
  const teamHeader = <thead><tr><th scope="col">Metric</th><th scope="col">{t1}</th><th scope="col">{t2}</th></tr></thead>
  const signalTable = signals.length > 0 && <table className="toss-data-table" aria-label="Additional market signals by team">
    <thead><tr><th scope="col">Signal</th><th scope="col">{t1}</th><th scope="col">{t2}</th></tr></thead>
    <tbody>{signals.map(signal => <tr key={signal.label}>
      <th scope="row" title={signal.label === 'Pre-Match Lay' ? 'Matched lay stakes' : signal.sublabel}>{signal.label}</th>
      {signal.v2 ? <><td>{signal.v1}</td><td>{signal.v2}</td></> : <td colSpan={2}>{signal.v1 || '—'}</td>}
    </tr>)}</tbody>
  </table>

  return (
    <div className={`toss-detail-page w-full${isEmbedded ? '' : ' detail-page'}`}>
      <header className="toss-detail-hero">
        {!isEmbedded && <button type="button" onClick={onBack} className="toss-detail-back" aria-label="Back to toss matches"><ArrowLeft size={16} /><span>Back</span></button>}
        <div className="toss-detail-heading">
          <span className="toss-detail-eyebrow">Toss market</span>
          <h1 id="toss-detail-title">{t1} <span>vs</span> {t2}</h1>
        </div>
        <div className="toss-detail-meta">
          {snap.inPlay && <span className="toss-detail-live"><span className="pulse-dot" /> LIVE</span>}
          <span className="toss-detail-date">Updated {timestamp(snap.serverTime) == null ? 'time unavailable' : new Date(timestamp(snap.serverTime)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </header>

      <div className={`toss-overview-grid ${prediction ? '' : 'without-prediction'}`}>
        {prediction && <section className="toss-prediction-card" aria-label="Toss winner prediction">
          <div className="toss-prediction-header"><span><Trophy size={15} />Toss Winner Prediction</span>
            {prediction.risk && <span className={`toss-risk-pill ${prediction.risk.avoidEntry || prediction.risk.tier === 'high' ? 'is-high' : ''}`}>{prediction.risk.shortLabel || prediction.risk.label}</span>}
          </div>
          <div className="toss-prediction-winner">
            <div className="toss-winner-label">Predicted toss winner</div>
            <h2 className="toss-winner-name">{prediction.winnerName}</h2>
            {prediction.algoName && <p className="toss-prediction-algorithm">{prediction.algoName}</p>}
          </div>
          <p className="toss-prediction-reason">{prediction.reason}</p>
          <div className="toss-prediction-note">Rule-based · future accuracy unvalidated</div>
          {prediction.matchedRules?.length > 1 && <MatchedRulesPanel rules={prediction.matchedRules} selectedReason={prediction.reason} />}
          <AvoidEntryBanner risk={prediction.risk} />
        </section>}

        <section className="toss-comparison-card" aria-labelledby="market-activity-heading">
          <div className="toss-comparison-heading"><h2 id="market-activity-heading">Market activity</h2><span>Total matched <strong>€{formatVolStr(totVol)}</strong></span></div>
          <table className="toss-data-table toss-market-table" aria-label="Matched money, support and latest toss odds">
            <thead><tr><th scope="col">Team</th><th scope="col">Matched</th><th scope="col">Support</th><th scope="col">Odds</th></tr></thead>
            <tbody>{teams.map((team, index) => <tr key={team.name}>
              <th scope="row"><span className={`toss-team-dot team-${index}`} />{team.name}</th>
              <td>€{formatVolStr(team.volume)}</td><td>{team.percentage == null ? '—' : `${team.percentage}%`}</td><td>{formatOdds(team.odds)}</td>
            </tr>)}</tbody>
          </table>
          <div className="toss-support-bar" aria-label={`${t1} ${pct1 ?? 0}% support, ${t2} ${pct2 ?? 0}% support`}>
            <span className="team-0" style={{ width: `${pct1 ?? 0}%` }} /><span className="team-1" style={{ width: `${pct2 ?? 0}%` }} />
          </div>
          <p className="toss-panel-caption">Matched stakes from the toss market</p>
        </section>
      </div>

      <LegendsTossMarketEvidence snap={snap} prediction={prediction} />

      {signalTable && (isLegends ? <details className="toss-signal-details"><summary>Additional market signals <span>Context only</span></summary>{signalTable}</details>
        : <section className="toss-panel"><header className="toss-panel-heading"><h2>Market signals</h2></header>{signalTable}</section>)}

      <div className="toss-analytics-grid">
        {(hasExposure || hasLedger) && <section className="toss-panel">
          <header className="toss-panel-heading"><h2>Bookmaker exposure &amp; P/L</h2><span>Per-odds Trades</span></header>
          <table className="toss-data-table" aria-label="Bookmaker risk and profit by team">{teamHeader}<tbody>
            {hasLedger && <tr className="toss-pl-row"><th scope="row">P/L if team wins</th>{[pl1, pl2].map((pl, index) => <td key={index} className={pnlCls(pl)}><strong>{fmtRs(pl)}</strong><small>{pl == null ? 'Unavailable' : pl >= 0 ? 'Profit' : 'Loss'}</small></td>)}</tr>}
            {hasExposure && exposureRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={index} className={row.signed ? pnlCls(value) : ''}>{row.signed ? fmtRs(value) : value == null ? '—' : `€${fmt(value)}`}</td>)}</tr>)}
          </tbody></table>
          <p className="toss-panel-caption">Calculated from matched trades at each odds level.</p>
        </section>}

        {(metricRows.length > 0 || Object.keys(tot).length > 0) && <section className="toss-panel">
          <header className="toss-panel-heading"><h2><BarChart3 size={14} />Deep betting metrics</h2><span>Provider reported</span></header>
          {metricRows.length > 0 && <table className="toss-data-table" aria-label="Raw accumulated betting values">{teamHeader}<tbody>
            {metricRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={index}>{value == null ? '—' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>)}</tr>)}
          </tbody></table>}
          {Object.keys(tot).length > 0 && <details className="toss-provider-details"><summary>Provider reported totals</summary><dl>{Object.entries(tot).map(([key, value]) => <div key={key}><dt>{['team1', 'totalBetTeam1'].includes(key) ? t1 : ['team2', 'totalBetTeam2'].includes(key) ? t2 : key}</dt><dd>{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</dd></div>)}</dl></details>}
        </section>}
      </div>

      {ns.teamA && sent.teamA && <section className="toss-panel toss-sentiment">
        <header className="toss-panel-heading"><h2>Market sentiment</h2><span>Higher support: <strong>{sent.strongerTeam}</strong> · difference €{fmt(sent.scoreDifference)}</span></header>
        <div className="toss-sentiment-grid">{[t1, t2].map((team, index) => {
          const pct = index === 0 ? ns.percentageA : ns.percentageB
          return <div key={team}><span>{team}</span><strong>{pct?.toFixed(1)}%</strong><div className="toss-sentiment-bar"><span style={{ width: `${pct || 0}%` }} /></div></div>
        })}</div>
      </section>}

      <details className="toss-data-note"><summary>Order cancellation data</summary><p>Unavailable. The feed does not include verified order cancellations. Back/lay imbalance alone cannot establish fake orders or spoofing.</p></details>
    </div>
  )
}
