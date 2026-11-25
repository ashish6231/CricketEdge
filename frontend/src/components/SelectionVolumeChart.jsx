import {
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

const money = value => value == null ? '—' : `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = value => value == null ? '—' : Number(value).toFixed(2)
const compactEuro = value => {
  const num = Number(value) || 0
  if (num >= 1_000_000) return `€${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `€${(num / 1_000).toFixed(0)}k`
  return `€${num.toFixed(0)}`
}

function BetfairTooltip({ active, payload, metricMode }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  const isProb = metricMode === 'probability'
  return (
    <div className="bf-tooltip">
      <div className="bf-tooltip__time">{point.fullTime || point.time}</div>
      <div className="bf-tooltip__row">
        <span>{isProb ? 'Implied Chance' : 'Matched Odds'}</span>
        <strong>{isProb ? `${point.probability}% (${odds(point.price)})` : `${odds(point.price)} (${point.probability}%)`}</strong>
      </div>
      {point.ma != null && (
        <div className="bf-tooltip__row">
          <span>Moving Avg</span>
          <strong>{isProb ? `${point.maProb}%` : odds(point.ma)}</strong>
        </div>
      )}
      <div className="bf-tooltip__row">
        <span>Matched ({point.side === 'lay' ? 'Lay' : 'Back'})</span>
        <strong className={point.side === 'lay' ? 'bf-tooltip__lay' : 'bf-tooltip__back'}>{money(point.volume)}</strong>
      </div>
    </div>
  )
}

export default function SelectionVolumeChart({
  view,
  priceBook,
  timeSeries,
  isToss = false,
  metricMode = 'odds',
  showMa = true,
  lastPrice = null,
}) {
  const backColor = isToss ? '#72bbef' : '#38bdf8'
  const layColor = isToss ? '#faa9ba' : '#fb7185'

  if (view === 'betfair') {
    const isProb = metricMode === 'probability'
    const priceKey = isProb ? 'probability' : 'price'
    const maKey = isProb ? 'maProb' : 'ma'
    const refValue = isProb && lastPrice > 0 ? Number((100 / lastPrice).toFixed(1)) : lastPrice
    const showDots = timeSeries.length <= 24

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={timeSeries} margin={{ top: 14, right: 10, left: 2, bottom: 6 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={24} />
          <YAxis
            yAxisId="price"
            domain={['auto', 'auto']}
            width={48}
            tick={{ fontSize: 10, fill: '#1e293b' }}
            tickFormatter={v => (isProb ? `${Math.round(v)}%` : odds(v))}
          />
          <YAxis
            yAxisId="vol"
            orientation="right"
            domain={[0, max => Math.max(10, max * 3.1)]}
            width={46}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            tickFormatter={compactEuro}
          />
          <Tooltip content={<BetfairTooltip metricMode={metricMode} />} />
          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '11px' }} />
          {refValue != null && (
            <ReferenceLine
              yAxisId="price"
              y={refValue}
              stroke="#ffb80c"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          )}
          <Bar yAxisId="vol" dataKey="backVol" stackId="vol" name="Back Vol" fill={backColor} minPointSize={3} radius={[2, 2, 0, 0]} />
          <Bar yAxisId="vol" dataKey="layVol" stackId="vol" name="Lay Vol" fill={layColor} minPointSize={3} radius={[2, 2, 0, 0]} />
          {showMa && (
            <Line
              yAxisId="price"
              type="monotone"
              dataKey={maKey}
              name="Moving Avg"
              stroke="#d97706"
              strokeWidth={1.6}
              strokeDasharray="4 3"
              dot={false}
            />
          )}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey={priceKey}
            name={isProb ? 'Chance %' : 'Matched Odds'}
            stroke="#1e3a8a"
            strokeWidth={2.4}
            dot={showDots ? { r: 3.5, fill: '#ffb80c', stroke: '#1e3a8a', strokeWidth: 1.5 } : false}
            activeDot={{ r: 5, fill: '#ffb80c', stroke: '#1e3a8a', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {view === 'volume' ? (
        <BarChart data={priceBook} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="price" tickFormatter={odds} tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis width={58} tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <Tooltip formatter={money} labelFormatter={v => `Price: ${odds(v)}`} contentStyle={{ background: '#fff', border: '1px solid #d9deec', borderRadius: 8 }} />
          <Legend verticalAlign="top" height={30} />
          <Bar dataKey="back" name={isToss ? 'Back Matched' : 'To Back'} fill={backColor} radius={[4, 4, 0, 0]} />
          <Bar dataKey="lay" name={isToss ? 'Lay Matched' : 'To Lay'} fill={layColor} radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={timeSeries} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={30} />
          <YAxis domain={['auto', 'auto']} width={58} tick={{ fontSize: 10 }} />
          <Tooltip formatter={odds} contentStyle={{ background: '#fff', border: '1px solid #d9deec', borderRadius: 8 }} />
          <Line dataKey="price" name="Price" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
