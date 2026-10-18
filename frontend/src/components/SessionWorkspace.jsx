import { useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info,
  ListChecks, MousePointerClick, RefreshCw, WalletCards,
} from 'lucide-react'
import { calcSessionPlBreakdown, settleSessionLines, fmtRs, formatVolStr } from '../utils/sessionMetrics'

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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${config.classes}`}>
      <Icon size={11} className={status === 'syncing' ? 'animate-spin' : ''} /> {config.label}
    </span>
  )
}

function sessionLabel(session) {
  return session.isRunsLine ? 'Total Runs' : `${session.over} Overs`
}

export function SessionSelector({ sessions, selectedMarket, onSelect }) {
  return (
    <section className="rounded-xl border border-border bg-bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Choose a session</h2>
          <p className="text-[11px] text-text-muted">Button select karte hi us session ka run-wise P/L neeche dikhega.</p>
        </div>
        <MousePointerClick size={18} className="shrink-0 text-amber-600" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="tablist" aria-label="Session markets">
        {sessions.map(session => {
          const active = session.marketName === selectedMarket
          return (
            <button
              key={session.marketName}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(session.marketName)}
              className={`group min-h-[84px] rounded-xl border p-3 text-left transition-all ${active ? 'border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-100' : 'border-border bg-white hover:border-amber-300 hover:bg-amber-50/40'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`text-base font-bold ${active ? 'text-amber-800' : 'text-text-primary'}`}>{sessionLabel(session)}</div>
                  <div className="mt-0.5 text-[10px] text-text-muted">{session.tradeCount ? `${session.tradeCount} bets` : 'No bets yet'}</div>
                </div>
                <ChevronRight size={16} className={`mt-0.5 transition-transform ${active ? 'text-amber-600' : 'text-slate-400 group-hover:translate-x-0.5 group-hover:text-amber-600'}`} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="font-semibold text-sky-700">Yes {session.bestYes ?? '—'}</span>
                <span className="font-semibold text-rose-700">No {session.bestNo ?? '—'}</span>
              </div>
              <div className={`mt-1 text-[9px] font-bold uppercase tracking-wide ${active ? 'text-amber-700' : 'text-slate-400'}`}>{active ? 'Viewing P/L below' : 'View run P/L'}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function QuoteStrip({ session, completed }) {
  const cells = [
    { label: 'YES LINE', value: session.bestYes, hint: session.bestYes != null ? `Final score > ${session.bestYes}` : 'Not available', classes: 'border-sky-200 bg-sky-50', valueClass: 'text-sky-800' },
    { label: completed ? 'CLOSING MID' : 'MARKET MID', value: session.marketMid, hint: 'Yes/No midpoint — prediction nahi', classes: 'border-amber-200 bg-amber-50', valueClass: 'text-amber-800' },
    { label: 'NO LINE', value: session.bestNo, hint: session.bestNo != null ? `Final score ≤ ${session.bestNo}` : 'Not available', classes: 'border-rose-200 bg-rose-50', valueClass: 'text-rose-800' },
  ]
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cells.map(cell => (
        <div key={cell.label} className={`rounded-xl border px-3 py-3 ${cell.classes}`}>
          <div className="text-[10px] font-bold tracking-wide text-slate-500">{cell.label}</div>
          <div className={`mt-0.5 text-2xl font-bold tabular-nums ${cell.valueClass}`}>{cell.value ?? '—'}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">{cell.hint}</div>
        </div>
      ))}
    </div>
  )
}

function RunWisePl({ session }) {
  const defaultRun = useMemo(() => {
    if (!session.plRowsFull.length) return null
    if (session.marketMid == null) return session.plRowsFull[0]
    return session.plRowsFull.reduce((nearest, row) => Math.abs(row.score - session.marketMid) < Math.abs(nearest.score - session.marketMid) ? row : nearest, session.plRowsFull[0])
  }, [session.marketMid, session.plRowsFull])
  const [selectedScore, setSelectedScore] = useState(defaultRun?.score ?? null)
  const [scoreInput, setScoreInput] = useState(String(defaultRun?.score ?? ''))
  const selectScore = score => { setSelectedScore(score); setScoreInput(String(score)) }

  const score = Number.isSafeInteger(selectedScore) && selectedScore >= 0 ? selectedScore : defaultRun?.score
  const selected = score == null ? null : {score}
  const breakdown = useMemo(() => score == null ? null : calcSessionPlBreakdown(session.lines, score), [score, session.lines])
  const lineSettlements = useMemo(() => score == null ? null : settleSessionLines(session.lines, score), [score, session.lines])
  if (!session.canCalculatePl || !session.plRowsFull.length || !selected || breakdown?.pl == null || !lineSettlements) return null
  const profit = breakdown.pl > 0
  const neutral = breakdown.pl === 0
  const tailScore = session.plRowsFull.at(-1).score

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-slate-50 px-4 py-3">
        <div><h3 className="text-sm font-bold text-text-primary">Run-wise bookie P/L</h3><p className="mt-0.5 text-[11px] text-text-muted">Har score par is session ki sabhi YES/NO bets ka net. Profit zone score prediction nahi hai.</p></div>
        <LedgerBadge status={session.ledgerStatus} />
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(230px,0.75fr)_minmax(0,1.25fr)]">
        <div className={`rounded-xl border p-4 ${neutral ? 'border-slate-200 bg-slate-50' : profit ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Selected final score</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="text-3xl font-bold tabular-nums text-text-primary">{selected.score}<span className="ml-1 text-sm font-semibold text-text-muted">runs</span></div>
            <div className={`rounded-full px-2 py-1 text-[10px] font-bold ${neutral ? 'bg-slate-200 text-slate-700' : profit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{neutral ? 'BREAK EVEN' : profit ? 'BOOKIE PROFIT' : 'BOOKIE LOSS'}</div>
          </div>
          <div className={`mt-3 text-3xl font-bold tabular-nums ${neutral ? 'text-slate-700' : profit ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtRs(breakdown.pl)}</div>

          <div className="mt-4 space-y-2 rounded-lg border border-white/80 bg-white/80 p-3 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-text-muted">Bookie receives</span><span className="font-bold tabular-nums text-emerald-700">+€{formatVolStr(breakdown.receives)}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-text-muted">Bookie pays</span><span className="font-bold tabular-nums text-rose-700">−€{formatVolStr(breakdown.pays)}</span></div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2"><span className="font-bold text-text-primary">Net P/L</span><span className={`font-bold tabular-nums ${neutral ? 'text-slate-700' : profit ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtRs(breakdown.pl)}</span></div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-xs font-bold text-text-primary"><MousePointerClick size={13} className="text-amber-600" /> Select final runs</div><span className="text-[10px] text-text-muted">0–{tailScore - 1}, {tailScore}+ runs</span></div>
          <label className="mb-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-text-muted">Check any final score<input aria-label="Final session score" type="number" min="0" step="1" value={scoreInput} onChange={event => { setScoreInput(event.target.value); const value = Number(event.target.value); if (event.target.value.trim() !== '' && Number.isSafeInteger(value) && value >= 0) setSelectedScore(value) }} onBlur={() => setScoreInput(String(selected.score))} className="w-24 rounded-lg border border-border bg-white px-3 py-2 text-sm font-bold text-text-primary" /></label>
          <div className="grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-5">
            {session.plRowsFull.map(row => {
              const active = row.score === selected.score || (row.score === tailScore && selected.score >= tailScore)
              const rowProfit = row.pl > 0
              const rowNeutral = row.pl === 0
              return (
                <button
                  key={row.score}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectScore(row.score)}
                  className={`rounded-lg border px-2 py-2.5 text-center transition-all ${active ? 'border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-100' : rowNeutral ? 'border-slate-200 bg-white hover:bg-slate-50' : rowProfit ? 'border-emerald-200 bg-white hover:border-emerald-400 hover:bg-emerald-50' : 'border-rose-200 bg-white hover:border-rose-400 hover:bg-rose-50'}`}
                >
                  <span className="block text-base font-bold tabular-nums text-text-primary">{row.score}{row.score === tailScore ? '+' : ''}</span>
                  <span className={`mt-0.5 block text-[10px] font-bold tabular-nums ${rowNeutral ? 'text-slate-600' : rowProfit ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtRs(row.pl)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <details className="border-t border-border">
        <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-text-primary">All betting lines settled at {selected.score} runs</summary>
        <div className="overflow-x-auto"><table className="w-full text-right text-xs" aria-label="Line-wise bookie settlement">
          <thead className="bg-slate-50 text-[10px] text-text-muted"><tr>{['Run line', 'YES stake', 'NO stake', 'YES P/L', 'NO P/L', 'Net P/L'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead>
          <tbody>{lineSettlements.map(row => <tr key={row.price} className="border-t border-border">
            <th scope="row" className="px-3 py-2 font-bold">{row.price}</th><td className="px-3 py-2">€{formatVolStr(row.yes)}</td><td className="px-3 py-2">€{formatVolStr(row.no)}</td>
            {[row.yesPl, row.noPl, row.pl].map((pl, index) => <td key={index} className={`whitespace-nowrap px-3 py-2 font-bold ${pl > 0 ? 'text-emerald-700' : pl < 0 ? 'text-rose-700' : 'text-slate-600'}`}>{fmtRs(pl)}</td>)}
          </tr>)}</tbody>
        </table></div>
      </details>
      <div className="border-t border-border bg-blue-50 px-4 py-2 text-[10px] leading-relaxed text-blue-800">Formula: customer ki losing stakes bookie ko milti hain, winning customers ki net winnings bookie pay karta hai (1:1 stake basis). <b>Receives − Pays = Net P/L.</b></div>
    </section>
  )
}

function OrderBook({ session }) {
  return (
    <details className="group mt-3 overflow-hidden rounded-xl border border-border bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-bold text-text-primary hover:bg-slate-50">
        <WalletCards size={15} className="text-primary" /> Calculation source: line-wise matched bets
        <span className="text-[10px] font-normal text-text-muted">{session.lines.length} lines</span>
        <ChevronDown size={15} className="ml-auto text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border">
        <div className="grid grid-cols-3 bg-slate-50 px-4 py-2 text-[10px] font-bold text-text-muted"><span>RUN LINE</span><span className="text-center text-sky-700">YES</span><span className="text-right text-rose-700">NO</span></div>
        <div className="max-h-56 overflow-y-auto">
          {session.lines.map(line => (
            <div key={line.price} className="grid grid-cols-3 border-t border-border px-4 py-2.5 text-xs">
              <span className="font-bold tabular-nums text-text-primary">{line.price}</span>
              <span className="text-center"><span className="block font-bold tabular-nums text-sky-700">{line.yes ? `€${formatVolStr(line.yes)}` : '—'}</span><span className="text-[9px] text-text-muted">{line.yesBets || 0} bets</span></span>
              <span className="text-right"><span className="block font-bold tabular-nums text-rose-700">{line.no ? `€${formatVolStr(line.no)}` : '—'}</span><span className="text-[9px] text-text-muted">{line.noBets || 0} bets</span></span>
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
    <article className="rounded-xl border border-border bg-bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-text-primary">{sessionLabel(session)} Session</h2><LedgerBadge status={session.ledgerStatus} /></div><p className="mt-0.5 text-[11px] text-text-muted">{session.marketName}</p></div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-slate-50 px-3 py-2 text-right">
          <div><div className="text-[9px] font-bold text-text-muted">BETS</div><div className="text-sm font-bold tabular-nums text-text-primary">{session.tradeCount}</div></div><div className="h-7 w-px bg-border" /><div><div className="text-[9px] font-bold text-text-muted">MATCHED</div><div className="text-sm font-bold tabular-nums text-text-primary">€{formatVolStr(session.totalVol)}</div></div>
        </div>
      </div>

      <QuoteStrip session={session} completed={completed} />
      {session.ledgerStatus === 'syncing' && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"><AlertCircle size={14} className="mt-0.5 shrink-0" /> Bet count ya matched money abhi provider summary se match nahi kar raha. Next update tak P/L incomplete ho sakta hai.</div>}
      {session.invalidTradeCount > 0 && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">{session.invalidTradeCount} matched trade rows invalid hain. Incomplete data se P/L calculate nahi kiya gaya.</div>}
      {session.plRanges?.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Bookie profit and loss score ranges">{session.plRanges.map(range => <span key={range.from} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${range.outcome === 'profit' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : range.outcome === 'loss' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{range.to == null ? `${range.from}+` : range.from === range.to ? range.from : `${range.from}–${range.to}`} runs: {range.outcome === 'profit' ? 'Bookie profit' : range.outcome === 'loss' ? 'Bookie loss' : 'Break even'}</span>)}</div>}
      {session.hasTrades ? <><RunWisePl key={`${session.marketName}:${session.canCalculatePl}`} session={session} /><OrderBook session={session} /></> : <div className="mt-4 rounded-xl border border-dashed border-border bg-slate-50 px-4 py-8 text-center"><Info className="mx-auto mb-2 text-slate-400" size={24} /><p className="text-sm font-bold text-text-primary">P/L abhi available nahi</p><p className="mt-1 text-[11px] text-text-muted">{session.invalidTradeCount > 0 ? 'Matched trade data valid hone par run-wise P/L dikhega.' : 'Is session mein matched bets nahi mile; sirf market quotes available hain.'}</p></div>}
    </article>
  )
}
