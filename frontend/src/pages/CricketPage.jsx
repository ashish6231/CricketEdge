import { lazy, useEffect, useRef, useState, useMemo, memo, useCallback } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, ChevronRight, Trophy, Lock, X } from 'lucide-react'
import { getCricketMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import SportHubHeader from '../components/SportHubHeader'
import LeagueSearch from '../components/LeagueSearch'
import { getSocket, releaseFeed, requestTossFeed } from '../socket'
import { crexScoreFingerprint, mergeCrexUpdate, resolveCrexScores } from '../utils/crexScore'

const MatchDetail = lazy(() => import('./MatchDetail'))

const STORAGE_KEY = 'cricket_selected_comp'
const SCROLL_KEY = 'cricket_matches_scroll_top'
const LAST_MATCH_KEY = 'cricket_last_clicked_match_id'

const formatVolStr = (val) => {
  if (val === null || val === undefined) return '—'
  if (val === 0 || val === '0') return '0.00'
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

// ── Isolated match card — only re-renders when its own props change ──
const MatchCard = memo(function MatchCard({ match, crexScore, now, isPro, onNavigate }) {
  const mLoad = match.matchLoad
  const t1Name = match.matchName?.split(' v ')?.[0] || 'Team 1'
  const t2Name = match.matchName?.split(' v ')?.[1] || 'Team 2'
  const snap = match.snapshot
  const tr1 = snap?.teams?.[t1Name]?.trades || snap?.teams?.[snap?.teamNames?.[0]]?.trades || []
  const tr2 = snap?.teams?.[t2Name]?.trades || snap?.teams?.[snap?.teamNames?.[1]]?.trades || []
  const tradeVol1 = tr1.reduce((s, t) => s + (parseFloat(t.size) || 0), 0)
  const tradeVol2 = tr2.reduce((s, t) => s + (parseFloat(t.size) || 0), 0)
  const vol1 = mLoad?.team1?.money ?? (tradeVol1 || snap?.teams?.[t1Name]?.totalBet || snap?.preMatchTotalBets?.team1 || 0)
  const vol2 = mLoad?.team2?.money ?? (tradeVol2 || snap?.teams?.[t2Name]?.totalBet || snap?.preMatchTotalBets?.team2 || 0)

  const sorted1 = [...tr1].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const sorted2 = [...tr2].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  // Find latest BACK trade specifically (always prefer BACK odds)
  const backTrade1 = sorted1.find(t => {
    const s = String(t.type || t.side || '').toLowerCase()
    return s === 'back' || s === 'b'
  })
  const backTrade2 = sorted2.find(t => {
    const s = String(t.type || t.side || '').toLowerCase()
    return s === 'back' || s === 'b'
  })

  const getRunnerBackPrice = (runnersList, teamName, idx) => {
    if (!Array.isArray(runnersList) || !runnersList.length) return null
    if (teamName) {
      const tNorm = teamName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const matchR = runnersList.find(r => {
        const rNorm = String(r.runnerName || r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        return rNorm && (tNorm.includes(rNorm) || rNorm.includes(tNorm))
      })
      if (matchR) {
        return matchR.back || matchR.backPrice || matchR.ex?.availableToBack?.[0]?.price || matchR.price || null
      }
    }
    const r = runnersList[idx]
    return r?.back || r?.backPrice || r?.ex?.availableToBack?.[0]?.price || r?.price || null
  }

  const rBack1 = getRunnerBackPrice(snap?.runners, t1Name, 0) || getRunnerBackPrice(match.runners, t1Name, 0)
  const rBack2 = getRunnerBackPrice(snap?.runners, t2Name, 1) || getRunnerBackPrice(match.runners, t2Name, 1)

  // Always show BACK odds for both teams
  const odds1 = (backTrade1?.price && !isNaN(Number(backTrade1.price))) ? parseFloat(backTrade1.price) :
    (rBack1 && !isNaN(Number(rBack1))) ? parseFloat(rBack1) :
    (mLoad?.team1?.odds && !isNaN(Number(mLoad.team1.odds))) ? parseFloat(mLoad.team1.odds) :
    (sorted1[0]?.price && !isNaN(Number(sorted1[0].price))) ? parseFloat(sorted1[0].price) :
    null

  const odds2 = (backTrade2?.price && !isNaN(Number(backTrade2.price))) ? parseFloat(backTrade2.price) :
    (rBack2 && !isNaN(Number(rBack2))) ? parseFloat(rBack2) :
    (mLoad?.team2?.odds && !isNaN(Number(mLoad.team2.odds))) ? parseFloat(mLoad.team2.odds) :
    (sorted2[0]?.price && !isNaN(Number(sorted2[0].price))) ? parseFloat(sorted2[0].price) :
    null

  let impliedP1 = null
  let impliedP2 = null
  if (odds1 && odds2 && odds1 > 1 && odds2 > 1 && odds1 !== odds2) {
    const inv1 = 1 / odds1
    const inv2 = 1 / odds2
    impliedP1 = Math.round((inv1 / (inv1 + inv2)) * 100)
    impliedP2 = 100 - impliedP1
  }

  const mP1 = typeof mLoad?.team1?.percent === 'number' ? mLoad.team1.percent : null
  const mP2 = typeof mLoad?.team2?.percent === 'number' ? mLoad.team2.percent : null
  let pct1 = mP1
  let pct2 = mP2
  if (pct1 === null || (pct1 === 50 && pct2 === 50 && impliedP1 !== null)) {
    if (impliedP1 !== null) {
      pct1 = impliedP1
      pct2 = impliedP2
    } else {
      const totVol = vol1 + vol2
      if (totVol > 0 && vol1 !== vol2) {
        pct1 = Math.round((vol1 / totVol) * 100)
        pct2 = 100 - pct1
      } else {
        pct1 = 50
        pct2 = 50
      }
    }
  }
  if (pct2 === null) pct2 = 100 - pct1

  let finalVol1 = vol1
  let finalVol2 = vol2
  if (!finalVol1 && !finalVol2 && match.totalMatched > 0) {
    finalVol1 = Math.round(match.totalMatched * (pct1 / 100))
    finalVol2 = match.totalMatched - finalVol1
  }
  const total = finalVol1 + finalVol2

  const team1 = { name: mLoad?.team1?.name || t1Name, money: finalVol1, percent: pct1, odds: odds1 }
  const team2 = { name: mLoad?.team2?.name || t2Name, money: finalVol2, percent: pct2, odds: odds2 }

  const crex = crexScore || match.crex || null

  const s = (match.status || '').toLowerCase()
  const isEnded = s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
  const isLive = !isEnded && (match.inPlay || s === 'in-play' || s === 'live')
  const accessType = isEnded ? 'free' : isPro ? 'pro' : 'locked'
  const resolvedScores = resolveCrexScores(crex, team1.name, team2.name)
  const score1 = isLive || isEnded ? resolvedScores.team1Score : null
  const score2 = isLive || isEnded ? resolvedScores.team2Score : null

  const diff = Number(match.startTime) - now
  const countdown = (!isLive && !isEnded && diff > 0) ? (() => {
    const totalSec = Math.floor(diff / 1000)
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), sec = totalSec % 60
    const pad = n => String(n).padStart(2, '0')
    return h > 24 ? `${Math.floor(h/24)}d ${pad(h%24)}:${pad(m)}:${pad(sec)}` : `${h}:${pad(m)}:${pad(sec)}`
  })() : null

  const dt = !countdown && !isLive && !isEnded && match.startTime ? (() => {
    const d = new Date(match.startTime)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} (${d.getDate()} ${'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sept,Oct,Nov,Dec'.split(',')[d.getMonth()]})`
  })() : null

  return (
    <button
      type="button"
      id={`match-card-${match.matchId}`}
      onClick={() => onNavigate(match)}
      className="match-card"
      aria-label={`Open ${team1.name} versus ${team2.name}`}
    >
      <div className="match-card-top">
        <span className="match-league">{match.competitionName || 'Cricket'}</span>
        <span className={`match-status ${isLive ? 'is-live' : isEnded ? 'is-completed' : 'is-upcoming'}`}>
          {isLive && <span className="status-dot" />}{isLive ? 'Live' : isEnded ? 'Completed' : 'Upcoming'}
        </span>
      </div>
      <div className="match-schedule">{countdown ? `Starts in ${countdown}` : dt || (isEnded ? 'Final match data' : 'Live market data')}</div>
      <div className="match-teams">
        {[{ ...team1, score: score1 }, { ...team2, score: score2 }].map((team, index) => (
          <div className={`match-team match-team-${index}`} key={index}>
            <span className={`team-monogram team-monogram-${index}`}>{team.name.split(' ').map(word => word[0]).join('').slice(0, 3)}</span>
            <div className="match-team-name"><strong>{team.name}</strong>{team.score && <span>{team.score}</span>}</div>
            <div className="match-odds"><small>Back odds</small><strong>{formatOdds(team.odds)}</strong></div>
          </div>
        ))}
      </div>
      <div className="match-flow-label"><span>Matched stake share</span><span>{pct1 == null ? 'Unavailable' : `${pct1}% / ${pct2}%`}</span></div>
      {pct1 != null && <div className="match-flow" aria-label={`${team1.name} ${team1.percent} percent market flow, ${team2.name} ${team2.percent} percent`}><span className="match-flow-team-1" style={{ width: `${Math.max(0, Math.min(100, team1.percent))}%` }} /><span className="match-flow-team-2" style={{ width: `${Math.max(0, Math.min(100, team2.percent))}%` }} /></div>}
      <div className="match-card-bottom">
        <span>{((isLive || isEnded) && crex?.statusText) || (total == null ? 'Matched stakes unavailable' : `€${formatVolStr(total)} matched stakes`)}</span>
        <span className="match-access">{accessType === 'locked' && <Lock size={12} />}{accessType === 'free' ? 'Free access' : accessType === 'locked' ? 'Pro required' : 'Pro access'}</span>
        <ChevronRight size={17} />
      </div>
    </button>
  )
})

export default function CricketPage() {
  const navigate = useNavigate()
  const { user, mobileMenu, setMobileMenu } = useOutletContext() || {}
  const isPro = hasProAccess(user)
  const { matchId } = useParams()

  const [loading, setLoading] = useState(() => {
    // If we have cached matches, don't show full-page loader
    try {
      const raw = sessionStorage.getItem('_cx_matches_list')
      if (raw) {
        const list = JSON.parse(raw)
        if (Array.isArray(list) && list.length > 0) return false
      }
    } catch { }
    return true
  })
  const [loadError, setLoadError] = useState('')
  const [matchStatus, setMatchStatus] = useState('all')
  const [leagueQuery, setLeagueQuery] = useState('')
  const [allMatches, setAllMatches] = useState(() => {
    // Restore cached matches list from sessionStorage for instant render
    try {
      const raw = sessionStorage.getItem('_cx_matches_list')
      if (raw) {
        const list = JSON.parse(raw)
        if (Array.isArray(list) && list.length > 0) return list
      }
    } catch { }
    return []
  })
  const allMatchesRef = useRef(allMatches)
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [now, setNow] = useState(() => Date.now())
  const [tossMatchIds, setTossMatchIds] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const scrollRef = useRef(null)
  const prevMatchIdRef = useRef(matchId)
  // Stable crex scores map — matchId -> { score1, score2, statusText, runningBall, odds }
  // Updated only when values actually change, avoids full list re-render
  const [crexScores, setCrexScores] = useState({})
  const crexScoresRef = useRef({})

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

  // Real-time 1s ticker for countdown clocks
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Toss match IDs for indicator in tournament pills — via socket
  useEffect(() => {
    const socket = getSocket()
    const onTossUpdate = (payload) => {
      const tossArr = Array.isArray(payload?.matches)
        ? payload.matches
        : Array.isArray(payload)
        ? payload
        : []
      if (tossArr.length) {
        setTossMatchIds(new Set(tossArr.map((m) => m.matchId)))
      }
    }
    socket.on('toss:matches', onTossUpdate)
    if (socket.connected) requestTossFeed()
    else socket.once('connect', requestTossFeed)
    return () => {
      socket.off('toss:matches', onTossUpdate)
      socket.off('connect', requestTossFeed)
      releaseFeed('toss')
    }
  }, [])

  const processMatches = (data) => {
    if (!data) return
    setLoadError('')
    const rawList = Array.isArray(data?.matches)
      ? data.matches
      : Array.isArray(data?.matches?.matches)
      ? data.matches.matches
      : Array.isArray(data)
      ? data
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

    const previousById = new Map(allMatchesRef.current.map(match => [String(match.matchId), match]))
    const prepared = rawList.map(match => {
      const previous = previousById.get(String(match.matchId))
      const crex = mergeCrexUpdate(previous?.crex, match.crex)
      return crex ? { ...match, crex } : match
    })

    // Sort: Live (1) → Upcoming (2) → Ended (3)
    const sorted = prepared.slice().sort((a, b) => {
      const tierA = getMatchTier(a)
      const tierB = getMatchTier(b)
      if (tierA !== tierB) return tierA - tierB
      return (a.startTime || 0) - (b.startTime || 0)
    })

    setAllMatches(prev => {
      // Only update if match list structure or match loads changed
      const sameStructure = prev.length === sorted.length &&
        sorted.every((m, i) => {
          const p = prev[i]
          return p &&
            String(p.matchId) === String(m.matchId) &&
            p.status === m.status &&
            p.inPlay === m.inPlay &&
            p.totalMatched === m.totalMatched &&
            p.matchLoad?.team1?.money === m.matchLoad?.team1?.money &&
            p.matchLoad?.team2?.money === m.matchLoad?.team2?.money &&
            p.matchLoad?.team1?.percent === m.matchLoad?.team1?.percent &&
            p.matchLoad?.team2?.percent === m.matchLoad?.team2?.percent &&
            p.matchLoad?.team1?.odds === m.matchLoad?.team1?.odds &&
            p.matchLoad?.team2?.odds === m.matchLoad?.team2?.odds &&
            crexScoreFingerprint(p.crex) === crexScoreFingerprint(m.crex)
        })
      if (!sameStructure) {
        try { sessionStorage.setItem('_cx_matches_list', JSON.stringify(sorted)) } catch { }
      }
      const result = sameStructure ? prev : sorted
      allMatchesRef.current = result
      return result
    })

    let scoresChanged = false
    const nextScores = { ...crexScoresRef.current }
    sorted.forEach(match => {
      if (!match.crex) return
      const mid = String(match.matchId)
      const merged = mergeCrexUpdate(nextScores[mid], match.crex)
      if (crexScoreFingerprint(merged) !== crexScoreFingerprint(nextScores[mid])) {
        nextScores[mid] = merged
        scoresChanged = true
      }
    })
    if (scoresChanged) {
      crexScoresRef.current = nextScores
      setCrexScores(nextScores)
    }

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
  }

  const fetchMatches = () => {
    getCricketMatches()
      .then((data) => {
        processMatches(data)
      })
      .catch((err) => {
        setLoadError(err?.detail || 'Live match data is temporarily unavailable. Please try again.')
        setLoading(false)
      })
  }

  // Initial HTTP fetch — don't wait for socket on first load
  useEffect(() => {
    fetchMatches()
  }, [])

  useEffect(() => {
    const socket = getSocket()

    const onMatchesUpdate = (payload) => {
      processMatches(payload)
    }

    const onCrexLive = (payload) => {
      if (!payload?.matchId) return
      const mid = String(payload.matchId)
      const prev = crexScoresRef.current[mid]
      const match = allMatchesRef.current.find(item => String(item.matchId) === mid)
      const candidate = mergeCrexUpdate(prev || match?.crex, payload)
      const [team1Name, team2Name] = String(match?.matchName || '').split(/\s+v(?:s)?\.?\s+/i).map(value => value.trim())
      const resolved = match ? resolveCrexScores(candidate, team1Name, team2Name) : { reliable: true }
      const nextValue = !resolved.reliable && prev
        ? mergeCrexUpdate(prev, { statusText: payload.statusText, runningBall: payload.runningBall, odds: payload.odds })
        : candidate
      if (crexScoreFingerprint(prev) === crexScoreFingerprint(nextValue)) return
      const next = { ...crexScoresRef.current, [mid]: nextValue }
      crexScoresRef.current = next
      setCrexScores(next)
    }

    // Overview team names are insufficient to identify a dated fixture.
    // Only consume scores linked to this market's match ID by the server.

    socket.on('cricket:matches', onMatchesUpdate)
    socket.on('crex:live', onCrexLive)

    return () => {
      socket.off('cricket:matches', onMatchesUpdate)
      socket.off('crex:live', onCrexLive)
    }
  }, [matchId])

  // Bulk odds for cards — already embedded in cricket:matches socket payload via runners field
  // No separate API call needed

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    sessionStorage.removeItem(SCROLL_KEY)
    sessionStorage.removeItem(LAST_MATCH_KEY)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    closeSidebar()
    if (matchId) navigate('/cricket')
  }

  const handleNavigate = useCallback((match) => {
    if (scrollRef.current) {
      sessionStorage.setItem(SCROLL_KEY, String(scrollRef.current.scrollTop || 0))
    }
    if (match?.matchId) {
      sessionStorage.setItem(LAST_MATCH_KEY, String(match.matchId))
      if (match.startTime != null) {
        sessionStorage.setItem(`match_start_${match.matchId}`, String(match.startTime))
      }
    }
    navigate(`/cricket/match/${match.matchId}`, { state: { startTime: match.startTime ?? null, matchData: match } })
  }, [navigate])

  // Handle scroll reset when entering MatchDetail, and scroll restoration when returning to match list
  useEffect(() => {
    const prevId = prevMatchIdRef.current
    prevMatchIdRef.current = matchId

    // When entering MatchDetail: always reset container scroll to 0 so page starts at the top
    if (matchId) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0
      }
      window.scrollTo(0, 0)
      return
    }

    // When returning from MatchDetail (prevId was present, matchId is now falsy)
    // or when mounting without matchId and a saved state exists
    const savedMatchId = sessionStorage.getItem(LAST_MATCH_KEY)
    const savedScroll = sessionStorage.getItem(SCROLL_KEY)

    if (!prevId && !savedMatchId && savedScroll === null) return

    let cancelled = false
    let attempts = 0

    const restoreScroll = () => {
      if (cancelled) return

      let restored = false
      const targetId = savedMatchId || prevId

      // 1. Try to locate the exact match card clicked previously
      if (targetId) {
        const el = document.getElementById(`match-card-${targetId}`)
        if (el) {
          if (savedScroll !== null && scrollRef.current) {
            scrollRef.current.scrollTop = Number(savedScroll)
          }
          el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
          restored = true
        }
      }

      // 2. If card element not yet found, restore the saved scrollTop offset directly
      if (!restored && savedScroll !== null && scrollRef.current) {
        scrollRef.current.scrollTop = Number(savedScroll)
        restored = true
      }

      // 3. Fallback: if no saved scroll, ensure user is at the top rather than stuck at the bottom
      if (!restored && scrollRef.current) {
        scrollRef.current.scrollTop = 0
      }

      // Retry up to 10 animation frames in case cards are still mounting / rendering
      if (!restored && attempts < 10) {
        attempts++
        requestAnimationFrame(restoreScroll)
      }
    }

    const frameId = requestAnimationFrame(restoreScroll)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [matchId])

  const isEndedMatch = (m) => {
    const s = (m.status || '').toLowerCase()
    return s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
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

  const liveCount = useMemo(() => {
    return allMatches.filter(m => !isEndedMatch(m) && (m.inPlay || (m.status || '').toLowerCase() === 'in-play' || (m.status || '').toLowerCase() === 'live')).length
  }, [allMatches])

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
      <div className="league-list flex-1 overflow-y-auto py-0.5">
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
        {Object.entries(competitions).filter(([comp]) => comp.toLowerCase().includes(leagueQuery.toLowerCase())).map(([comp, compMatches]) => {
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
    <div className="sports-workspace flex overflow-hidden">
      {/* ── Desktop Permanent Leagues Sidebar (Compact & sleeker on big screens) ── */}
      <aside className="league-sidebar hidden md:flex h-full flex-col shrink-0">
        <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
          <div className="flex items-center gap-1.5">
            <Trophy size={19} className="text-primary" />
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-white">Cricket Leagues</div>
              <div className="text-[9px] text-slate-400 font-mono">
                {Object.keys(competitions).length} available leagues
              </div>
            </div>
          </div>
        </div>

        <LeagueSearch value={leagueQuery} onChange={setLeagueQuery} />
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
        inert={!sidebarOpen}
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
          data-league-drawer role="dialog" aria-modal={sidebarOpen || undefined} aria-label="Cricket leagues"
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
              <Trophy size={19} className="text-primary" />
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
              aria-label="Close leagues"
            >
              <X size={15} />
            </button>
          </div>

          <LeagueSearch value={leagueQuery} onChange={setLeagueQuery} />
        {renderLeaguesList()}

          {/* Footer */}
          <div className="p-2 border-t border-[#1b2234] bg-[#0a0d18] text-center text-[9px] text-slate-500 shrink-0">
            Click any league to filter • Closes automatically
          </div>
        </aside>
      </div>

      {/* ── Main Content Area ── */}
      <div ref={scrollRef} className="sports-content flex-1 overflow-y-auto">
        {matchId ? (
          <MatchDetail sport="cricket" />
        ) : (
          <>
            <SportHubHeader title="Cricket matches" description="Live scores, market flow and league predictions in one place."
              league={selectedComp} total={displayedMatches.length} live={displayedMatches.filter(isLiveMatch).length}
              upcoming={displayedMatches.filter(m => !isLiveMatch(m) && !isEndedMatch(m)).length} completed={displayedMatches.filter(isEndedMatch).length}
              search={searchQuery} onSearch={setSearchQuery} status={matchStatus} onStatus={setMatchStatus}
              onOpenLeagues={() => { setLeagueQuery(''); if (window.innerWidth < 768) { setSidebarOpen(true); setMobileMenu?.(true) } else document.querySelector('.league-sidebar input')?.focus() }} />

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

        <div className="hub-results w-full space-y-6 fade-in">
          {displayedMatches.length > 0 ? (() => {
            const visibleMatches = displayedMatches.filter(m => matchStatus === 'all' || (matchStatus === 'live' && isLiveMatch(m)) || (matchStatus === 'upcoming' && !isLiveMatch(m) && !isEndedMatch(m)) || (matchStatus === 'completed' && isEndedMatch(m)))
            const liveMatches = visibleMatches.filter(isLiveMatch)
            const upcomingMatches = visibleMatches.filter((m) => !isLiveMatch(m) && !isEndedMatch(m))
            const endedMatches = visibleMatches.filter(isEndedMatch)

            const renderGroup = (matches, label, dotCls, textCls, countCls) => matches.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2 px-0.5">
                  <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                  <span className={`text-xs font-black uppercase tracking-wider ${textCls}`}>{label}</span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${countCls}`}>{matches.length}</span>
                </div>
                <div className="match-grid grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
                  {matches.map(m => (
                    <MatchCard
                      key={m.matchId}
                      match={m}
                      crexScore={crexScores[String(m.matchId)] || m.crex || null}
                      now={now}
                      isPro={isPro}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </div>
            )

            return (
              <div className="space-y-6">
                {!visibleMatches.length && <div className="ui-empty-state"><Trophy size={28} /><h2>No {matchStatus} matches here</h2><p>Choose another status or explore all leagues.</p><button className="ui-button ui-button-secondary" onClick={() => setMatchStatus('all')}>Show all matches</button></div>}
                {renderGroup(liveMatches, 'Live In-Play Matches', 'bg-red-500 animate-pulse', 'text-red-400', 'text-red-400 bg-red-950/50 border border-red-800/40')}
                {renderGroup(upcomingMatches, 'Upcoming Fixtures', 'bg-sky-400', 'text-sky-400', 'text-slate-400 bg-[#161a28]')}
                {renderGroup(endedMatches, 'Completed Matches', 'bg-emerald-400', 'text-emerald-400', 'text-emerald-400 bg-emerald-950/50 border border-emerald-800/40')}
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
