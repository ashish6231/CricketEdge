import { memo, useId, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, Info, LoaderCircle, RefreshCw } from 'lucide-react'
import { buildAllSessions, formatVolStr, groupSessionsByTeam } from '../utils/sessionMetrics'
import { SessionSelector, SessionWorkspace } from './SessionWorkspace'

function SessionPanel({
  odds = [],
  trades = [],
  markets = [],
  t1 = '',
  t2 = '',
  crexData = null,
  completed = false,
  loading = false,
  onRetry = null,
}) {
  const baseId = useId()
  const tabRefs = useRef(new Map())
  const [selectedGroupKey, setSelectedGroupKey] = useState(null)
  const [selectedInning, setSelectedInning] = useState(null)
  const [selectedMarket, setSelectedMarket] = useState(null)

  const sessions = useMemo(() => buildAllSessions(odds, trades, markets), [odds, trades, markets])
  const { groups, groupedByTeam, orderConfirmed, defaultGroupKey } = useMemo(
    () => groupSessionsByTeam({ sessions, t1, t2, crexData }),
    [sessions, t1, t2, crexData],
  )

  const activeGroup = groups.find(group => group.key === selectedGroupKey)
    || groups.find(group => group.key === defaultGroupKey)
    || groups[0]
    || null
  const groupSessions = useMemo(() => activeGroup?.sessions || [], [activeGroup])
  const groupInnings = useMemo(
    () => [...new Set(groupSessions.map(session => session.inning))].sort((a, b) => a - b),
    [groupSessions],
  )

  const defaultInning = useMemo(() => {
    const complete = groupSessions.filter(session => session.ledgerStatus === 'verified')
    return complete.length
      ? Math.max(...complete.map(session => session.inning))
      : groupSessions.find(session => session.hasTrades)?.inning ?? groupInnings[0] ?? 1
  }, [groupSessions, groupInnings])
  const activeInning = groupInnings.includes(selectedInning) ? selectedInning : defaultInning

  const filtered = useMemo(() => groupSessions
    .filter(session => groupInnings.length <= 1 || session.inning === activeInning)
    .sort((a, b) => Number(b.hasTrades) - Number(a.hasTrades) || a.over - b.over),
  [groupSessions, groupInnings.length, activeInning])

  const defaultMarket = filtered.length
    ? (filtered.find(session => session.ledgerStatus === 'verified') || filtered.find(session => session.hasTrades) || filtered[0]).marketName
    : null
  const activeMarket = filtered.some(session => session.marketName === selectedMarket) ? selectedMarket : defaultMarket

  const selectGroup = (key) => {
    setSelectedGroupKey(key)
    setSelectedInning(null)
    setSelectedMarket(null)
    const tabEl = tabRefs.current.get(key)
    tabEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  if (loading && !sessions.length) {
    return (
      <div className="session-card flex flex-col items-center justify-center py-10 text-center">
        <LoaderCircle className="mb-2 h-6 w-6 animate-spin text-amber-600" />
        <p className="text-xs font-bold text-slate-800">Session markets load ho rahe hain...</p>
      </div>
    )
  }

  if (!sessions.length) {
    const matchLabel = t1 && t2 ? `${t1} vs ${t2}` : 'This match'
    return (
      <div className="session-card py-8 text-center">
        <Activity className="mx-auto mb-2.5 text-amber-500" size={28} />
        <h3 className="text-sm font-bold text-slate-900">Session markets are syncing</h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          {matchLabel} ke team-wise session quotes aur matched bets aate hi run-wise P/L yahan automatically dikhega.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-300 hover:bg-amber-50"
          >
            <RefreshCw size={13} /> Refresh Session
          </button>
        )}
      </div>
    )
  }

  const selectedSession = filtered.find(session => session.marketName === activeMarket) || null
  const activeTabId = activeGroup ? `${baseId}-team-${activeGroup.key}` : undefined

  return (
    <div className="space-y-2.5 fade-in">
      {groups.length > 0 && (
        <section className="session-card" aria-label="Team-wise sessions">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {groupedByTeam ? 'Team-wise Sessions' : 'Innings Sessions'}
            </h2>
            {!groupedByTeam && !orderConfirmed && (
              <span className="text-[10px] font-medium text-slate-500">
                Toss / batting order confirm hote hi team name dikhega
              </span>
            )}
          </div>
          <div
            className="session-team-tablist"
            role="tablist"
            aria-label={groupedByTeam ? 'Teams' : 'Innings'}
          >
            {groups.map(group => {
              const active = group.key === activeGroup?.key
              return (
                <button
                  key={group.key}
                  ref={el => { if (el) tabRefs.current.set(group.key, el); else tabRefs.current.delete(group.key) }}
                  id={`${baseId}-team-${group.key}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectGroup(group.key)}
                  className="session-team-tab"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-extrabold">{group.label}</span>
                    <span className="session-team-role">{group.roleLabel}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-slate-500">
                    <span>{group.sessions.length} lines · {group.tradeCount}b</span>
                    <span className="font-bold text-slate-700">
                      {group.score || (group.totalVol ? `€${formatVolStr(group.totalVol)}` : '—')}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div role="tabpanel" aria-labelledby={activeTabId} tabIndex={0} className="space-y-2.5 focus:outline-none">
        {groupInnings.length > 1 && (
          <div className="session-innings-tabs" role="tablist" aria-label={`${activeGroup?.label || 'Team'} innings`}>
            {groupInnings.map(inning => (
              <button
                key={inning}
                type="button"
                role="tab"
                aria-selected={activeInning === inning}
                onClick={() => { setSelectedInning(inning); setSelectedMarket(null) }}
                className={`session-innings-tab${activeInning === inning ? ' is-active' : ''}`}
              >
                {inning === 1 ? '1st' : inning === 2 ? '2nd' : `${inning}th`} Innings
              </button>
            ))}
          </div>
        )}

        {filtered.length ? (
          <>
            <SessionSelector sessions={filtered} selectedMarket={activeMarket} onSelect={setSelectedMarket} />
            <SessionWorkspace session={selectedSession} completed={completed} />
          </>
        ) : (
          <div className="session-card py-10 text-center text-xs text-slate-500">
            Is innings mein session market nahi mila.
          </div>
        )}
      </div>

      <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50">
          <Info size={14} className="text-primary" /> P/L kaise calculate hota hai?
          <ChevronDown size={14} className="ml-auto text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-200 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600">
          1:1 stake basis: losing customer stakes received − winning customers ki net winnings = bookie P/L. “Ledger complete” ka matlab bet count aur matched money provider totals se match karte hain.
        </div>
      </details>
    </div>
  )
}

export default memo(SessionPanel)
