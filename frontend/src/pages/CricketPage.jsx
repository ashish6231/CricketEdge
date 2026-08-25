import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams, Routes, Route } from 'react-router-dom'
import { Activity, LoaderCircle, ChevronRight, Lock } from 'lucide-react'
import { getCricketMatches, getCricketOddsBulk, getTossMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import MatchDetail from './MatchDetail'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

const STORAGE_KEY = 'cricket_selected_comp'

const fmtDateTime = (ts) => {
  if (!ts) return null
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date} • ${time}`
}

export default function CricketPage() {
  const navigate = useNavigate()
  const { isLoggedIn, authReady, user, mobileMenu, setMobileMenu, liveMode } = useOutletContext()
  const isPro = hasProAccess(user)
  const { matchId } = useParams()
  const liveShell = Boolean(liveMode && matchId)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || null)
  const [allMatches, setAllMatches] = useState([])
  const [oddsMap, setOddsMap] = useState({})
  const [tossMatchIds, setTossMatchIds] = useState(new Set())
  const scrollRef = useRef(null)
  const SCROLL_KEY = 'cricket_scroll_pos'

  useEffect(() => {
    if (!authReady) return
    setLoading(true)
    Promise.all([
      getCricketMatches(),
      getTossMatches().catch(() => ({ matches: [] }))
    ]).then(([data, tossData]) => {
      setLoadError('')
      const tossArr = Array.isArray(tossData?.matches)
        ? tossData.matches
        : Array.isArray(tossData?.matches?.matches)
          ? tossData.matches.matches
          : []
      if (tossArr.length) {
        setTossMatchIds(new Set(tossArr.map(m => m.matchId)))
      }
      if (data?.matches) {
        setAllMatches(data.matches)
        const grouped = {}
        data.matches.forEach(m => {
          const comp = m.competitionName || 'Other'
          if (!grouped[comp]) grouped[comp] = []
          grouped[comp].push(m)
        })
        setCompetitions(grouped)
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved && grouped[saved]) {
          setSelectedComp(saved)
        } else {
          const compWithEnded = Object.entries(grouped).find(([, ms]) => ms.some(m => m.status === 'ended'))
          setSelectedComp(compWithEnded?.[0] || Object.keys(grouped)[0] || null)
        }
      }
      setLoading(false)
    }).catch(err => {
      setLoadError(err?.detail || 'Live matches load nahi ho paaye. Thodi der baad dubara try karo.')
      setLoading(false)
    })
  }, [isLoggedIn, authReady])

  useEffect(() => {
    // Match detail open hone par bulk odds band — server match detail ke liye free
    if (matchId) return
    // Live odds Pro-only — guests / free users pe "No token" spam mat karo
    if (!isPro) return

    const matches = competitions[selectedComp] || []
    if (!matches.length) return
    // Sirf live/upcoming matches ke odds refresh karo
    const activeIds = matches
      .filter(m => m.status !== 'ended')
      .map(m => m.matchId)
    if (!activeIds.length) return

    const fetchOdds = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      getCricketOddsBulk(activeIds)
        .then(data => {
          if (data && !data.error) {
            setOddsMap(prev => ({ ...prev, ...data }))
          }
        })
        .catch(err => {
          console.warn('Bulk odds fetch failed:', err?.detail || err)
        })
    }

    fetchOdds()
    return startVisibleInterval(fetchOdds, LIVE_POLL_MS)
  }, [selectedComp, competitions, matchId, isPro])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    // Navigate back to list when comp changes
    navigate('/cricket')
  }

  const getMatchStatusBadge = (match) => {
    if (match.inPlay && match.status === 'in-play') {
      return (
        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.15)', color: '#ef4444' }}>
          <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#ef4444' }} /> LIVE
        </span>
      )
    }
    if (match.status === 'ended') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#22c55e' }}>ENDED</span>
    if (match.status === 'upcoming') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>UPCOMING</span>
    return <span className="text-xs text-text-muted">{match.status}</span>
  }

  const getAccessType = (match) => {
    if (match.status === 'ended') return 'free'
    if (isPro) return 'pro'
    return 'locked'
  }

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>
  if (loadError) return (
    <div className="flex h-[80vh] items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-red-300 mb-3">{loadError}</p>
        <p className="text-xs text-text-muted">VPN on karke refresh karo, ya thodi der baad dubara try karo.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition-colors">Retry</button>
      </div>
    </div>
  )

  const currentMatches = competitions[selectedComp] || []

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">

      {/* ── Sidebar — classic mode only ── */}
      {!liveShell && (
      <div className="hidden md:flex w-60 border-r border-border flex-col overflow-y-auto flex-shrink-0" style={{ background: '#0a0a0a' }}>
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">🏏 Cricket</div>
        {Object.entries(competitions).map(([comp, compMatches]) => (
          <button
            key={comp}
            onClick={() => handleCompSelect(comp)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'font-semibold' : 'border-transparent text-text-secondary hover:bg-[#10b981]/10'}`}
            style={selectedComp === comp ? { background: 'rgba(16,185,129,0.07)', color: '#10b981', borderColor: '#10b981' } : {}}
          >
            <div className="font-medium truncate text-xs flex items-center justify-between gap-1">
              <span className="truncate">{comp}</span>
              {compMatches.some(m => tossMatchIds.has(m.matchId)) && (
                <span className="text-red-500 font-bold flex-shrink-0">T</span>
              )}
            </div>
            <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
              {compMatches.length} matches
              {compMatches.some(m => m.inPlay && m.status === 'in-play') && (
                <span className="flex items-center gap-0.5" style={{ color: '#10b981' }}>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#10b981' }} />
                  {compMatches.filter(m => m.inPlay && m.status === 'in-play').length} live
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      )}

      {/* ── Mobile drawer ── */}
      {!liveShell && (
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
          <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">🏏 Cricket</div>
          {Object.entries(competitions).map(([comp, compMatches]) => (
            <button key={comp} onClick={() => { handleCompSelect(comp); setMobileMenu(false) }}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'font-semibold' : 'border-transparent text-text-secondary'}`}
              style={selectedComp === comp ? { background: 'rgba(16,185,129,0.07)', color: '#10b981', borderColor: '#10b981' } : {}}>
              <div className="font-medium truncate text-xs flex items-center justify-between gap-1">
                <span className="truncate">{comp}</span>
                {compMatches.some(m => tossMatchIds.has(m.matchId)) && <span className="text-red-500 font-bold flex-shrink-0">T</span>}
              </div>
              <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                {compMatches.length} matches
                {compMatches.some(m => m.inPlay && m.status === 'in-play') && (
                  <span className="flex items-center gap-0.5" style={{ color: '#10b981' }}>
                    <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#10b981' }} />
                    {compMatches.filter(m => m.inPlay && m.status === 'in-play').length} live
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ── Main content area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {matchId ? (
          // Show match detail inline
          <MatchDetail sport="cricket" />
        ) : (
          // Show match cards
          <div className="p-4 fade-in" ref={el => { if (el) { const s = sessionStorage.getItem(SCROLL_KEY); if (s && scrollRef.current) { scrollRef.current.scrollTop = Number(s); sessionStorage.removeItem(SCROLL_KEY) } }}}>
            {selectedComp && currentMatches.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-text-primary">{selectedComp}</h2>
                  <span className="text-xs text-text-muted">{currentMatches.length} matches</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {currentMatches.map(match => {
                    const accessType = getAccessType(match)
                    const dt = fmtDateTime(match.startTime)
                    const o = oddsMap[match.matchId]
                    return (
                      <button
                        key={match.matchId}
                        onClick={() => {
                          sessionStorage.setItem(SCROLL_KEY, scrollRef.current?.scrollTop || 0)
                          if (match.startTime != null) {
                            sessionStorage.setItem(`match_start_${match.matchId}`, String(match.startTime))
                          }
                          navigate(`/cricket/match/${match.matchId}`, {
                            state: { startTime: match.startTime ?? null },
                          })
                        }}
                        className={`glass-card rounded-2xl p-4 transition-all text-left group hover:shadow-md`}
                      >
                        {dt && <div className="text-[11px] text-text-muted mb-1 font-medium">📅 {dt}</div>}
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <span className="font-bold text-text-primary text-sm leading-snug">{match.matchName}</span>
                          {getMatchStatusBadge(match)}
                        </div>
                        {o?.teamNames?.length >= 2 && (
                          <div className="flex gap-2 mb-2">
                            {o.teamNames.map(tn => {
                              const tod = o.odds?.[tn]
                              return (
                                <div key={tn} className="flex-1 rounded-lg px-2 py-1" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
                                  <div className="text-[10px] font-semibold text-text-secondary truncate mb-0.5">{tn}</div>
                                  <div className="flex gap-1.5 text-[10px]">
                                    <span className="font-bold text-back">B: {tod?.back ?? '—'}</span>
                                    <span className="text-text-muted">/</span>
                                    <span className="font-bold text-loss">L: {tod?.lay ?? '—'}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="text-xs text-text-muted mb-3">
                          Matched: <span className="text-text-secondary font-semibold">₹{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          {accessType === 'free'
                            ? <span className="text-xs font-semibold" style={{ color: '#10b981' }}>✅ Free access</span>
                            : accessType === 'pro'
                              ? <span className="text-xs font-semibold" style={{ color: '#10b981' }}>⭐ Pro access</span>
                              : <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#dc2626' }}><Lock size={11} /> Pro Required</span>
                          }
                          <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-center">
                <div>
                  <Activity className="h-10 w-10 text-text-muted mx-auto mb-2" />
                  <h2 className="text-xl font-bold">No Matches Found</h2>
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
