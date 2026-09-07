import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Info, ChevronRight, Trophy, Radio, Lock, Activity, Menu, X, Search, Zap, Flame, SlidersHorizontal, TrendingUp } from 'lucide-react'
import { getCricketMatches, getCricketOddsBulk, getTossMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import MatchDetail from './MatchDetail'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'
import { CricketBallIcon, formatRateBox, MarketRateDisplay, RunningBallBadge } from '../components/CrexLiveSection'

const STORAGE_KEY = 'cricket_selected_comp'

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

const getTeamCrexScore = (crex, teamName, isTeam1) => {
  if (!crex) return null
  const s1 = crex.score1
  const s2 = crex.score2
  if (!s1 && !s2) return null

  // If crex team names are available, match tokens to guarantee alignment
  if (crex.team1Name && teamName) {
    const tNorm = (teamName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const c1Norm = (crex.team1Name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const c2Norm = (crex.team2Name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const c1Short = (crex.team1Short || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const c2Short = (crex.team2Short || '').toLowerCase().replace(/[^a-z0-9]/g, '')

    const m1 = (c1Norm && (tNorm.includes(c1Norm) || c1Norm.includes(tNorm))) ||
               (c1Short && c1Short.length >= 2 && (tNorm.includes(c1Short) || c1Short.includes(tNorm)))
    const m2 = (c2Norm && (tNorm.includes(c2Norm) || c2Norm.includes(tNorm))) ||
               (c2Short && c2Short.length >= 2 && (tNorm.includes(c2Short) || c2Short.includes(tNorm)))

    if (m1 && !m2) return s1
    if (m2 && !m1) return s2
  }

  return isTeam1 ? s1 : s2
}

export default function CricketPage() {
  const navigate = useNavigate()
  const { user, mobileMenu, setMobileMenu } = useOutletContext() || {}
  const isPro = hasProAccess(user)
  const { matchId } = useParams()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [allMatches, setAllMatches] = useState([])
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [now, setNow] = useState(() => Date.now())
  const [oddsMap, setOddsMap] = useState({})
  const [tossMatchIds, setTossMatchIds] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const scrollRef = useRef(null)

  // Synchronize with outlet mobileMenu
  useEffect(() => {
    if (typeof mobileMenu === 'boolean') {
      setSidebarOpen(mobileMenu)
    }
  }, [mobileMenu])

  const closeSidebar = () => {
    setSidebarOpen(false)
    if (typeof setMobileMenu === 'function') {
      setMobileMenu(false)
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      if (typeof setMobileMenu === 'function') {
        setMobileMenu(next)
      }
      return next
    })
  }

  // Close sidebar on Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  // Real-time 1s ticker for countdown clocks
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Toss match IDs for indicator in tournament pills
  useEffect(() => {
    getTossMatches()
      .then((data) => {
        const tossArr = Array.isArray(data?.matches)
          ? data.matches
          : Array.isArray(data?.matches?.matches)
          ? data.matches.matches
          : []
        if (tossArr.length) {
          setTossMatchIds(new Set(tossArr.map((m) => m.matchId)))
        }
      })
      .catch(() => {})
  }, [])

  const fetchMatches = () => {
    getCricketMatches()
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
            || m.crex?.status === 'completed'
            || m.crex?.scorecard?.status === 'completed'
            || /won by|won the|match drawn|match tied|no result/i.test(m.crex?.statusText || '')
          if (isEnded) return 3
          const isLive = m.inPlay || s === 'in-play' || s === 'live'
          if (isLive) return 1
          return 2
        }

        // Sort: Live (1) → Upcoming (2) → Ended (3)
        const sorted = rawList.slice().sort((a, b) => {
          const tierA = getMatchTier(a)
          const tierB = getMatchTier(b)
          if (tierA !== tierB) return tierA - tierB
          return (a.startTime || 0) - (b.startTime || 0)
        })

        setAllMatches(sorted)

        // Group matches by competition
        const grouped = {}
        const validComps = new Set()
        sorted.forEach((m) => {
          if (!String(m.matchId).startsWith('crex-')) {
            validComps.add(m.competitionName || 'Other')
          }
        })

        sorted.forEach((m) => {
          const comp = m.competitionName || 'Other'
          if (validComps.has(comp)) {
            if (!grouped[comp]) grouped[comp] = []
            grouped[comp].push(m)
          }
        })

        setCompetitions(grouped)

        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved && (saved === 'ALL' || grouped[saved])) {
          setSelectedComp(saved)
        } else {
          setSelectedComp('ALL')
        }
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(err?.detail || 'Live match data is temporarily unavailable. Please try again.')
        setLoading(false)
      })
  }

  useEffect(() => {
    setLoading(true)
    fetchMatches()
    return startVisibleInterval(fetchMatches, LIVE_POLL_MS)
  }, [])

  // Bulk odds for cards
  useEffect(() => {
    if (matchId || !isPro) return

    const matches = (selectedComp === 'ALL' ? allMatches : competitions[selectedComp]) || []
    const ids = matches.slice(0, 30).map((m) => m.matchId)
    if (!ids.length) return

    getCricketOddsBulk(ids)
      .then((data) => {
        if (data?.oddsMap) setOddsMap(data.oddsMap)
      })
      .catch(() => {})
  }, [selectedComp, competitions, allMatches, matchId, isPro])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    closeSidebar()
    if (matchId) {
      navigate('/cricket')
    }
  }

  const isEndedMatch = (m) => {
    const s = (m.status || '').toLowerCase()
    if (s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed') return true
    if (m.crex?.status === 'completed') return true
    if (m.crex?.scorecard?.status === 'completed') return true
    if (/won by|won the|match drawn|match tied|no result/i.test(m.crex?.statusText || '')) return true
    return false
  }

  const isLiveMatch = (m) => {
    if (isEndedMatch(m)) return false
    const s = (m.status || '').toLowerCase()
    return m.inPlay || s === 'in-play' || s === 'live'
  }

  const hasSearch = Boolean(searchQuery.trim())

  // Filter matches:
  // When search is active, search ALL matches across ALL leagues (not league-wise)
  // When normal mode is active, filter by selected competition from the sidebar
  const displayedMatches = useMemo(() => {
    let list = []
    if (hasSearch) {
      const q = searchQuery.toLowerCase().trim()
      list = allMatches.filter((m) =>
        (m.matchName || '').toLowerCase().includes(q) ||
        (m.competitionName || '').toLowerCase().includes(q) ||
        (m.crex?.team1Name || '').toLowerCase().includes(q) ||
        (m.crex?.team2Name || '').toLowerCase().includes(q) ||
        (m.crex?.team1Short || '').toLowerCase().includes(q) ||
        (m.crex?.team2Short || '').toLowerCase().includes(q) ||
        (m.team1 || '').toLowerCase().includes(q) ||
        (m.team2 || '').toLowerCase().includes(q)
      )
    } else {
      list = selectedComp === 'ALL' ? allMatches : (competitions[selectedComp] || [])
    }

    return list.slice().sort((a, b) => {
      const aLive = isLiveMatch(a)
      const bLive = isLiveMatch(b)
      if (aLive && !bLive) return -1
      if (!aLive && bLive) return 1
      const aEnded = isEndedMatch(a)
      const bEnded = isEndedMatch(b)
      if (!aEnded && bEnded) return -1
      if (aEnded && !bEnded) return 1
      return (a.startTime || 0) - (b.startTime || 0)
    })
  }, [selectedComp, allMatches, competitions, searchQuery, hasSearch])

  const totalDisplayCount = useMemo(() => {
    return allMatches.length
  }, [allMatches])

  const availableCompetitions = useMemo(() => {
    return competitions
  }, [competitions])

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

  if (!matchId && loading && !allMatches.length) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-9 w-9 animate-spin text-amber-500" />
          <span className="text-sm font-semibold text-text-muted">Loading matches...</span>
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
            onClick={() => fetchMatches()}
            className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-500 transition-colors shadow-md"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Reusable leagues list for both desktop permanent sidebar and mobile drawer
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
          onClick={() => handleCompSelect('ALL')}
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
              <div className="text-[9px] text-slate-500 font-mono truncate">All active tournaments</div>
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

        {/* Tournament items */}
        {Object.entries(competitions).map(([comp, compMatches]) => {
          const compLiveCount = compMatches.filter((m) => isLiveMatch(m)).length
          const isSelected = selectedComp === comp && !hasSearch
          const hasToss = compMatches.some((m) => tossMatchIds.has(m.matchId))

          return (
            <button
              key={comp}
              type="button"
              onClick={() => handleCompSelect(comp)}
              className={`w-full text-left px-3 py-2 transition-all border-l-[3px] flex items-center justify-between gap-1.5 border-b border-[#1b2234]/25 ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-500/15 text-white font-bold'
                  : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] truncate leading-tight ${isSelected ? 'text-emerald-300 font-bold' : 'text-slate-200 font-medium'}`}>
                  {comp}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1 font-mono">
                  <span>{compMatches.length} matches</span>
                  {compLiveCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-rose-400 font-bold flex items-center gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
                        {compLiveCount} live
                      </span>
                    </>
                  )}
                </div>
              </div>
              {hasToss && (
                <span className="text-[8px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1 rounded shrink-0">
                  T
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-[#07090e]">
      {/* ── Desktop Permanent Leagues Sidebar (Compact & sleeker on big screens) ── */}
      <aside className="hidden md:flex w-52 lg:w-56 h-full bg-[#080b14] border-r border-[#1b2234] flex-col shrink-0 select-none">
        <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🏏</span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-white">Cricket Leagues</div>
              <div className="text-[9px] text-slate-400 font-mono">
                {Object.keys(competitions).length} available leagues
              </div>
            </div>
          </div>
        </div>

        {renderLeaguesList()}

        <div className="p-2 border-t border-[#1b2234] bg-[#0a0d18] text-center text-[9px] text-slate-500 shrink-0">
          Click any league to filter matches
        </div>
      </aside>

      {/* ── Mobile Sliding Leagues Drawer (Hidden on big screens, drawer on mobile) ── */}
      <div
        className={`md:hidden fixed inset-0 z-50 flex pointer-events-none transition-all duration-300 ${
          sidebarOpen ? 'pointer-events-auto' : ''
        }`}
        aria-hidden={!sidebarOpen}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 ease-out ${
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={closeSidebar}
        />

        {/* Sliding Drawer Panel */}
        <aside
          className={`relative w-64 max-w-[80vw] h-full bg-[#080b14] border-r border-[#1b2234] flex flex-col pointer-events-auto shadow-2xl shadow-black/95 transition-transform duration-300 select-none ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🏏</span>
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-white">Cricket Leagues</div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {Object.keys(competitions).length} available leagues
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={closeSidebar}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Close leagues sidebar"
            >
              <X size={15} />
            </button>
          </div>

          {renderLeaguesList()}

          {/* Footer */}
          <div className="p-2 border-t border-[#1b2234] bg-[#0a0d18] text-center text-[9px] text-slate-500 shrink-0">
            Click any league to filter • Closes automatically
          </div>
        </aside>
      </div>

      {/* ── Main Content Area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#07090e]">
        {matchId ? (
          <MatchDetail sport="cricket" />
        ) : (
          <>
            {/* Compact Cricket Hub Sticky Control Bar */}
            <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#07090e]/95 border-b border-[#1b2030] px-3 sm:px-4 py-2">
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            {/* Leagues Drawer Trigger Button — Only on mobile */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121624] hover:bg-[#1a2034] border border-[#1f263c] hover:border-amber-500/50 text-xs font-bold text-white transition-all shrink-0 active:scale-95 shadow-sm group"
              title="Browse cricket leagues and tournaments"
            >
              <Menu size={14} className="text-amber-400 group-hover:scale-110 transition-transform" />
              <span>Leagues</span>
              <span className="text-[10px] font-mono text-amber-300 font-semibold bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded-full max-w-[130px] truncate">
                {selectedComp === 'ALL' ? 'All Matches' : selectedComp}
              </span>
            </button>

            {/* Desktop Active League Indicator */}
            <div className="hidden md:flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">League:</span>
              <span className="text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg">
                {selectedComp === 'ALL' ? 'All Tournaments' : selectedComp}
              </span>
            </div>

            {/* Global Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any team or match across all leagues..."
                className="w-full bg-[#101420] border border-[#1f273b] focus:border-amber-500/60 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
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

        {/* Search status banner if query is typed */}
        {hasSearch && (
          <div className="px-3 sm:px-4 py-2 bg-[#121727] border-b border-[#1e263d] flex items-center justify-between text-xs text-slate-300">
            <span>
              Searching all leagues for "<span className="text-amber-300 font-bold">{searchQuery}</span>" ({displayedMatches.length} found)
            </span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-amber-400 hover:text-amber-300 font-bold ml-2 underline"
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Match Cards Grid (Compact & Sleek) ── */}
        <div className="p-2.5 sm:p-3 md:p-3.5 w-full space-y-3.5 fade-in">
          {displayedMatches.length > 0 ? (() => {
            const liveMatches = displayedMatches.filter(isLiveMatch)
            const upcomingMatches = displayedMatches.filter((m) => !isLiveMatch(m) && !isEndedMatch(m))
            const endedMatches = displayedMatches.filter(isEndedMatch)

            const renderMatchCard = (match) => {
              const mLoad = match.matchLoad
              const t1Name = match.matchName?.split(' v ')?.[0] || 'Team 1'
              const t2Name = match.matchName?.split(' v ')?.[1] || 'Team 2'

              const snap = match.snapshot
              const tr1 = snap?.teams?.[t1Name]?.trades || snap?.teams?.[snap?.teamNames?.[0]]?.trades || []
              const tr2 = snap?.teams?.[t2Name]?.trades || snap?.teams?.[snap?.teamNames?.[1]]?.trades || []

              const tradeVol1 = tr1.length > 0 ? tr1.reduce((s, t) => s + (parseFloat(t.size) || 0), 0) : 0
              const tradeVol2 = tr2.length > 0 ? tr2.reduce((s, t) => s + (parseFloat(t.size) || 0), 0) : 0

              const vol1 = mLoad?.team1?.money || tradeVol1 || snap?.teams?.[t1Name]?.totalBet || snap?.teams?.[snap?.teamNames?.[0]]?.totalBet || snap?.preMatchTotalBets?.team1 || match.preMatchVolume?.team1?.total || 0
              const vol2 = mLoad?.team2?.money || tradeVol2 || snap?.teams?.[t2Name]?.totalBet || snap?.teams?.[snap?.teamNames?.[1]]?.totalBet || snap?.preMatchTotalBets?.team2 || match.preMatchVolume?.team2?.total || 0

              let finalVol1 = vol1
              let finalVol2 = vol2
              if (finalVol1 === 0 && finalVol2 === 0 && (match.totalMatched || 0) > 0) {
                finalVol1 = Math.round(match.totalMatched * 0.5)
                finalVol2 = Math.round(match.totalMatched * 0.5)
              }

              const sorted1 = [...tr1].sort((a, b) => b.updatedAt - a.updatedAt)
              const sorted2 = [...tr2].sort((a, b) => b.updatedAt - a.updatedAt)

              const odds1 = mLoad?.team1?.odds || (sorted1[0]?.price ? parseFloat(sorted1[0].price) : null) || match.runners?.[0]?.price || null
              const odds2 = mLoad?.team2?.odds || (sorted2[0]?.price ? parseFloat(sorted2[0].price) : null) || match.runners?.[1]?.price || null

              const tot = finalVol1 + finalVol2
              const pct1 = (mLoad?.team1?.percent && mLoad?.team1?.money > 0) ? mLoad.team1.percent : (tot > 0 ? Math.round((finalVol1 / tot) * 100) : 50)
              const pct2 = (mLoad?.team2?.percent && mLoad?.team2?.money > 0) ? mLoad.team2.percent : (tot > 0 ? (100 - pct1) : 50)

              const team1 = {
                name: mLoad?.team1?.name || t1Name,
                money: finalVol1,
                percent: pct1,
                odds: odds1,
              }
              const team2 = {
                name: mLoad?.team2?.name || t2Name,
                money: finalVol2,
                percent: pct2,
                odds: odds2,
              }

              const score1 = getTeamCrexScore(match.crex, team1.name, true)
              const score2 = getTeamCrexScore(match.crex, team2.name, false)

              const dt = formatTimeAndDate(match.startTime)
              const countdown = formatCountdown(match.startTime, now)
              const isEnded = isEndedMatch(match)
              const isLive = isLiveMatch(match)
              const accessType = getAccessType(match)

              return (
                <div
                  key={match.matchId}
                  onClick={() => navigate(`/cricket/match/${match.matchId}`, { state: { startTime: match.startTime ?? null } })}
                  className="rounded-xl border border-amber-500/40 hover:border-amber-400 bg-[#090c16] hover:bg-[#0f1320] p-2.5 sm:p-3 transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-md hover:shadow-amber-500/10 flex flex-col gap-2"
                >
                  {/* Top Row: League + Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 truncate uppercase tracking-wider flex-1">
                      {match.competitionName || 'Cricket'}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isLive ? (
                        <span className="flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                          LIVE
                        </span>
                      ) : countdown ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          ⏰ {countdown}
                        </span>
                      ) : isEnded ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          COMPLETED
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">
                          {dt}
                        </span>
                      )}

                      {accessType === 'free' ? (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Free</span>
                      ) : accessType === 'pro' ? (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">Pro</span>
                      ) : (
                        <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 flex items-center gap-0.5">
                          <Lock size={9} /> Pro
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Teams, Scores, Volumes, and Odds */}
                  <div className="space-y-1.5">
                    {/* Team 1 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs sm:text-[13px] font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                          {team1.name}
                        </span>
                        {score1 && (
                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.2 rounded shrink-0">
                            {score1}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400 font-medium">
                          €{formatVolStr(team1.money)}
                        </span>
                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                          team1.percent >= 50
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800/80 text-slate-400'
                        }`}>
                          {team1.percent}%
                        </span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400 bg-[#0e1f1a] border border-emerald-800/40 px-1.5 py-0.5 rounded-md min-w-[40px] text-center">
                          {team1.odds ? `▲ ${formatOdds(team1.odds)}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Micro Inflow Bar */}
                    <div className="h-1 w-full bg-[#151928] rounded-full overflow-hidden flex">
                      <div style={{ width: `${team1.percent}%` }} className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300" />
                      <div style={{ width: `${team2.percent}%` }} className="bg-gradient-to-r from-sky-500 to-blue-500 h-full transition-all duration-300" />
                    </div>

                    {/* Team 2 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs sm:text-[13px] font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                          {team2.name}
                        </span>
                        {score2 && (
                          <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/60 border border-sky-800/40 px-1.5 py-0.2 rounded shrink-0">
                            {score2}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400 font-medium">
                          €{formatVolStr(team2.money)}
                        </span>
                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                          team2.percent >= 50
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800/80 text-slate-400'
                        }`}>
                          {team2.percent}%
                        </span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400 bg-[#0e1f1a] border border-emerald-800/40 px-1.5 py-0.5 rounded-md min-w-[40px] text-center">
                          {team2.odds ? `▲ ${formatOdds(team2.odds)}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Live Rate Box or Match Status Text + Details Link */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#1b2234]/70 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {match.crex?.odds?.rate ? (
                        <div className="flex items-center gap-1 bg-[#101422] border border-[#21293e] px-1.5 py-0.5 rounded-md" title="Live Market Rate">
                          <span className="text-[9px] font-bold text-slate-400 truncate max-w-[70px]">
                            {match.crex.odds.rateTeam || match.crex.team1Short || 'Rate'}:
                          </span>
                          <CricketBallIcon size={11} />
                          <span className="px-1.5 py-0.2 bg-white text-slate-950 font-black text-[9px] rounded font-mono leading-none">
                            {formatRateBox(match.crex.odds.rate)}
                          </span>
                          <span className="px-1.5 py-0.2 bg-white text-slate-950 font-black text-[9px] rounded font-mono leading-none">
                            {formatRateBox(match.crex.odds.rate2 || match.crex.odds.rate)}
                          </span>
                        </div>
                      ) : match.crex?.statusText ? (
                        <span className="text-[10px] text-amber-300 font-medium truncate">
                          ⚡ {match.crex.statusText}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono truncate">
                          €{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'} matched
                        </span>
                      )}

                      {match.crex?.runningBall && (
                        <RunningBallBadge runningBall={match.crex.runningBall} size="sm" />
                      )}
                    </div>

                    <span className="text-[11px] font-bold text-amber-400 group-hover:text-amber-300 flex items-center gap-0.5 shrink-0">
                      <span>Details</span>
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div className="space-y-4">
                {/* 1. Live Matches */}
                {liveMatches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 px-0.5">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-black uppercase tracking-wider text-red-400">Live In-Play Matches</span>
                      <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/50 border border-red-800/40 px-1.5 py-0.2 rounded-full">
                        {liveMatches.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {liveMatches.map(renderMatchCard)}
                    </div>
                  </div>
                )}

                {/* 2. Upcoming Fixtures */}
                {upcomingMatches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 px-0.5">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-sky-400">Upcoming Fixtures</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-[#161a28] px-1.5 py-0.2 rounded-full">
                        {upcomingMatches.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {upcomingMatches.map(renderMatchCard)}
                    </div>
                  </div>
                )}

                {/* 3. Completed Matches */}
                {endedMatches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 px-0.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Completed Matches</span>
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-1.5 py-0.2 rounded-full">
                        {endedMatches.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {endedMatches.map(renderMatchCard)}
                    </div>
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="rounded-xl border border-[#1e2334] bg-[#0c0e17] p-8 text-center my-6">
              <Trophy size={24} className="text-amber-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white mb-1">No Matches Found</h3>
              <p className="text-xs text-[#8e8e93]">
                {searchQuery ? `No matches match "${searchQuery}". Try a different team or league name.` : 'Check back soon for new live or scheduled fixtures.'}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 px-3.5 py-1.5 rounded-lg bg-[#1e2436] hover:bg-[#28314a] text-xs font-bold text-white transition-colors"
                >
                  Clear Search
                </button>
              )}
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  )
}
