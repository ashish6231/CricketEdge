import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './SelectionVolumeCard.css'

const money = value => value == null ? '—' : `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = value => value == null ? '—' : value.toFixed(2)

export default function SelectionVolumeCard({ teamData, isSession = false }) {
  const [view, setView] = useState('ladder')
  if (!teamData) return null
  const d = teamData
  const priceBook = isSession ? d.orderBook : d.liquidityBook
  const priceBookAvailable = isSession ? d.available : d.liquidityAvailable
  const sessionPl = row => d.orderBook.reduce((sum, line) => sum + (Math.ceil(row.price) > line.price ? line.lay - line.back : line.back - line.lay), 0)
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
      <div className="selection-volume__scroll" tabIndex={0} role="region" aria-label={`${d.name} price ladder`}>
        <table className="selection-volume__table">
          <thead><tr><th scope="col">{isSession ? 'Run line' : 'Price'}</th><th scope="col">To Back</th><th scope="col">To Lay</th><th scope="col">Traded</th>{isSession && <th scope="col">P/L @ next run</th>}</tr></thead>
          <tbody>{priceBook.map(row => <tr key={row.price}>
            <th scope="row" className={row.back > 0 && row.lay === 0 ? 'selection-volume__back-cell' : row.lay > 0 && row.back === 0 ? 'selection-volume__lay-cell' : ''}>{odds(row.price)}</th>
            <td className={row.back > 0 ? 'selection-volume__back-cell' : ''}>{row.back > 0 ? money(row.back) : '—'}</td>
            <td className={row.lay > 0 ? 'selection-volume__lay-cell' : ''}>{row.lay > 0 ? money(row.lay) : '—'}</td>
            <td>{money(row.traded)}</td>{isSession && <td>{money(sessionPl(row))}</td>}
          </tr>)}</tbody>
        </table>
      </div> : <div className="selection-volume__chart">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'volume' ? <BarChart data={priceBook} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="price" tickFormatter={odds} tick={{ fontSize: 11 }} minTickGap={20} /><YAxis width={58} tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip formatter={money} labelFormatter={v => `Price: ${odds(v)}`} contentStyle={{ background: '#fff', border: '1px solid #d9deec', borderRadius: 8 }} />
            <Legend verticalAlign="top" height={30} />
            <Bar dataKey="back" name="To Back" fill="#38bdf8" radius={[4, 4, 0, 0]} /><Bar dataKey="lay" name="To Lay" fill="#fb7185" radius={[4, 4, 0, 0]} />
          </BarChart> : <LineChart data={d.timeSeries} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={30} /><YAxis domain={['auto', 'auto']} width={58} tick={{ fontSize: 10 }} />
            <Tooltip formatter={odds} contentStyle={{ background: '#fff', border: '1px solid #d9deec', borderRadius: 8 }} /><Line dataKey="price" name="Price" stroke="#2563eb" dot={false} strokeWidth={2} />
          </LineChart>}
        </ResponsiveContainer>
      </div>}
  </section>
}
