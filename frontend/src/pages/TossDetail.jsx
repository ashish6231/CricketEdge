import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, BarChart3, Trophy } from 'lucide-react'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import SubscriptionRequiredGate from '../components/SubscriptionRequiredGate'
import { isSubscriptionRequiredError, requiresPaidMatchAccess } from '../utils/matchAccess'
import { predictTossWinner } from '../utils/tossPredictor'
import { MatchedRulesPanel, AvoidEntryBanner } from '../components/PredictionMeta'
import { getMarketExposureFromTrades } from '../utils/bookiePl'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle } from '../socket'
import { getCricketMatchBundle, getTossSnapshot } from '../api'
import { hasTossSnapshot } from '../utils/matchBundle'
import TossRuleEvidence from '../components/TossRuleEvidence'
import { getTossMarketSummary } from '../../../server/utils/tossMarketSummary.mjs'
import { formatTossAmount as formatVolStr, formatSignedTossMoney as fmtRs, formatTossMoney } from '../utils/tossMarketDisplay'
import { createTossSnapshotSync } from '../utils/tossSnapshotSync'
import { getTossRuleInputs } from '../../../server/utils/universalTossAlgorithm.mjs'
import {getTossMarketStatus,formatTossTime} from '../utils/tossMarketStatus'

const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
const pnlCls = n => n == null ? 'text-text-muted' : n >= 0 ? 'text-profit' : 'text-loss'

const formatOdds = (val) => {
  if (val === null || val === undefined || val === 0 || isNaN(Number(val))) return '—'
  return Number(val).toFixed(2)
}

export default function TossDetail({ isEmbedded = false }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn, isFreeMode, authReady, user } = useOutletContext()
  const [snap, setSnap] = useState(null)
  const [marketInfo, setMarketInfo] = useState(location.state?.matchData)
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const socket = getSocket()
    let cancelled = false
    let resolved = false
    let receivedBundle = false
    let sync

    setLoading(true)
    setSnap(null)
    setMarketInfo(location.state?.matchData)
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
      if (isSubscriptionRequiredError(bundle)) {
        setRequiresPro(true)
        setLoading(false)
        resolved = true
        return true
      }
      const tossData = bundle?.toss
      if (tossData && !tossData.error) {
        return handleSnapshot(tossData)
      }
      return false
    }

    const handleSnapshot = snapshot => cancelled ? false : sync.apply(snapshot)
    const handleRequestError = error => {
      if (cancelled) return true
      if (isLoginRequiredError(error)) {
        setRequiresLogin(true)
        setLoading(false)
        resolved = true
        return true
      }
      if (isSubscriptionRequiredError(error)) {
        setRequiresPro(true)
        setLoading(false)
        resolved = true
        return true
      }
      return false
    }

    sync=createTossSnapshotSync({matchId,fetchSnapshot:getTossSnapshot,onSummary:setMarketInfo,
      onSnapshot:snapshot=>{
        setSnap(snapshot)
        setLoadError('')
        setLoading(false)
        resolved=true
      },onError:handleRequestError})
    const onTossFeed=payload=>{sync.refreshFromFeed(payload)}
    const onBundle = bundle => {
      receivedBundle = true
      handleBundle(bundle)
    }
    const onGenericBundle = bundle => {
      if (String(bundle?.matchId) === String(matchId)) onBundle(bundle)
    }
    const cached = getMatchBundle(matchId)
    if (hasTossSnapshot(cached)) handleBundle(cached)
    sync.refresh(location.state?.matchData?.tossLoad)

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
    const fallbackTimer = setTimeout(() => {
      if (!cancelled && (!receivedBundle || !resolved) && !document.hidden) loadFromHttp()
    }, 6000)
    // Keep checking this open detail even when list/socket notifications stop
    // or the amount stays unchanged while a toss result arrives separately.
    const refreshOpenMarket=()=>{if(!cancelled && !document.hidden)sync.refreshNow()}
    const refreshTimer=setInterval(refreshOpenMarket,15000)
    document.addEventListener('visibilitychange',refreshOpenMarket)
    socket.on(`match:bundle:${matchId}`, onBundle)
    socket.on('match:bundle', onGenericBundle)
    socket.on('toss:matches', onTossFeed)

    subscribeMatch(matchId, 'toss')

    const loadingTimeout = setTimeout(() => {
      if (!cancelled && !resolved) {
        setLoading(false)
        setLoadError(current => current || 'Toss data is taking longer than expected. Please retry.')
      }
    }, 12000)

    return () => {
      cancelled = true
      sync.cancel()
      clearTimeout(loadingTimeout)
      clearTimeout(fallbackTimer)
      clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange',refreshOpenMarket)
      unsubscribeMatch(matchId)
      socket.off(`match:bundle:${matchId}`, onBundle)
      socket.off('match:bundle', onGenericBundle)
      socket.off('toss:matches', onTossFeed)
    }
  }, [matchId, isLoggedIn, isFreeMode, location.state?.matchData])

  if (requiresPaidMatchAccess({ authReady, isLoggedIn, isFreeMode, user, match: snap || marketInfo, feature: 'toss' })) return <SubscriptionRequiredGate featureLabel="Toss" onBack={() => navigate('/toss')} />

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (requiresPro && !isFreeMode) return <SubscriptionRequiredGate featureLabel="Toss" onBack={() => navigate('/toss')} />

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

  return <TossSnapshotDetails snap={snap} matchInfo={marketInfo} isEmbedded={isEmbedded} onBack={() => navigate(-1)} />
}

// Shared by the dedicated toss page and Match Detail's toss section.
export function TossSnapshotDetails({ snap, matchInfo, isEmbedded = false, onBack }) {
  const [statusNow,setStatusNow]=useState(Date.now)
  useEffect(()=>{const timer=setInterval(()=>setStatusNow(Date.now()),30000);return()=>clearInterval(timer)},[])
  const marketStatus=getTossMarketStatus(snap,matchInfo,statusNow)
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const raw = snap.deepMetrics?.raw || {}
  const market = getTossMarketSummary(snap,matchInfo)
  const exp = getMarketExposureFromTrades(snap, t1, t2)
  const exp1 = exp.team1 || {}, exp2 = exp.team2 || {}
  const ns = snap.netSupport || {}, sent = snap.sentimentScore || {}
  const t1Trades = snap.teams?.[t1]?.trades || []
  const t2Trades = snap.teams?.[t2]?.trades || []
  const competition = snap.competitionName || snap.seriesName || matchInfo?.competitionName || ''
  const ruleContext={...matchInfo,competitionName:competition}
  const ruleInputs = getTossRuleInputs(snap,ruleContext)
  const [pl1, pl2] = ruleInputs.pl
  const providerTotals = ruleInputs.providerTotals || [null, null]
  const totVol = market.totalMatched
  const teamVolume = market.team1.money != null && market.team2.money != null ? market.team1.money + market.team2.money : null
  const pct1 = teamVolume > 0 ? Math.round(market.team1.money / teamVolume * 100) : null
  const pct2 = pct1 == null ? null : 100 - pct1
  const prediction = predictTossWinner(snap, ruleContext)
  const teams = [
    { name: t1, volume: market.team1.money, netExposure: market.team1.netExposure, percentage: pct1, odds: market.team1.odds, providerTotal: providerTotals[0], pl: pl1 },
    { name: t2, volume: market.team2.money, netExposure: market.team2.netExposure, percentage: pct2, odds: market.team2.odds, providerTotal: providerTotals[1], pl: pl2 },
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
  const teamHeader = <thead><tr><th scope="col">Metric</th><th scope="col">{t1}</th><th scope="col">{t2}</th></tr></thead>

  return (
    <div className={`toss-detail-page toss-v2 w-full${isEmbedded ? '' : ' detail-page'}`}>
      <header className="toss-detail-hero">
        {!isEmbedded && <button type="button" onClick={onBack} className="toss-detail-back" aria-label="Back to toss matches"><ArrowLeft size={16} /><span>Back</span></button>}
        <div className="toss-detail-heading">
          <span className="toss-detail-eyebrow">Toss market</span>
          <h1 id="toss-detail-title">{t1} <span>vs</span> {t2}</h1>
        </div>
        <div className="toss-detail-meta">
          {marketStatus.resultReported ? <span className="toss-risk-pill">Toss result reported</span>
            : snap.inPlay && <span className="toss-detail-live"><span className="pulse-dot" /> LIVE</span>}
          <span className="toss-detail-date">Snapshot: {formatTossTime(marketStatus.sourceTime)}</span>
        </div>
      </header>

      <div className="toss-v2-stack">
        <section className="toss-comparison-card" aria-label="Toss data status">
          {marketStatus.resultReported && <div className="toss-comparison-heading"><h2>Reported toss winner: {marketStatus.winner}</h2><span>{marketStatus.resultText || 'Reported result'}</span></div>}
          <p className="match-panel-note">Latest recorded trade: {formatTossTime(marketStatus.lastTradeTime)}.{marketStatus.resultReported?' Toss has been reported; these amounts are recorded market values, not a live winner forecast.':''}</p>
          {marketStatus.stale && <p className="match-panel-note" role="status">Snapshot source time is more than 2 minutes old or unavailable. The displayed market amounts are not confirmed current.</p>}
        </section>
        {prediction && <section className="toss-prediction-card" aria-label={marketStatus.closed?'Toss rule calculation':'Toss winner prediction'}>
          <div className="toss-prediction-header"><span><Trophy size={15} />{marketStatus.closed?'Toss Rule Calculation':'Toss Winner Prediction'}</span>
            <div><span className="toss-prediction-note">{marketStatus.closed?'Rule calculation · not the reported result':'Rule-based · future accuracy unvalidated'}</span>{prediction.risk && <span className={`toss-risk-pill ${prediction.risk.avoidEntry || prediction.risk.tier === 'high' ? 'is-high' : ''}`}>{prediction.risk.shortLabel || prediction.risk.label}</span>}</div>
          </div>
          <div className="toss-prediction-main">
            <div className="toss-prediction-winner">
              <div className="toss-winner-label">{marketStatus.closed?'Rule-selected team (not the result)':'Predicted toss winner'}</div>
              <h2 className="toss-winner-name">{prediction.winnerName}</h2>
              {prediction.algoName && <p className="toss-prediction-algorithm">{prediction.algoName}</p>}
            </div>
            <p className="toss-prediction-reason">{prediction.reason}</p>
          </div>
          {prediction.matchedRules?.length > 1 && <MatchedRulesPanel rules={prediction.matchedRules} selectedReason={prediction.reason} />}
          <AvoidEntryBanner risk={prediction.risk} />
        </section>}

        {!prediction && ruleInputs.unavailableReason && <section className="toss-prediction-card" aria-label="Toss prediction unavailable" role="status">
          <div className="toss-prediction-header"><span><Trophy size={15} />Toss Winner Prediction</span></div>
          <p className="toss-prediction-reason">{ruleInputs.unavailableReason}</p>
        </section>}

        <section className="toss-comparison-card" aria-labelledby="market-activity-heading">
          <div className="toss-comparison-heading"><h2 id="market-activity-heading">Market activity</h2><span>Total matched <strong>€{formatVolStr(totVol)}</strong></span></div>
          <div className="match-market-cards toss-market-cards" aria-label="Toss market activity by team">
            {teams.map((team, index) => <article className={`match-market-team team-${index}`} key={team.name}>
              <header className="match-market-team-name"><span>{team.name.split(/\s+/).map(word => word[0]).join('').slice(0, 3)}</span><h3>{team.name}</h3></header>
              <div className="toss-market-team-quote">
                <div><small>Toss odds</small><strong aria-label={`${team.name} odds`}>{formatOdds(team.odds)}</strong></div>
                <div><small>Support</small><strong>{team.percentage == null ? '—' : `${team.percentage}%`}</strong></div>
              </div>
              <div className="match-market-team-stats">
                <div><small>Net exposure (Back − Lay)</small><strong aria-label={`${team.name} net exposure`} className={pnlCls(team.netExposure)}>{fmtRs(team.netExposure)}</strong></div>
                <div><small>Bookie P/L</small><strong className={pnlCls(team.pl)}>{fmtRs(team.pl)}</strong></div>
                <div title="Provider activity total; separate from net exposure and Bookie P/L"><small>Provider total</small><strong>{formatTossMoney(team.providerTotal)}</strong></div>
              </div>
              <div className="match-market-team-matched">
                <div><small>Total matched</small><strong aria-label={`${team.name} matched money`} title={formatTossMoney(team.volume)}>€{formatVolStr(team.volume)}</strong><span>of €{formatVolStr(totVol)}</span></div>
                <b>{team.percentage == null ? '—' : `${team.percentage}%`}</b>
              </div>
              <div className="match-market-team-bar" aria-label={`${team.name} ${team.percentage ?? 0}% support`}><span style={{ width: `${team.percentage ?? 0}%` }} /></div>
            </article>)}
          </div>
        </section>
      </div>

      <TossRuleEvidence snap={snap} prediction={prediction} inputs={ruleInputs} />

      <div className="toss-analytics-grid">
        {(hasExposure || hasLedger) && <section className="toss-panel">
          <header className="toss-panel-heading"><h2>Bookmaker exposure &amp; P/L</h2><span>Per-odds Trades</span></header>
          <table className="toss-data-table" aria-label="Bookmaker risk and profit by team">{teamHeader}<tbody>
            {hasLedger && <tr className="toss-pl-row"><th scope="row">Bookie P/L</th>{[pl1, pl2].map((pl, index) => <td key={index} className={pnlCls(pl)}><strong>{fmtRs(pl)}</strong><small>{pl == null ? 'Unavailable' : pl >= 0 ? 'Profit' : 'Loss'}</small></td>)}</tr>}
            {hasExposure && exposureRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={index} className={row.signed ? pnlCls(value) : ''}>{row.signed ? fmtRs(value) : value == null ? '—' : `€${fmt(value)}`}</td>)}</tr>)}
          </tbody></table>
          <p className="toss-panel-caption">P/L = Lay stake − Back exposure, the same formula used on the match page.</p>
        </section>}

        {metricRows.length > 0 && <section className="toss-panel">
          <header className="toss-panel-heading"><h2><BarChart3 size={14} />Deep betting metrics</h2><span>Provider reported</span></header>
          <table className="toss-data-table" aria-label="Raw accumulated betting values">{teamHeader}<tbody>
            {metricRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={index}>{value == null ? '—' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>)}</tr>)}
          </tbody></table>
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
