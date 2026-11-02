import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const money = value => value == null ? '—' : `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = value => value == null ? '—' : Number(value).toFixed(2)

export default function SelectionVolumeChart({ view, priceBook, timeSeries }) {
  return (
        <ResponsiveContainer width="100%" height="100%">
          {view === 'volume' ? <BarChart data={priceBook} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="price" tickFormatter={odds} tick={{ fontSize: 11 }} minTickGap={20} /><YAxis width={58} tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip formatter={money} labelFormatter={v => `Price: ${odds(v)}`} contentStyle={{ background: '#fff', border: '1px solid #d9deec', borderRadius: 8 }} />
            <Legend verticalAlign="top" height={30} />
            <Bar dataKey="back" name="To Back" fill="#38bdf8" radius={[4, 4, 0, 0]} /><Bar dataKey="lay" name="To Lay" fill="#fb7185" radius={[4, 4, 0, 0]} />
          </BarChart> : <LineChart data={timeSeries} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={30} /><YAxis domain={['auto', 'auto']} width={58} tick={{ fontSize: 10 }} />
            <Tooltip formatter={odds} contentStyle={{ background: '#fff', border: '1px solid #d9deec', borderRadius: 8 }} /><Line dataKey="price" name="Price" stroke="#2563eb" dot={false} strokeWidth={2} />
          </LineChart>}
        </ResponsiveContainer>
  )
}
