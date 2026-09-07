import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronRight, LoaderCircle, Lock, Radio, Search } from 'lucide-react'
import { getCricketMatches, getCricketOddsBulk, getTennisMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

const SPORT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'cricket', label: '🏏 Cricket' },
  { id: 'tennis', label: '🎾 Tennis' },
]

const SCROLL_Y_KEY = 'live_desk_scroll_y'
const FILTER_KEY = 'live_desk_sport_filter'
const FOCUS_KEY = 'live_desk_focus_match'

const fmtWhen = (ts) => {
  if (!ts) return null
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date} · ${time}`
}

const isLive = (m) => {
  if (m.sport === 'tennis') return m.status === 'in-play' || (m.inPlay && m.status !== 'ended')
  return Boolean(m.inPlay && m.status === 'in-play')
}

const isUpcoming = (m) => {
  if (isLive(m) || m.status === 'ended') return false
  return m.status === 'upcoming' || !m.status || m.status !== 'ended'
}

const tagMatch = (m, sport) => ({
  ...m,
  sport,
  _key: `${sport}:${m.matchId}`,
})

export default function LiveDesk({ isLoggedIn, authReady, user, stickyTop = 56 }) {
  const navigate = useNavigate()
  const isPro = hasProAccess(user)

  const [loading, setLoading] = useState(() => {
    try {
      // Returning from match detail — avoid full-page spinner wipe of scroll context
      if (sessionStorage.getItem(FOCUS_KEY) || sessionStorage.getItem(SCROLL_Y_KEY) != null) return false
    } catch { /* ignore */ }
    return true
  })
  const [loadError, setLoadError] = useState('')
  const [matches, setMatches] = useState([])
  const [oddsMap, setOddsMap] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [sportFilter, setSportFilter] = useState(() => {
    try {
      const saved = sessionStorage.getItem(FILTER_KEY)
      if (saved && SPORT_FILTERS.some((f) => f.id === saved)) return saved
    } catch { /* ignore */ }
    return 'all'
  })

  useEffect(() => {
    try { sessionStorage.setItem(FILTER_KEY, sportFilter) } catch { /* ignore */ }
  }, [sportFilter])

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    const returning = (() => {
      try { return sessionStorage.getItem(SCROLL_Y_KEY) != null || sessionStorage.getItem(FOCUS_KEY) } catch { return false }
    })()

    const load = (isInitial = false) => {
      Promise.all([
        getCricketMatches().catch((err) => ({ __err: err })),
        getTennisMatches().catch((err) => ({ __err: err })),
      ]).then(([cricket, tennis]) => {
        if (cancelled) return
        const cricketErr = cricket?.__err
        const tennisErr = tennis?.__err
        if (cricketErr && tennisErr) {
          setLoadError(cricketErr?.detail || tennisErr?.detail || 'Live feed load nahi ho paayi.')
          setLoading(false)
          return
        }
        setLoadError('')
        const cricketList = Array.isArray(cricket?.matches)
          ? cricket.matches.map((m) => tagMatch(m, 'cricket'))
          : []
        const tennisList = Array.isArray(tennis?.matches)
          ? tennis.matches.map((m) => tagMatch(m, 'tennis'))
          : []
        setMatches([...cricketList, ...tennisList])
        setLoading(false)
      })
    }

    // Back from match: don't blank the page with spinner if we can restore scroll
    if (!returning) setLoading(true)
    load(true)
    return startVisibleInterval(() => load(false), LIVE_POLL_MS * 2)
  }, [isLoggedIn, authReady])

  const filtered = useMemo(() => {
    let list = sportFilter === 'all' ? matches : matches.filter((m) => m.sport === sportFilter)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((m) =>
        (m.matchName || '').toLowerCase().includes(q) ||
        (m.competitionName || '').toLowerCase().includes(q) ||
        (m.team1 || '').toLowerCase().includes(q) ||
        (m.team2 || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [matches, sportFilter, searchQuery])

  const liveMatches = useMemo(
    () => filtered.filter(isLive).sort((a, b) => (b.totalMatched || 0) - (a.totalMatched || 0)),
    [filtered],
  )

  const upcomingMatches = useMemo(
    () =>
      filtered
        .filter(isUpcoming)
        .sort((a, b) => (a.startTime || Infinity) - (b.startTime || Infinity)),
    [filtered],
  )

  useEffect(() => {
    if (!isPro || loading) return
    const activeIds = filtered
      .filter((m) => m.sport === 'cricket' && m.status !== 'ended')
      .map((m) => m.matchId)
    if (!activeIds.length) return

    const fetchOdds = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      getCricketOddsBulk(activeIds)
        .then((data) => {
          if (data && !data.error) setOddsMap((prev) => ({ ...prev, ...data }))
        })
        .catch(() => {})
    }
    fetchOdds()
    return startVisibleInterval(fetchOdds, LIVE_POLL_MS)
  }, [filtered, isPro, loading])

  // Restore scroll / focus after list is painted (back from match detail)
  useLayoutEffect(() => {
    if (loading || !matches.length) return
    let focus = null
    let y = null
    try {
      focus = sessionStorage.getItem(FOCUS_KEY)
      y = sessionStorage.getItem(SCROLL_Y_KEY)
    } catch { /* ignore */ }
    if (focus == null && y == null) return

    const restore = () => {
      try {
        if (focus) {
          const el = document.querySelector(`[data-live-key="${CSS.escape(focus)}"]`)
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'auto' })
          } else if (y != null) {
            window.scrollTo(0, Number(y) || 0)
          }
        } else if (y != null) {
          window.scrollTo(0, Number(y) || 0)
        }
        sessionStorage.removeItem(FOCUS_KEY)
        sessionStorage.removeItem(SCROLL_Y_KEY)
      } catch { /* ignore */ }
    }

    // Wait a frame so rows exist after fade-in / layout
    const id = requestAnimationFrame(() => requestAnimationFrame(restore))
    return () => cancelAnimationFrame(id)
  }, [loading, matches, sportFilter])

  const openMatch = (match) => {
    try {
      sessionStorage.setItem(SCROLL_Y_KEY, String(window.scrollY || 0))
      sessionStorage.setItem(FILTER_KEY, sportFilter)
      sessionStorage.setItem(FOCUS_KEY, match._key)
    } catch { /* ignore */ }
    if (match.startTime != null) {
      sessionStorage.setItem(`match_start_${match.matchId}`, String(match.startTime))
    }
    navigate(`/${match.sport}/match/${match.matchId}`, {
      state: { startTime: match.startTime ?? null },
    })
  }

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-[70vh] items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="live-desk min-h-[calc(100vh-57px)]">
      <div className="live-desk-glow" aria-hidden />

      {/* Sport chips & Search — sticky under top bar while scrolling */}
      <div
        className="live-desk-filters sticky z-20"
        style={{ top: stickyTop }}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {SPORT_FILTERS.map((f) => {
              const active = sportFilter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSportFilter(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide transition-all ${
                    active ? 'text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                  style={
                    active
                      ? { background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 0 16px rgba(220,38,38,0.3)' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid #1b2234' }
                  }
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Search bar */}
          <div className="relative flex-1 min-w-[170px] max-w-xs ml-auto">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all matches..."
              className="w-full bg-[#080b14] border border-[#1b2234] focus:border-red-500/50 rounded-full pl-7 pr-7 py-1 text-xs text-white placeholder:text-slate-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-2 fade-in">
        {/* LIVE */}
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full" style={{ background: '#ef4444' }} />
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-red-400">Live now</h2>
          </div>

          {liveMatches.length === 0 ? (
            <div
              className="rounded-2xl px-4 py-8 text-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed #2c2c2e' }}
            >
              <Radio className="mx-auto mb-2 h-7 w-7 text-text-muted" />
              <p className="text-sm font-semibold text-text-secondary">No live matches right now</p>
              <p className="mt-1 text-xs text-text-muted">Upcoming fixtures are listed below.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 stagger">
              {liveMatches.map((match) => (
                <MatchRow
                  key={match._key}
                  match={match}
                  live
                  odds={match.sport === 'cricket' ? oddsMap[match.matchId] : null}
                  isPro={isPro}
                  onOpen={openMatch}
                />
              ))}
            </div>
          )}
        </section>

        {/* UPCOMING */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-text-muted">Upcoming</h2>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#2c2c2e,transparent)' }} />
          </div>

          {upcomingMatches.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Activity className="mb-2 h-9 w-9 text-text-muted" />
              <p className="text-sm font-semibold text-text-secondary">Nothing upcoming in this filter</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingMatches.map((match, i) => (
                <MatchRow
                  key={match._key}
                  match={match}
                  live={false}
                  odds={match.sport === 'cricket' ? oddsMap[match.matchId] : null}
                  isPro={isPro}
                  onOpen={openMatch}
                  style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function MatchRow({ match, live, odds, isPro, onOpen, style }) {
  const locked = match.status !== 'ended' && !isPro
  const when = fmtWhen(match.startTime)
  const sportLabel = match.sport === 'cricket' ? '🏏' : '🎾'
  const league = match.competitionName || 'Other'

  return (
    <button
      type="button"
      data-live-key={match._key}
      onClick={() => onOpen(match)}
      className={`live-desk-row group w-full text-left ${live ? 'live-desk-row--live' : 'live-desk-row--up'}`}
      style={style}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex w-7 flex-col items-center gap-1 shrink-0">
          <span className="text-sm leading-none">{sportLabel}</span>
          {live && (
            <span className="flex items-center gap-1 text-[8px] font-black tracking-wider text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
            <span className="truncate uppercase tracking-wider text-slate-400 font-bold">{league}</span>
            {when && !live && (
              <span className="shrink-0 text-slate-400 font-mono text-[10px]">{when}</span>
            )}
          </div>
          <div className="text-xs sm:text-sm font-bold text-white group-hover:text-sky-300 transition-colors truncate">
            {match.matchName}
          </div>

          {odds?.teamNames?.length >= 2 && (
            <div className="mt-1.5 flex gap-1.5">
              {odds.teamNames.map((tn) => {
                const tod = odds.odds?.[tn]
                return (
                  <div
                    key={tn}
                    className="min-w-0 flex-1 rounded-lg px-2 py-1 bg-[#060810] border border-[#1b2234]"
                  >
                    <div className="truncate text-[10px] font-bold text-slate-300">{tn}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] font-mono">
                      <span className="font-bold text-sky-400 bg-sky-500/10 px-1 rounded border border-sky-500/20">
                        B {tod?.back ?? '—'}
                      </span>
                      <span className="font-bold text-rose-400 bg-rose-500/10 px-1 rounded border border-rose-500/20">
                        L {tod?.lay ?? '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-2 pt-1 border-t border-[#1b2234]/60">
            <span className="text-[10px] text-slate-400 font-mono">
              Matched: <b className="text-slate-200">€{(match.totalMatched || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
            </span>
            {locked ? (
              <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                <Lock size={10} /> Pro
              </span>
            ) : (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                {isPro && match.status !== 'ended' ? 'Pro Access' : 'Open'}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-400" />
      </div>
    </button>
  )
}
