import { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { LoaderCircle, ChevronRight, Trophy, Lock, X, Search } from 'lucide-react'
import { getCricketMatches } from '../api'
import { hasProAccess } from '../lib/subscriptionAccess'
import MatchDetail from './MatchDetail'
import { CricketBallIcon, formatRateBox } from '../components/CrexLiveSection'
import { getSocket } from '../socket'

const STORAGE_KEY = 'cricket_selected_comp'

const formatVolStr = (val) => {
  if (val === null || val === undefined || val === 0 || val === '0') return '0.00'
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

function getTeamCrexScore(crex, teamName, isTeam1) {
  if (!crex) return null
  const s1 = crex.scorecard?.team1?.score || crex.score1
  const s2 = crex.scorecard?.team2?.score || crex.score2
  if (!s1 && !s2) return null
  const isDummy = (s) => !s || s === '0-0 0.0' || s === '0/0 (0.0)' || s === '0-0 (0.0)' || s.trim() === '0/0'

  if (crex.isReversed) {
    const sc = isTeam1 ? s2 : s1
    return isDummy(sc) ? null : sc
  }
  if (crex.team1Name && teamName) {
    const tNorm = teamName.toLowerCase().replace(/[^a-z0-9]/g, '')
    const c1Norm = crex.team1Name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const c2Norm = (crex.team2Name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const c1Short = (crex.team1Short || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const c2Short = (crex.team2Short || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const m1 = (c1Norm && (tNorm.includes(c1Norm) || c1Norm.includes(tNorm))) || (c1Short.length >= 2 && (tNorm.includes(c1Short) || c1Short.includes(tNorm)))
    const m2 = (c2Norm && (tNorm.includes(c2Norm) || c2Norm.includes(tNorm))) || (c2Short.length >= 2 && (tNorm.includes(c2Short) || c2Short.includes(tNorm)))
    if (m1 && !m2) return isDummy(s1) ? null : s1
    if (m2 && !m1) return isDummy(s2) ? null : s2
  }
  const fallback = isTeam1 ? s1 : s2
  return isDummy(fallback) ? null : fallback
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

  // Implied probability from odds if odds exist
  let impliedP1 = null
  let impliedP2 = null
  if (odds1 && odds2 && odds1 > 1 && odds2 > 1 && odds1 !== odds2) {
    const inv1 = 1 / odds1
    const inv2 = 1 / odds2
    impliedP1 = Math.round((inv1 / (inv1 + inv2)) * 100)
    impliedP2 = 100 - impliedP1
  }

  // Determine percentages
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

  const isTie = pct1 === pct2 && (!odds1 || !odds2 || odds1 === odds2)
  const isTeam1Greater = !isTie && (pct1 > pct2 || (pct1 === pct2 && odds1 < odds2))
  const isTeam2Greater = !isTie && (pct2 > pct1 || (pct1 === pct2 && odds2 < odds1))

  const team1 = { name: mLoad?.team1?.name || t1Name, money: finalVol1, percent: pct1, odds: odds1 }
  const team2 = { name: mLoad?.team2?.name || t2Name, money: finalVol2, percent: pct2, odds: odds2 }

  const crex = crexScore || match.crex || null
  const score1 = getTeamCrexScore(crex, team1.name, true)
  const score2 = getTeamCrexScore(crex, team2.name, false)

  const s = (match.status || '').toLowerCase()
  const isEnded = s === 'ended' || s === 'verified' || s === 'pending' || s === 'completed' || s === 'closed'
  const isLive = !isEnded && (match.inPlay || s === 'in-play' || s === 'live')
  const accessType = isEnded ? 'free' : isPro ? 'pro' : 'locked'

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
    <div
      onClick={() => onNavigate(match)}
      className="rounded-xl border border-amber-500/30 hover:border-amber-400/80 bg-gradient-to-b from-[#0c0f1d] to-[#070912] hover:to-[#0d1222] p-2.5 sm:p-3 transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-lg hover:shadow-amber-500/10 flex flex-col gap-2.5"
    >
      {/* Top Row: League + Status Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-slate-400 truncate uppercase tracking-wider flex-1">
          {match.competitionName || 'Cricket'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isLive ? (
            <span className="flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" /> LIVE
            </span>
          ) : countdown ? (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">⏰ {countdown}</span>
          ) : isEnded ? (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">COMPLETED</span>
          ) : (
            <span className="text-[10px] font-medium text-slate-400">{dt}</span>
          )}
          {accessType === 'free' ? (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Free</span>
          ) : accessType === 'pro' ? (
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">Pro</span>
          ) : (
            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 flex items-center gap-0.5"><Lock size={9} /> Pro</span>
          )}
        </div>
      </div>

      {/* ── Teams, Scores, Market Volumes, and Load Bars ── */}
      <div className="space-y-2.5">
        {/* Team 1 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                isTie
                  ? 'bg-slate-400'
                  : isTeam1Greater
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'
              }`} />
              <span className="text-xs sm:text-[13px] font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                {team1.name}
              </span>
              {score1 && (
                <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-700/50 px-1.5 py-0.5 rounded shrink-0">
                  {score1}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-mono text-slate-400 font-medium">
                €{formatVolStr(team1.money)}
              </span>
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                isTie
                  ? 'bg-slate-800/60 text-slate-300 border-slate-700/50'
                  : isTeam1Greater
                    ? 'bg-emerald-950/70 text-emerald-400 border-emerald-600/50 font-black'
                    : 'bg-rose-950/70 text-rose-400 border-rose-600/50 font-black'
              }`}>
                {team1.percent}%
              </span>
              <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md min-w-[40px] text-center ${
                isTie
                  ? 'text-slate-300 bg-[#141824] border border-[#21293e]'
                  : isTeam1Greater
                    ? 'text-emerald-400 bg-[#0e1f1a] border border-emerald-800/40'
                    : 'text-rose-300 bg-[#1f0e13] border border-rose-800/40'
              }`}>
                {team1.odds ? `▲ ${formatOdds(team1.odds)}` : '—'}
              </span>
            </div>
          </div>
          {/* Team 1 Market Bar */}
          <div className="h-1.5 w-full bg-[#121624] rounded-full overflow-hidden">
            <div
              style={{ width: `${team1.percent}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                isTie
                  ? 'bg-slate-500'
                  : isTeam1Greater
                    ? 'bg-gradient-to-r from-emerald-600 to-green-500'
                    : 'bg-gradient-to-r from-red-600 to-rose-600'
              }`}
            />
          </div>
        </div>

        {/* Team 2 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                isTie
                  ? 'bg-slate-400'
                  : isTeam2Greater
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'
              }`} />
              <span className="text-xs sm:text-[13px] font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                {team2.name}
              </span>
              {score2 && (
                <span className="text-[10px] font-mono font-bold text-sky-300 bg-sky-950/70 border border-sky-700/50 px-1.5 py-0.5 rounded shrink-0">
                  {score2}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-mono text-slate-400 font-medium">
                €{formatVolStr(team2.money)}
              </span>
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                isTie
                  ? 'bg-slate-800/60 text-slate-300 border-slate-700/50'
                  : isTeam2Greater
                    ? 'bg-emerald-950/70 text-emerald-400 border-emerald-600/50 font-black'
                    : 'bg-rose-950/70 text-rose-400 border-rose-600/50 font-black'
              }`}>
                {team2.percent}%
              </span>
              <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md min-w-[40px] text-center ${
                isTie
                  ? 'text-slate-300 bg-[#141824] border border-[#21293e]'
                  : isTeam2Greater
                    ? 'text-emerald-400 bg-[#0e1f1a] border border-emerald-800/40'
                    : 'text-rose-300 bg-[#1f0e13] border border-rose-800/40'
              }`}>
                {team2.odds ? `▲ ${formatOdds(team2.odds)}` : '—'}
              </span>
            </div>
          </div>
          {/* Team 2 Market Bar */}
          <div className="h-1.5 w-full bg-[#121624] rounded-full overflow-hidden">
            <div
              style={{ width: `${team2.percent}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                isTie
                  ? 'bg-slate-500'
                  : isTeam2Greater
                    ? 'bg-gradient-to-r from-emerald-600 to-green-500'
                    : 'bg-gradient-to-r from-red-600 to-rose-600'
              }`}
            />
          </div>
        </div>
      </div>

      {/* ── Footer: Rate Box or Match Status Text + Details Link ── */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1b2234]/70 text-[11px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {crex?.odds?.rate ? (
            <div className="flex items-center gap-1 bg-[#101422] border border-[#21293e] px-1.5 py-0.5 rounded-md" title="Live Market Rate">
              <span className="text-[9px] font-bold text-slate-400 truncate max-w-[70px]">{crex.odds.rateTeam || crex.team1Short || 'Rate'}:</span>
              <CricketBallIcon size={11} />
              <span className="px-1.5 py-0.2 bg-white text-slate-950 font-black text-[9px] rounded font-mono leading-none">{formatRateBox(crex.odds.rate)}</span>
              <span className="px-1.5 py-0.2 bg-white text-slate-950 font-black text-[9px] rounded font-mono leading-none">{formatRateBox(crex.odds.rate2 || crex.odds.rate)}</span>
            </div>
          ) : crex?.statusText ? (
            <span className="text-[10px] text-amber-300 font-medium truncate">⚡ {crex.statusText}</span>
          ) : (
            <span className="text-[10px] text-slate-500 font-mono truncate">€{match.totalMatched?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'} matched</span>
          )}
        </div>
        <span className="text-[11px] font-bold text-amber-400 group-hover:text-amber-300 flex items-center gap-0.5 shrink-0">
          <span>Details</span><ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </div>
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
  const [competitions, setCompetitions] = useState({})
  const [selectedComp, setSelectedComp] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ALL')
  const [now, setNow] = useState(() => Date.now())
  const [tossMatchIds, setTossMatchIds] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const scrollRef = useRef(null)
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

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      if (typeof setMobileMenu === 'function') {
        setMobileMenu(next)
      }
      return next
    })
  }

  // Close sidebar on Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

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
    return () => socket.off('toss:matches', onTossUpdate)
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

    // Strip crex from match objects — crex scores come exclusively via crex:live
    const stripped = rawList.map(m => {
      if (!m.crex) return m
      const { crex, ...rest } = m
      return rest
    })

    // Sort: Live (1) → Upcoming (2) → Ended (3)
    const sorted = stripped.slice().sort((a, b) => {
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
            p.matchLoad?.team2?.odds === m.matchLoad?.team2?.odds
        })
      if (!sameStructure) {
        try { sessionStorage.setItem('_cx_matches_list', JSON.stringify(sorted)) } catch { }
      }
      return sameStructure ? prev : sorted
    })

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
      // Only update if something actually changed
      if (prev &&
        prev.score1 === payload.score1 &&
        prev.score2 === payload.score2 &&
        prev.statusText === payload.statusText &&
        prev.runningBall === payload.runningBall &&
        prev.odds?.rate === payload.odds?.rate
      ) return
      const next = { ...crexScoresRef.current, [mid]: payload }
      crexScoresRef.current = next
      setCrexScores(next)
    }

    const onCrexOverview = (crexList) => {
      if (!Array.isArray(crexList) || !crexList.length) return
      setAllMatches(prev => prev.map(m => {
        const cm = crexList.find(c => {
          const t1 = (m.matchName || '').split(' v ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
          const t2 = (m.matchName || '').split(' v ')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
          const c1 = (c.team1Name || c.team1Short || '').toLowerCase().replace(/[^a-z0-9]/g, '')
          const c2 = (c.team2Name || c.team2Short || '').toLowerCase().replace(/[^a-z0-9]/g, '')
          return (c1 && (t1.includes(c1) || c1.includes(t1))) && (c2 && (t2.includes(c2) || c2.includes(t2)))
        })
        if (!cm) return m
        return { ...m, crex: { ...(m.crex || {}), ...cm, matched: true } }
      }))
    }

    socket.on('cricket:matches', onMatchesUpdate)
    socket.on('crex:live', onCrexLive)
    socket.on('crex:overview', onCrexOverview)

    return () => {
      socket.off('cricket:matches', onMatchesUpdate)
      socket.off('crex:live', onCrexLive)
      socket.off('crex:overview', onCrexOverview)
    }
  }, [matchId])

  // Bulk odds for cards — already embedded in cricket:matches socket payload via runners field
  // No separate API call needed

  const handleCompSelect = (comp) => {
    setSelectedComp(comp)
    localStorage.setItem(STORAGE_KEY, comp)
    closeSidebar()
    if (matchId) navigate('/cricket')
  }

  const handleNavigate = useCallback((match) => {
    navigate(`/cricket/match/${match.matchId}`, { state: { startTime: match.startTime ?? null, matchData: match } })
  }, [navigate])

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
      <div className="flex-1 overflow-y-auto no-scrollbar py-0.5">
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
        {Object.entries(competitions).map(([comp, compMatches]) => {
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
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-[#07090e]">
      {/* ── Desktop Permanent Leagues Sidebar (Compact & sleeker on big screens) ── */}
      <aside className="hidden md:flex w-52 lg:w-56 h-full bg-[#080b14] border-r border-[#1b2234] flex-col shrink-0 select-none">
        <div className="px-3 py-2.5 border-b border-[#1b2234] flex items-center justify-between bg-[#0a0d18] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🏏</span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-white">Cricket Leagues</div>
              <div className="text-[9px] text-slate-400 font-mono">
                {Object.keys(competitions).length} available leagues
              </div>
            </div>
          </div>
        </div>

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
              <span className="text-sm">🏏</span>
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
            >
              <X size={15} />
            </button>
          </div>

          {renderLeaguesList()}

          {/* Footer */}
          <div className="p-2 border-t border-[#1b2234] bg-[#0a0d18] text-center text-[9px] text-slate-500 shrink-0">
            Click any league to filter • Closes automatically
          </div>
        </aside>
      </div>

      {/* ── Main Content Area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#07090e]">
        {matchId ? (
          <MatchDetail sport="cricket" />
        ) : (
          <>
            {/* Compact Cricket Hub Sticky Control Bar */}
            <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#07090e]/95 border-b border-[#1b2030] px-3 sm:px-4 py-2">
              <div className="flex items-center justify-between gap-2.5">
                {/* Desktop Active League Indicator */}
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">League:</span>
                  <span className="text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg">
                    {selectedComp === 'ALL' ? 'All Tournaments' : selectedComp}
                  </span>
                </div>

                {/* Global Search Input */}
                <div className="relative flex-1 min-w-0">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any team or match across all leagues..."
                    className="w-full bg-[#101420] border border-[#1f273b] focus:border-amber-500/60 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Join Telegram Button */}
                <a
                  href="https://t.me/cricedge_online"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0 transition-all hover:scale-105 active:scale-95 shadow-md shadow-[#0088cc]/20"
                  style={{
                    background: 'linear-gradient(135deg, #0088cc, #24A1DE)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                  title="Join official Telegram channel @cricedge_online"
                >
                  <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                  <span className="hidden xs:inline">Join Telegram</span>
                  <span className="xs:hidden">Telegram</span>
                </a>
              </div>
            </div>

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

        {/* ── Official Telegram Channel Homescreen Card ── */}
        <div className="px-2.5 sm:px-3 md:px-3.5 pt-2.5">
          <div className="rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 border border-[#0088cc]/30 bg-gradient-to-r from-[#0088cc]/15 via-[#0b101c] to-[#24a1de]/10 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0088cc] to-[#24a1de] flex items-center justify-center shrink-0 shadow-md">
                <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-white">Join CricEdge Official Telegram</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#0088cc]/20 text-[#38bdf8] border border-[#0088cc]/35">
                    @cricedge_online
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate hidden xs:block">
                  Live cricket updates, signals, predictions & daily discussion.
                </p>
              </div>
            </div>
            <a
              href="https://t.me/cricedge_online"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0 transition-all hover:scale-105 active:scale-95 shadow-md shadow-[#0088cc]/20"
              style={{ background: 'linear-gradient(135deg, #0088cc, #24A1DE)' }}
            >
              <span>Join Channel</span>
              <ChevronRight size={13} />
            </a>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 md:p-3.5 w-full space-y-3.5 fade-in">
          {displayedMatches.length > 0 ? (() => {
            const liveMatches = displayedMatches.filter(isLiveMatch)
            const upcomingMatches = displayedMatches.filter((m) => !isLiveMatch(m) && !isEndedMatch(m))
            const endedMatches = displayedMatches.filter(isEndedMatch)

            const renderGroup = (matches, label, dotCls, textCls, countCls) => matches.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2 px-0.5">
                  <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                  <span className={`text-xs font-black uppercase tracking-wider ${textCls}`}>{label}</span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${countCls}`}>{matches.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
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
              <div className="space-y-4">
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
