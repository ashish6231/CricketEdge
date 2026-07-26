import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { LoaderCircle, Activity, ChevronRight, Lock } from 'lucide-react'
import { getSessionMatches } from '../api'

const STORAGE_KEY = 'session_selected_comp'

export default function SessionPage() {
  const navigate = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || null)

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
        setCompetitions(grouped)
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved && grouped[saved]) {
          setSelectedComp(saved)
        } else if (Object.keys(grouped).length > 0) {
          setSelectedComp(Object.keys(grouped)[0])
        }
      }
      setLoading(false)
    })
  }, [])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
  }

  const getStatusBadge = (match) => {
    if (match.inPlay && match.status !== 'ended') {
      return <span className="flex items-center gap-1 text-xs text-back"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-back" /> LIVE</span>
    }
    if (match.status === 'ended') {
      return <span className="text-xs text-profit bg-profit/10 px-1.5 py-0.5 rounded">ENDED</span>
    }
    return <span className="text-xs text-text-muted">{match.status}</span>
  }

  const getAccessType = (match) => {
    if (match.status === 'ended') return 'free'
    if (isLoggedIn) return 'free'
    return 'login'
  }

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 border-r border-border flex-col overflow-y-auto flex-shrink-0">
        <div className="p-3 text-xs font-bold uppercase tracking-wider text-text-muted">Session Listings</div>
        {Object.entries(competitions).map(([comp, compMatches]) => (
          <button
            key={comp}
            onClick={() => handleCompSelect(comp)}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
              selectedComp === comp ? 'bg-primary/10 text-primary border-r-2 border-primary' : 'text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            <div className="font-medium truncate">{comp}</div>
            <div className="text-xs text-text-muted mt-0.5">
              {compMatches.length} sessions
            </div>
          </button>
        ))}
      </div>

      {/* Mobile */}
      <div className="md:hidden p-3 border-b border-border">
        <select value={selectedComp || ''} onChange={e => handleCompSelect(e.target.value)} className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary">
          {Object.keys(competitions).map(comp => <option key={comp} value={comp}>{comp}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 fade-in">
        {selectedComp && competitions[selectedComp] ? (
          <>
            <h2 className="text-xl font-bold text-text-primary mb-2">{selectedComp}</h2>
            <p className="text-xs text-text-muted mb-4">📊 Session markets — Over-by-over analysis</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {competitions[selectedComp].map(match => {
                const accessType = getAccessType(match)
                return (
                  <button
                    key={match.matchId}
                    onClick={() => navigate(`/session/match/${match.matchId}`)}
                    className={`glass-card rounded-xl p-4 hover:bg-bg-card-hover transition-all text-left group ${accessType === 'login' ? 'border border-primary/20' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-text-primary">{match.matchName}</span>
                      {getStatusBadge(match)}
                    </div>
                    <div className="text-xs text-text-muted mb-2">
                      Total Matched: <span className="text-text-secondary font-medium">{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      {accessType === 'free' ? <span className="text-xs text-profit">✅ Free access</span> : <span className="text-xs text-primary flex items-center gap-1"><Lock size={12} /> Login required</span>}
                      <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-primary" />
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div className="flex h-[60vh] items-center justify-center text-center"><Activity className="h-10 w-10 text-text-muted mx-auto mb-2" /><h2 className="text-xl font-bold">No Session Markets</h2></div>
        )}
      </div>
    </div>
  )
}
