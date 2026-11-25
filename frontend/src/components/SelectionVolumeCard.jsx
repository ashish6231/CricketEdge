import { useState, lazy, Suspense } from 'react'
import VirtualPriceRows from './VirtualPriceRows'
import LazyLoadBoundary from './LazyLoadBoundary'
const SelectionVolumeChart = lazy(() => import('./SelectionVolumeChart'))
import './SelectionVolumeCard.css'

const money = value => value == null ? '—' : `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = value => value == null ? '—' : value.toFixed(2)
const prob = value => value != null && value > 0 ? `${(100 / value).toFixed(1)}%` : '—'

export default function SelectionVolumeCard({ teamData, isToss = false, isSession = false }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [view, setView] = useState(() => (isToss ? 'betfair' : 'ladder'))
  const [metricMode, setMetricMode] = useState('odds')
  const [showMa, setShowMa] = useState(true)
  if (!teamData) return null
  const d = teamData
  const priceBook = isSession ? d.orderBook : isToss ? d.orderBook : d.liquidityBook
  const priceBookAvailable = isSession || isToss ? d.available : d.liquidityAvailable
  const totalBet = Number(d.totalBet) || 0
  const totalBack = Number(d.totalBack) || 0
  const backShare = totalBet > 0 ? (totalBack / totalBet) * 100 : 50
  const layShare = totalBet > 0 ? 100 - backShare : 50
  const sessionPl = row => d.orderBook.reduce((sum, line) => sum + (Math.ceil(row.price) > line.price ? line.lay - line.back : line.back - line.lay), 0)
  const chartData = view === 'volume' && isToss ? d.orderBook : priceBook
  const isChartEmpty = view === 'betfair' || view === 'time' ? !d.timeSeries.length : !chartData.length

  if (isToss) {
    const trendText = d.trend === 'Dropping' ? 'Steaming (Odds ↓)' : d.trend === 'Rising' ? 'Drifting (Odds ↑)' : 'Steady'
    const viewButtons = [
      ['betfair', 'Price & Volume'],
      ['volume', 'Odds Histogram'],
      ['ladder', 'Price Ladder'],
    ]
    return (
      <section className="selection-volume selection-volume--betfair" aria-label={`${d.name} Betfair Exchange graph`}>
        <header className="bf-header">
          <div className="bf-header__title">
            <span className="bf-badge">Betfair Graph</span>
            <h3>{d.name}</h3>
          </div>
          <span className={`bf-trend bf-trend--${d.trend.toLowerCase()}`}>{trendText}</span>
        </header>

        <dl className="bf-kpis">
          <div className="bf-kpi bf-kpi--ltp">
            <dt>Last Price Matched</dt>
            <dd>{odds(d.lastPrice)} <span>({prob(d.lastPrice)})</span></dd>
          </div>
          <div className="bf-kpi">
            <dt>Matched Range</dt>
            <dd>{odds(d.low)} – {odds(d.high)}</dd>
          </div>
          <div className="bf-kpi">
            <dt>Total Matched</dt>
            <dd>{money(d.totalBet)}</dd>
          </div>
        </dl>

        <div className="bf-wom" aria-label={`Weight of money: Back ${backShare.toFixed(0)}%, Lay ${layShare.toFixed(0)}%`}>
          <div className="bf-wom__labels">
            <span className="bf-wom__back-label">Back {backShare.toFixed(0)}% · {money(d.totalBack)}</span>
            <span className="bf-wom__lay-label">Lay {layShare.toFixed(0)}% · {money(d.totalLay)}</span>
          </div>
          <div className="bf-wom__track" aria-hidden="true">
            <span className="bf-wom__back-fill" style={{ width: `${Math.max(0, Math.min(100, backShare))}%` }} />
            <span className="bf-wom__lay-fill" style={{ width: `${Math.max(0, Math.min(100, layShare))}%` }} />
          </div>
        </div>

        <div className="bf-toolbar">
          <div className="selection-volume__switch" role="group" aria-label={`${d.name} graph view`}>
            {viewButtons.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
            ))}
          </div>
          {view === 'betfair' && (
            <div className="bf-toolbar__options" role="group" aria-label={`${d.name} graph display options`}>
              <button
                type="button"
                className="bf-chip"
                aria-pressed={metricMode === 'probability'}
                onClick={() => setMetricMode(mode => mode === 'odds' ? 'probability' : 'odds')}
              >
                {metricMode === 'odds' ? '% Chance' : 'Decimal Odds'}
              </button>
              <button
                type="button"
                className="bf-chip"
                aria-pressed={showMa}
                onClick={() => setShowMa(prev => !prev)}
              >
                Moving Avg
              </button>
            </div>
          )}
        </div>

        {isChartEmpty ? (
          <p className="selection-volume__empty">No recorded Betfair trade history in this period.</p>
        ) : view === 'ladder' ? (
          <div className="selection-volume__scroll bf-ladder-scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} tabIndex={0} role="region" aria-label={`${d.name} Betfair price ladder`}>
            <table className="selection-volume__table">
              <thead><tr><th scope="col">Odds</th><th scope="col">Back Matched</th><th scope="col">Lay Matched</th><th scope="col">Total Traded</th></tr></thead>
              <VirtualPriceRows rows={priceBook} scrollTop={scrollTop} columns={4}>{row => (
                <tr key={row.price}>
                  <th scope="row" className={row.back > 0 && row.lay === 0 ? 'selection-volume__back-cell' : row.lay > 0 && row.back === 0 ? 'selection-volume__lay-cell' : ''}>{odds(row.price)}</th>
                  <td className={row.back > 0 ? 'selection-volume__back-cell' : ''}>{row.back > 0 ? money(row.back) : '—'}</td>
                  <td className={row.lay > 0 ? 'selection-volume__lay-cell' : ''}>{row.lay > 0 ? money(row.lay) : '—'}</td>
                  <td>{money(row.traded)}</td>
                </tr>
              )}</VirtualPriceRows>
            </table>
          </div>
        ) : (
          <figure className="selection-volume__figure">
            <div className="selection-volume__chart selection-volume__chart--betfair">
              <LazyLoadBoundary><Suspense fallback={<div className="skeleton-block" style={{ height: '100%' }} role="status" aria-label="Loading Betfair chart" />}>
                <SelectionVolumeChart
                  view={view}
                  priceBook={chartData}
                  timeSeries={d.timeSeries}
                  isToss={true}
                  metricMode={metricMode}
                  showMa={showMa}
                  lastPrice={d.lastPrice}
                />
              </Suspense></LazyLoadBoundary>
            </div>
            <figcaption className="visually-hidden">
              Betfair graph for {d.name}: last price matched {odds(d.lastPrice)}, range {odds(d.low)} to {odds(d.high)}, total matched {money(d.totalBet)}.
            </figcaption>
          </figure>
        )}

        <p className="selection-volume__note">
          Last price line (amber dashed), Back matched (blue bars), Lay matched (pink bars) · {d.timeFilter === 'all' ? 'All recorded trades' : `Last ${d.timeFilter}`}.
        </p>
      </section>
    )
  }

  return <section className="selection-volume" aria-label={`${d.name} recorded volume`}>
    <header className="selection-volume__header">
      <h3>{d.name}</h3><span className="selection-volume__trend">{d.trend}</span>
    </header>
    <dl className="selection-volume__summary">
      <div><dt>Range:</dt><dd>Low: {odds(d.low)} <span>High: {odds(d.high)}</span></dd></div>
      <div><dt>On this selection:</dt><dd>{money(d.totalBet)}</dd></div>
      <div><dt>Last price matched:</dt><dd>{odds(d.lastPrice)}</dd></div>
      <div className="selection-volume__back"><dt>Total Back:</dt><dd>{money(d.totalBack)}</dd></div>
      <div className="selection-volume__lay"><dt>Total Lay:</dt><dd>{money(d.totalLay)}</dd></div>
    </dl>
    <p className="selection-volume__note">{isSession ? 'Recorded stake volume' : d.liquiditySource === 'live' ? 'To Back / To Lay: current live order-book liquidity' : d.liquiditySource === 'recorded-level' ? 'To Back / To Lay: latest recorded amount at each price (not summed Back/Lay totals)' : 'To Back / To Lay data is unavailable'} · {d.timeFilter === 'all' ? 'All available trades' : `Last ${d.timeFilter} from latest recorded trade`}.</p>
    {d.invalid > 0 && <p className="selection-volume__warning">Partial totals: {d.invalid} invalid trade rows excluded.</p>}
    {d.missingTimes > 0 && <p className="selection-volume__warning">{d.missingTimes} rows have no valid time; excluded from history and timed filters.</p>}
    <div className="selection-volume__toolbar">
      <span>{priceBook.length} price levels</span>
      <div className="selection-volume__switch" aria-label={`${d.name} chart view`}>
        {[['ladder', 'Price ladder'], ['volume', 'Chart'], ['time', 'History']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      </div>
    </div>
    {view !== 'time' && !priceBook.length ? <p className="selection-volume__empty">{priceBookAvailable ? 'No To Back / To Lay liquidity at the moment.' : 'Current To Back / To Lay values are unavailable from the market feed.'}</p> : view === 'time' && !d.timeSeries.length ? <p className="selection-volume__empty">No recorded price history in this period.</p> : view === 'ladder' ?
      <div className="selection-volume__scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} tabIndex={0} role="region" aria-label={`${d.name} price ladder`}>
        <table className="selection-volume__table">
          <thead><tr><th scope="col">{isSession ? 'Run line' : 'Price'}</th><th scope="col">To Back</th><th scope="col">To Lay</th><th scope="col">Traded</th>{isSession && <th scope="col">P/L @ next run</th>}</tr></thead>
          <VirtualPriceRows rows={priceBook} scrollTop={scrollTop} columns={isSession ? 5 : 4}>{row => <tr key={row.price}>
            <th scope="row" className={row.back > 0 && row.lay === 0 ? 'selection-volume__back-cell' : row.lay > 0 && row.back === 0 ? 'selection-volume__lay-cell' : ''}>{odds(row.price)}</th>
            <td className={row.back > 0 ? 'selection-volume__back-cell' : ''}>{row.back > 0 ? money(row.back) : '—'}</td>
            <td className={row.lay > 0 ? 'selection-volume__lay-cell' : ''}>{row.lay > 0 ? money(row.lay) : '—'}</td>
            <td>{money(row.traded)}</td>{isSession && <td>{money(sessionPl(row))}</td>}
          </tr>}</VirtualPriceRows>
        </table>
      </div> : <div className="selection-volume__chart">
        <LazyLoadBoundary><Suspense fallback={<div className="skeleton-block" style={{ height: '100%' }} role="status" aria-label="Loading chart" />}>
          <SelectionVolumeChart view={view} priceBook={priceBook} timeSeries={d.timeSeries} />
        </Suspense></LazyLoadBoundary>
      </div>}
  </section>
}
