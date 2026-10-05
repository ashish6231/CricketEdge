import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Activity, LoaderCircle, ChevronRight, Lock, BarChart3 } from 'lucide-react'
import { hasProAccess } from '../lib/subscriptionAccess'
import SessionDetail from './SessionDetail'
import { getSocket, releaseFeed, requestSessionFeed } from '../socket'
import { getSessionMatches } from '../api'

const STORAGE_KEY = 'session_selected_comp_v2'
const SCROLL_KEY = 'session_scroll_pos'
const ALL_COMPETITIONS = '__all__'
const ENDED_STATUSES = new Set(['ended', 'completed', 'closed', 'verified', 'pending'])

const getSessionStatus = (match) => {
  const status = String(match?.status || '').toLowerCase()
  if (ENDED_STATUSES.has(status)) return 'completed'
  if (match?.inPlay || status === 'live' || status === 'in-play') return 'live'
  return 'upcoming'
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]

const sortSessionMatches = (a, b) => {
  const aStatus = getSessionStatus(a)
  const bStatus = getSessionStatus(b)
  const tier = { live: 1, upcoming: 2, completed: 3 }
  if (tier[aStatus] !== tier[bStatus]) return tier[aStatus] - tier[bStatus]
  const aTime = new Date(a.startTime || 0).getTime() || 0
  const bTime = new Date(b.startTime || 0).getTime() || 0
  return aStatus === 'upcoming' ? aTime - bTime : bTime - aTime
}

const fmtDateTime = (ts) => {
  if (!ts) return null
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date} • ${time}`
}

export default function SessionPage() {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const { user, mobileMenu, setMobileMenu } = useOutletContext()
  const isPro = hasProAccess(user)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || ALL_COMPETITIONS)
  const [statusFilter, setStatusFilter] = useState('live')
  const scrollRef = useRef(null)

  useEffect(() => {
    const socket = getSocket()
    let cancelled = false
    let receivedFeed = false

    const applySessionMatches = (payload) => {
      if (cancelled) return
      if (!payload?.matches) return
      setLoadError('')
      const grouped = {}
      payload.matches.forEach(m => {
        const comp = m.competitionName || 'Other'
        if (!grouped[comp]) grouped[comp] = []
        grouped[comp].push(m)
      })
      Object.keys(grouped).forEach(comp => {
        grouped[comp].sort(sortSessionMatches)
      })
      setCompetitions(grouped)
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === ALL_COMPETITIONS || (saved && grouped[saved])) setSelectedComp(saved)
      else setSelectedComp(ALL_COMPETITIONS)
      setLoading(false)
    }

    getSessionMatches()
      .then(payload => {
        if (!receivedFeed) applySessionMatches(payload)
      })
      .catch(error => {
        if (cancelled || receivedFeed) return
        setLoadError(error?.detail || 'Session data is temporarily unavailable. Please try again.')
        setLoading(false)
      })

    const onSessionUpdate = (payload) => {
      receivedFeed = true
      applySessionMatches(payload)
    }

    socket.on('session:matches', onSessionUpdate)

    if (socket.connected) {
      requestSessionFeed()
    } else {
      socket.once('connect', requestSessionFeed)
    }

    return () => {
      cancelled = true
      socket.off('session:matches', onSessionUpdate)
      socket.off('connect', requestSessionFeed)
      releaseFeed('session')
    }
  }, [])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    navigate('/session')
  }

  const getStatusBadge = (match) => {
    const status = getSessionStatus(match)
    if (status === 'live') {
      return (
        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
          <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#f59e0b' }} /> LIVE
        </span>
      )
    }
    if (status === 'completed') {
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>COMPLETED</span>
    }
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>UPCOMING</span>
  }

  const getAccessType = (match) => {
    if (getSessionStatus(match) === 'completed') return 'free'
    if (isPro) return 'pro'
    return 'locked'
  }

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  const allMatches = Object.values(competitions).flat().sort(sortSessionMatches)
  const currentMatches = selectedComp === ALL_COMPETITIONS
    ? allMatches
    : (competitions[selectedComp] || [])
  const statusCounts = currentMatches.reduce((counts, match) => {
    const status = getSessionStatus(match)
    counts[status] += 1
    return counts
  }, { live: 0, upcoming: 0, completed: 0 })
  const visibleMatches = statusFilter === 'all'
    ? currentMatches
    : currentMatches.filter(match => getSessionStatus(match) === statusFilter)

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">

      {/* Sidebar */}
      <div className="hidden md:flex w-60 border-r border-border flex-col overflow-y-auto flex-shrink-0" style={{ background: '#0a0a0a' }}>
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border flex items-center gap-1">
          <BarChart3 size={12} className="text-[#f59e0b]" /> Session
        </div>
        <button
          onClick={() => handleCompSelect(ALL_COMPETITIONS)}
          className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === ALL_COMPETITIONS ? 'font-semibold' : 'border-transparent text-text-secondary hover:bg-[#f59e0b]/10'}`}
          style={selectedComp === ALL_COMPETITIONS ? { background: 'rgba(245,158,11,0.07)', color: '#f59e0b', borderColor: '#f59e0b' } : {}}
        >
          <div className="font-medium truncate text-xs">All Competitions</div>
          <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
            {allMatches.length} matches
            {allMatches.some(m => getSessionStatus(m) === 'live') && (
              <span className="flex items-center gap-0.5" style={{ color: '#f59e0b' }}>
                <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#f59e0b' }} />
                {allMatches.filter(m => getSessionStatus(m) === 'live').length} live
              </span>
            )}
          </div>
        </button>
        {Object.entries(competitions).map(([comp, compMatches]) => (
          <button
            key={comp}
            onClick={() => handleCompSelect(comp)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'font-semibold' : 'border-transparent text-text-secondary hover:bg-[#f59e0b]/10'}`}
            style={selectedComp === comp ? { background: 'rgba(245,158,11,0.07)', color: '#f59e0b', borderColor: '#f59e0b' } : {}}
          >
            <div className="font-medium truncate text-xs">{comp}</div>
            <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
              {compMatches.length} matches
              {compMatches.some(m => getSessionStatus(m) === 'live') && (
                <span className="flex items-center gap-0.5" style={{ color: '#f59e0b' }}>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#f59e0b' }} />
                  {compMatches.filter(m => getSessionStatus(m) === 'live').length} live
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Mobile drawer */}
      <div className="md:hidden fixed inset-0 z-50 flex pointer-events-none">
        <div
          className="absolute inset-0 bg-black/60 transition-opacity duration-300"
          style={{ opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none' }}
          onClick={() => setMobileMenu(false)}
        />
        <div
          className="relative w-72 max-w-[80vw] h-full flex flex-col overflow-y-auto pointer-events-auto"
          style={{
            background: '#0a0a0a', borderRight: '1px solid #2c2c2e',
            transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">📊 Session</div>
          <button onClick={() => { handleCompSelect(ALL_COMPETITIONS); setMobileMenu(false) }}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === ALL_COMPETITIONS ? 'font-semibold' : 'border-transparent text-text-secondary'}`}
            style={selectedComp === ALL_COMPETITIONS ? { background: 'rgba(245,158,11,0.07)', color: '#f59e0b', borderColor: '#f59e0b' } : {}}>
            <div className="font-medium truncate text-xs">All Competitions</div>
            <div className="text-xs text-text-muted mt-0.5">{allMatches.length} matches</div>
          </button>
          {Object.entries(competitions).map(([comp, compMatches]) => (
            <button key={comp} onClick={() => { handleCompSelect(comp); setMobileMenu(false) }}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'font-semibold' : 'border-transparent text-text-secondary'}`}
              style={selectedComp === comp ? { background: 'rgba(245,158,11,0.07)', color: '#f59e0b', borderColor: '#f59e0b' } : {}}>
              <div className="font-medium truncate text-xs">{comp}</div>
              <div className="text-xs text-text-muted mt-0.5">{compMatches.length} matches</div>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile comp selector */}
      <div className="md:hidden absolute top-14 left-0 right-0 z-30 p-3 border-b border-border" style={{ background: '#0a0a0a' }}>
        <select
          value={selectedComp || ''}
          onChange={e => handleCompSelect(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm text-white"
          style={{ background: '#111', border: '1px solid #2c2c2e' }}
        >
          <option value={ALL_COMPETITIONS}>All Competitions</option>
          {Object.keys(competitions).map(comp => <option key={comp} value={comp}>{comp}</option>)}
        </select>
      </div>

      {/* Main content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto md:pt-0 pt-14">
        {matchId ? (
          <SessionDetail />
        ) : (
          <div className="p-4 fade-in" ref={el => {
            if (el) {
              const s = sessionStorage.getItem(SCROLL_KEY)
              if (s && scrollRef.current) {
                scrollRef.current.scrollTop = Number(s)
                sessionStorage.removeItem(SCROLL_KEY)
              }
            }
          }}>
            {selectedComp && currentMatches.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-black text-white">{selectedComp === ALL_COMPETITIONS ? 'All Competitions' : selectedComp}</h2>
                  <span className="text-xs text-[#8e8e93]">{visibleMatches.length} of {currentMatches.length} matches</span>
                </div>
                <p className="text-xs text-[#8e8e93] mb-3">Over-by-over session markets — Yes/No lines & bookie P/L</p>

                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" role="tablist" aria-label="Session match status">
                  {STATUS_FILTERS.map(({ key, label }) => {
                    const count = key === 'all' ? currentMatches.length : statusCounts[key]
                    const active = statusFilter === key
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setStatusFilter(key)}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                        style={active
                          ? { background: '#f59e0b', color: '#111', border: '1px solid #f59e0b' }
                          : { background: '#111', color: '#8e8e93', border: '1px solid #2c2c2e' }}
                      >
                        {label} <span className={active ? 'text-black/60' : 'text-[#636366]'}>{count}</span>
                      </button>
                    )
                  })}
                </div>

                {visibleMatches.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visibleMatches.map(match => {
                    const accessType = getAccessType(match)
                    const dt = fmtDateTime(match.startTime)
                    const isLive = getSessionStatus(match) === 'live'
                    const sessionCount = Number(match.sessionCount)
                    const totalMatched = Number(match.totalMatched)
                    return (
                      <button
                        key={match.matchId}
                        onClick={() => {
                          sessionStorage.setItem(SCROLL_KEY, scrollRef.current?.scrollTop || 0)
                          navigate(`/session/match/${match.matchId}`)
                        }}
                        className="rounded-2xl p-4 transition-all text-left group hover:shadow-lg"
                        style={{
                          background: '#111',
                          border: isLive ? '1px solid rgba(245,158,11,0.35)' : '1px solid #2c2c2e',
                          boxShadow: isLive ? '0 4px 20px rgba(245,158,11,0.08)' : 'none',
                        }}
                      >
                        {dt && <div className="text-[11px] text-[#8e8e93] mb-1 font-medium">{dt}</div>}
                        {selectedComp === ALL_COMPETITIONS && match.competitionName && (
                          <div className="text-[10px] text-[#f59e0b] mb-1 font-semibold truncate">{match.competitionName}</div>
                        )}
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <span className="font-bold text-white text-sm leading-snug">{match.matchName}</span>
                          {getStatusBadge(match)}
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 rounded-lg px-2.5 py-2 text-center" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
                            <div className="text-[9px] text-[#8e8e93] uppercase tracking-wide">Markets</div>
                            <div className="text-sm font-black text-[#f59e0b]">{Number.isFinite(sessionCount) ? sessionCount : 0}</div>
                          </div>
                          <div className="flex-1 rounded-lg px-2.5 py-2 text-center" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
                            <div className="text-[9px] text-[#8e8e93] uppercase tracking-wide">Matched</div>
                            <div className="text-sm font-black text-white">
                              €{Number.isFinite(totalMatched) ? totalMatched.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          {accessType === 'free'
                            ? <span className="text-xs font-semibold text-[#22c55e]">Free access</span>
                            : accessType === 'pro'
                              ? <span className="text-xs font-semibold text-[#f59e0b]">Pro access</span>
                              : <span className="text-xs font-semibold flex items-center gap-1 text-[#ef4444]"><Lock size={11} /> Pro Required</span>
                          }
                          <ChevronRight className="h-4 w-4 text-[#8e8e93] group-hover:text-[#f59e0b] transition-colors" />
                        </div>
                      </button>
                    )
                  })}
                  </div>
                ) : (
                  <div className="flex h-[40vh] items-center justify-center text-center flex-col rounded-2xl" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
                    <Activity className="h-9 w-9 text-[#3a3a3c] mb-3" />
                    <h3 className="text-base font-bold text-white">No {statusFilter} matches</h3>
                    <p className="text-[#8e8e93] text-xs mt-1">Is competition mein abhi koi {statusFilter} session match nahi hai</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-center flex-col">
                <Activity className="h-10 w-10 text-[#3a3a3c] mb-3" />
                <h2 className="text-xl font-bold text-white">No Session Markets</h2>
                <p className="text-[#8e8e93] text-sm mt-1">{loadError || 'Abhi koi session match available nahi hai'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
