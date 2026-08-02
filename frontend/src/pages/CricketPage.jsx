import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams, Routes, Route } from 'react-router-dom'
import { Activity, LoaderCircle, ChevronRight, Lock } from 'lucide-react'
import { getCricketMatches, getCricketOdds } from '../api'
import MatchDetail from './MatchDetail'

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
  const { isLoggedIn, user } = useOutletContext()
  const isPro = user?.subscription?.planSlug === 'pro' || user?.role === 'admin' || user?.role === 'superadmin'
  const { matchId } = useParams()
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || null)
  const [allMatches, setAllMatches] = useState([])
  const [oddsMap, setOddsMap] = useState({})

  useEffect(() => {
    getCricketMatches().then(data => {
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
    })
  }, [])

  useEffect(() => {
    const matches = competitions[selectedComp] || []
    if (!matches.length) return
    matches.forEach(m => {
      getCricketOdds(m.matchId).then(data => {
        if (data && !data.error) {
          setOddsMap(prev => ({ ...prev, [m.matchId]: data }))
        }
      })
    })
    const interval = setInterval(() => {
      matches.forEach(m => {
        getCricketOdds(m.matchId).then(data => {
          if (data && !data.error) {
            setOddsMap(prev => ({ ...prev, [m.matchId]: data }))
          }
        })
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [selectedComp, competitions])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    // Navigate back to list when comp changes
    navigate('/cricket')
  }

  const getMatchStatusBadge = (match) => {
    if (match.inPlay && match.status === 'in-play') {
      return (
        <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>
          <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#dc2626' }} /> LIVE
        </span>
      )
    }
    if (match.status === 'ended') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>ENDED</span>
    if (match.status === 'upcoming') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>UPCOMING</span>
    return <span className="text-xs text-text-muted">{match.status}</span>
  }

  const getAccessType = (match) => {
    if (match.status === 'ended') return 'free'
    if (isPro) return 'pro'
    return 'locked'
  }

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  const currentMatches = competitions[selectedComp] || []

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">

      {/* ── Sidebar — always visible ── */}
      <div className="hidden md:flex w-60 border-r border-border flex-col overflow-y-auto flex-shrink-0" style={{ background: 'rgba(255,242,242,0.7)' }}>
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">🏏 Cricket</div>
        {Object.entries(competitions).map(([comp, compMatches]) => (
          <button
            key={comp}
            onClick={() => handleCompSelect(comp)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'border-primary font-semibold' : 'border-transparent text-text-secondary hover:bg-primary/5'}`}
            style={selectedComp === comp ? { background: 'rgba(220,38,38,0.07)', color: '#dc2626' } : {}}
          >
            <div className="font-medium truncate text-xs">{comp}</div>
            <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
              {compMatches.length} matches
              {compMatches.some(m => m.inPlay && m.status === 'in-play') && (
                <span className="flex items-center gap-0.5" style={{ color: '#dc2626' }}>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#dc2626' }} />
                  {compMatches.filter(m => m.inPlay && m.status === 'in-play').length} live
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* ── Mobile selector ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border p-2" style={{ background: '#fff' }}>
        <select value={selectedComp || ''} onChange={e => handleCompSelect(e.target.value)}
          className="w-full border border-border rounded-xl px-3 py-2 text-sm text-text-primary" style={{ background: '#fff' }}>
          {Object.keys(competitions).map(comp => <option key={comp} value={comp}>{comp}</option>)}
        </select>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-y-auto">
        {matchId ? (
          // Show match detail inline
          <MatchDetail sport="cricket" />
        ) : (
          // Show match cards
          <div className="p-4 fade-in">
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
                        onClick={() => navigate(`/cricket/match/${match.matchId}`)}
                        className={`glass-card rounded-2xl p-4 transition-all text-left group hover:shadow-md`}
                      >
                        {dt && <div className="text-[11px] text-text-muted mb-1 font-medium">📅 {dt}</div>}
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <span className="font-bold text-text-primary text-sm leading-snug">{match.matchName}</span>
                          {getMatchStatusBadge(match)}
                        </div>
                        {o?.teamNames?.length === 2 && (
                          <div className="flex gap-2 mb-2">
                            {o.teamNames.map(tn => {
                              const tod = o.odds?.[tn]
                              return (
                                <div key={tn} className="flex-1 rounded-lg px-2 py-1" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
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
                            ? <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>✅ Free access</span>
                            : accessType === 'pro'
                              ? <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>⭐ Pro access</span>
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
