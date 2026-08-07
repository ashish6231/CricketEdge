import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, BarChart3, Zap, Info } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts'
import { buildAllSessions, fmtRs, formatVolStr } from '../utils/sessionMetrics'

function RangeBar({ bestYes, bestNo, predicted }) {
  if (bestYes == null || bestNo == null) return null
  const span = bestNo - bestYes || 1
  const pct = Math.min(100, Math.max(0, ((predicted - bestYes) / span) * 100))
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-[#8e8e93] mb-1 font-semibold">
        <span className="text-[#3b82f6]">Yes {bestYes}</span>
        <span className="text-white">~{predicted}</span>
        <span className="text-[#ef4444]">No {bestNo}</span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#2c2c2e' }}>
        <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#a855f7)' }} />
        <div className="absolute inset-y-0 right-0 rounded-r-full" style={{ width: `${100 - pct}%`, background: 'linear-gradient(90deg,#a855f7,#ef4444)' }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white" style={{ left: `calc(${pct}% - 5px)`, background: '#f59e0b' }} />
      </div>
    </div>
  )
}

function PlHoverPreview({ run, overLabel }) {
  if (!run) return null
  const profit = run.pl >= 0
  return (
    <div
      className="mb-2 rounded-lg px-3 py-2.5 border text-center animate-in fade-in duration-150"
      style={{
        background: profit ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        borderColor: profit ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
      }}
    >
      <div className="text-[11px] text-[#8e8e93]">
        Agar <span className="text-white font-bold">{run.score} runs</span> par settle ho ({overLabel})
      </div>
      <div className={`text-base font-black mt-0.5 ${profit ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
        Bookie {profit ? 'Profit' : 'Loss'}: {fmtRs(run.pl)}
      </div>
    </div>
  )
}

function CustomPlTooltip({ active, payload, label, overLabel }) {
  if (!active || !payload?.length) return null
  const pl = payload[0]?.value ?? 0
  const profit = pl >= 0
  return (
    <div
      className="rounded-xl px-3 py-2 border shadow-lg text-xs"
      style={{ background: '#111', borderColor: '#2c2c2e' }}
    >
      <div className="font-bold text-white mb-1">{overLabel}: {label} runs</div>
      <div className={`font-black text-sm ${profit ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
        {profit ? 'Profit' : 'Loss'} — {fmtRs(pl)}
      </div>
    </div>
  )
}

function OverSummaryChart({ sessions }) {
  const overSessions = sessions.filter(s => !s.isRunsLine && s.over > 0)
  if (overSessions.length < 2) return null

  const data = overSessions.map(s => ({
    over: `${s.over} Ov`,
    overNum: s.over,
    predicted: s.predicted,
    sweetSpot: s.bestPlRow?.score ?? null,
    sweetPl: s.bestPlRow?.pl ?? null,
  }))

  return (
    <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
      <div className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wide mb-2 flex items-center gap-1">
        <BarChart3 size={11} className="text-[#f59e0b]" /> Over-wise Predicted Runs
      </div>
      <div className="h-[130px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
            <XAxis dataKey="over" stroke="#8e8e93" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#8e8e93" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#111', border: '1px solid #2c2c2e', borderRadius: 12, fontSize: 12 }}
              formatter={(v, name) => [v, name === 'predicted' ? 'Predicted' : 'Sweet Spot']}
              labelFormatter={l => l}
            />
            <Bar dataKey="predicted" fill="#f59e0b" radius={[3, 3, 0, 0]} name="predicted" />
            <Bar dataKey="sweetSpot" fill="#22c55e" radius={[3, 3, 0, 0]} name="sweetSpot" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SessionCard({ session }) {
  const {
    label, bestYes, bestNo, predicted, gap, liquidity,
    plRows, plRowsFull, bestPlRow, volumeChart, lines, totalVol,
    hasTrades, over, isRunsLine,
  } = session
  const [showOrderBook, setShowOrderBook] = useState(false)
  const [hoveredRun, setHoveredRun] = useState(null)

  const overLabel = isRunsLine ? 'Runs Line' : `${over} Overs`

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
      {/* Header — over wise */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-[#2c2c2e]" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.06),transparent)' }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-base shrink-0"
          style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.25),rgba(220,38,38,0.12))', border: '1px solid rgba(245,158,11,0.3)' }}>
          {isRunsLine ? 'R' : over}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-sm">{overLabel}</div>
          <div className="text-[10px] text-[#8e8e93] truncate">{session.marketName}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-black text-[#f59e0b] leading-none">~{predicted ?? '—'}</div>
          <div className="text-[9px] text-[#8e8e93]">predicted runs</div>
        </div>
        {gap != null && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${liquidity.textClass}`}
            style={{ background: liquidity.bg, border: `1px solid ${liquidity.border}` }}>
            {liquidity.emoji} {gap.toFixed(0)}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg p-2 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
            <div className="text-[9px] text-[#8e8e93]">Best Yes</div>
            <div className="text-sm font-black text-[#3b82f6]">{bestYes ?? '—'}</div>
          </div>
          <div className="rounded-lg p-2 text-center border border-[#2c2c2e]" style={{ background: 'rgba(245,158,11,0.06)' }}>
            <div className="text-[9px] text-[#8e8e93]">Predicted</div>
            <div className="text-sm font-black text-[#f59e0b]">{predicted ?? '—'}</div>
          </div>
          <div className="rounded-lg p-2 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
            <div className="text-[9px] text-[#8e8e93]">Best No</div>
            <div className="text-sm font-black text-[#ef4444]">{bestNo ?? '—'}</div>
          </div>
        </div>

        <RangeBar bestYes={bestYes} bestNo={bestNo} predicted={predicted} />

        {/* Bookie Sweet Spot — per over, scoped range, only if trades exist for THIS market */}
        {hasTrades && plRowsFull.length > 0 && bestPlRow ? (
          <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wide flex items-center gap-1">
                <Zap size={11} className="text-[#f59e0b]" />
                {overLabel} — Bookie Sweet Spot
              </span>
              <span className="text-[10px] font-bold text-[#22c55e]">
                Best: {bestPlRow.score} runs → {fmtRs(bestPlRow.pl)}
              </span>
            </div>

            {/* Chart — focused window */}
            {plRows.length > 0 && (
              <div className="h-[100px] w-full mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={plRows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                    <XAxis dataKey="score" stroke="#8e8e93" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis stroke="#8e8e93" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => formatVolStr(v)} width={36} />
                    <Tooltip
                      cursor={{ fill: '#2c2c2e', opacity: 0.4 }}
                      content={<CustomPlTooltip overLabel={overLabel} />}
                    />
                    <ReferenceLine y={0} stroke="#3a3a3c" />
                    {predicted != null && <ReferenceLine x={predicted} stroke="#f59e0b" strokeDasharray="4 4" />}
                    <Bar dataKey="pl" radius={[2, 2, 0, 0]}>
                      {plRows.map(r => (
                        <Cell
                          key={r.score}
                          fill={r.score === bestPlRow.score ? '#22c55e' : r.pl >= 0 ? '#16a34a' : '#ef4444'}
                          fillOpacity={r.score === bestPlRow.score ? 1 : 0.65}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Saari runs — P/L table (hover = profit/loss detail) */}
            <PlHoverPreview run={hoveredRun} overLabel={overLabel} />
            <div className="rounded-lg overflow-hidden border border-[#2c2c2e]">
              <div className="grid grid-cols-3 text-[10px] text-[#8e8e93] font-bold px-3 py-2 border-b border-[#2c2c2e] sticky top-0" style={{ background: '#111' }}>
                <span>Runs</span>
                <span className="text-right">Bookie P/L</span>
                <span className="text-right">Status</span>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {plRowsFull.map(r => {
                  const isBest = r.score === bestPlRow.score
                  const isPredicted = predicted != null && r.score === Math.round(predicted)
                  const isHovered = hoveredRun?.score === r.score
                  const profit = r.pl >= 0
                  return (
                    <div
                      key={r.score}
                      role="row"
                      tabIndex={0}
                      title={`${r.score} runs → Bookie ${profit ? 'Profit' : 'Loss'}: ${fmtRs(r.pl)}`}
                      onMouseEnter={() => setHoveredRun(r)}
                      onMouseLeave={() => setHoveredRun(prev => (prev?.score === r.score ? null : prev))}
                      onFocus={() => setHoveredRun(r)}
                      onBlur={() => setHoveredRun(prev => (prev?.score === r.score ? null : prev))}
                      className={`grid grid-cols-3 text-[11px] px-3 py-1.5 border-b border-[#2c2c2e]/30 cursor-pointer transition-colors ${
                        isHovered ? 'bg-[#2c2c2e]/60' : isBest ? 'bg-[#22c55e]/10' : isPredicted ? 'bg-[#f59e0b]/5' : 'hover:bg-[#1a1a1a]/80'
                      }`}
                    >
                      <span className={`font-bold ${isBest ? 'text-[#22c55e]' : isPredicted ? 'text-[#f59e0b]' : 'text-white'}`}>
                        {r.score}
                        {isBest && ' ★'}
                        {isPredicted && !isBest && ' ~'}
                      </span>
                      <span className={`text-right font-bold ${r.pl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {fmtRs(r.pl)}
                      </span>
                      <span className={`text-right text-[10px] font-semibold ${r.pl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {r.pl >= 0 ? 'PROFIT' : 'LOSS'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="text-[9px] text-[#636366] text-center mt-1.5">
              {plRowsFull.length} runs • hover karo — profit/loss detail dikhega
            </div>
          </div>
        ) : (
          <div className="rounded-lg px-3 py-2 text-[10px] text-[#8e8e93] text-center border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
            {overLabel}: abhi trade data nahi — sirf odds dikha rahe hain
          </div>
        )}

        {hasTrades && volumeChart.length > 0 && (
          <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
            <div className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wide mb-2">
              {overLabel} — Volume by Price ({formatVolStr(totalVol)})
            </div>
            <div className="h-[100px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                  <XAxis dataKey="price" stroke="#8e8e93" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8e8e93" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => formatVolStr(v)} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#111', border: '1px solid #2c2c2e', borderRadius: 12, fontSize: 11 }}
                    formatter={(v, name) => [formatVolStr(v), name === 'yes' ? 'Yes' : 'No']}
                    labelFormatter={p => `${overLabel}: ${p} runs`}
                  />
                  <Bar dataKey="yes" stackId="v" fill="#3b82f6" />
                  <Bar dataKey="no" stackId="v" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {hasTrades && lines.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOrderBook(v => !v)}
              className="w-full flex items-center justify-between text-[10px] font-bold text-[#8e8e93] uppercase tracking-wide py-1"
            >
              <span>{overLabel} — Order Book ({lines.length} lines)</span>
              {showOrderBook ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showOrderBook && (
              <div className="rounded-xl overflow-hidden border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
                <div className="grid grid-cols-3 text-[10px] text-[#8e8e93] font-bold px-3 py-2 border-b border-[#2c2c2e]" style={{ background: '#111' }}>
                  <span>Price</span>
                  <span className="text-center text-[#3b82f6]">Yes</span>
                  <span className="text-right text-[#ef4444]">No</span>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {lines.map(l => (
                    <div key={l.price} className="grid grid-cols-3 text-[11px] px-3 py-1.5 border-b border-[#2c2c2e]/40">
                      <span className="font-bold text-white">{l.price}</span>
                      <span className="text-center text-[#3b82f6]">{l.yes > 0 ? formatVolStr(l.yes) : '—'}</span>
                      <span className="text-right text-[#ef4444]">{l.no > 0 ? formatVolStr(l.no) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function mergeOddsAndTrades(odds, trades) {
  const names = new Set()
  odds?.forEach(o => o.marketName && names.add(o.marketName))
  trades?.forEach(t => t.team && names.add(t.team))
  const oddsMap = Object.fromEntries((odds || []).map(o => [o.marketName, o]))
  return [...names].map(name => oddsMap[name] || { marketName: name, bestYes: null, bestNo: null })
}

/** Premium session panel — MatchDetail Session tab */
export default function SessionPanel({ odds = [], trades = [] }) {
  const [activeInning, setActiveInning] = useState(1)
  const [showLegend, setShowLegend] = useState(false)

  const mergedOdds = useMemo(() => mergeOddsAndTrades(odds, trades), [odds, trades])
  const sessions = useMemo(() => buildAllSessions(mergedOdds, trades), [mergedOdds, trades])
  const innings = useMemo(() => [...new Set(sessions.map(s => s.inning))].sort(), [sessions])

  const filtered = useMemo(() => {
    if (innings.length <= 1) return sessions
    return sessions.filter(s => s.inning === activeInning)
  }, [sessions, activeInning, innings.length])

  if (!sessions.length) {
    return (
      <div className="flex h-[40vh] items-center justify-center rounded-2xl" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
        <p className="text-[#8e8e93] text-sm">No session data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 fade-in">
      <OverSummaryChart sessions={filtered} />

      {innings.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
          {innings.map(inn => (
            <button key={inn} type="button" onClick={() => setActiveInning(inn)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold ${activeInning === inn ? 'text-white' : 'text-[#8e8e93]'}`}
              style={activeInning === inn ? { background: 'linear-gradient(135deg,#b45309,#f59e0b)' } : {}}>
              {inn === 1 ? '1st' : `${inn}${inn === 2 ? 'nd' : 'rd'}`} Innings
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(item => (
          <SessionCard key={item.marketName} session={item} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-[#8e8e93] text-sm">Is innings mein koi session market nahi</div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
        <button type="button" onClick={() => setShowLegend(v => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 text-sm font-bold text-white hover:bg-[#1a1a1a]">
          <Info size={15} className="text-[#f59e0b]" /> Kaise padhein?
          {showLegend ? <ChevronUp size={15} className="ml-auto text-[#8e8e93]" /> : <ChevronDown size={15} className="ml-auto text-[#8e8e93]" />}
        </button>
        {showLegend && (
          <div className="px-4 pb-4 border-t border-[#2c2c2e] pt-3 text-xs text-[#8e8e93] space-y-1">
            <p>Har <span className="text-[#f59e0b] font-bold">Over Line</span> ka apna alag sweet spot — 6 Ov ≠ 20 Ov</p>
            <p>Chart sirf us over ke trade range mein dikhta hai, poori innings nahi</p>
          </div>
        )}
      </div>
    </div>
  )
}
