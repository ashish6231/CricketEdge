import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import {
  ArrowLeft, LoaderCircle, ChevronDown, ChevronUp,
  BarChart3, TrendingUp, Activity, Zap, Info,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts'
import { getSessionTrades } from '../api'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { buildAllSessions, fmtRs, formatVolStr, sessionDataFingerprint } from '../utils/sessionMetrics'
import SessionPickBanner from '../components/SessionPickBanner'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

function RangeBar({ bestYes, bestNo, predicted }) {
  if (bestYes == null || bestNo == null) return null
  const span = bestNo - bestYes || 1
  const pct = Math.min(100, Math.max(0, ((predicted - bestYes) / span) * 100))

  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-[#8e8e93] mb-1.5 font-semibold">
        <span className="text-[#3b82f6]">Yes {bestYes}</span>
        <span className="text-white">~{predicted}</span>
        <span className="text-[#ef4444]">No {bestNo}</span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: '#2c2c2e' }}>
        <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#a855f7)' }} />
        <div className="absolute inset-y-0 right-0 rounded-r-full" style={{ width: `${100 - pct}%`, background: 'linear-gradient(90deg,#a855f7,#ef4444)' }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg"
          style={{ left: `calc(${pct}% - 6px)`, background: '#f59e0b' }}
        />
      </div>
      <div className="text-center text-[10px] text-[#636366] mt-1">Market range {bestYes} – {bestNo} runs</div>
    </div>
  )
}

function PlHoverPreviewSlot({ run, overLabel }) {
  return (
    <div className="mb-2 h-[68px] flex items-stretch">
      {run ? (
        <div
          className="w-full rounded-lg px-3 py-2 border flex flex-col justify-center"
          style={{
            background: run.pl >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            borderColor: run.pl >= 0 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
          }}
        >
          <div className="text-[11px] text-[#8e8e93]">
            Agar <span className="text-white font-bold">{run.score} runs</span> par settle ho ({overLabel})
          </div>
          <div className={`text-base font-black mt-0.5 ${run.pl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
            Bookie {run.pl >= 0 ? 'Profit' : 'Loss'}: {fmtRs(run.pl)}
          </div>
        </div>
      ) : (
        <div className="w-full rounded-lg border border-[#2c2c2e]/60 flex items-center justify-center text-[10px] text-[#636366]" style={{ background: '#0a0a0a' }}>
          Hover a run row — profit/loss detail yahan dikhega
        </div>
      )}
    </div>
  )
}

function CustomPlTooltip({ active, payload, label, overLabel }) {
  if (!active || !payload?.length) return null
  const pl = payload[0]?.value ?? 0
  const profit = pl >= 0
  return (
    <div className="rounded-xl px-3 py-2 border shadow-lg text-xs" style={{ background: '#111', borderColor: '#2c2c2e' }}>
      <div className="font-bold text-white mb-1">{overLabel}: {label} runs</div>
      <div className={`font-black text-sm ${profit ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
        {profit ? 'Profit' : 'Loss'} — {fmtRs(pl)}
      </div>
    </div>
  )
}

function SessionCard({ session, expanded, onToggle }) {
  const { label, bestYes, bestNo, predicted, gap, liquidity, plRows, plRowsFull, bestPlRow, volumeChart, lines, totalVol, over, isRunsLine, sessionPick } = session
  const [hoveredRun, setHoveredRun] = useState(null)
  const overLabel = isRunsLine ? 'Runs Line' : `${over} Overs`

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: '#111111',
        border: expanded ? '1px solid rgba(245,158,11,0.4)' : '1px solid #2c2c2e',
        boxShadow: expanded ? '0 8px 32px rgba(245,158,11,0.08)' : 'none',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#1a1a1a]/60 transition-colors"
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
          style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(220,38,38,0.15))', border: '1px solid rgba(245,158,11,0.25)' }}>
          {session.isRunsLine ? 'R' : session.over}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-sm truncate">{label}</div>
          <div className="text-[10px] text-[#8e8e93] truncate mt-0.5">{session.marketName}</div>
        </div>

        <div className="text-right flex-shrink-0">
          {sessionPick?.pick ? (
            <>
              <div className={`text-base font-black leading-none ${sessionPick.pick === 'YES' ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>
                {sessionPick.pick} @ {sessionPick.betLine}
              </div>
              <div className="text-[10px] text-[#8e8e93]">~{predicted ?? '—'} runs</div>
            </>
          ) : (
            <>
              <div className="text-lg font-black text-white leading-none">~{predicted ?? '—'}</div>
              <div className="text-[10px] text-[#8e8e93]">runs</div>
            </>
          )}
        </div>

        {gap != null && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${liquidity.textClass}`}
            style={{ background: liquidity.bg, border: `1px solid ${liquidity.border}` }}>
            {liquidity.emoji} {gap.toFixed(0)}
          </span>
        )}

        {expanded ? <ChevronUp size={16} className="text-[#8e8e93] flex-shrink-0" /> : <ChevronDown size={16} className="text-[#8e8e93] flex-shrink-0" />}
      </button>

      {/* Quick stats row — always visible */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2.5 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
          <div className="text-[10px] text-[#8e8e93] mb-0.5">Best Yes</div>
          <div className="text-base font-black text-[#3b82f6]">{bestYes ?? '—'}</div>
          <div className="text-[9px] text-[#636366] mt-0.5">Score upar</div>
        </div>
        <div className="rounded-xl p-2.5 text-center border border-[#2c2c2e]" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <div className="text-[10px] text-[#8e8e93] mb-0.5">Predicted</div>
          <div className="text-base font-black text-[#f59e0b]">{predicted ?? '—'}</div>
          <div className="text-[9px] text-[#636366] mt-0.5">Midpoint</div>
        </div>
        <div className="rounded-xl p-2.5 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
          <div className="text-[10px] text-[#8e8e93] mb-0.5">Best No</div>
          <div className="text-base font-black text-[#ef4444]">{bestNo ?? '—'}</div>
          <div className="text-[9px] text-[#636366] mt-0.5">Score neeche</div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <RangeBar bestYes={bestYes} bestNo={bestNo} predicted={predicted} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#2c2c2e] pt-4 slide-up">
          {sessionPick?.pick && (
            <SessionPickBanner pick={sessionPick} overLabel={overLabel} />
          )}
          {/* Bookie best score */}
          {plRowsFull?.length > 0 && (
            <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wide flex items-center gap-1">
                  <Zap size={11} className="text-[#f59e0b]" /> Bookie Sweet Spot
                </span>
                <span className="text-[10px] font-bold text-[#22c55e]">
                  Best: {bestPlRow.score} runs → {fmtRs(bestPlRow.pl)}
                </span>
              </div>
              {plRows.length > 0 && (
                <div className="h-[120px] w-full mb-3">
                  <ResponsiveContainer width="100%" height="100%" debounce={50}>
                    <BarChart data={plRows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                      <XAxis dataKey="score" stroke="#8e8e93" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#8e8e93" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => formatVolStr(v)} />
                      <Tooltip
                        animationDuration={0}
                        cursor={{ fill: '#2c2c2e', opacity: 0.35 }}
                        wrapperStyle={{ outline: 'none', zIndex: 20 }}
                        content={<CustomPlTooltip overLabel={overLabel} />}
                      />
                      <ReferenceLine y={0} stroke="#3a3a3c" />
                      <Bar dataKey="pl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {plRows.map(r => (
                          <Cell
                            key={r.score}
                            fill={r.score === bestPlRow.score ? '#22c55e' : r.pl >= 0 ? '#16a34a' : '#ef4444'}
                            fillOpacity={r.score === bestPlRow.score ? 1 : 0.7}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <PlHoverPreviewSlot run={hoveredRun} overLabel={overLabel} />
              <div className="rounded-lg overflow-hidden border border-[#2c2c2e]">
                <div className="grid grid-cols-3 text-[10px] text-[#8e8e93] font-bold px-3 py-2 border-b border-[#2c2c2e]" style={{ background: '#111' }}>
                  <span>Runs</span>
                  <span className="text-right">Bookie P/L</span>
                  <span className="text-right">Status</span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {plRowsFull.map(r => {
                    const profit = r.pl >= 0
                    const isHovered = hoveredRun?.score === r.score
                    return (
                    <div
                      key={r.score}
                      title={`${r.score} runs → Bookie ${profit ? 'Profit' : 'Loss'}: ${fmtRs(r.pl)}`}
                      onMouseEnter={() => setHoveredRun(r)}
                      onMouseLeave={() => setHoveredRun(prev => (prev?.score === r.score ? null : prev))}
                      className={`grid grid-cols-3 text-[11px] px-3 py-1.5 border-b border-[#2c2c2e]/30 cursor-default ${
                        isHovered ? 'bg-[#2c2c2e]/60' : r.score === bestPlRow.score ? 'bg-[#22c55e]/10' : ''
                      }`}
                    >
                      <span className={`font-bold ${r.score === bestPlRow.score ? 'text-[#22c55e]' : 'text-white'}`}>
                        {r.score}{r.score === bestPlRow.score && ' ★'}
                      </span>
                      <span className={`text-right font-bold ${r.pl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{fmtRs(r.pl)}</span>
                      <span className={`text-right text-[10px] font-semibold ${r.pl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {r.pl >= 0 ? 'PROFIT' : 'LOSS'}
                      </span>
                    </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Volume by price */}
          {volumeChart.length > 0 && (
            <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
              <div className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wide mb-2 flex items-center gap-1">
                <BarChart3 size={11} className="text-[#3b82f6]" /> Volume by Price
                <span className="ml-auto text-[#636366] font-normal normal-case">{formatVolStr(totalVol)} matched</span>
              </div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%" debounce={50}>
                  <BarChart data={volumeChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                    <XAxis dataKey="price" stroke="#8e8e93" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#8e8e93" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => formatVolStr(v)} />
                    <Tooltip
                      animationDuration={0}
                      cursor={{ fill: '#2c2c2e', opacity: 0.35 }}
                      wrapperStyle={{ outline: 'none', zIndex: 20 }}
                      contentStyle={{ background: '#111', border: '1px solid #2c2c2e', borderRadius: 12, fontSize: 12 }}
                      formatter={(v, name) => [formatVolStr(v), name === 'yes' ? 'Yes (Back)' : 'No (Lay)']}
                      labelFormatter={p => `Line: ${p} runs`}
                    />
                    <Bar dataKey="yes" stackId="v" fill="#3b82f6" radius={[0, 0, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="no" stackId="v" fill="#ef4444" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Order book table */}
          {lines.length > 0 && (
            <div className="rounded-xl overflow-hidden border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
              <div className="grid grid-cols-3 text-[10px] text-[#8e8e93] font-bold px-3 py-2 border-b border-[#2c2c2e]" style={{ background: '#111' }}>
                <span>Price</span>
                <span className="text-center text-[#3b82f6]">Yes Vol</span>
                <span className="text-right text-[#ef4444]">No Vol</span>
              </div>
              <div className="max-h-44 overflow-y-auto">
                {lines.map(l => (
                  <div key={l.price} className="grid grid-cols-3 text-[11px] px-3 py-2 border-b border-[#2c2c2e]/40 hover:bg-[#1a1a1a] transition-colors">
                    <span className="font-bold text-white">{l.price}</span>
                    <span className="text-center text-[#3b82f6] font-semibold">{l.yes > 0 ? formatVolStr(l.yes) : '—'}</span>
                    <span className="text-right text-[#ef4444] font-semibold">{l.no > 0 ? formatVolStr(l.no) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SessionDetail() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [activeInning, setActiveInning] = useState(1)
  const [expandedMarket, setExpandedMarket] = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(() => {
    const fetch = (isInitial = false) => {
      if (isInitial) { setLoading(true); setRequiresLogin(false); setRequiresPro(false) }
      getSessionTrades(matchId).then(res => {
        if (isLoginRequiredError(res)) setRequiresLogin(true)
        else if (res) {
          setData(prev => {
            if (prev && sessionDataFingerprint(prev) === sessionDataFingerprint(res)) return prev
            return res
          })
          setLastRefresh(new Date())
        }
        if (isInitial) setLoading(false)
      }).catch(err => {
        if (isLoginRequiredError(err)) setRequiresLogin(true)
        else if (err?.code === 'SUBSCRIPTION_REQUIRED' || err?.status === 403) setRequiresPro(true)
        if (isInitial) setLoading(false)
      })
    }
    fetch(true)
    return startVisibleInterval(() => fetch(false), LIVE_POLL_MS)
  }, [matchId, isLoggedIn])

  const sessions = useMemo(
    () => buildAllSessions(data?.odds || [], data?.trades || []),
    [data],
  )

  const innings = useMemo(() => [...new Set(sessions.map(s => s.inning))].sort(), [sessions])

  const filtered = useMemo(() => {
    if (innings.length <= 1) return sessions
    return sessions.filter(s => s.inning === activeInning)
  }, [sessions, activeInning, innings.length])

  const summary = useMemo(() => {
    const withGap = filtered.filter(s => s.gap != null)
    const avgGap = withGap.length ? withGap.reduce((a, s) => a + s.gap, 0) / withGap.length : null
    const tightest = withGap.reduce((best, s) => (!best || s.gap < best.gap ? s : best), null)
    return { count: filtered.length, avgGap, tightest }
  }, [filtered])

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (requiresPro) return (
    <div className="flex h-[80vh] items-center justify-center p-4">
      <div className="rounded-2xl p-8 max-w-sm w-full text-center" style={{ background: '#111', border: '1px solid rgba(251,191,36,0.4)' }}>
        <div className="text-5xl mb-4">⭐</div>
        <h2 className="text-xl font-black text-white mb-2">Pro Plan Needed</h2>
        <p className="text-[#8e8e93] text-sm mb-6">Live session data dekhne ke liye Pro plan lo.</p>
        <a href="https://t.me/cricket_edgeonline" target="_blank" rel="noopener noreferrer"
          className="block w-full py-3 rounded-xl font-bold text-white text-sm mb-3"
          style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
          Buy Pro — Telegram
        </a>
        <button onClick={() => navigate(-1)} className="text-sm text-[#8e8e93] hover:text-white">← Back</button>
      </div>
    </div>
  )

  if (requiresLogin) {
    return (
      <LoginRequiredGate
        description="Sign in to view live session data."
      />
    )
  }

  if (!data) return null

  return (
    <div className="p-4 max-w-3xl mx-auto fade-in space-y-4 pb-8">

      <button onClick={() => navigate('/session')} className="flex items-center gap-1.5 text-[#8e8e93] hover:text-white text-sm font-medium transition-colors">
        <ArrowLeft size={15} /> Back
      </button>

      {/* Hero header */}
      <div className="rounded-2xl overflow-hidden relative" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
        <div className="absolute top-0 right-0 p-6 opacity-[0.04] pointer-events-none">
          <Activity size={120} />
        </div>
        <div className="px-5 py-4 border-b border-[#2c2c2e]" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(220,38,38,0.05))' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#f59e0b] mb-1 flex items-center gap-1">
                <TrendingUp size={11} /> Session Analysis
              </div>
              <h1 className="text-lg font-black text-white leading-tight">{data.matchName || 'Session Markets'}</h1>
            </div>
            {lastRefresh && (
              <div className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                <span className="pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: '#22c55e' }} />
                Live · {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 divide-x divide-[#2c2c2e]">
          {[
            { label: 'Markets', value: summary.count, sub: 'this innings' },
            { label: 'Avg Gap', value: summary.avgGap != null ? summary.avgGap.toFixed(1) : '—', sub: 'runs spread' },
            { label: 'Tightest', value: summary.tightest ? `~${summary.tightest.predicted}` : '—', sub: summary.tightest?.label || 'best liquidity' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="px-4 py-3 text-center">
              <div className="text-[10px] text-[#8e8e93] uppercase tracking-wide">{label}</div>
              <div className="text-xl font-black text-white mt-0.5">{value}</div>
              <div className="text-[9px] text-[#636366] mt-0.5 truncate">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inning tabs */}
      {innings.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
          {innings.map(inn => (
            <button
              key={inn}
              onClick={() => { setActiveInning(inn); setExpandedMarket(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${activeInning === inn ? 'text-white shadow-sm' : 'text-[#8e8e93] hover:text-white'}`}
              style={activeInning === inn ? { background: 'linear-gradient(135deg,#b45309,#f59e0b)' } : {}}
            >
              {inn === 1 ? '1st' : `${inn}${inn === 2 ? 'nd' : 'rd'}`} Innings
            </button>
          ))}
        </div>
      )}

      {/* Session cards */}
      <div className="space-y-3 stagger">
        {filtered.map(item => (
          <SessionCard
            key={item.marketName}
            session={item}
            expanded={expandedMarket === item.marketName}
            onToggle={() => setExpandedMarket(expandedMarket === item.marketName ? null : item.marketName)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
          <BarChart3 className="mx-auto mb-3 text-[#3a3a3c]" size={40} />
          <p className="text-[#8e8e93] text-sm">Is innings mein koi session data nahi mila</p>
        </div>
      )}

      {/* Legend — collapsible */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
        <button
          type="button"
          onClick={() => setShowLegend(v => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 text-sm font-bold text-white hover:bg-[#1a1a1a] transition-colors"
        >
          <Info size={15} className="text-[#f59e0b]" />
          Kaise padhein ye data?
          {showLegend ? <ChevronUp size={15} className="ml-auto text-[#8e8e93]" /> : <ChevronDown size={15} className="ml-auto text-[#8e8e93]" />}
        </button>
        {showLegend && (
          <div className="px-4 pb-4 space-y-2 border-t border-[#2c2c2e] pt-3 slide-up">
            {[
              { color: 'text-[#3b82f6]', label: 'Best Yes', desc: 'is price se UPAR score jayega — back karo' },
              { color: 'text-[#ef4444]', label: 'Best No', desc: 'is price se NEECHE rahega — lay karo' },
              { color: 'text-[#f59e0b]', label: 'Predicted', desc: 'Yes + No ka midpoint — market estimate' },
              { color: 'text-[#22c55e]', label: 'Gap 🟢', desc: 'chota gap = zyada liquid market' },
              { color: 'text-[#a855f7]', label: 'Bookie Sweet Spot', desc: 'score jahan bookie max profit mein ho' },
            ].map(({ color, label, desc }) => (
              <div key={label} className="flex items-start gap-2 text-xs">
                <span className={`font-bold ${color} shrink-0`}>{label}</span>
                <span className="text-[#8e8e93]">— {desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
