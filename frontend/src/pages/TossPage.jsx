import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Activity, ChevronRight, Lock } from 'lucide-react'
import { getTossMatches } from '../api'
import TossDetail from './TossDetail'

const STORAGE_KEY = 'toss_selected_comp'

const fmtDateTime = (ts) => {
  if (!ts) return null
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date} • ${time}`
}

export default function TossPage() {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useOutletContext()
  const isPro = user?.subscription?.planSlug === 'pro' || user?.role === 'admin' || user?.role === 'superadmin'
  const { matchId } = useParams()
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || null)

  useEffect(() => {
    getTossMatches().then(data => {
      if (data?.matches) {
        const grouped = {}
        data.matches.forEach(m => {
          const comp = m.competitionName || 'Other'
          if (!grouped[comp]) grouped[comp] = []
          grouped[comp].push(m)
        })
        setCompetitions(grouped)
        const saved = localStorage.getItem(STORAGE_KEY)
        setSelectedComp(saved && grouped[saved] ? saved : Object.keys(grouped)[0] || null)
      }
      setLoading(false)
    })
  }, [])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    navigate('/toss')
  }

  const getStatusBadge = (match) => {
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
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">🪙 Toss</div>
        {Object.entries(competitions).map(([comp, compMatches]) => (
          <button
            key={comp}
            onClick={() => handleCompSelect(comp)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'border-primary font-semibold' : 'border-transparent text-text-secondary hover:bg-primary/5'}`}
            style={selectedComp === comp ? { background: 'rgba(220,38,38,0.07)', color: '#dc2626' } : {}}
          >
            <div className="font-medium truncate text-xs">{comp}</div>
            <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
              {compMatches.length} markets
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
          className="w-full border border-border rounded-xl px-3 py-2 text-sm" style={{ background: '#fff' }}>
          {Object.keys(competitions).map(comp => <option key={comp} value={comp}>{comp}</option>)}
        </select>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        {matchId ? (
          <TossDetail />
        ) : (
          <div className="p-4 fade-in">
            {selectedComp && currentMatches.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-text-primary">{selectedComp}</h2>
                  <span className="text-xs text-text-muted">{currentMatches.length} markets</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {currentMatches.map(match => {
                    const accessType = getAccessType(match)
                    const dt = fmtDateTime(match.startTime)
                    return (
                      <button
                        key={match.matchId}
                        onClick={() => accessType !== 'locked' ? navigate(`/toss/match/${match.matchId}`) : null}
                        className={`glass-card rounded-2xl p-4 transition-all text-left group ${accessType === 'locked' ? 'opacity-80 cursor-not-allowed' : 'hover:shadow-md'}`}
                      >
                        {dt && <div className="text-[11px] text-text-muted mb-1 font-medium">📅 {dt}</div>}
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <span className="font-bold text-text-primary text-sm leading-snug">{match.matchName}</span>
                          {getStatusBadge(match)}
                        </div>
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
                <Activity className="h-10 w-10 text-text-muted mx-auto mb-2" />
                <p className="text-text-muted mt-1">No toss markets found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
