import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Info, ChevronRight, Coins, Radio, Activity, X, Trophy, Search, Menu } from 'lucide-react'
import { getTossMatches } from '../api'
import TossDetail from './TossDetail'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'
import { getSocket, requestTossFeed } from '../socket'

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

  const totalSec = Math.floor(diff / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  const pad = (n) => String(n).padStart(2, '0')
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return `${days}d ${pad(remHours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}

const formatVolStr = (val) => {
  if (val === null || val === undefined || val === 0 || val === '0') return '0.00'
  const num = Number(val)
  if (isNaN(num)) return val.toString()
  const abs = Math.abs(num)
  if (abs >= 10000000) return `${num < 0 ? '-' : ''}${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `${num < 0 ? '-' : ''}${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${num < 0 ? '-' : ''}${(abs / 1000).toFixed(2)}k`
  return num.toFixed(2)
}

const formatOdds = (val) => {
  if (val === null || val === undefined || val === 0 || isNaN(Number(val))) return '—'
  return Number(val).toFixed(2)
}

function extractTossOdds(trades, fallback = null) {
  if (!Array.isArray(trades) || trades.length === 0) return fallback
  const tossTrades = trades.filter((t) => {
    const p = parseFloat(t.price)
    return !isNaN(p) && p >= 1.70 && p <= 2.30
  })
  if (tossTrades.length > 0) {
    const sorted = [...tossTrades].sort((a, b) => b.updatedAt - a.updatedAt)
    return parseFloat(sorted[0].price)
  }
  const broader = trades.filter((t) => {
    const p = parseFloat(t.price)
    return !isNaN(p) && p >= 1.60 && p <= 2.40
  })
  if (broader.length > 0) {
    const sorted = [...broader].sort((a, b) => b.updatedAt - a.updatedAt)
    return parseFloat(sorted[0].price)
  }
  return fallback
}

function isEndedMatch(m) {
  if (!m) return false
  const s = (m.status || '').toLowerCase()
  return s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
}

function isLiveMatch(m) {
  if (!m || isEndedMatch(m)) return false
  const s = (m.status || '').toLowerCase()
  return Boolean(m.inPlay || s === 'in-play' || s === 'live')
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

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [allMatches, setAllMatches] = useState([])
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const scrollRef = useRef(null)

  // Real-time 1s ticker for countdown clocks
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

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

    const onTossUpdate = (payload) => {
      processMatches(payload)
    }

    socket.on('toss:matches', onTossUpdate)

    if (socket.connected) {
      requestTossFeed()
    } else {
      socket.once('connect', () => requestTossFeed())
    }

    return () => {
      socket.off('toss:matches', onTossUpdate)
    }
  }, [matchId])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    if (matchId) {
      navigate('/toss')
    }
  }

  const hasSearch = searchQuery.trim().length > 0

  // Filter matches based on selected competition and search query
  const displayedMatches = useMemo(() => {
    let list = selectedComp === 'ALL' ? allMatches : (competitions[selectedComp] || [])
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((m) => {
        const name = (m.matchName || '').toLowerCase()
        const comp = (m.competitionName || '').toLowerCase()
        return name.includes(q) || comp.includes(q)
      })
    }
    return list
  }, [selectedComp, allMatches, competitions, searchQuery])

  // Count active live matches (strictly non-ended)
  const liveCount = useMemo(() => {
    return allMatches.filter(isLiveMatch).length
  }, [allMatches])

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
      <div className="flex-1 overflow-y-auto no-scrollbar py-0.5">
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
        {Object.entries(competitions).map(([comp, compMatches]) => {
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

  // Helper to render a single toss match row in the Smart Money table
  const renderMatchRow = (match) => {
    const tLoad = match.tossLoad
    const t1Name = match.matchName?.split(' v ')?.[0] || 'Team 1'
    const t2Name = match.matchName?.split(' v ')?.[1] || 'Team 2'

    const snap = match.snapshot
    const tr1 = snap?.teams?.[t1Name]?.trades || snap?.teams?.[snap?.teamNames?.[0]]?.trades || []
    const tr2 = snap?.teams?.[t2Name]?.trades || snap?.teams?.[snap?.teamNames?.[1]]?.trades || []

    const tradeVol1 = tr1.length > 0 ? tr1.reduce((s, t) => s + (parseFloat(t.size) || 0), 0) : 0
    const tradeVol2 = tr2.length > 0 ? tr2.reduce((s, t) => s + (parseFloat(t.size) || 0), 0) : 0

    const vol1 = tradeVol1 || tLoad?.team1?.money || snap?.teams?.[t1Name]?.totalBet || snap?.teams?.[snap?.teamNames?.[0]]?.totalBet || snap?.preMatchTotalBets?.team1 || match.preMatchVolume?.team1?.total || 0
    const vol2 = tradeVol2 || tLoad?.team2?.money || snap?.teams?.[t2Name]?.totalBet || snap?.teams?.[snap?.teamNames?.[1]]?.totalBet || snap?.preMatchTotalBets?.team2 || match.preMatchVolume?.team2?.total || 0

    const tossOdds1 = extractTossOdds(tr1) || (snap?.syntheticSupport?.teamA?.averageOdds ? parseFloat(snap.syntheticSupport.teamA.averageOdds.toFixed(2)) : null)
    const tossOdds2 = extractTossOdds(tr2) || (snap?.syntheticSupport?.teamB?.averageOdds ? parseFloat(snap.syntheticSupport.teamB.averageOdds.toFixed(2)) : null)

    const odds1 = (tLoad?.team1?.odds && tLoad.team1.odds >= 1.60 && tLoad.team1.odds <= 2.40 ? tLoad.team1.odds : null) || tossOdds1 || (match.runners?.[0]?.price && match.runners[0].price >= 1.60 && match.runners[0].price <= 2.40 ? match.runners[0].price : null) || null
    const odds2 = (tLoad?.team2?.odds && tLoad.team2.odds >= 1.60 && tLoad.team2.odds <= 2.40 ? tLoad.team2.odds : null) || tossOdds2 || (match.runners?.[1]?.price && match.runners[1].price >= 1.60 && match.runners[1].price <= 2.40 ? match.runners[1].price : null) || null

    const tot = vol1 + vol2
    const pct1 = (tLoad?.team1?.percent && tLoad?.team1?.money > 0) ? tLoad.team1.percent : (tot > 0 ? Math.round((vol1 / tot) * 100) : 50)
    const pct2 = (tLoad?.team2?.percent && tLoad?.team2?.money > 0) ? tLoad.team2.percent : (tot > 0 ? (100 - pct1) : 50)

    const team1 = {
      name: tLoad?.team1?.name || t1Name,
      money: vol1,
      percent: pct1,
      odds: odds1,
    }
    const team2 = {
      name: tLoad?.team2?.name || t2Name,
      money: vol2,
      percent: pct2,
      odds: odds2,
    }

    const dt = formatTimeAndDate(match.startTime)
    const countdown = formatCountdown(match.startTime, now)
    const isEnded = isEndedMatch(match)
    const isLive = isLiveMatch(match)

    return (
      <div
        key={match.matchId}
        className="px-3 py-2 md:px-4 md:py-2.5 hover:bg-[#121824]/80 transition-colors flex items-center justify-between gap-2 md:gap-4 cursor-pointer group"
        onClick={() => navigate(`/toss/match/${match.matchId}`, { state: { matchData: match } })}
      >
        {/* Left: Info icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/toss/match/${match.matchId}`, { state: { matchData: match } })
          }}
          className="flex-shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full border border-white/20 hover:border-amber-400/60 text-white/50 hover:text-amber-300 flex items-center justify-center transition-colors bg-white/5"
          title="View Toss AI Predictions & Smart Money Flow"
        >
          <Info size={12} />
        </button>

        {/* Scheduled Time & Countdown Column */}
        <div className="flex flex-col items-start min-w-[75px] md:min-w-[95px] flex-shrink-0">
          {dt && (
            <span className="text-xs md:text-sm font-bold text-[#f59e0b] leading-tight tracking-tight">
              {dt}
            </span>
          )}
          {isLive ? (
            <span className="flex items-center gap-1 text-[10px] md:text-[11px] font-extrabold text-red-400 leading-tight mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              LIVE
            </span>
          ) : countdown ? (
            <span className="text-[11px] md:text-xs font-mono font-bold text-[#f59e0b] leading-tight mt-0.5">
              ⏰ {countdown}
            </span>
          ) : isEnded ? (
            <span className="text-[10px] font-bold text-slate-400 leading-tight mt-0.5">
              COMPLETED
            </span>
          ) : (
            <span className="text-[10px] font-medium text-slate-400 leading-tight mt-0.5">
              SCHEDULED
            </span>
          )}
        </div>

        {/* Competition & Match Title Column */}
        <div className="flex flex-col min-w-0 flex-1 pr-2">
          <span className="text-[10px] md:text-[11px] text-slate-400 font-medium truncate leading-tight">
            {match.competitionName || 'T20 Cricket League'}
          </span>
          <span className="text-xs md:text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate leading-tight mt-0.5">
            {match.matchName}
          </span>
        </div>

        {/* Right: Team 1 & Team 2 Columns */}
        <div className="flex items-center gap-3 sm:gap-6 md:gap-8 flex-shrink-0">
          {/* Team 1 Column */}
          <div className="flex flex-col items-center w-20 sm:w-28 md:w-32 text-center">
            <span className="text-[10px] md:text-[11px] font-semibold text-slate-300 truncate max-w-full leading-tight">
              {team1.name}
            </span>
            <span className="text-xs md:text-sm font-black text-white tracking-tight leading-none my-0.5" title="On this selection">
              {formatVolStr(team1.money)}
            </span>
            {/* Percentage Badge */}
            <span
              className={`text-[10px] md:text-[11px] font-bold px-2 py-0.5 rounded-full inline-block leading-none transition-transform group-hover:scale-105 ${
                team1.percent >= 50
                  ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                  : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
              }`}
            >
              {team1.percent}%
            </span>
            {/* Odds */}
            <div className="flex items-center justify-center gap-0.5 text-[11px] md:text-xs font-bold text-[#10b981] leading-tight mt-0.5" title="Last price matched">
              <span className="text-[9px]">▲</span>
              <span>{formatOdds(team1.odds)}</span>
            </div>
          </div>

          {/* Team 2 Column */}
          <div className="flex flex-col items-center w-20 sm:w-28 md:w-32 text-center">
            <span className="text-[10px] md:text-[11px] font-semibold text-slate-300 truncate max-w-full leading-tight">
              {team2.name}
            </span>
            <span className="text-xs md:text-sm font-black text-white tracking-tight leading-none my-0.5" title="On this selection">
              {formatVolStr(team2.money)}
            </span>
            {/* Percentage Badge */}
            <span
              className={`text-[10px] md:text-[11px] font-bold px-2 py-0.5 rounded-full inline-block leading-none transition-transform group-hover:scale-105 ${
                team2.percent >= 50
                  ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                  : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
              }`}
            >
              {team2.percent}%
            </span>
            {/* Odds */}
            <div className="flex items-center justify-center gap-0.5 text-[11px] md:text-xs font-bold text-[#10b981] leading-tight mt-0.5" title="Last price matched">
              <span className="text-[9px]">▲</span>
              <span>{formatOdds(team2.odds)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!matchId && loading && !allMatches.length) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-9 w-9 animate-spin text-amber-500" />
          <span className="text-sm font-semibold text-text-muted">Loading toss markets...</span>
        </div>
      </div>
    )
  }

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

  const liveMatches = displayedMatches.filter(isLiveMatch)
  const upcomingMatches = displayedMatches.filter((m) => !isLiveMatch(m) && !isEndedMatch(m))
  const endedMatches = displayedMatches.filter(isEndedMatch)

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-[#07090e]">
      {/* ── Desktop Permanent Sidebar: Toss Leagues ── */}
      <aside className="hidden md:flex w-52 lg:w-56 border-r border-[#1b2234] flex-col bg-[#080b14] shrink-0 select-none">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🪙</span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-white">Toss Leagues</div>
              <div className="text-[9px] text-slate-400 font-mono">
                {Object.keys(competitions).length} available leagues
              </div>
            </div>
          </div>
        </div>

        {renderLeaguesList()}
      </aside>

      {/* ── Mobile League Drawer ── */}
      <div className="md:hidden fixed inset-0 z-50 flex pointer-events-none">
        <div
          className="absolute inset-0 bg-black/70 transition-opacity duration-300"
          style={{ opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none' }}
          onClick={() => setMobileMenu && setMobileMenu(false)}
        />
        <div
          className="relative w-64 max-w-[80vw] h-full flex flex-col pointer-events-auto bg-[#080b14] border-r border-[#1b2234]"
          style={{
            transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🪙</span>
              <span className="text-[11px] font-black uppercase tracking-widest text-white">Toss Leagues</span>
            </div>
            <button onClick={() => setMobileMenu && setMobileMenu(false)} className="text-slate-400 hover:text-white p-1">
              <X size={15} />
            </button>
          </div>

          {renderLeaguesList()}
        </div>
      </div>

      {/* ── Main Content Area: Toss Smart Money Table ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#07090e]">
        {matchId ? (
          <TossDetail />
        ) : (
          <>
            {/* Sticky Control Bar */}
            <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#07090e]/95 border-b border-[#1b2030] px-3 sm:px-4 py-2">
              <div className="flex items-center justify-between gap-2.5 flex-wrap">
                {/* Desktop Active League Indicator */}
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">League:</span>
                  <span className="text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg">
                    {selectedComp === 'ALL' ? 'All Tournaments' : selectedComp}
                  </span>
                </div>

                {/* Search Input */}
                <div className="relative w-full md:flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search toss markets by team or league..."
                    className="w-full bg-[#101420] border border-[#1f273b] focus:border-amber-500/60 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

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

            <div className="p-2.5 sm:p-3 md:p-3.5 w-full space-y-3.5 md:space-y-4 fade-in">
              {/* Horizontal Scrollable Competition Pills Filter */}
              <div className="overflow-x-auto no-scrollbar py-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap min-w-max">
                  {/* All Matches Pill */}
                  <button
                    type="button"
                    onClick={() => handleCompSelect('ALL')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedComp === 'ALL' && !hasSearch
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                        : 'bg-white/5 text-text-secondary hover:text-white hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <span>All Matches</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        selectedComp === 'ALL' && !hasSearch ? 'bg-slate-950/25 text-slate-950 font-black' : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {allMatches.length}
                    </span>
                  </button>

                  {Object.entries(competitions).map(([comp, compMatches]) => (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => handleCompSelect(comp)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                        selectedComp === comp && !hasSearch
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                          : 'bg-white/5 text-text-secondary hover:text-white hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <span>{comp}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          selectedComp === comp && !hasSearch ? 'bg-slate-950/25 text-slate-950 font-black' : 'bg-white/10 text-slate-400'
                        }`}
                      >
                        {compMatches.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Match Sections: Live first, Upcoming second, Completed at bottom */}
              {displayedMatches.length > 0 ? (
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
                      <div className="rounded-xl border border-red-500/30 bg-[#0c1018] shadow-2xl overflow-hidden divide-y divide-[#1e2536]/80">
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
                      <div className="rounded-xl border border-[#1e2536] bg-[#0c1018] shadow-2xl overflow-hidden divide-y divide-[#1e2536]/80">
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
                      <div className="rounded-xl border border-[#1e2536]/60 bg-[#0a0d14] opacity-80 hover:opacity-100 transition-opacity shadow-lg overflow-hidden divide-y divide-[#1e2536]/60">
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
                    {hasSearch ? 'No toss markets matching your search' : 'No Toss Markets in Selected League'}
                  </h3>
                  <p className="text-xs text-text-muted mb-4">
                    {hasSearch ? 'Try a different search keyword or clear filters.' : 'Select another league or view all matches.'}
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('')
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
