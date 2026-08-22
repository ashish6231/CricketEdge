import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronRight, LoaderCircle, Lock, Radio } from 'lucide-react'
import { getCricketMatches, getCricketOddsBulk, getTennisMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

const SPORT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'cricket', label: '🏏 Cricket' },
  { id: 'tennis', label: '🎾 Tennis' },
]

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

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [matches, setMatches] = useState([])
  const [oddsMap, setOddsMap] = useState({})
  const [sportFilter, setSportFilter] = useState('all')

  useEffect(() => {
    if (!authReady) return
    let cancelled = false

    const load = () => {
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

    setLoading(true)
    load()
    return startVisibleInterval(load, LIVE_POLL_MS * 2)
  }, [isLoggedIn, authReady])

  const filtered = useMemo(() => {
    if (sportFilter === 'all') return matches
    return matches.filter((m) => m.sport === sportFilter)
  }, [matches, sportFilter])

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

  const openMatch = (match) => {
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

      {/* Sport chips — sticky under top bar while scrolling */}
      <div
        className="live-desk-filters sticky z-20"
        style={{ top: stickyTop }}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          {SPORT_FILTERS.map((f) => {
            const active = sportFilter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSportFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition-all ${
                  active ? 'text-white' : 'text-text-secondary hover:text-white'
                }`}
                style={
                  active
                    ? { background: 'linear-gradient(135deg,#dc2626,#b91c1c)', boxShadow: '0 0 20px rgba(220,38,38,0.25)' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid #2c2c2e' }
                }
              >
                {f.label}
              </button>
            )
          })}
          <span className="ml-auto text-[11px] font-medium text-text-muted">
            {liveMatches.length} live · {upcomingMatches.length} upcoming
          </span>
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
      onClick={() => onOpen(match)}
      className={`live-desk-row group w-full text-left ${live ? 'live-desk-row--live' : 'live-desk-row--up'}`}
      style={style}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex w-8 flex-col items-center gap-1">
          <span className="text-base leading-none">{sportLabel}</span>
          {live && (
            <span className="text-[9px] font-black tracking-wider text-red-400">LIVE</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            <span className="truncate">{league}</span>
            {when && !live && (
              <>
                <span className="opacity-40">·</span>
                <span className="shrink-0 normal-case tracking-normal">{when}</span>
              </>
            )}
          </div>
          <div className="text-sm font-bold leading-snug text-text-primary">{match.matchName}</div>

          {odds?.teamNames?.length >= 2 && (
            <div className="mt-2 flex gap-1.5">
              {odds.teamNames.map((tn) => {
                const tod = odds.odds?.[tn]
                return (
                  <div
                    key={tn}
                    className="min-w-0 flex-1 rounded-lg px-2 py-1"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid #2c2c2e' }}
                  >
                    <div className="truncate text-[10px] font-semibold text-text-secondary">{tn}</div>
                    <div className="mt-0.5 flex gap-1.5 text-[10px]">
                      <span className="font-bold text-back">B {tod?.back ?? '—'}</span>
                      <span className="font-bold text-loss">L {tod?.lay ?? '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-text-muted">
              Matched{' '}
              <span className="font-semibold text-text-secondary">
                ₹{(match.totalMatched || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </span>
            {locked ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400">
                <Lock size={11} /> Pro
              </span>
            ) : (
              <span className="text-[11px] font-semibold" style={{ color: '#10b981' }}>
                {isPro && match.status !== 'ended' ? 'Pro' : 'Open'}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-primary" />
      </div>
    </button>
  )
}
