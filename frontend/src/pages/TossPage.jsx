import PageLoading from '../components/PageLoading'
import useDebouncedValue from '../lib/useDebouncedValue'
import useVisibilityClock from '../lib/useVisibilityClock'
import { lazy, useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Coins, X, Trophy } from 'lucide-react'
import { getSocket, releaseFeed, requestTossFeed } from '../socket'
import { getTossMatches } from '../api'
import SportHubHeader from '../components/SportHubHeader'
import LeagueSearch from '../components/LeagueSearch'
import TossMarketCard from '../components/TossMarketCard'
import { isMatchEnded, isMatchLiveByStart } from '../utils/matchTiming'

const TossDetail = lazy(() => import('./TossDetail'))

const STORAGE_KEY = 'toss_selected_comp'

function formatTimeAndDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  const day = d.getDate()
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
  const month = monthNames[d.getMonth()]
  return `${hours}:${mins} (${day} ${month})`
}

function formatCountdown(startTimeMs, now) {
  if (!startTimeMs) return null
  const diff = Number(startTimeMs) - now
  if (diff <= 0) return null

  const totalMinutes = Math.max(1, Math.ceil(diff / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  const pad = (n) => String(n).padStart(2, '0')
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return `${days}d ${pad(remHours)}h ${pad(minutes)}m`
  }
  return hours > 0 ? `${hours}h ${pad(minutes)}m` : `${minutes}m`
}

function isEndedMatch(m) {
  return isMatchEnded(m)
}

function isLiveMatch(m) {
  return isMatchLiveByStart(m)
}

function getMatchTier(m) {
  if (isEndedMatch(m)) return 3 // Ended matches LAST
  if (isLiveMatch(m)) return 1  // Live matches FIRST
  return 2                      // Upcoming matches SECOND
}

export default function TossPage() {
  const navigate = useNavigate()
  const { mobileMenu, setMobileMenu } = useOutletContext() || {}
  const { matchId } = useParams()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [matchStatus, setMatchStatus] = useState('all')
  const [leagueQuery, setLeagueQuery] = useState('')
  const debouncedLeague = useDebouncedValue(leagueQuery)
  const [allMatches, setAllMatches] = useState([])
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebouncedValue(searchQuery)
  const now = useVisibilityClock()
  const scrollRef = useRef(null)

  const processMatches = (data) => {
    if (!data) return
    setLoadError('')
    const rawList = Array.isArray(data?.matches)
      ? data.matches
      : Array.isArray(data?.matches?.matches)
      ? data.matches.matches
      : Array.isArray(data)
      ? data
      : []

    // Sort: Live (1) → Upcoming (2, soonest start first) → Ended (3, most recently ended first)
    const sorted = rawList.slice().sort((a, b) => {
      const tierA = getMatchTier(a)
      const tierB = getMatchTier(b)

      if (tierA !== tierB) {
        return tierA - tierB
      }

      // Live matches (Tier 1): most recent first
      if (tierA === 1) {
        return (b.startTime || 0) - (a.startTime || 0)
      }

      // Upcoming matches (Tier 2): earliest scheduled first (soonest match at top)
      if (tierA === 2) {
        return (a.startTime || 0) - (b.startTime || 0)
      }

      // Ended matches (Tier 3): most recently ended first
      return (b.startTime || 0) - (a.startTime || 0)
    })

    setAllMatches(sorted)

    // Group matches by competition
    const grouped = {}
    sorted.forEach((m) => {
      const comp = m.competitionName || 'Other'
      if (!grouped[comp]) grouped[comp] = []
      grouped[comp].push(m)
    })

    setCompetitions(grouped)

    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (saved === 'ALL' || grouped[saved])) {
      setSelectedComp(saved)
    } else {
      setSelectedComp('ALL')
    }
    setLoading(false)
  }

  useEffect(() => {
    const socket = getSocket()
    let cancelled = false
    let receivedFeed = false
    const fallbackTimer = setTimeout(() => {
      if (cancelled || receivedFeed || document.hidden) return
      getTossMatches().then(data => { if (!cancelled && !receivedFeed) processMatches(data) }).catch(error => { if (!cancelled && !receivedFeed) { setLoadError(error?.detail || 'Toss data is temporarily unavailable. Please try again.'); setLoading(false) } })
    }, 200)

    const onTossUpdate = (payload) => {
      receivedFeed = true
      processMatches(payload)
    }

    socket.on('toss:matches', onTossUpdate)

    requestTossFeed()

    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
      socket.off('toss:matches', onTossUpdate)
      releaseFeed('toss')
    }
  }, [matchId])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    if (matchId) {
      navigate('/toss')
    }
  }

  const hasSearch = debouncedSearch.trim().length > 0

  // Filter matches based on selected competition and search query
  const displayedMatches = useMemo(() => {
    let list = selectedComp === 'ALL' || debouncedSearch.trim() ? allMatches : (competitions[selectedComp] || [])
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim()
      list = list.filter((m) => {
        const name = (m.matchName || '').toLowerCase()
        const comp = (m.competitionName || '').toLowerCase()
        return name.includes(q) || comp.includes(q)
      })
    }
    return list
  }, [selectedComp, allMatches, competitions, debouncedSearch])

  // Count active live matches (strictly non-ended)
  const liveCount = useMemo(() => {
    return allMatches.filter(match => isMatchLiveByStart(match, now)).length
  }, [allMatches, now])

  const renderLeaguesList = () => {
    if (loading && !allMatches.length) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-slate-500 gap-2">
          <LoaderCircle className="h-4 w-4 animate-spin text-amber-500" />
          <span className="text-[10px] font-medium font-mono">Loading leagues...</span>
        </div>
      )
    }

    return (
      <div className="league-list flex-1 overflow-y-auto py-0.5">
        {/* All Matches Option */}
        <button
          type="button"
          onClick={() => {
            handleCompSelect('ALL')
            if (setMobileMenu) setMobileMenu(false)
          }}
          className={`w-full text-left px-3 py-2 transition-all border-l-[3px] flex items-center justify-between gap-1.5 border-b border-[#1b2234]/30 ${
            selectedComp === 'ALL' && !hasSearch
              ? 'border-amber-500 bg-amber-500/15 text-white font-bold'
              : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 truncate min-w-0">
            <Trophy size={13} className={selectedComp === 'ALL' && !hasSearch ? 'text-amber-400 shrink-0' : 'text-slate-400 shrink-0'} />
            <div className="min-w-0">
              <div className="text-[11px] font-bold truncate">All Matches</div>
              <div className="text-[9px] text-slate-500 font-mono truncate">All active toss markets</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {liveCount > 0 && (
              <span className="flex items-center gap-0.5 text-[8px] font-extrabold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1 py-0.2 rounded-full">
                <span className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
                {liveCount}
              </span>
            )}
            <span className="text-[9px] font-mono text-slate-400 bg-[#060810] px-1.5 py-0.2 rounded border border-[#1b2234]">
              {allMatches.length}
            </span>
          </div>
        </button>

        {/* Categorized League List */}
        {Object.entries(competitions).filter(([comp]) => comp.toLowerCase().includes(debouncedLeague.toLowerCase())).map(([comp, compMatches]) => {
          const compLiveCount = compMatches.filter(isLiveMatch).length
          const isSelected = selectedComp === comp && !hasSearch

          return (
            <button
              key={comp}
              type="button"
              onClick={() => {
                handleCompSelect(comp)
                if (setMobileMenu) setMobileMenu(false)
              }}
              className={`w-full text-left px-3 py-2 transition-all border-l-[3px] flex items-start justify-between gap-1.5 border-b border-[#1b2234]/25 ${
                isSelected
                  ? 'border-[#10b981] bg-[#10b981]/8 text-white font-bold'
                  : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-bold leading-tight truncate ${isSelected ? 'text-white' : ''}`}>
                  {comp}
                </div>
                <div className="text-[9px] text-text-muted mt-0.5 flex items-center gap-1 font-mono">
                  <span>{compMatches.length} matches</span>
                  {compLiveCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-[#10b981] font-semibold flex items-center gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-[#10b981] inline-block" />
                        {compLiveCount} live
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  const renderMatchRow = match => (
    <TossMarketCard key={match.matchId} match={match}
      isLive={isLiveMatch(match)} isEnded={isEndedMatch(match)}
      startLabel={formatTimeAndDate(match.startTime)} countdown={formatCountdown(match.startTime,now)}
      onOpen={() => navigate(`/toss/match/${match.matchId}`,{state:{matchData:match}})} />
  )

  if (!matchId && loading && !allMatches.length) return <PageLoading label="Loading toss markets" />

  if (!matchId && loadError && !allMatches.length) {
    return (
      <div className="flex h-[80vh] items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-5 text-center shadow-lg">
          <p className="text-sm font-bold text-red-400 mb-2">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-500 transition-colors shadow-md"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const visibleMatches = displayedMatches.filter(m => matchStatus === 'all' || (matchStatus === 'live' && isLiveMatch(m)) || (matchStatus === 'upcoming' && !isLiveMatch(m) && !isEndedMatch(m)) || (matchStatus === 'completed' && isEndedMatch(m)))
  const liveMatches = visibleMatches.filter(isLiveMatch)
  const upcomingMatches = visibleMatches.filter((m) => !isLiveMatch(m) && !isEndedMatch(m))
  const endedMatches = visibleMatches.filter(isEndedMatch)

  return (
    <div className="sports-workspace flex overflow-hidden">
      {/* ── Desktop Permanent Sidebar: Toss Leagues ── */}
      <aside className="league-sidebar hidden md:flex flex-col shrink-0">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
          <div className="flex items-center gap-1.5">
            <Coins size={19} className="text-primary" />
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-white">Toss Leagues</div>
              <div className="text-[9px] text-slate-400 font-mono">
                {Object.keys(competitions).length} available leagues
              </div>
            </div>
          </div>
        </div>

        <LeagueSearch value={leagueQuery} onChange={setLeagueQuery} />
        {renderLeaguesList()}
      </aside>

      {/* ── Mobile League Drawer ── */}
      <div className="md:hidden fixed inset-0 z-50 flex pointer-events-none" inert={!mobileMenu} aria-hidden={!mobileMenu}>
        <div
          className="absolute inset-0 bg-black/70 transition-opacity duration-300"
          style={{ opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none' }}
          onClick={() => setMobileMenu && setMobileMenu(false)}
        />
        <div
          className="relative w-64 max-w-[80vw] h-full flex flex-col pointer-events-auto bg-[#080b14] border-r border-[#1b2234]"
          data-league-drawer role="dialog" aria-modal={mobileMenu || undefined} aria-label="Toss leagues"
          style={{
            transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
            <div className="flex items-center gap-1.5">
              <Coins size={19} className="text-primary" />
              <span className="text-[11px] font-black uppercase tracking-widest text-white">Toss Leagues</span>
            </div>
            <button aria-label="Close leagues" onClick={() => setMobileMenu && setMobileMenu(false)} className="text-slate-400 hover:text-white p-1">
              <X size={15} />
            </button>
          </div>

          <LeagueSearch value={leagueQuery} onChange={setLeagueQuery} />
        {renderLeaguesList()}
        </div>
      </div>

      {/* ── Main Content Area: Toss Smart Money Table ── */}
      <div ref={scrollRef} className="sports-content flex-1 overflow-y-auto">
        {matchId ? (
          <TossDetail />
        ) : (
          <>
            <SportHubHeader title="Toss markets" description="Explore toss activity and pre-match signals by league."
              league={selectedComp} total={displayedMatches.length} live={displayedMatches.filter(isLiveMatch).length}
              upcoming={displayedMatches.filter(m => !isLiveMatch(m) && !isEndedMatch(m)).length} completed={displayedMatches.filter(isEndedMatch).length}
              search={searchQuery} onSearch={setSearchQuery} status={matchStatus} onStatus={setMatchStatus}
              onOpenLeagues={() => { if (window.innerWidth < 768) setMobileMenu?.(true); else document.querySelector('.league-sidebar input')?.focus() }} />

            {/* Search status banner */}
            {hasSearch && (
              <div className="px-3 sm:px-4 py-2 bg-[#121727] border-b border-[#1e263d] flex items-center justify-between text-xs text-slate-300">
                <span>
                  Searching toss markets for "<span className="text-amber-300 font-bold">{searchQuery}</span>" ({displayedMatches.length} found)
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-amber-400 hover:text-amber-300 font-bold ml-2 underline"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="hub-results w-full space-y-6 fade-in">
              {/* Match Sections: Live first, Upcoming second, Completed at bottom */}
              {visibleMatches.length > 0 ? (
                <div className="space-y-4">
                  {/* 1. Live In-Play Toss Markets */}
                  {liveMatches.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />
                        <span className="text-xs font-black uppercase tracking-wider text-red-400">Live In-Play Toss</span>
                        <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/60 border border-red-800/40 px-1.5 py-0.2 rounded-full">
                          {liveMatches.length}
                        </span>
                      </div>
                      <div className="toss-exchange-list">
                        {liveMatches.map(renderMatchRow)}
                      </div>
                    </div>
                  )}

                  {/* 2. Upcoming Toss Fixtures */}
                  {upcomingMatches.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" />
                        <span className="text-xs font-black uppercase tracking-wider text-sky-400">Upcoming Toss Fixtures</span>
                        <span className="text-[10px] font-mono font-bold text-slate-300 bg-[#161a28] border border-slate-700/50 px-1.5 py-0.2 rounded-full">
                          {upcomingMatches.length}
                        </span>
                      </div>
                      <div className="toss-exchange-list">
                        {upcomingMatches.map(renderMatchRow)}
                      </div>
                    </div>
                  )}

                  {/* 3. Completed Toss Markets */}
                  {endedMatches.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className="h-2 w-2 rounded-full bg-slate-500 inline-block" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Completed Toss Markets</span>
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-[#161a28] px-1.5 py-0.2 rounded-full">
                          {endedMatches.length}
                        </span>
                      </div>
                      <div className="toss-exchange-list">
                        {endedMatches.map(renderMatchRow)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#1e2536] bg-[#0c1018] p-12 text-center shadow-xl">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-3">
                    <Coins size={24} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">
                    {hasSearch ? 'No toss markets matching your search' : `No ${matchStatus === 'all' ? '' : matchStatus + ' '}toss markets in this league`}
                  </h3>
                  <p className="text-xs text-text-muted mb-4">
                    {hasSearch ? 'Try a different search keyword or clear filters.' : 'Select another league or view all matches.'}
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setMatchStatus('all')
                      handleCompSelect('ALL')
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-colors border border-amber-500/30"
                  >
                    View All Matches
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
