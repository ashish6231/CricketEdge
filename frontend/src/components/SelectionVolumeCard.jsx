import { useState, lazy, Suspense } from 'react'
import VirtualPriceRows from './VirtualPriceRows'
import LazyLoadBoundary from './LazyLoadBoundary'
const SelectionVolumeChart = lazy(() => import('./SelectionVolumeChart'))
import './SelectionVolumeCard.css'

const money = value => value == null ? '—' : `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = value => value == null ? '—' : value.toFixed(2)

export default function SelectionVolumeCard({ teamData, isToss = false, isSession = false, marketVol = null }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [view, setView] = useState(() => (isSession ? 'ladder' : 'volume'))
  const [metricMode, setMetricMode] = useState('odds')
  if (!teamData) return null
  const d = teamData
  const priceBook = isSession || isToss ? d.orderBook : d.liquidityBook
  const priceBookAvailable = isSession || isToss ? d.available : d.liquidityAvailable
  const sessionPl = row => d.orderBook.reduce((sum, line) => sum + (Math.ceil(row.price) > line.price ? line.lay - line.back : line.back - line.lay), 0)
  const chartData = view === 'volume' && isToss ? d.orderBook : priceBook
  const isChartEmpty = view === 'betfair' || view === 'time' ? !d.timeSeries.length : !chartData.length
  const peakRow = d.orderBook.reduce((best, row) => (!best || row.traded > best.traded ? row : best), null)

  if (!isSession) {
    const viewButtons = [
      ['volume', 'Odds & Volume'],
      ['betfair', 'Price & Volume'],
      ['ladder', 'Price Ladder', 'bf-tab-ladder'],
    ]

    const renderLadder = () => !priceBook.length ? (
      <p className="selection-volume__empty">
        {priceBookAvailable
          ? 'No To Back / To Lay liquidity at the moment.'
          : 'Current To Back / To Lay values are unavailable from the market feed.'}
      </p>
    ) : (
      <div className="bf-ladder-scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} tabIndex={0} role="region" aria-label={`${d.name} price, exchange available and traded`}>
        <table className="bf-ladder-table">
          <thead>
            <tr>
              <th scope="col">Price</th>
              <th scope="col">{isToss ? 'Back Matched' : 'To Back'}</th>
              <th scope="col">{isToss ? 'Lay Matched' : 'To Lay'}</th>
              <th scope="col">Traded</th>
            </tr>
          </thead>
          <VirtualPriceRows rows={priceBook} scrollTop={scrollTop} columns={4} rowHeight={28} viewport={390}>{row => {
            const hasBack = row.back > 0
            const hasLay = row.lay > 0
            const priceCls = hasBack && !hasLay ? 'bf-cell-back' : hasLay && !hasBack ? 'bf-cell-lay' : ''
            return (
              <tr key={row.price}>
                <th scope="row" className={priceCls}>{odds(row.price)}</th>
                <td className={hasBack ? 'bf-cell-back' : ''}>{hasBack ? money(row.back) : ''}</td>
                <td className={hasLay ? 'bf-cell-lay' : ''}>{hasLay ? money(row.lay) : ''}</td>
                <td className="bf-cell-traded">{money(row.traded)}</td>
              </tr>
            )
          }}</VirtualPriceRows>
        </table>
      </div>
    )

    return (
      <section className="selection-volume selection-volume--bf-split" aria-label={`${d.name} Betfair market graph`}>
        <div className={`bf-split-left${view === 'ladder' ? ' is-hidden-mobile' : ''}`}>
          <div className="bf-sel-bar">
            <h3>{d.name}</h3>
            {peakRow && (
              <span className="bf-peak-tag" title="Highest traded volume odd">
                Peak {odds(peakRow.price)} · {money(peakRow.traded)}
              </span>
            )}
          </div>

          <div className="bf-matched-strip">
            <span>Matched</span>
            <span>Low: <strong>{odds(d.low)}</strong> &nbsp;High: <strong>{odds(d.high)}</strong></span>
          </div>

          <dl className="bf-kv-list">
            {marketVol != null && marketVol > 0 && (
              <div><dt>On this market:</dt><dd>{money(marketVol)}</dd></div>
            )}
            <div><dt>On this selection:</dt><dd>{money(d.totalBet)}</dd></div>
            <div><dt>Last price matched:</dt><dd>{odds(d.lastPrice)}</dd></div>
            <div>
              <dt>Back / Lay matched:</dt>
              <dd><span className="bf-txt-back">{money(d.totalBack)}</span> / <span className="bf-txt-lay">{money(d.totalLay)}</span></dd>
            </div>
          </dl>

          <h4 className="bf-chart-title">
            {view === 'volume' ? 'Odds & Volume' : 'Price/Volume over time'}
          </h4>

          {isChartEmpty ? (
            <p className="selection-volume__empty">
              {view === 'betfair'
                ? 'No timed price & volume history available for this period.'
                : priceBookAvailable
                  ? 'No To Back / To Lay liquidity at the moment.'
                  : 'Current To Back / To Lay values are unavailable from the market feed.'}
            </p>
          ) : (
            <figure className="selection-volume__figure">
              <div className="bf-chart-frame">
                <LazyLoadBoundary><Suspense fallback={<div className="skeleton-block" style={{ height: '100%' }} role="status" aria-label="Loading chart" />}>
                  <SelectionVolumeChart
                    view={view === 'ladder' ? 'volume' : view}
                    priceBook={chartData}
                    timeSeries={d.timeSeries}
                    isToss={isToss}
                    metricMode={metricMode}
                  />
                </Suspense></LazyLoadBoundary>
              </div>
              <figcaption className="visually-hidden">
                Betfair market graph for {d.name}: last price matched {odds(d.lastPrice)}, range {odds(d.low)} to {odds(d.high)}, total matched {money(d.totalBet)}.
              </figcaption>
            </figure>
          )}

          <div className="bf-bottom-controls">
            <div className="bf-pill-switch" role="group" aria-label={`${d.name} graph view`}>
              {viewButtons.map(([key, label, extraCls]) => (
                <button
                  key={key}
                  type="button"
                  className={extraCls || ''}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === 'betfair' && (
              <div className="bf-pill-switch bf-pill-switch--sub" role="group" aria-label={`${d.name} price scale`}>
                <button type="button" aria-pressed={metricMode === 'odds'} onClick={() => setMetricMode('odds')}>Price</button>
                <button type="button" aria-pressed={metricMode === 'probability'} onClick={() => setMetricMode('probability')}>% Chance</button>
              </div>
            )}
          </div>

          {d.invalid > 0 && <p className="selection-volume__warning">Partial totals: {d.invalid} invalid trade rows excluded.</p>}
          {d.missingTimes > 0 && <p className="selection-volume__warning">{d.missingTimes} rows have no valid time; excluded from history and timed filters.</p>}
        </div>

        <div className={`bf-split-right${view === 'ladder' ? ' is-active-mobile' : ''}`}>
          <div className="bf-right-head">
            <span>Price, Exchange Available and Traded</span>
            <button type="button" className="bf-mobile-back" onClick={() => setView('volume')}>
              ← Odds &amp; Volume
            </button>
          </div>
          {renderLadder()}
        </div>

        <p className="bf-footnote">
          {view === 'betfair'
            ? 'Crimson step-line shows matched price/chance; grey spikes show traded volume.'
            : 'Blue highlights Back matched/available; pink highlights Lay matched/available.'} · {d.timeFilter === 'all' ? 'All recorded trades' : `Last ${d.timeFilter}`}.
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
    <p className="selection-volume__note">Recorded stake volume · {d.timeFilter === 'all' ? 'All available trades' : `Last ${d.timeFilter} from latest recorded trade`}.</p>
    {d.invalid > 0 && <p className="selection-volume__warning">Partial totals: {d.invalid} invalid trade rows excluded.</p>}
    {d.missingTimes > 0 && <p className="selection-volume__warning">{d.missingTimes} rows have no valid time; excluded from history and timed filters.</p>}
    <div className="selection-volume__toolbar">
      <span>{priceBook.length} price levels</span>
      <div className="selection-volume__switch" aria-label={`${d.name} chart view`}>
        {[['ladder', 'Price ladder'], ['volume', 'Chart'], ['time', 'History']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      </div>
    </div>
    {view !== 'time' && !priceBook.length ? <p className="selection-volume__empty">No To Back / To Lay liquidity at the moment.</p> : view === 'time' && !d.timeSeries.length ? <p className="selection-volume__empty">No recorded price history in this period.</p> : view === 'ladder' ?
      <div className="selection-volume__scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)} tabIndex={0} role="region" aria-label={`${d.name} price ladder`}>
        <table className="selection-volume__table">
          <thead><tr><th scope="col">Run line</th><th scope="col">To Back</th><th scope="col">To Lay</th><th scope="col">Traded</th><th scope="col">P/L @ next run</th></tr></thead>
          <VirtualPriceRows rows={priceBook} scrollTop={scrollTop} columns={5} rowHeight={34} viewport={300}>{row => <tr key={row.price}>
            <th scope="row" className={row.back > 0 && row.lay === 0 ? 'selection-volume__back-cell' : row.lay > 0 && row.back === 0 ? 'selection-volume__lay-cell' : ''}>{odds(row.price)}</th>
            <td className={row.back > 0 ? 'selection-volume__back-cell' : ''}>{row.back > 0 ? money(row.back) : '—'}</td>
            <td className={row.lay > 0 ? 'selection-volume__lay-cell' : ''}>{row.lay > 0 ? money(row.lay) : '—'}</td>
            <td>{money(row.traded)}</td><td>{money(sessionPl(row))}</td>
          </tr>}</VirtualPriceRows>
        </table>
      </div> : <div className="selection-volume__chart">
        <LazyLoadBoundary><Suspense fallback={<div className="skeleton-block" style={{ height: '100%' }} role="status" aria-label="Loading chart" />}>
          <SelectionVolumeChart view={view} priceBook={priceBook} timeSeries={d.timeSeries} />
        </Suspense></LazyLoadBoundary>
      </div>}
  </section>
}
