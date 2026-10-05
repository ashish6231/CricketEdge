import { lazy, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, Activity, ChevronRight, Lock, X } from 'lucide-react'
import { hasProAccess } from '../lib/subscriptionAccess'
import { getTennisMatches } from '../api'
import { getSocket, releaseFeed, requestTennisFeed } from '../socket'
import SportHubHeader from '../components/SportHubHeader'
import LeagueSearch from '../components/LeagueSearch'

const MatchDetail = lazy(() => import('./MatchDetail'))

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
  const { isLoggedIn, authReady, user, mobileMenu, setMobileMenu } = useOutletContext()
  const isPro = hasProAccess(user)
  const { matchId } = useParams()
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [leagueQuery, setLeagueQuery] = useState('')
  const [matchStatus, setMatchStatus] = useState('all')
  const [loadError, setLoadError] = useState('')
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const scrollRef = useRef(null)
  const SCROLL_KEY = 'tennis_scroll_pos'

  const processMatches = (data) => {
    setLoadError('')
    const matches = Array.isArray(data?.matches) ? data.matches : (Array.isArray(data) ? data : [])
    const grouped = {}
    matches.forEach(m => {
      const comp = m.competitionName || 'Other'
      if (!grouped[comp]) grouped[comp] = []
      grouped[comp].push(m)
    })
    setCompetitions(grouped)
    const saved = localStorage.getItem(STORAGE_KEY)
    setSelectedComp(saved && (saved === 'ALL' || grouped[saved]) ? saved : 'ALL')
    setLoading(false)
  }

  useEffect(() => {
    if (!authReady) return
    const socket = getSocket()
    let cancelled = false
    let receivedFeed = false
    getTennisMatches().then(data => { if (!cancelled && !receivedFeed) processMatches(data) }).catch(error => { if (!cancelled && !receivedFeed) { setLoadError(error?.detail || 'Tennis data is temporarily unavailable. Please try again.'); setLoading(false) } })

    const onTennisUpdate = (payload) => {
      receivedFeed = true
      processMatches(payload)
    }

    socket.on('tennis:matches', onTennisUpdate)

    if (socket.connected) {
      requestTennisFeed()
    } else {
      socket.once('connect', requestTennisFeed)
    }

    return () => {
      cancelled = true
      socket.off('tennis:matches', onTennisUpdate)
      socket.off('connect', requestTennisFeed)
      releaseFeed('tennis')
    }
  }, [isLoggedIn, authReady])

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    navigate('/tennis')
  }

  if (!matchId && loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>
  if (!matchId && loadError) return (
    <div className="flex h-[80vh] items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-red-300 mb-3">{loadError}</p>
        <p className="text-xs text-text-muted">VPN on karke refresh karo, ya thodi der baad dubara try karo.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition-colors">Retry</button>
      </div>
    </div>
  )

  const leagueMatches = selectedComp === 'ALL' || searchQuery.trim() ? Object.values(competitions).flat() : competitions[selectedComp] || []
  const currentMatches = leagueMatches.filter(match => `${match.matchName} ${match.competitionName}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
  const isEnded = match => ['ended', 'completed', 'closed'].includes((match.status || '').toLowerCase())
  const isLive = match => !isEnded(match) && (match.inPlay || ['in-play', 'live'].includes((match.status || '').toLowerCase()))
  const visibleMatches = currentMatches.filter(match => matchStatus === 'all' || matchStatus === 'live' && isLive(match) || matchStatus === 'completed' && isEnded(match) || matchStatus === 'upcoming' && !isLive(match) && !isEnded(match))

  return (
    <div className="sports-workspace flex overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="league-sidebar hidden md:flex flex-col overflow-y-auto shrink-0">
        <div className="px-3 py-2.5 text-xs font-black uppercase tracking-wider text-text-muted border-b border-border">Tennis leagues</div>
        <LeagueSearch value={leagueQuery} onChange={setLeagueQuery} />
        <button className="ui-all-leagues" aria-pressed={selectedComp === 'ALL'} onClick={() => { handleCompSelect('ALL'); setMobileMenu(false) }}>All leagues</button>
        {Object.entries(competitions).filter(([comp]) => comp.toLowerCase().includes(leagueQuery.toLowerCase())).map(([comp, compMatches]) => (
          <button
            key={comp}
            onClick={() => handleCompSelect(comp)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'font-semibold' : 'border-transparent text-text-secondary hover:bg-[#10b981]/10'}`}
            style={selectedComp === comp ? { background: 'rgba(16,185,129,0.07)', color: '#10b981', borderColor: '#10b981' } : {}}
          >
            <div className="font-medium truncate text-xs">{comp}</div>
            <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
              {compMatches.length} matches
              {compMatches.some(isLive) && (
                <span className="flex items-center gap-0.5" style={{ color: '#10b981' }}>
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#10b981' }} />
                  {compMatches.filter(isLive).length} live
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* ── Mobile drawer ── */}
      <div className="md:hidden fixed inset-0 z-50 flex pointer-events-none" inert={!mobileMenu} aria-hidden={!mobileMenu}>
        <div
          className="absolute inset-0 bg-black/60 transition-opacity duration-300"
          style={{ opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none' }}
          onClick={() => setMobileMenu(false)}
        />
        <div
          data-league-drawer role="dialog" aria-modal={mobileMenu || undefined} aria-label="Tennis leagues"
          className="relative w-72 max-w-[80vw] h-full flex flex-col overflow-y-auto pointer-events-auto"
          style={{
            background: '#0a0a0a', borderRight: '1px solid #2c2c2e',
            transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">Tennis leagues<button aria-label="Close leagues" onClick={() => setMobileMenu(false)}><X size={18} /></button></div>
        <LeagueSearch value={leagueQuery} onChange={setLeagueQuery} />
        <button className="ui-all-leagues" aria-pressed={selectedComp === 'ALL'} onClick={() => { handleCompSelect('ALL'); setMobileMenu(false) }}>All leagues</button>
          {Object.entries(competitions).filter(([comp]) => comp.toLowerCase().includes(leagueQuery.toLowerCase())).map(([comp, compMatches]) => (
            <button key={comp} onClick={() => { handleCompSelect(comp); setMobileMenu(false) }}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-r-2 ${selectedComp === comp ? 'font-semibold' : 'border-transparent text-text-secondary'}`}
              style={selectedComp === comp ? { background: 'rgba(16,185,129,0.07)', color: '#10b981', borderColor: '#10b981' } : {}}>
              <div className="font-medium truncate text-xs">{comp}</div>
              <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
                {compMatches.length} matches
                {compMatches.some(isLive) && (
                  <span className="flex items-center gap-0.5" style={{ color: '#10b981' }}>
                    <span className="pulse-dot h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#10b981' }} />
                    {compMatches.filter(isLive).length} live
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div ref={scrollRef} className="sports-content flex-1 overflow-y-auto">
        {matchId ? (
          <MatchDetail sport="tennis" />
        ) : (
          <div className="fade-in" ref={el => { if (el) { const s = sessionStorage.getItem(SCROLL_KEY); if (s && scrollRef.current) { scrollRef.current.scrollTop = Number(s); sessionStorage.removeItem(SCROLL_KEY) } }}}>
            <SportHubHeader title="Tennis matches" description="Follow tournaments, live markets and match activity."
              league={selectedComp} total={currentMatches.length} live={currentMatches.filter(isLive).length}
              upcoming={currentMatches.filter(match => !isLive(match) && !isEnded(match)).length} completed={currentMatches.filter(isEnded).length}
              search={searchQuery} onSearch={setSearchQuery} status={matchStatus} onStatus={setMatchStatus}
              onOpenLeagues={() => { if (window.innerWidth < 768) setMobileMenu(true); else document.querySelector('.league-sidebar input')?.focus() }} />
            <div className="hub-results">
            {visibleMatches.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-text-primary">{selectedComp === 'ALL' ? 'All tournaments' : selectedComp}</h2>
                  <span className="text-xs text-text-muted">{currentMatches.length} matches</span>
                </div>
                <div className="match-grid grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
                  {visibleMatches.map(match => (
                    <button
                      key={match.matchId}
                      onClick={() => {
                        sessionStorage.setItem(SCROLL_KEY, scrollRef.current?.scrollTop || 0)
                        if (match.startTime != null) {
                          sessionStorage.setItem(`match_start_${match.matchId}`, String(match.startTime))
                        }
                        navigate(`/tennis/match/${match.matchId}`, {
                          state: { startTime: match.startTime ?? null, matchData: match },
                        })
                      }}
                      type="button" className="match-card" aria-label={`Open ${match.matchName}`}
                    >
                      <div className="match-card-top"><span className="match-league">{match.competitionName}</span><span className={`match-status ${isLive(match) ? 'is-live' : isEnded(match) ? 'is-completed' : 'is-upcoming'}`}>{isLive(match) ? 'Live' : isEnded(match) ? 'Completed' : 'Upcoming'}</span></div>
                      <div className="match-schedule">{fmtDateTime(match.startTime) || 'Schedule pending'}</div>
                      <div className="match-teams">{(match.matchName || 'Players to be confirmed').split(' v ').map((name, index) => <div className="match-team" key={index}><span className={`team-monogram team-monogram-${index % 2}`}>{name.split(' ').map(word => word[0]).join('').slice(0, 3)}</span><div className="match-team-name"><strong>{name}</strong></div></div>)}</div>
                      <div className="match-card-bottom"><span>€{Number(match.totalMatched || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} volume</span><span className="match-access">{!isEnded(match) && !isPro && <Lock size={12} />}{isEnded(match) ? 'Free access' : isPro ? 'Pro access' : 'Pro required'}</span><ChevronRight size={17} /></div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="ui-empty-state">
                <Activity className="h-10 w-10 text-text-muted mx-auto mb-2" />
                <h2 className="text-xl font-bold">No matches to show</h2><p>Try another league or clear the match filters.</p><button className="ui-button ui-button-secondary" onClick={() => { setSearchQuery(''); setMatchStatus('all'); handleCompSelect('ALL') }}>Reset filters</button>
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
