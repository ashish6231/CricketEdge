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
  ResponsiveContainer,
} from 'recharts'

const money = value => value == null ? '—' : `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = value => value == null ? '—' : Number(value).toFixed(2)
const compactNum = value => {
  const num = Number(value) || 0
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}k`
  return `${num.toFixed(0)}`
}

function BetfairChartTooltip({ active, payload, metricMode }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  const isProb = metricMode === 'probability'
  return (
    <div className="bf-tooltip">
      <div className="bf-tooltip__time">{point.fullTime || point.time}</div>
      <div className="bf-tooltip__row">
        <span>{isProb ? '% Chance' : 'Price'}</span>
        <strong>{isProb ? `${point.probability}% (${odds(point.price)})` : `${odds(point.price)} (${point.probability}%)`}</strong>
      </div>
      <div className="bf-tooltip__row">
        <span>Volume ({point.side === 'lay' ? 'Lay' : 'Back'})</span>
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
}) {
  if (view === 'betfair') {
    const isProb = metricMode === 'probability'
    const priceKey = isProb ? 'probability' : 'price'
    const showDots = timeSeries.length <= 12

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={timeSeries} margin={{ top: 8, right: 6, left: 2, bottom: 2 }}>
          <CartesianGrid stroke="#e2e8f0" horizontal={true} vertical={false} />
          <XAxis
            dataKey="time"
            tick={false}
            axisLine={{ stroke: '#94a3b8' }}
            tickLine={false}
            height={6}
          />
          <YAxis
            yAxisId="price"
            domain={['auto', 'auto']}
            width={48}
            axisLine={{ stroke: '#94a3b8' }}
            tickLine={{ stroke: '#94a3b8' }}
            tick={{ fontSize: 10, fill: '#c8102e', fontWeight: 600 }}
            tickFormatter={v => (isProb ? `${Math.round(v)}%` : odds(v))}
            label={{
              value: isProb ? '% Chance' : 'Price',
              angle: -90,
              position: 'insideLeft',
              offset: 6,
              fill: '#c8102e',
              fontSize: 10,
              fontWeight: 700,
            }}
          />
          <YAxis
            yAxisId="vol"
            orientation="right"
            domain={[0, max => Math.max(10, max * 2.8)]}
            width={44}
            axisLine={{ stroke: '#94a3b8' }}
            tickLine={{ stroke: '#94a3b8' }}
            tick={{ fontSize: 9.5, fill: '#1f2937', fontWeight: 600 }}
            tickFormatter={compactNum}
            label={{
              value: 'Volume',
              angle: 90,
              position: 'insideRight',
              offset: 6,
              fill: '#1f2937',
              fontSize: 10,
              fontWeight: 700,
            }}
          />
          <Tooltip content={<BetfairChartTooltip metricMode={metricMode} />} />
          <Bar
            yAxisId="vol"
            dataKey="volume"
            name="Volume"
            fill="#8c8c8c"
            barSize={timeSeries.length > 35 ? 2 : 5}
            minPointSize={2}
          />
          <Line
            yAxisId="price"
            type="stepAfter"
            dataKey={priceKey}
            name={isProb ? '% Chance' : 'Price'}
            stroke="#c8102e"
            strokeWidth={1.6}
            dot={showDots ? { r: 2, fill: '#c8102e' } : false}
            activeDot={{ r: 4, fill: '#c8102e', stroke: '#ffffff', strokeWidth: 1.5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {view === 'volume' ? (
        <BarChart data={priceBook} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="price"
            tickFormatter={odds}
            tick={{ fontSize: 10, fill: '#334155' }}
            axisLine={{ stroke: '#94a3b8' }}
            minTickGap={16}
          />
          <YAxis
            width={48}
            tick={{ fontSize: 10, fill: '#334155' }}
            axisLine={{ stroke: '#94a3b8' }}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />
          <Tooltip
            formatter={money}
            labelFormatter={v => `Odds: ${odds(v)}`}
            contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11 }}
          />
          <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: '10px' }} />
          <Bar dataKey="back" name={isToss ? 'Back Matched' : 'To Back'} fill="#8dd0fa" stroke="#5bb6f5" strokeWidth={0.6} radius={[1, 1, 0, 0]} maxBarSize={24} />
          <Bar dataKey="lay" name={isToss ? 'Lay Matched' : 'To Lay'} fill="#f6c2c9" stroke="#ea9aa5" strokeWidth={0.6} radius={[1, 1, 0, 0]} maxBarSize={24} />
        </BarChart>
      ) : (
        <LineChart data={timeSeries} margin={{ top: 10, right: 6, left: 0, bottom: 6 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={30} />
          <YAxis domain={['auto', 'auto']} width={48} tick={{ fontSize: 10 }} />
          <Tooltip formatter={odds} contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 11 }} />
          <Line type="stepAfter" dataKey="price" name="Price" stroke="#c8102e" dot={false} strokeWidth={1.6} />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
