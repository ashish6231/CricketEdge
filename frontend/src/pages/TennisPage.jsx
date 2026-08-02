import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Activity, ChevronRight, Lock } from 'lucide-react'
import { getTennisMatches } from '../api'
import MatchDetail from './MatchDetail'

const STORAGE_KEY = 'tennis_selected_comp'

const fmtDateTime = (ts) => {
  if (!ts) return null
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date} • ${time}`
}

export default function TennisPage() {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useOutletContext()
  const isPro = user?.subscription?.planSlug === 'pro' || user?.role === 'admin' || user?.role === 'superadmin'
  const { matchId } = useParams()
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || null)

  useEffect(() => {
    getTennisMatches().then(data => {
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
    navigate('/tennis')
  }

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  const currentMatches = competitions[selectedComp] || []

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">

      {/* ── Sidebar — always visible ── */}
      <div className="hidden md:flex w-60 border-r border-border flex-col overflow-y-auto flex-shrink-0" style={{ background: '#0a0a0a' }}>
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">🎾 Tennis</div>
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
              {compMatches.some(m => m.status === 'in-play') && (
                <span className="flex items-center gap-0.5" style={{ color: '#dc2626' }}>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#dc2626' }} />
                  {compMatches.filter(m => m.status === 'in-play').length} live
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* ── Mobile selector ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border p-2" style={{ background: '#111111' }}>
        <select value={selectedComp || ''} onChange={e => handleCompSelect(e.target.value)}
          className="w-full border border-border rounded-xl px-3 py-2 text-sm text-text-primary" style={{ background: '#1a1a1a', color: '#fff' }}>
          {Object.keys(competitions).map(comp => <option key={comp} value={comp}>{comp}</option>)}
        </select>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        {matchId ? (
          <MatchDetail sport="tennis" />
        ) : (
          <div className="p-4 fade-in">
            {selectedComp && currentMatches.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-text-primary">{selectedComp}</h2>
                  <span className="text-xs text-text-muted">{currentMatches.length} matches</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {currentMatches.map(match => (
                    <button
                      key={match.matchId}
                      onClick={() => navigate(`/tennis/match/${match.matchId}`)}
                      className={`glass-card rounded-xl p-4 transition-all text-left group hover:bg-bg-card-hover`}
                    >
                      {fmtDateTime(match.startTime) && <div className="text-[11px] text-text-muted mb-1 font-medium">📅 {fmtDateTime(match.startTime)}</div>}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-text-primary">{match.matchName}</span>
                        {match.status === 'in-play' ? (
                          <span className="flex items-center gap-1 text-xs text-back">
                            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-back inline-block" /> LIVE
                          </span>
                        ) : match.status === 'ended' ? (
                          <span className="text-xs text-profit bg-profit/10 px-1.5 py-0.5 rounded">ENDED</span>
                        ) : (
                          <span className="text-xs text-primary">UPCOMING</span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted mb-2">
                        Total Matched: <span className="text-text-secondary font-medium">{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        {match.status === 'ended' || isPro
                          ? <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>{isPro && match.status !== 'ended' ? '⭐ Pro access' : '✅ Free access'}</span>
                          : <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#dc2626' }}><Lock size={11} /> Pro Required</span>
                        }
                        <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-center">
                <Activity className="h-10 w-10 text-text-muted mx-auto mb-2" />
                <h2 className="text-xl font-bold">No Matches</h2>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
