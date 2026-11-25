import { useState, useMemo } from 'react'
import { BarChart3, ChevronDown } from 'lucide-react'
import TeamCard from './SelectionVolumeCard'
import MatchPredictionCard from './MatchPredictionCard'
import TotalBetLoadBars from './TotalBetLoadBars'
import { getPreMatchPeriod } from '../utils/preMatchPeriod'
import { capturePreMatchExposure } from '../../../server/utils/preMatchExposure.mjs'
import { processTeamData, getLiveProviderTotals } from '../utils/selectionVolume'
import {
  getDirectProviderBookiePl,
  getSettledBookiePl,
  splitMatchOutcomes,
  finiteNumber,
  tradeTimestamp,
  tradeSide,
  getSelectionStakes,
} from '../utils/bookiePl'
import { teamEq } from '../utils/gatedFadePredictor'
import { tradeMatchesMarket } from '../utils/sessionMetrics'

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

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return formatVolStr(n)
}

const fmtRs = (n) => {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}€${fmt(Math.abs(n))}`
}

const pnlCls = (n) => n == null ? 'text-text-muted' : n >= 0 ? 'text-profit' : 'text-loss'

const formatOdds = (val) => {
  if (val === null || val === undefined || val === 0 || isNaN(Number(val))) return '—'
  return Number(val).toFixed(2)
}

const formatTotalBets = (val) => {
  const number = finiteNumber(val)
  if (number == null) return '—'
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const findMarketRunner = (marketSnapshot, teamName) => (marketSnapshot?.runners || []).find(runner =>
  teamEq(runner?.runnerName || runner?.name || runner?.team, teamName)
) || null

const percentage = value => Number.isFinite(value) ? `${value.toFixed(0)}%` : '—'

/**
 * Shared match/toss market workbench: prediction banner, load bar,
 * market overview cards, tabbed period data table, and market depth & trades.
 */
export default function MarketWorkbench({
  snapshot,
  prediction = null,
  predictionLabel = 'Predicted winner',
  loadLabel = 'Match Load',
  isToss = false,
  liveOdds = null,
  startTime = null,
  preMatchCapture = null,
  preMatchFields = null,
  preMatchProviderTotals = null,
  predictionProviderTotals = null,
  activeSessions = [],
  sessionTrades = [],
}) {
  const [timeFilter, setTimeFilter] = useState('all')
  const [marketType, setMarketType] = useState('match_odds')
  const [metricsPeriod, setMetricsPeriod] = useState('pre')

  const effectiveSnapshot = useMemo(() => {
    if (!snapshot) return null
    const resolvedStart = snapshot.startTime ?? snapshot.openDate ?? snapshot.marketStartTime ?? startTime
    return capturePreMatchExposure(
      resolvedStart != null ? { ...snapshot, startTime: resolvedStart } : snapshot,
      preMatchCapture,
      { now: Date.now() },
    )
  }, [snapshot, startTime, preMatchCapture])

  const resolvedPreMatchFields = useMemo(() => {
    if (preMatchFields) return preMatchFields
    if (!effectiveSnapshot) return null
    return getPreMatchPeriod(effectiveSnapshot, {
      startTime: effectiveSnapshot.startTime ?? startTime,
      capturedTotals: preMatchProviderTotals,
    })
  }, [preMatchFields, effectiveSnapshot, startTime, preMatchProviderTotals])

  if (!effectiveSnapshot) return null

  const captureState = effectiveSnapshot.preMatchCapture
  const { t1, t2, drawName } = splitMatchOutcomes(effectiveSnapshot.teamNames)
  const hasDraw = !!drawName
  const t1Trades = (effectiveSnapshot.teams?.[t1] || {}).trades || []
  const t2Trades = (effectiveSnapshot.teams?.[t2] || {}).trades || []
  const drawTrades = hasDraw ? ((effectiveSnapshot.teams?.[drawName] || {}).trades || []) : []

  const getLatestOdds = (trades, teamKey) => {
    const liveQuote = Object.entries(liveOdds?.odds || {}).find(([name]) => teamEq(name, teamKey))?.[1]
    const sorted = [...trades].sort((a, b) => (tradeTimestamp(b) || 0) - (tradeTimestamp(a) || 0))
    let back = liveQuote?.back ?? sorted.find(t => tradeSide(t) === 'back')?.price
    let lay = liveQuote?.lay ?? sorted.find(t => tradeSide(t) === 'lay')?.price

    if (back == null || lay == null) {
      const runners = Array.isArray(effectiveSnapshot?.runners) ? effectiveSnapshot.runners : []
      const normalizeName = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
      const targetName = normalizeName(teamKey)
      const runnerName = (runner) => runner?.runnerName || runner?.name || ''
      let runner = runners.find(r => normalizeName(runnerName(r)) === targetName)
      if (!runner && runners.length === effectiveSnapshot?.teamNames?.length) {
        const teamIndex = effectiveSnapshot.teamNames.findIndex(name => normalizeName(name) === targetName)
        if (teamIndex >= 0) runner = runners[teamIndex]
      }
      if (!runner) {
        const possible = runners.filter(r => teamEq(runnerName(r), teamKey))
        if (possible.length === 1) runner = possible[0]
      }
      if (runner) {
        if (back == null) back = runner.back ?? runner.backPrice ?? runner.ex?.availableToBack?.[0]?.price ?? runner.price ?? null
        if (lay == null) lay = runner.lay || runner.layPrice || runner.ex?.availableToLay?.[0]?.price || null
      }
    }

    return { back: finiteNumber(back) > 1 ? finiteNumber(back) : null, lay: finiteNumber(lay) > 1 ? finiteNumber(lay) : null }
  }

  const t1Odds = getLatestOdds(t1Trades, t1)
  const t2Odds = getLatestOdds(t2Trades, t2)
  const drawOdds = hasDraw ? getLatestOdds(drawTrades, drawName) : null
  const am1 = getSelectionStakes(effectiveSnapshot, t1)
  const am2 = getSelectionStakes(effectiveSnapshot, t2)
  const formatStakeVolume = value => value == null ? 'Unavailable' : `€${fmt(value)}`
  const exactStakeVolume = value => value == null ? 'Unavailable' : `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const { pl1, pl2, plDraw } = isToss
    ? getDirectProviderBookiePl(effectiveSnapshot, t1, t2, drawName)
    : getSettledBookiePl(effectiveSnapshot, t1, t2, drawName)

  const validMarketTrades = (trades) => trades.filter(trade => (
    finiteNumber(trade?.size) > 0 && finiteNumber(trade?.price) > 1 && tradeSide(trade)
  ))
  const t1ValidTrades = validMarketTrades(t1Trades)
  const t2ValidTrades = validMarketTrades(t2Trades)
  const drawValidTrades = hasDraw ? validMarketTrades(drawTrades) : []

  const marketProviderTotals = getLiveProviderTotals(effectiveSnapshot) || [null, null]
  const marketTotalBets = marketProviderTotals.every(value => value != null)
    ? marketProviderTotals.reduce((sum, value) => sum + value, 0)
    : null

  const sumTradeMoney = (trades) => trades.reduce((sum, trade) => sum + finiteNumber(trade.size), 0)
  const drawMetrics = hasDraw ? getSelectionStakes(effectiveSnapshot, drawName) : null
  const marketMoney1 = sumTradeMoney(t1ValidTrades) || am1.totalBet || 0
  const marketMoney2 = sumTradeMoney(t2ValidTrades) || am2.totalBet || 0
  const marketMoneyDraw = hasDraw ? (sumTradeMoney(drawValidTrades) || drawMetrics?.totalBet || 0) : 0
  const marketMoneyTotal = marketMoney1 + marketMoney2 + marketMoneyDraw
  const marketMoneyPct1 = marketMoneyTotal > 0 ? (marketMoney1 / marketMoneyTotal) * 100 : 50
  const marketMoneyPct2 = marketMoneyTotal > 0 ? (marketMoney2 / marketMoneyTotal) * 100 : 50
  const marketMoneyPctDraw = marketMoneyTotal > 0 ? (marketMoneyDraw / marketMoneyTotal) * 100 : 0

  const aBack = am1.back || 0
  const aLay = am1.lay || 0
  const bBack = am2.back || 0
  const bLay = am2.lay || 0
  const aRatio = aLay > 0 ? aBack / aLay : null
  const bRatio = bLay > 0 ? bBack / bLay : null
  const aTotalBL = aBack + aLay
  const bTotalBL = bBack + bLay
  const aBackPct = aTotalBL > 0 ? (aBack / aTotalBL) * 100 : 50
  const bBackPct = bTotalBL > 0 ? (bBack / bTotalBL) * 100 : 50

  const finalTmv = effectiveSnapshot.threeMinVolume || {}
  const finalTmb = effectiveSnapshot.threeMinTotalBets || {}
  const exp = effectiveSnapshot.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const sent = effectiveSnapshot.sentimentScore || {}
  const ns = effectiveSnapshot.netSupport || {}

  const isSessionMarket = !isToss && marketType.startsWith('session_')
  const selectedSessionName = isSessionMarket ? marketType.replace('session_', '') : ''
  const selectedSessionTrades = isSessionMarket ? sessionTrades.filter(t => tradeMatchesMarket(t, selectedSessionName)) : []

  const t1GraphData = processTeamData(t1, effectiveSnapshot?.teams?.[t1], timeFilter, findMarketRunner(effectiveSnapshot, t1))
  const t2GraphData = processTeamData(t2, effectiveSnapshot?.teams?.[t2], timeFilter, findMarketRunner(effectiveSnapshot, t2))
  const sessionGraphData = isSessionMarket ? processTeamData('Total Runs', { trades: selectedSessionTrades }, timeFilter) : null

  if (t1GraphData) t1GraphData.bookieProfitIfWins = pl1
  if (t2GraphData) t2GraphData.bookieProfitIfWins = pl2
  const marketVol = (t1GraphData?.totalBet || 0) + (t2GraphData?.totalBet || 0)

  const marketSelections = [
    { name: t1, odds: t1Odds, pl: pl1, money: marketMoney1, moneyPct: marketMoneyPct1, bets: marketProviderTotals[0], back: am1.back, lay: am1.lay },
    { name: t2, odds: t2Odds, pl: pl2, money: marketMoney2, moneyPct: marketMoneyPct2, bets: marketProviderTotals[1], back: am2.back, lay: am2.lay },
    ...(hasDraw ? [{ name: drawName, odds: drawOdds, pl: plDraw, money: marketMoneyDraw, moneyPct: marketMoneyPctDraw, bets: null, back: drawMetrics?.back, lay: drawMetrics?.lay }] : []),
  ]

  const periods = [
    { key: 'pre', label: 'Pre-match', pnl: effectiveSnapshot.preMatchPnl || {}, bets: effectiveSnapshot.preMatchTotalBets || {}, vol: effectiveSnapshot.preMatchVolume || {} },
    { key: 'live', label: 'In-play', pnl: effectiveSnapshot.inPlayPnl || {}, bets: effectiveSnapshot.inPlayTotalBets || {}, vol: effectiveSnapshot.inPlayVolume || {} },
    { key: '3min', label: 'Last 3 min', pnl: effectiveSnapshot.threeMinPnl || {}, bets: finalTmb, vol: finalTmv },
  ]
  const period = periods.find(item => item.key === metricsPeriod) || periods[0]
  const liveProviderTotals = marketProviderTotals
  const selectionKeys = [t1, t2].map(name => `team${(effectiveSnapshot.teamNames || []).indexOf(name) + 1}`)
  const periodValues = field => selectionKeys.map(key => field?.[key])

  const tllPreMatchValues = {
    volume: periodValues(effectiveSnapshot.preMatchVolume),
    pnl: periodValues(effectiveSnapshot.preMatchPnl).map(value => finiteNumber(value)),
    totalBets: periodValues(effectiveSnapshot.preMatchTotalBets),
  }
  const threeMinProviderTotals = selectionKeys.map(key => finiteNumber(effectiveSnapshot.threeMinTotalBets?.[key]))
  const periodProviderTotals = metricsPeriod === 'pre' ? tllPreMatchValues.totalBets
    : metricsPeriod === '3min' ? threeMinProviderTotals : liveProviderTotals
  const resolvedPredictionTotals = predictionProviderTotals || resolvedPreMatchFields?.providerTotals || [null, null]

  const periodVolumeValues = metricsPeriod === 'pre' ? tllPreMatchValues.volume : periodValues(period.vol)
  const periodPnlValues = metricsPeriod === 'pre'
    ? tllPreMatchValues.pnl : periodValues(period.pnl).map(value => finiteNumber(value))

  const flowRows = [
    { label: 'Bookie P/L', values: [pl1, pl2], format: 'signed', missingLabel: 'Price history unavailable' },
    { label: 'Back stake', values: [am1.back, am2.back], format: 'currency', tone: 'back' },
    { label: 'Lay stake', values: [am1.lay, am2.lay], format: 'currency', tone: 'lay' },
    { label: 'Back / lay ratio', values: [aRatio, bRatio], format: 'ratio' },
    { label: 'Back / lay share', values: [aTotalBL > 0 ? aBackPct : null, bTotalBL > 0 ? bBackPct : null], format: 'split' },
    { label: 'Net exposure', values: [exp1.netExposure, exp2.netExposure], format: 'signed' },
    { label: 'Back risk', values: [exp1.backExposure, exp2.backExposure], format: 'currency', tone: 'back' },
    { label: 'Lay risk', values: [exp1.layExposure, exp2.layExposure], format: 'currency', tone: 'lay' },
    { label: 'Total Bet', values: liveProviderTotals, format: 'total-bet', emphasis: true, missingLabel: 'Unavailable' },
    ...(ns.teamA && sent.teamA ? [{ label: 'Market sentiment', values: [ns.percentageA, ns.percentageB], format: 'percent' }] : []),
  ]

  const periodRows = [
    ...(metricsPeriod === 'pre' ? [
      { label: 'Total Back Volume (all odds)', values: periodVolumeValues.map(value => value?.back), format: 'stake-total', tone: 'back', missingLabel: 'Provider value unavailable' },
      { label: 'Total Lay Volume (all odds)', values: periodVolumeValues.map(value => value?.lay), format: 'stake-total', tone: 'lay', missingLabel: 'Provider value unavailable' },
      { label: 'Total Vol', values: periodVolumeValues.map(value => finiteNumber(value?.total)), format: 'currency-exact', missingLabel: 'Provider value unavailable' },
      {
        label: 'Back / Lay Volume Ratio',
        values: periodVolumeValues.map(value => {
          const back = finiteNumber(value?.back), lay = finiteNumber(value?.lay)
          const ratio = back > 0 && lay > 0 ? back / lay : null
          return Number.isFinite(ratio) ? ratio : null
        }),
        format: 'ratio',
        missingLabel: 'Unavailable',
      },
    ] : []),
    { label: 'P/L', values: periodPnlValues, format: 'signed-exact', missingLabel: 'Provider value unavailable' },
    {
      label: 'Total Bet',
      values: periodProviderTotals,
      format: 'total-bet',
      emphasis: true,
      missingLabel: metricsPeriod === 'pre' ? 'Not captured' : 'Unavailable',
    },
    ...(metricsPeriod === 'pre' ? [{
      label: 'Provider total (prediction input)',
      values: resolvedPredictionTotals,
      format: 'currency',
      emphasis: true,
      missingLabel: 'Not captured',
    }] : []),
    ...(metricsPeriod !== 'pre' ? [
      { label: 'Back volume', values: periodValues(period.vol).map(value => value?.back), format: 'currency', tone: 'back' },
      { label: 'Lay volume', values: periodValues(period.vol).map(value => value?.lay), format: 'currency', tone: 'lay' },
      { label: 'Total Vol', values: periodValues(period.vol).map(value => finiteNumber(value?.total)), format: 'currency-exact', missingLabel: 'Not captured' },
    ] : []),
  ]

  const insightRows = metricsPeriod === 'exposure' ? flowRows : periodRows

  const formatInsightValue = (row, value) => {
    if (value == null && row.missingLabel) return <small>{row.missingLabel}</small>
    if (row.format === 'activity') return value == null ? '—' : <>{value.count.toLocaleString('en-IN')}{value.pct != null && <> <small>{`(${percentage(value.pct)})`}</small></>}</>
    if (row.format === 'total-bet') return formatTotalBets(value)
    if (row.format === 'signed') return fmtRs(value)
    if (row.format === 'signed-exact') return value == null ? '—' : `${value < 0 ? '−' : '+'}€${Math.abs(Number(value)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (row.format === 'stake-total') return exactStakeVolume(value)
    if (row.format === 'currency-exact') return value == null ? '—' : `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (row.format === 'currency') return value == null ? '—' : value > 0 && value < .005 ? '<€0.01' : `€${fmt(value)}`
    if (row.format === 'ratio') return value == null ? '—' : `${value.toFixed(2)}×`
    if (row.format === 'split') return value == null ? '—' : `${value.toFixed(0)}% / ${(100 - value).toFixed(0)}%`
    if (row.format === 'percent') return value == null ? '—' : `${Number(value).toFixed(1)}%`
    return fmt(value)
  }

  return (
    <div className="match-v2-shell">
      <MatchPredictionCard prediction={prediction} label={predictionLabel} />
      <TotalBetLoadBars markets={[{
        label: loadLabel,
        team1: { name: t1, amount: marketProviderTotals[0] },
        team2: { name: t2, amount: marketProviderTotals[1] },
      }]} />

      <section className="match-v2-card" aria-labelledby={isToss ? 'toss-market-heading' : 'match-market-heading'}>
        <header className="match-v2-section-head">
          <div>
            <h2 id={isToss ? 'toss-market-heading' : 'match-market-heading'}>Market overview</h2>
            <p>Latest recorded odds and settlement</p>
          </div>
          <span><strong>€{fmt(marketMoneyTotal)}</strong> matched · {formatTotalBets(marketTotalBets)} total bets</span>
        </header>
        <div className={`match-market-cards${hasDraw ? ' has-three' : ''}`} aria-label="Market activity, odds and bookmaker profit">
          {marketSelections.map((side, index) => (
            <article className={`match-market-team team-${index}`} key={side.name}>
              <header className="match-market-team-name">
                <span>{side.name.split(/\s+/).map(word => word[0]).join('').slice(0, 3)}</span>
                <h3>{side.name}</h3>
              </header>
              <div className="match-market-team-odds" aria-label={`${side.name} best odds`}>
                <div><small>Back</small><strong>{formatOdds(side.odds?.back)}</strong></div>
                <div><small>Lay</small><strong>{formatOdds(side.odds?.lay)}</strong></div>
              </div>
              <div className="match-market-team-stats">
                <div><small>Total bets</small><strong>{formatTotalBets(side.bets)}</strong></div>
                <div><small>Bookie P/L</small><strong className={pnlCls(side.pl)}>{fmtRs(side.pl)}</strong></div>
              </div>
              <div className="match-market-team-stats match-market-team-volumes">
                <div><small>Back volume · all odds</small><strong aria-label={`${side.name} back volume`} title={exactStakeVolume(side.back)}>{formatStakeVolume(side.back)}</strong></div>
                <div><small>Lay volume · all odds</small><strong aria-label={`${side.name} lay volume`} title={exactStakeVolume(side.lay)}>{formatStakeVolume(side.lay)}</strong></div>
              </div>
              <div className="match-market-team-matched">
                <div><small>Total matched</small><strong>€{fmt(side.money)}</strong><span>of €{fmt(marketMoneyTotal)}</span></div>
                <b>{marketMoneyTotal > 0 ? percentage(side.moneyPct) : '—'}</b>
              </div>
              <div className="match-market-team-bar" aria-label={`${side.name} ${marketMoneyTotal > 0 ? percentage(side.moneyPct) : 'matched share unavailable'}`}>
                <span style={{ width: `${marketMoneyTotal > 0 ? Math.max(0, Math.min(100, side.moneyPct)) : 0}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="match-v2-card match-v2-insights">
        <header className="match-v2-section-head">
          <div>
            <h2>Period data</h2>
            <p>{metricsPeriod === 'exposure' ? 'Recorded market totals' : metricsPeriod === 'pre'
              ? captureState?.state === 'locked' ? `Pre-match data locked${captureState.capturedAfterStart ? ' after match start' : ''} · ${new Date(captureState.lockedAt).toLocaleString('en-IN')}`
                : 'Collecting pre-match data — waiting for all four non-zero Back/Lay exposures'
              : 'Provider-reported period values'}</p>
          </div>
        </header>
        <div className="match-v2-tabs" role="tablist" aria-label="Metrics period">
          {[...periods, { key: 'exposure', label: 'Exposure' }].map(item => (
            <button key={item.key} type="button" role="tab" aria-selected={metricsPeriod === item.key} onClick={() => setMetricsPeriod(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="match-v2-table" style={{ '--team-count': 2 }} role="table" aria-label={metricsPeriod === 'exposure' ? 'Market stakes ratios and exposure' : `${period.label} metrics`}>
          <div className="match-v2-table-head" role="row">
            <span role="columnheader">Metric</span>
            {[t1, t2].map(name => <div role="columnheader" key={name}><span>{name.split(/\s+/).map(word => word[0]).join('').slice(0, 3)}</span><strong>{name}</strong></div>)}
          </div>
          {insightRows.map(row => (
            <div className={`match-v2-table-row${row.emphasis ? ' is-emphasis' : ''}`} role="row" key={row.label}>
              <span role="rowheader">{row.label}</span>
              {row.values.map((value, index) => (
                <strong role="cell" key={index} className={row.format === 'signed' ? pnlCls(value) : row.tone ? `match-tone-${row.tone}` : ''}>
                  {formatInsightValue(row, value)}
                </strong>
              ))}
            </div>
          ))}
        </div>
      </section>

      <details className="match-v2-card match-depth-panel" open={isToss}>
        <summary className="match-depth-summary">
          <span><BarChart3 size={16} /><strong>{isToss ? 'Betfair Exchange Toss Graphs' : 'Market depth & trades'}</strong><small>€{formatVolStr(marketVol)} volume</small></span>
          <ChevronDown size={16} />
        </summary>
        <div className="match-depth-content">
          <header className="match-depth-toolbar">
            <div><h2>Recorded trades</h2><p>Filter price history and market depth</p></div>
            <div className="match-depth-controls">
              <div className="match-period-tabs" aria-label="Trade history range">
                {[['all', 'All'], ['3h', '3H'], ['1h', '1H']].map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={timeFilter === key} onClick={() => setTimeFilter(key)}>{label}</button>
                ))}
              </div>
              {!isToss && activeSessions?.length > 0 && (
                <select aria-label="Recorded market" value={marketType} onChange={event => setMarketType(event.target.value)}>
                  <option value="match_odds">Match odds</option>
                  {activeSessions.map(session => <option key={session} value={`session_${session}`}>{session}</option>)}
                </select>
              )}
            </div>
          </header>
          {isSessionMarket ? (
            <div>
              <h3 className="match-session-title">{selectedSessionName} · €{formatVolStr(sessionGraphData?.totalBet || 0)}</h3>
              <TeamCard teamData={sessionGraphData} isToss={false} isSession={true} marketVol={sessionGraphData?.totalBet || 0} />
            </div>
          ) : (
            <div className="match-price-grid">
              <TeamCard teamData={t1GraphData} isToss={isToss} marketVol={marketVol} />
              <TeamCard teamData={t2GraphData} isToss={isToss} marketVol={marketVol} />
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
