import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Info, ChevronRight, ArrowLeft, Radio, Coins, ShieldCheck, Flame } from 'lucide-react'
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

export default function TossPage() {
  const navigate = useNavigate()
  const { user } = useOutletContext()
  const isPro = hasProAccess(user)
  const { matchId } = useParams()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [allMatches, setAllMatches] = useState([])
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [now, setNow] = useState(() => Date.now())
  const [currency, setCurrency] = useState('€') // '€' or '₹'

  // Clock ticker for real-time countdown
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

        // Strictly filter ONLY live or upcoming matches (never ended or verified)
        const isLiveOrUpcoming = (m) => {
          if (m.status === 'ended' || m.status === 'verified' || m.status === 'closed') return false
          if (m.inPlay || m.status === 'in-play') return true
          if (m.status === 'upcoming' || m.status === 'active') return true
          if (m.startTime) {
            const ms = Number(m.startTime)
            if (!isNaN(ms)) {
              return ms >= Date.now() - 4 * 60 * 60 * 1000
            }
          }
          return true
        }

        // Filter only matches that have toss data available AND are live/upcoming
        const validMatches = rawList
          .filter((m) => (m.tossLoad || m.inPlay || (m.runners && m.runners.length >= 2)) && isLiveOrUpcoming(m))
          .sort((a, b) => {
            const aLive = a.inPlay || a.status === 'in-play'
            const bLive = b.inPlay || b.status === 'in-play'
            if (aLive && !bLive) return -1
            if (!aLive && bLive) return 1
            return (a.startTime || 0) - (b.startTime || 0)
          })

        setAllMatches(validMatches)

        // Group into competitions that only have live/upcoming toss data
        const grouped = {}
        validMatches.forEach((m) => {
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
      })
      .catch((err) => {
        setLoadError(err?.detail || 'Toss live load data temporarily unavailable. Please try again.')
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

  // Filter matches based on selected competition
  const displayedMatches = useMemo(() => {
    if (selectedComp === 'ALL') {
      return allMatches
    }
    return competitions[selectedComp] || []
  }, [selectedComp, allMatches, competitions])

  // Count active live matches
  const liveCount = useMemo(() => {
    return allMatches.filter((m) => m.inPlay || m.status === 'in-play').length
  }, [allMatches])

  if (loading && !allMatches.length) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-9 w-9 animate-spin text-amber-500" />
          <span className="text-sm font-semibold text-text-muted">Loading live toss load...</span>
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

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-[#07090e]">
      {/* ── Sidebar: Only leagues with available toss data ── */}
      <aside className="hidden md:flex w-64 border-r border-[#1e2330] flex-col overflow-y-auto flex-shrink-0 bg-[#0a0d14]">
        <div className="px-4 py-3.5 border-b border-[#1e2330] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-text-primary">Toss Leagues</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {Object.keys(competitions).length} Active
          </span>
        </div>

        {/* All Leagues Option */}
        <button
          onClick={() => handleCompSelect('ALL')}
          className={`w-full text-left px-4 py-3 text-sm transition-all border-l-3 flex items-center justify-between ${
            selectedComp === 'ALL'
              ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-300'
              : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🌐</span>
            <span className="text-xs font-bold truncate">All Toss Leagues</span>
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-text-muted font-semibold">
            {allMatches.length}
          </span>
        </button>

        {/* Dynamic Leagues with Toss Data */}
        <div className="divide-y divide-[#1e2330]/40">
          {Object.entries(competitions).map(([comp, compMatches]) => {
            const hasLive = compMatches.some((m) => m.inPlay || m.status === 'in-play')
            const isSelected = selectedComp === comp

            return (
              <button
                key={comp}
                onClick={() => handleCompSelect(comp)}
                className={`w-full text-left px-4 py-3 transition-all border-l-3 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-semibold'
                    : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary'
                }`}
              >
                <div className="font-semibold truncate text-xs text-text-primary">{comp}</div>
                <div className="text-[11px] text-text-muted mt-1 flex items-center gap-2">
                  <span>{compMatches.length} matches</span>
                  {hasLive && (
                    <span className="flex items-center gap-1 font-bold text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      LIVE
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 overflow-y-auto bg-[#07090e]">
        {matchId ? (
          <div className="p-4">
            <button
              onClick={() => navigate('/toss')}
              className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-text-secondary hover:text-white transition-colors border border-white/10"
            >
              <ArrowLeft size={14} /> Back to Live Toss Load
            </button>
            <TossDetail />
          </div>
        ) : (
          <div className="p-3 md:p-6 max-w-6xl mx-auto fade-in">
            {/* ── Top Header matching reference image: Live toss load with glowing indicator ── */}
            <div className="rounded-2xl p-4 md:p-5 mb-5 border border-[#232a3b] bg-gradient-to-r from-[#121724] via-[#0d121c] to-[#121724] shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#f59e0b] drop-shadow-sm flex items-center gap-2.5">
                    <span>Live toss load</span>
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 shadow-md shadow-amber-500/50" />
                    </span>
                  </h1>

                  {liveCount > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                      {liveCount} LIVE
                    </span>
                  )}
                </div>

                {/* Right controls: Currency toggle & Market stats */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted font-medium">Currency:</span>
                  <div className="flex rounded-lg bg-[#181f2f] border border-[#2a3449] p-0.5">
                    <button
                      onClick={() => setCurrency('€')}
                      className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                        currency === '€' ? 'bg-amber-500 text-black shadow' : 'text-text-secondary hover:text-white'
                      }`}
                    >
                      € (EUR)
                    </button>
                    <button
                      onClick={() => setCurrency('₹')}
                      className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                        currency === '₹' ? 'bg-amber-500 text-black shadow' : 'text-text-secondary hover:text-white'
                      }`}
                    >
                      ₹ (INR)
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile league pill selector */}
              <div className="md:hidden mt-3 pt-3 border-t border-[#1e2536] flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                <button
                  onClick={() => handleCompSelect('ALL')}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    selectedComp === 'ALL'
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/5 text-text-secondary border border-white/10'
                  }`}
                >
                  All Leagues ({allMatches.length})
                </button>
                {Object.keys(competitions).map((comp) => (
                  <button
                    key={comp}
                    onClick={() => handleCompSelect(comp)}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      selectedComp === comp
                        ? 'bg-amber-500 text-black'
                        : 'bg-white/5 text-text-secondary border border-white/10'
                    }`}
                  >
                    {comp}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Match Cards Table Layout matching reference image ── */}
            {displayedMatches.length > 0 ? (
              <div className="rounded-2xl border border-[#1e2536] bg-[#0c1018] shadow-2xl overflow-hidden divide-y divide-[#1e2536]/80">
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
                  const isLive = match.inPlay || match.status === 'in-play'
                  const isEnded = match.status === 'ended' || match.status === 'verified'

                  return (
                    <div
                      key={match.matchId}
                      className="p-3.5 md:p-4 hover:bg-[#121824]/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group"
                      onClick={() => navigate(`/toss/match/${match.matchId}`)}
                    >
                      {/* Left: Info icon, Time, Countdown, League, Match name */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/toss/match/${match.matchId}`)
                          }}
                          className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border border-white/20 hover:border-amber-400/60 text-white/60 hover:text-amber-300 flex items-center justify-center transition-colors bg-white/5"
                          title="View Toss AI Predictions & Smart Money Flow"
                        >
                          <Info size={13} />
                        </button>

                        <div className="min-w-0">
                          {/* Time & Countdown Header */}
                          <div className="flex items-center gap-2.5 flex-wrap mb-1">
                            {dt && (
                              <span className="text-xs md:text-sm font-black text-[#f59e0b] tracking-tight">
                                {dt}
                              </span>
                            )}

                            {isLive ? (
                              <span className="flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                                LIVE
                              </span>
                            ) : countdown ? (
                              <span className="text-xs font-mono font-bold text-[#fbbf24] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {countdown}
                              </span>
                            ) : isEnded ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                COMPLETED
                              </span>
                            ) : null}
                          </div>

                          {/* League Name */}
                          <div className="text-[11px] md:text-xs text-slate-400 font-medium tracking-wide truncate mb-1">
                            {match.competitionName || 'T20 Cricket League'}
                          </div>

                          {/* Match Title */}
                          <div className="text-sm md:text-base font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                            {match.matchName}
                          </div>
                        </div>
                      </div>

                      {/* Right: Team 1 & Team 2 Columns matching reference image */}
                      <div className="flex items-center justify-between md:justify-end gap-6 sm:gap-10 pt-2 md:pt-0 border-t md:border-t-0 border-[#1e2536]/60 flex-shrink-0">
                        {/* Team 1 Column */}
                        <div className="flex flex-col items-center min-w-[100px] sm:min-w-[130px] text-center">
                          <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px] sm:max-w-[140px] mb-1">
                            {team1.name}
                          </span>
                          <span className="text-sm md:text-base font-black text-white tracking-tight mb-1.5">
                            {team1.money?.toLocaleString('en-IN') || '0'}
                            {currency}
                          </span>
                          {/* Percentage Badge */}
                          <span
                            className={`text-xs font-bold px-3 py-0.5 rounded-full mb-1 inline-block transition-transform group-hover:scale-105 ${
                              team1.percent >= 50
                                ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981] shadow-sm shadow-[#10b981]/20'
                                : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
                            }`}
                          >
                            {team1.percent}%
                          </span>
                          {/* Odds */}
                          <div className="flex items-center justify-center gap-1 text-xs md:text-sm font-bold text-[#10b981]">
                            <span className="text-[10px]">▲</span>
                            <span>{team1.odds != null ? team1.odds : '—'}</span>
                          </div>
                        </div>

                        {/* Team 2 Column */}
                        <div className="flex flex-col items-center min-w-[100px] sm:min-w-[130px] text-center">
                          <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px] sm:max-w-[140px] mb-1">
                            {team2.name}
                          </span>
                          <span className="text-sm md:text-base font-black text-white tracking-tight mb-1.5">
                            {team2.money?.toLocaleString('en-IN') || '0'}
                            {currency}
                          </span>
                          {/* Percentage Badge */}
                          <span
                            className={`text-xs font-bold px-3 py-0.5 rounded-full mb-1 inline-block transition-transform group-hover:scale-105 ${
                              team2.percent >= 50
                                ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981] shadow-sm shadow-[#10b981]/20'
                                : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
                            }`}
                          >
                            {team2.percent}%
                          </span>
                          {/* Odds */}
                          <div className="flex items-center justify-center gap-1 text-xs md:text-sm font-bold text-[#10b981]">
                            <span className="text-[10px]">▲</span>
                            <span>{team2.odds != null ? team2.odds : '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-[#1e2536] bg-[#0c1018] p-12 text-center">
                <Coins className="h-10 w-10 text-amber-500/40 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">No Toss Markets in this League</h3>
                <p className="text-xs text-text-muted mb-4">
                  Showing only leagues with verified toss data. Check back when a match opens.
                </p>
                <button
                  onClick={() => handleCompSelect('ALL')}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 text-xs font-bold transition-all"
                >
                  View All Toss Leagues
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
