import { useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, ChevronDown, Info, ListChecks, RefreshCw, WalletCards,
} from 'lucide-react'
import {
  calcSessionPlBreakdown,
  fmtRs,
  formatVolStr,
  settleSessionLines,
  summarizeLineOutcome,
} from '../utils/sessionMetrics'
import './SessionWorkspace.css'

function LedgerBadge({ status }) {
  const config = {
    verified: { label: 'Ledger complete', Icon: CheckCircle2, classes: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    invalid: { label: 'Invalid trade data', Icon: AlertCircle, classes: 'border-rose-200 bg-rose-50 text-rose-700' },
    syncing: { label: 'Ledger syncing', Icon: RefreshCw, classes: 'border-amber-200 bg-amber-50 text-amber-700' },
    calculated: { label: 'Calculated from trades', Icon: ListChecks, classes: 'border-blue-200 bg-blue-50 text-blue-700' },
    'quotes-only': { label: 'Quotes only', Icon: Info, classes: 'border-slate-200 bg-slate-50 text-slate-600' },
  }[status] || { label: 'Trade ledger', Icon: ListChecks, classes: 'border-slate-200 bg-slate-50 text-slate-600' }
  const { Icon } = config
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${config.classes}`}>
      <Icon size={11} className={status === 'syncing' ? 'animate-spin' : ''} /> {config.label}
    </span>
  )
}

function sessionLabel(session) {
  return session.isRunsLine ? 'Total Runs' : `${session.over} Overs`
}

export function SessionSelector({ sessions, selectedMarket, onSelect }) {
  return (
    <section className="session-card" aria-label="Session markets">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Sessions ({sessions.length})</h2>
        <span className="text-[11px] text-slate-500">Tap to inspect line</span>
      </div>
      <div className="session-sel-grid" role="tablist" aria-label="Session markets">
        {sessions.map(session => {
          const active = session.marketName === selectedMarket
          return (
            <button
              key={session.marketName}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(session.marketName)}
              className={`session-sel-btn${active ? ' is-active' : ''}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`truncate text-xs font-bold ${active ? 'text-amber-900' : 'text-slate-900'}`}>
                  {sessionLabel(session)}
                </span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-500">
                  {session.tradeCount ? `${session.tradeCount}b` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px] tabular-nums">
                <span className="font-bold text-rose-700">N {session.bestNo ?? '—'}</span>
                <span className="font-bold text-sky-700">Y {session.bestYes ?? '—'}</span>
                <span className="text-slate-500">{session.totalVol ? `€${formatVolStr(session.totalVol)}` : '—'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function QuoteStrip({ session, completed }) {
  const cells = [
    {
      label: 'NO (UNDER)',
      value: session.bestNo,
      hint: session.bestNo != null ? `≤ ${Math.floor(session.bestNo)}` : '—',
      classes: 'border-rose-200 bg-rose-50',
      valueClass: 'text-rose-800',
    },
    {
      label: completed ? 'CLOSE MID' : 'MID LINE',
      value: session.marketMid,
      hint: session.gap != null ? `Gap ${session.gap.toFixed(0)}` : 'Quote',
      classes: 'border-amber-200 bg-amber-50',
      valueClass: 'text-amber-800',
    },
    {
      label: 'YES (OVER)',
      value: session.bestYes,
      hint: session.bestYes != null ? `≥ ${Math.floor(session.bestYes) + 1}` : '—',
      classes: 'border-sky-200 bg-sky-50',
      valueClass: 'text-sky-800',
    },
  ]
  return (
    <div className="session-quotes">
      {cells.map(cell => (
        <div key={cell.label} className={`session-quote-cell ${cell.classes}`}>
          <div className="text-[9px] font-bold tracking-wider text-slate-500">{cell.label}</div>
          <strong className={cell.valueClass}>{cell.value ?? '—'}</strong>
          <div className="text-[10px] font-medium tabular-nums text-slate-500">{cell.hint}</div>
        </div>
      ))}
    </div>
  )
}

function YesNoLoadBar({ session }) {
  const totalYes = session.totalYes ?? session.lines.reduce((s, l) => s + l.yes, 0)
  const totalNo = session.totalNo ?? session.lines.reduce((s, l) => s + l.no, 0)
  const total = totalYes + totalNo
  if (total <= 0) return null
  const noPct = Math.round((totalNo / total) * 100)
  const yesPct = 100 - noPct
  const yesBets = session.yesBets ?? session.lines.reduce((s, l) => s + l.yesBets, 0)
  const noBets = session.noBets ?? session.lines.reduce((s, l) => s + l.noBets, 0)

  return (
    <div className="session-load-wrap">
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold tabular-nums">
        <span className="text-rose-700">NO €{formatVolStr(totalNo)} ({noPct}% · {noBets})</span>
        <span className="text-sky-700">YES €{formatVolStr(totalYes)} ({yesPct}% · {yesBets})</span>
      </div>
      <div className="session-load-track" aria-label={`NO ${noPct}% vs YES ${yesPct}% customer volume`}>
        <div className="h-full bg-rose-500" style={{ width: `${noPct}%` }} />
        <div className="h-full bg-sky-500" style={{ width: `${yesPct}%` }} />
      </div>
    </div>
  )
}

/** Keep lower flat tail collapsed into one summary row so 20-over sheets jump straight to active lines. */
function compactPositionRows(plRowsFull, lines, anchorScore) {
  if (!plRowsFull.length) return []
  const tailScore = plRowsFull.at(-1).score
  const validPrices = (lines || []).map(l => Number(l.price)).filter(n => Number.isFinite(n))
  const firstAction = validPrices.length ? Math.max(0, Math.floor(Math.min(...validPrices)) - 1) : 0
  const windowStart = Math.max(0, Math.min(firstAction, anchorScore - 2))
  // Collapse only if at least 4 constant rows precede the action zone.
  if (windowStart < 4) {
    return plRowsFull.map(row => ({
      ...row,
      label: row.score === tailScore ? `${row.score}+` : String(row.score),
    }))
  }
  const lower = plRowsFull[0]
  const active = plRowsFull.slice(windowStart).map(row => ({
    ...row,
    label: row.score === tailScore ? `${row.score}+` : String(row.score),
  }))
  return [
    { score: windowStart - 1, pl: lower.pl, label: `0–${windowStart - 1}` },
    ...active,
  ]
}

function RunWisePositionCurve({ rows, activeScore, maxAbsPl, onSelect }) {
  if (!rows.length) return null
  const scale = maxAbsPl > 0 ? maxAbsPl : 1
  return (
    <div className="session-curve-box">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500">
        <span>BOOKIE POSITION BY RUNS</span>
        <span className="flex items-center gap-2">
          <span className="text-emerald-700">■ Profit</span>
          <span className="text-rose-700">■ Loss</span>
        </span>
      </div>
      <div className="session-curve-bars" role="list" aria-label="Bookie P/L across run scores">
        {rows.map(row => {
          const isActive = row.score === activeScore
          const pct = row.pl === 0 ? 0 : Math.max(8, Math.round((Math.abs(row.pl) / scale) * 100))
          return (
            <button
              key={row.label}
              type="button"
              role="listitem"
              title={`${row.label} runs: ${fmtRs(row.pl)}`}
              onClick={() => onSelect(row.score)}
              className={`session-curve-col${isActive ? ' is-active' : ''}`}
            >
              <span className="session-curve-half is-pos">
                {row.pl > 0 && <span className="session-curve-bar rounded-t bg-emerald-500" style={{ height: `${pct}%` }} />}
              </span>
              <span className="session-curve-half is-neg">
                {row.pl < 0 && <span className="session-curve-bar rounded-b bg-rose-500" style={{ height: `${pct}%` }} />}
              </span>
              <span className="mt-0.5 text-[8.5px] font-bold tabular-nums text-slate-600">{row.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RunWisePl({ session }) {
  const defaultRun = useMemo(() => {
    if (!session.plRowsFull.length) return null
    if (session.marketMid == null) return session.plRowsFull[0]
    const target = Math.floor(session.marketMid)
    return session.plRowsFull.reduce(
      (nearest, row) => Math.abs(row.score - target) < Math.abs(nearest.score - target) ? row : nearest,
      session.plRowsFull[0],
    )
  }, [session.marketMid, session.plRowsFull])

  const [selectedScore, setSelectedScore] = useState(defaultRun?.score ?? null)
  const [scoreInput, setScoreInput] = useState(String(defaultRun?.score ?? ''))
  const selectScore = score => {
    const safe = Math.max(0, Math.floor(score))
    setSelectedScore(safe)
    setScoreInput(String(safe))
  }

  const score = Number.isSafeInteger(selectedScore) && selectedScore >= 0 ? selectedScore : defaultRun?.score
  const breakdown = useMemo(() => score == null ? null : calcSessionPlBreakdown(session.lines, score), [score, session.lines])
  const comparison = useMemo(() => score == null ? null : summarizeLineOutcome(session.lines, score), [score, session.lines])
  const lineSettlements = useMemo(() => score == null ? null : settleSessionLines(session.lines, score), [score, session.lines])
  const visibleRows = useMemo(
    () => score == null ? [] : compactPositionRows(session.plRowsFull, session.lines, score),
    [session.plRowsFull, session.lines, score],
  )
  const maxAbsPl = useMemo(
    () => visibleRows.reduce((m, r) => Math.max(m, Math.abs(r.pl)), 0),
    [visibleRows],
  )

  if (!session.canCalculatePl || !session.plRowsFull.length || score == null || breakdown?.pl == null || !lineSettlements) return null

  const profit = breakdown.pl > 0
  const neutral = breakdown.pl === 0
  const tailScore = session.plRowsFull.at(-1).score

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header + Target Line Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <h3 className="text-xs font-bold text-slate-900">Position Sheet &amp; Line Check</h3>
          <p className="text-[10px] text-slate-500">Compare NO (≤ {score}) vs YES ({score + 1}+) from matched order book</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="session-stepper">
            <button type="button" aria-label="Decrease target runs" onClick={() => selectScore(Math.max(0, score - 1))}>−</button>
            <input
              aria-label="Final session score"
              type="number"
              min="0"
              step="1"
              value={scoreInput}
              onChange={event => {
                setScoreInput(event.target.value)
                const value = Number(event.target.value)
                if (event.target.value.trim() !== '' && Number.isSafeInteger(value) && value >= 0) setSelectedScore(value)
              }}
              onBlur={() => setScoreInput(String(score))}
            />
            <button type="button" aria-label="Increase target runs" onClick={() => selectScore(score + 1)}>+</button>
          </div>
          <LedgerBadge status={session.ledgerStatus} />
        </div>
      </div>

      <div className="space-y-2.5 p-2.5 sm:p-3">
        {/* Binary NO vs YES comparison at chosen line */}
        {comparison && (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-700">If final score vs {comparison.line} runs:</span>
              {comparison.favoredSide !== 'EVEN' ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${comparison.favoredSide === 'YES' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'}`}>
                  Bookie favors {comparison.favoredSide === 'YES' ? `YES (${comparison.yesFrom}+)` : `NO (≤${comparison.line})`} by +€{formatVolStr(comparison.advantage)}
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  Equal across {comparison.line} / {comparison.yesFrom}+
                </span>
              )}
            </div>
            <div className="session-compare-grid">
              {[
                {
                  key: 'NO',
                  title: `NO · ≤ ${comparison.line} runs`,
                  side: comparison.noSide,
                  favored: comparison.favoredSide === 'NO',
                },
                {
                  key: 'YES',
                  title: `YES · ${comparison.yesFrom}+ runs`,
                  side: comparison.yesSide,
                  favored: comparison.favoredSide === 'YES',
                },
              ].map(({ key, title, side, favored }) => (
                <div key={key} className={`session-compare-card${favored ? ' is-favored' : side.pl < 0 ? ' is-risk' : ''}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-bold ${key === 'YES' ? 'text-sky-700' : 'text-rose-700'}`}>{title}</span>
                    {favored && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">FAVORED</span>}
                  </div>
                  <div className={`mt-1 text-lg font-extrabold tabular-nums ${side.pl > 0 ? 'text-emerald-700' : side.pl < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                    {fmtRs(side.pl)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-slate-500">
                    <span>In +€{formatVolStr(side.receives)}</span>
                    <span>Out −€{formatVolStr(side.pays)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exact score net summary strip */}
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${neutral ? 'border-slate-200 bg-slate-50' : profit ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-bold text-slate-600">At {score} runs:</span>
            <strong className={`text-base font-extrabold tabular-nums ${neutral ? 'text-slate-700' : profit ? 'text-emerald-700' : 'text-rose-700'}`}>
              {fmtRs(breakdown.pl)}
            </strong>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold tabular-nums text-slate-600">
            <span className="text-emerald-700">In +€{formatVolStr(breakdown.receives)}</span>
            <span className="text-rose-700">Out −€{formatVolStr(breakdown.pays)}</span>
            <span className={`rounded-full px-2 py-0.5 font-bold ${neutral ? 'bg-slate-200 text-slate-700' : profit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
              {neutral ? 'BREAK EVEN' : profit ? 'BOOKIE PROFIT' : 'BOOKIE LOSS'}
            </span>
          </div>
        </div>

        {/* Visual Run-Wise Position Bar Curve */}
        <RunWisePositionCurve rows={visibleRows.slice(-26)} activeScore={score} maxAbsPl={maxAbsPl} onSelect={selectScore} />

        {/* Actionable Run Score Tiles */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span>TAP RUN SCORE TO CHECK</span>
            <span>Active zone through {tailScore}+</span>
          </div>
          <div className="session-score-grid">
            {visibleRows.map(row => {
              const active = row.score === score || (row.score === tailScore && score >= tailScore)
              const rowProfit = row.pl > 0
              const rowNeutral = row.pl === 0
              return (
                <button
                  key={row.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectScore(row.score)}
                  className={`session-score-btn${active ? ' is-active' : ''}`}
                >
                  <span className="block text-xs font-bold text-slate-900">{row.label}</span>
                  <span className={`block text-[10px] font-bold ${rowNeutral ? 'text-slate-500' : rowProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {fmtRs(row.pl)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Line-wise settlement accordion */}
      <details className="border-t border-slate-200">
        <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
          All betting lines settled at {score} runs ({lineSettlements.length})
        </summary>
        <div tabIndex={0} role="region" aria-label="Line-wise bookie settlement table" className="session-lines-scroll border-t border-slate-200">
          <table className="w-full text-right text-[11px] tabular-nums" aria-label="Line-wise bookie settlement">
            <thead className="sticky top-0 bg-slate-100 text-[10px] text-slate-600">
              <tr>
                {['Line', 'NO (≤Line)', 'YES (>Line)', 'NO P/L', 'YES P/L', 'Net'].map(label => (
                  <th key={label} scope="col" className="whitespace-nowrap px-2.5 py-1.5 font-bold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineSettlements.map(row => (
                <tr key={row.price} className="border-t border-slate-100">
                  <th scope="row" className="px-2.5 py-1.5 text-center font-bold text-slate-900">{row.price}</th>
                  <td className="px-2.5 py-1.5 text-rose-700">€{formatVolStr(row.no)}</td>
                  <td className="px-2.5 py-1.5 text-sky-700">€{formatVolStr(row.yes)}</td>
                  {[row.noPl, row.yesPl, row.pl].map((pl, index) => (
                    <td key={index} className={`whitespace-nowrap px-2.5 py-1.5 font-bold ${pl > 0 ? 'text-emerald-700' : pl < 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                      {fmtRs(pl)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

function OrderBook({ session }) {
  return (
    <details className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
        <WalletCards size={14} className="text-primary" />
        <span>Line-wise matched bets</span>
        <span className="text-[10px] font-normal text-slate-500">({session.lines.length} lines)</span>
        <ChevronDown size={14} className="ml-auto text-slate-400" />
      </summary>
      <div className="border-t border-slate-200">
        <div className="grid grid-cols-3 bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600">
          <span>RUN LINE</span>
          <span className="text-center text-rose-700">NO (UNDER)</span>
          <span className="text-right text-sky-700">YES (OVER)</span>
        </div>
        <div className="session-lines-scroll">
          {session.lines.map(line => (
            <div key={line.price} className="grid grid-cols-3 items-center border-t border-slate-100 px-3 py-1.5 text-xs tabular-nums">
              <span className="font-bold text-slate-900">{line.price}</span>
              <span className="text-center">
                <span className="font-bold text-rose-700">{line.no ? `€${formatVolStr(line.no)}` : '—'}</span>
                <span className="ml-1 text-[10px] text-slate-400">({line.noBets || 0})</span>
              </span>
              <span className="text-right">
                <span className="font-bold text-sky-700">{line.yes ? `€${formatVolStr(line.yes)}` : '—'}</span>
                <span className="ml-1 text-[10px] text-slate-400">({line.yesBets || 0})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}

export function SessionWorkspace({ session, completed = false }) {
  if (!session) return null
  return (
    <article className="session-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h2 className="text-base font-bold text-slate-900">{sessionLabel(session)}</h2>
          <LedgerBadge status={session.ledgerStatus} />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold tabular-nums text-slate-700">
          <span>{session.tradeCount} bets</span>
          <span className="text-slate-300">·</span>
          <span>€{formatVolStr(session.totalVol)}</span>
        </div>
      </div>

      <QuoteStrip session={session} completed={completed} />
      {session.hasTrades && <YesNoLoadBar session={session} />}

      {session.ledgerStatus === 'syncing' && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>Provider totals se bet count/money sync ho raha hai — next update tak P/L partial ho sakta hai.</span>
        </div>
      )}
      {session.invalidTradeCount > 0 && (
        <div role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-800">
          {session.invalidTradeCount} matched trade rows invalid hain. Incomplete data se P/L calculate nahi kiya gaya.
        </div>
      )}

      {session.plRanges?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Bookie profit and loss score ranges">
          {session.plRanges.map(range => (
            <span
              key={range.from}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                range.outcome === 'profit'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : range.outcome === 'loss'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              {range.to == null ? `${range.from}+` : range.from === range.to ? range.from : `${range.from}–${range.to}`} runs: {range.outcome === 'profit' ? 'Bookie profit' : range.outcome === 'loss' ? 'Bookie loss' : 'Break even'}
            </span>
          ))}
        </div>
      )}

      {session.hasTrades ? (
        <>
          <RunWisePl key={`${session.marketName}:${session.canCalculatePl}`} session={session} />
          <OrderBook session={session} />
        </>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <Info className="mx-auto mb-1.5 text-slate-400" size={20} />
          <p className="text-xs font-bold text-slate-800">P/L abhi available nahi</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {session.invalidTradeCount > 0 ? 'Matched trade data valid hone par run-wise P/L dikhega.' : 'Is session mein matched bets nahi mile; sirf quotes available hain.'}
          </p>
        </div>
      )}
    </article>
  )
}
