import { memo, useEffect, useMemo, useState } from 'react'
import { Activity, ChevronDown, Info } from 'lucide-react'
import { buildAllSessions } from '../utils/sessionMetrics'
import { SessionSelector, SessionWorkspace } from './SessionWorkspace'

function SessionPanel({ odds = [], trades = [], markets = [], t1 = '', t2 = '' }) {
  const [activeInning, setActiveInning] = useState(1)
  const [inningTouched, setInningTouched] = useState(false)
  const [selectedMarket, setSelectedMarket] = useState(null)
  const sessions = useMemo(() => buildAllSessions(odds, trades, markets), [odds, trades, markets])
  const innings = useMemo(() => [...new Set(sessions.map(session => session.inning))].sort(), [sessions])

  useEffect(() => {
    if (inningTouched || !sessions.length) return
    const complete = sessions.filter(session => session.ledgerStatus === 'verified')
    const active = complete.length ? Math.max(...complete.map(session => session.inning)) : sessions.find(session => session.hasTrades)?.inning
    if (active != null && active !== activeInning) setActiveInning(active)
  }, [sessions, activeInning, inningTouched])

  const filtered = useMemo(() => sessions
    .filter(session => innings.length <= 1 || session.inning === activeInning)
    .sort((a, b) => Number(b.hasTrades) - Number(a.hasTrades) || a.over - b.over),
  [sessions, activeInning, innings.length])

  useEffect(() => {
    if (!filtered.length) { setSelectedMarket(null); return }
    if (!filtered.some(session => session.marketName === selectedMarket)) {
      setSelectedMarket((filtered.find(session => session.ledgerStatus === 'verified') || filtered.find(session => session.hasTrades) || filtered[0]).marketName)
    }
  }, [filtered, selectedMarket])

  if (!sessions.length) {
    const matchLabel = t1 && t2 ? `${t1} vs ${t2}` : 'This match'
    return (
      <div className="rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <Activity className="mx-auto mb-3 text-amber-500" size={30} />
        <h3 className="text-base font-bold text-text-primary">Session markets are syncing</h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-text-muted">{matchLabel} ke over-wise matched bets aate hi run-wise P/L yahan automatically dikhega.</p>
      </div>
    )
  }

  const selectedSession = filtered.find(session => session.marketName === selectedMarket) || null

  return (
    <div className="space-y-3 fade-in">
      {innings.length > 1 && (
        <section className="rounded-xl border border-border bg-white p-2 shadow-sm">
          <div className="flex gap-2" role="tablist" aria-label="Session innings">
            {innings.map(inning => (
              <button
                key={inning}
                type="button"
                role="tab"
                aria-selected={activeInning === inning}
                onClick={() => { setInningTouched(true); setActiveInning(inning); setSelectedMarket(null) }}
                className={`flex-1 rounded-lg border py-2.5 text-sm font-bold ${activeInning === inning ? 'border-amber-500 bg-amber-500 text-slate-950 shadow-sm' : 'border-border bg-white text-text-muted hover:border-amber-300 hover:bg-amber-50'}`}
              >
                {inning === 1 ? '1st' : inning === 2 ? '2nd' : `${inning}th`} Innings
              </button>
            ))}
          </div>
        </section>
      )}

      {filtered.length ? <><SessionSelector sessions={filtered} selectedMarket={selectedMarket} onSelect={setSelectedMarket} /><SessionWorkspace session={selectedSession} /></> : <div className="rounded-xl border border-border bg-white py-10 text-center text-sm text-text-muted">Is innings mein session market nahi mila.</div>}

      <details className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-text-primary hover:bg-slate-50"><Info size={15} className="text-primary" /> P/L formula <ChevronDown size={15} className="ml-auto text-text-muted transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-text-muted">Losing customer stakes received − winning customer stakes paid = bookie net P/L. “Ledger complete” ka matlab bet count aur matched money provider totals se match karte hain.</div>
      </details>
    </div>
  )
}

export default memo(SessionPanel)
