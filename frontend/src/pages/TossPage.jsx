import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Info, ChevronRight, Coins, Radio, Lock, Activity, X } from 'lucide-react'
import { getTossMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import TossDetail from './TossDetail'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

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

function fmtDateTime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date} • ${time}`
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

export default function TossPage() {
  const navigate = useNavigate()
  const { user, mobileMenu, setMobileMenu, liveMode: outletLiveMode, setLiveMode: outletSetLiveMode } = useOutletContext() || {}
  const isPro = hasProAccess(user)
  const { matchId } = useParams()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [allMatches, setAllMatches] = useState([])
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [now, setNow] = useState(() => Date.now())
  const [currency, setCurrency] = useState('€') // '€' or '₹'
  const scrollRef = useRef(null)

  // Determine Live Mode state (from Navbar switch or localStorage)
  const isLiveMode = outletLiveMode !== undefined ? Boolean(outletLiveMode) : (() => {
    try { return localStorage.getItem('live_desk_mode') === '1' } catch { return false }
  })()

  const toggleLiveMode = () => {
    if (outletSetLiveMode) {
      outletSetLiveMode((prev) => !prev)
    } else {
      try {
        const next = !isLiveMode
        localStorage.setItem('live_desk_mode', next ? '1' : '0')
        window.location.reload()
      } catch {}
    }
  }

  // Real-time 1s ticker for countdown clocks
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchMatches = () => {
    getTossMatches()
      .then((data) => {
        setLoadError('')
        const rawList = Array.isArray(data?.matches)
          ? data.matches
          : Array.isArray(data?.matches?.matches)
          ? data.matches.matches
          : []

        const getMatchTier = (m) => {
          const s = (m.status || '').toLowerCase()
          const isEnded = s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
          if (isEnded) return 1 // Ended matches FIRST
          const isLive = m.inPlay || s === 'in-play' || s === 'live'
          if (isLive) return 2 // Live matches SECOND
          return 3 // Upcoming matches THIRD
        }

        // Sort: Ended matches first, then Live, then Upcoming (sorted by date)
        const sorted = rawList.slice().sort((a, b) => {
          const tierA = getMatchTier(a)
          const tierB = getMatchTier(b)

          if (tierA !== tierB) {
            return tierA - tierB
          }

          // Ended matches (Tier 1): most recently ended/started first
          if (tierA === 1) {
            return (b.startTime || 0) - (a.startTime || 0)
          }

          // Live matches (Tier 2): most recent first
          if (tierA === 2) {
            return (b.startTime || 0) - (a.startTime || 0)
          }

          // Upcoming matches (Tier 3): earliest scheduled first
          return (a.startTime || 0) - (b.startTime || 0)
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
          setSelectedComp(isLiveMode ? 'ALL' : (Object.keys(grouped)[0] || 'ALL'))
        }
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(err?.detail || 'Live toss data is temporarily unavailable. Please try again.')
        setLoading(false)
      })
  }

  useEffect(() => {
    setLoading(true)
    fetchMatches()
    return startVisibleInterval(fetchMatches, LIVE_POLL_MS)
  }, [])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    if (matchId) {
      navigate('/toss')
    }
  }

  const isEndedMatch = (m) => {
    const s = (m.status || '').toLowerCase()
    return s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
  }

  // Filter matches based on selected competition & liveMode
  const displayedMatches = useMemo(() => {
    let list = selectedComp === 'ALL' ? allMatches : (competitions[selectedComp] || [])
    if (isLiveMode) {
      // In live mode: only show live and upcoming matches; ended matches are hidden
      list = list.filter((m) => !isEndedMatch(m))
    }
    return list
  }, [selectedComp, allMatches, competitions, isLiveMode])

  const totalDisplayCount = useMemo(() => {
    if (!isLiveMode) return allMatches.length
    return allMatches.filter((m) => !isEndedMatch(m)).length
  }, [allMatches, isLiveMode])

  const availableCompetitions = useMemo(() => {
    if (!isLiveMode) return competitions
    const filtered = {}
    Object.entries(competitions).forEach(([comp, matches]) => {
      const active = matches.filter((m) => !isEndedMatch(m))
      if (active.length > 0) {
        filtered[comp] = active
      }
    })
    return filtered
  }, [competitions, isLiveMode])

  // Count active live matches (strictly non-ended)
  const liveCount = useMemo(() => {
    return allMatches.filter((m) => {
      return !isEndedMatch(m) && (m.inPlay || (m.status || '').toLowerCase() === 'in-play' || (m.status || '').toLowerCase() === 'live')
    }).length
  }, [allMatches])

  const getMatchStatusBadge = (match) => {
    const s = (match.status || '').toLowerCase()
    const isEnded = s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
    if (isEnded) {
      return (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ENDED
        </span>
      )
    }
    if (match.inPlay || s === 'in-play' || s === 'live') {
      return (
        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" /> LIVE
        </span>
      )
    }
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">UPCOMING</span>
  }

  const getAccessType = (match) => {
    const isEnded = match.status === 'ended' || match.status === 'verified' || match.status === 'pending' || match.status === 'completed' || match.status === 'closed'
    if (isEnded) return 'free'
    if (isPro) return 'pro'
    return 'locked'
  }

  if (loading && !allMatches.length) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-9 w-9 animate-spin text-amber-500" />
          <span className="text-sm font-semibold text-text-muted">Loading toss markets...</span>
        </div>
      </div>
    )
  }

  if (loadError && !allMatches.length) {
    return (
      <div className="flex h-[80vh] items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-5 text-center shadow-lg">
          <p className="text-sm font-bold text-red-400 mb-2">{loadError}</p>
          <button
            onClick={() => fetchMatches()}
            className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-500 transition-colors shadow-md"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // If a specific toss match detail is opened
  if (matchId) {
    return <TossDetail />
  }

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-[#07090e]">
      {/* ── Sidebar: Toss Leagues ── */}
      <aside className="hidden md:flex w-64 border-r border-[#1e2330] flex-col overflow-y-auto flex-shrink-0 bg-[#0a0d14]">
        <div className="px-4 py-3 border-b border-[#1e2330] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-text-primary">Toss Markets</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {Object.keys(competitions).length} Leagues
          </span>
        </div>

        {/* All Leagues Option */}
        <button
          onClick={() => handleCompSelect('ALL')}
          className={`w-full text-left px-4 py-2.5 text-xs transition-all border-l-3 flex items-center justify-between ${
            selectedComp === 'ALL'
              ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-300'
              : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🪙</span>
            <span className="text-xs font-bold truncate">All Toss Markets</span>
          </div>
          <span className="text-[11px] text-text-muted bg-white/5 px-2 py-0.5 rounded-full font-semibold">
            {allMatches.length}
          </span>
        </button>

        {/* Categorized League List */}
        {Object.entries(competitions).map(([comp, compMatches]) => {
          const compLiveCount = compMatches.filter((m) => m.inPlay || m.status === 'in-play').length
          const isSelected = selectedComp === comp

          return (
            <button
              key={comp}
              onClick={() => handleCompSelect(comp)}
              className={`w-full text-left px-4 py-2.5 text-xs transition-all border-l-3 flex items-center justify-between ${
                isSelected
                  ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-300'
                  : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="text-sm flex-shrink-0">🏏</span>
                <span className="truncate">{comp}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {compLiveCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                    {compLiveCount}
                  </span>
                )}
                <span className="text-[11px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full font-semibold">
                  {compMatches.length}
                </span>
              </div>
            </button>
          )
        })}
      </aside>

      {/* ── Mobile League Drawer ── */}
      <div className="md:hidden fixed inset-0 z-50 flex pointer-events-none">
        <div
          className="absolute inset-0 bg-black/70 transition-opacity duration-300"
          style={{ opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none' }}
          onClick={() => setMobileMenu && setMobileMenu(false)}
        />
        <div
          className="relative w-72 max-w-[80vw] h-full flex flex-col overflow-y-auto pointer-events-auto bg-[#0a0d14] border-r border-[#1e2330]"
          style={{
            transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="px-4 py-3 border-b border-[#1e2330] flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-text-primary">🪙 Toss Markets</span>
            <button onClick={() => setMobileMenu && setMobileMenu(false)} className="text-text-muted hover:text-white">
              <X size={18} />
            </button>
          </div>
          <button
            onClick={() => {
              handleCompSelect('ALL')
              if (setMobileMenu) setMobileMenu(false)
            }}
            className={`w-full text-left px-4 py-2.5 text-xs transition-all border-l-3 ${
              selectedComp === 'ALL'
                ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-300'
                : 'border-transparent text-text-secondary hover:bg-white/5'
            }`}
          >
            All Toss Markets ({allMatches.length})
          </button>
          {Object.entries(competitions).map(([comp, compMatches]) => (
            <button
              key={comp}
              onClick={() => {
                handleCompSelect(comp)
                if (setMobileMenu) setMobileMenu(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-xs transition-all border-l-3 ${
                selectedComp === comp
                  ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-300'
                  : 'border-transparent text-text-secondary hover:bg-white/5'
              }`}
            >
              {comp} ({compMatches.length})
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* =========================================================================
            MODE 1: LIVE DESK / LIVE TABLE INTERFACE (when live toggle is ON)
            ========================================================================= */}
        {isLiveMode ? (
          <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-3 md:space-y-4 fade-in">
            {/* Top Bar with Title, Live Badge, and Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0c1018] p-3 md:p-4 rounded-xl border border-[#1e2536] shadow-lg">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">🪙</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                      Live Toss Smart Money Desk
                    </h1>
                    {liveCount > 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        {liveCount} LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Real-time market volume & live odds for upcoming and in-play cricket toss markets.
                  </p>
                </div>
              </div>

              {/* Controls: Mode Status & Currency Switch */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={toggleLiveMode}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                  title="Click to toggle between Live Desk and Classic Card UI"
                >
                  <Radio size={12} className="animate-pulse text-red-400" />
                  <span>Live Mode: ON</span>
                </button>

                {/* Currency Switch */}
                <div className="flex items-center bg-[#151a26] p-0.5 rounded-lg border border-[#232b3e]">
                  <button
                    type="button"
                    onClick={() => setCurrency('€')}
                    className={`px-2.5 py-1 text-xs font-extrabold rounded-md transition-all ${
                      currency === '€'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    EUR (€)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('₹')}
                    className={`px-2.5 py-1 text-xs font-extrabold rounded-md transition-all ${
                      currency === '₹'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    INR (₹)
                  </button>
                </div>
              </div>
            </div>

            {/* Horizontal Scrollable Competition Pills Filter */}
            <div className="overflow-x-auto no-scrollbar py-1">
              <div className="flex items-center gap-1.5 whitespace-nowrap min-w-max">
                <button
                  type="button"
                  onClick={() => handleCompSelect('ALL')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                    selectedComp === 'ALL'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                      : 'bg-white/5 text-text-secondary hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  <span>All Toss Markets</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedComp === 'ALL' ? 'bg-slate-950/30 text-slate-950' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {totalDisplayCount}
                  </span>
                </button>

                {Object.keys(availableCompetitions).map((comp) => (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => handleCompSelect(comp)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      selectedComp === comp
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                        : 'bg-white/5 text-text-secondary hover:text-white hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Compact Match Table Layout matching reference image ── */}
            {displayedMatches.length > 0 ? (
              <div className="rounded-xl border border-[#1e2536] bg-[#0c1018] shadow-2xl overflow-hidden divide-y divide-[#1e2536]/80">
                {displayedMatches.map((match) => {
                  const tLoad = match.tossLoad
                  const team1 = tLoad?.team1 || {
                    name: match.matchName?.split(' v ')?.[0] || 'Team 1',
                    money: 0,
                    percent: 50,
                    odds: null,
                  }
                  const team2 = tLoad?.team2 || {
                    name: match.matchName?.split(' v ')?.[1] || 'Team 2',
                    money: 0,
                    percent: 50,
                    odds: null,
                  }

                  const dt = formatTimeAndDate(match.startTime)
                  const countdown = formatCountdown(match.startTime, now)
                  const s = (match.status || '').toLowerCase()
                  const isEnded = s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
                  const isLive = !isEnded && (match.inPlay || s === 'in-play' || s === 'live')

                  return (
                    <div
                      key={match.matchId}
                      className="px-3 py-2 md:px-4 md:py-2.5 hover:bg-[#121824]/80 transition-colors flex items-center justify-between gap-2 md:gap-4 cursor-pointer group"
                      onClick={() => navigate(`/toss/match/${match.matchId}`)}
                    >
                      {/* Left: Info icon */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/toss/match/${match.matchId}`)
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
                        {isEnded ? (
                          <span className="text-[10px] font-bold text-emerald-400 leading-tight mt-0.5">
                            COMPLETED
                          </span>
                        ) : isLive ? (
                          <span className="flex items-center gap-1 text-[10px] md:text-[11px] font-extrabold text-red-400 leading-tight mt-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                            LIVE
                          </span>
                        ) : countdown ? (
                          <span className="text-[11px] md:text-xs font-mono font-bold text-[#f59e0b] leading-tight mt-0.5">
                            {countdown}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-400 leading-tight mt-0.5">
                            COMPLETED
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

                      {/* Right: Team 1 & Team 2 Columns matching reference image */}
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
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-[#1e2536] bg-[#0c1018] p-12 text-center shadow-xl">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-3">
                  <Coins size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-1">No Toss Markets in Selected League</h3>
                <p className="text-xs text-text-muted mb-4">Select "All Toss Markets" to view all matches.</p>
                <button
                  onClick={() => handleCompSelect('ALL')}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-colors border border-amber-500/30"
                >
                  View All Toss Markets
                </button>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             MODE 2: CLASSIC / OLD TYPE UI CARDS (when live toggle is OFF)
             ========================================================================= */
          <div className="p-4 md:p-6 max-w-7xl mx-auto fade-in">
            {/* Header with Selected League and Toggle */}
            <div className="flex items-center justify-between mb-4 bg-[#0c1018] p-3 md:p-4 rounded-xl border border-[#1e2536]">
              <div>
                <h2 className="text-base sm:text-lg font-black text-text-primary">
                  {selectedComp === 'ALL' ? 'All Toss Markets' : selectedComp}
                </h2>
                <span className="text-xs text-text-muted font-medium">
                  {displayedMatches.length} markets available
                </span>
              </div>
              <button
                onClick={toggleLiveMode}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                title="Switch to Live Desk Compact View"
              >
                <Radio size={12} className="text-slate-400" />
                <span>Live Mode: OFF (Click to Enable)</span>
              </button>
            </div>

            {displayedMatches.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {displayedMatches.map((match) => {
                  const accessType = getAccessType(match)
                  const dt = fmtDateTime(match.startTime)
                  const tLoad = match.tossLoad

                  return (
                    <button
                      key={match.matchId}
                      onClick={() => {
                        navigate(`/toss/match/${match.matchId}`, {
                          state: { startTime: match.startTime ?? null },
                        })
                      }}
                      className="glass-card rounded-2xl p-4 transition-all text-left group hover:shadow-md border border-[#2c2c2e] hover:border-amber-500/40 bg-[#111622]/60 hover:bg-[#151c2c]/80"
                    >
                      {dt && <div className="text-[11px] text-text-muted mb-1 font-medium">📅 {dt}</div>}
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <span className="font-bold text-text-primary text-sm leading-snug group-hover:text-amber-300 transition-colors">
                          {match.matchName}
                        </span>
                        {getMatchStatusBadge(match)}
                      </div>
                      {tLoad?.team1 && tLoad?.team2 && (
                        <div className="flex gap-2 mb-2">
                          <div className="flex-1 rounded-lg px-2 py-1 bg-[#1a1a1a] border border-[#2c2c2e]">
                            <div className="text-[10px] font-semibold text-text-secondary truncate mb-0.5">
                              {tLoad.team1.name}
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className="text-emerald-400">▲ {formatOdds(tLoad.team1.odds)}</span>
                              <span className="text-slate-400">{tLoad.team1.percent}%</span>
                            </div>
                          </div>
                          <div className="flex-1 rounded-lg px-2 py-1 bg-[#1a1a1a] border border-[#2c2c2e]">
                            <div className="text-[10px] font-semibold text-text-secondary truncate mb-0.5">
                              {tLoad.team2.name}
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className="text-emerald-400">▲ {formatOdds(tLoad.team2.odds)}</span>
                              <span className="text-slate-400">{tLoad.team2.percent}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="text-xs text-text-muted mb-3">
                        Matched:{' '}
                        <span className="text-text-secondary font-semibold">
                          ₹{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        {accessType === 'free' ? (
                          <span className="text-xs font-semibold text-emerald-400">✅ Free access</span>
                        ) : accessType === 'pro' ? (
                          <span className="text-xs font-semibold text-amber-400">⭐ Pro access</span>
                        ) : (
                          <span className="text-xs font-semibold flex items-center gap-1 text-red-400">
                            <Lock size={11} /> Pro Required
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-amber-400 transition-colors" />
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-[50vh] items-center justify-center text-center">
                <div>
                  <Activity className="h-10 w-10 text-text-muted mx-auto mb-2" />
                  <h2 className="text-xl font-bold text-white">No Toss Markets Found</h2>
                  <p className="text-text-muted mt-1">Waiting for live data...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
