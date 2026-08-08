import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Activity, LoaderCircle, ChevronRight, Lock, BarChart3 } from 'lucide-react'
import { getSessionMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import SessionDetail from './SessionDetail'

const STORAGE_KEY = 'session_selected_comp'
const SCROLL_KEY = 'session_scroll_pos'

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
  const { isLoggedIn, user, mobileMenu, setMobileMenu } = useOutletContext()
  const isPro = hasProAccess(user)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || null)
  const scrollRef = useRef(null)

  useEffect(() => {
    getSessionMatches().then(data => {
      if (data?.matches) {
        setMatches(data.matches)
        const grouped = {}
        data.matches.forEach(m => {
          const comp = m.competitionName || 'Other'
          if (!grouped[comp]) grouped[comp] = []
          grouped[comp].push(m)
        })
        // Live matches pehle
        Object.keys(grouped).forEach(comp => {
          grouped[comp].sort((a, b) => {
            const aLive = a.inPlay && a.status !== 'ended' ? 0 : 1
            const bLive = b.inPlay && b.status !== 'ended' ? 0 : 1
            return aLive - bLive
          })
        })
        setCompetitions(grouped)
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved && grouped[saved]) setSelectedComp(saved)
        else setSelectedComp(Object.keys(grouped)[0] || null)
      }
      setLoading(false)
    })
  }, [])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    navigate('/session')
  }

  const getStatusBadge = (match) => {
    if (match.inPlay && match.status !== 'ended') {
      return (
        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
          <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#f59e0b' }} /> LIVE
        </span>
      )
    }
    if (match.status === 'ended') {
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>ENDED</span>
    }
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>UPCOMING</span>
  }

  const getAccessType = (match) => {
    if (match.status === 'ended') return 'free'
    if (isPro) return 'pro'
    return 'locked'
  }

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  const currentMatches = competitions[selectedComp] || []

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">

      {/* Sidebar */}
      <div className="hidden md:flex w-60 border-r border-border flex-col overflow-y-auto flex-shrink-0" style={{ background: '#0a0a0a' }}>
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border flex items-center gap-1">
          <BarChart3 size={12} className="text-[#f59e0b]" /> Session
        </div>
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
              {compMatches.some(m => m.inPlay && m.status !== 'ended') && (
                <span className="flex items-center gap-0.5" style={{ color: '#f59e0b' }}>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#f59e0b' }} />
                  {compMatches.filter(m => m.inPlay && m.status !== 'ended').length} live
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
                  <h2 className="text-base font-black text-white">{selectedComp}</h2>
                  <span className="text-xs text-[#8e8e93]">{currentMatches.length} matches</span>
                </div>
                <p className="text-xs text-[#8e8e93] mb-4">Over-by-over session markets — Yes/No lines & bookie P/L</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {currentMatches.map(match => {
                    const accessType = getAccessType(match)
                    const dt = fmtDateTime(match.startTime)
                    const isLive = match.inPlay && match.status !== 'ended'
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
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <span className="font-bold text-white text-sm leading-snug">{match.matchName}</span>
                          {getStatusBadge(match)}
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 rounded-lg px-2.5 py-2 text-center" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
                            <div className="text-[9px] text-[#8e8e93] uppercase tracking-wide">Markets</div>
                            <div className="text-sm font-black text-[#f59e0b]">{match.sessionCount ?? '—'}</div>
                          </div>
                          <div className="flex-1 rounded-lg px-2.5 py-2 text-center" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
                            <div className="text-[9px] text-[#8e8e93] uppercase tracking-wide">Matched</div>
                            <div className="text-sm font-black text-white">
                              ₹{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—'}
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
              </>
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-center flex-col">
                <Activity className="h-10 w-10 text-[#3a3a3c] mb-3" />
                <h2 className="text-xl font-bold text-white">No Session Markets</h2>
                <p className="text-[#8e8e93] text-sm mt-1">Abhi koi session match available nahi hai</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
