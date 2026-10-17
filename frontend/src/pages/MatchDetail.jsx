import TeamCard from '../components/SelectionVolumeCard'
import { processTeamData, getPreMatchTradeActivity, getLiveProviderTotals, getFrozenPreMatchProviderTotals, canCapturePreMatchProviderTotals, getMarketBetActivity } from '../utils/selectionVolume'
import { TossSnapshotDetails } from './TossDetail'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, BarChart3, BookOpen, Coins, Radio, Sparkles, AlertTriangle, Trophy, ChevronDown, LockKeyhole } from 'lucide-react'
import { CrexScorecardBanner, CrexLiveTab } from '../components/CrexLiveSection'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { predictMatchStart, lockMatchStartPrediction, getMatchStartExitAdvice, PREDICTOR_VERSION } from '../utils/matchStartPredictor'
import { getBookiePl, splitMatchOutcomes, finiteNumber, timestamp, tradeSide, getSelectionStakes, getBookiePlFromMatchedTrades } from '../utils/bookiePl'
import { teamEq } from '../utils/gatedFadePredictor'
import { tradeMatchesMarket, sessionDataFingerprint } from '../utils/sessionMetrics'
import SessionPanel from '../components/SessionPanel'
import { RiskBadge } from '../components/PredictionMeta'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle, setMatchBundle } from '../socket'
import { getCricketMatchBundle } from '../api'
import { isCompleteMatchBundle } from '../utils/matchBundle'
import { getMatchStartTimestamp, isMatchLiveByStart } from '../utils/matchTiming'

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return formatVolStr(n)
}

const fmtRs = (n) => {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}€${fmt(Math.abs(n))}`
}

const pnlCls = (n) => n == null ? 'text-text-muted' : n >= 0 ? 'text-profit' : 'text-loss'

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

const formatTotalBets = (val) => {
  const number = finiteNumber(val)
  if (number == null) return '—'
  if (Math.abs(number) >= 1000) return formatVolStr(number)
  return number.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/** Match scheduled start — not live clock / serverTime */
const formatMatchSchedule = (ts) => {
  if (ts == null || ts === '') return null
  let d
  if (typeof ts === 'number' || (/^\d+$/.test(String(ts)))) {
    const n = Number(ts)
    // seconds vs milliseconds
    d = new Date(n < 1e12 ? n * 1000 : n)
  } else {
    d = new Date(ts)
  }
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return { date, time, label: `${date} • ${time}` }
}

const findMarketRunner = (marketSnapshot, teamName) => (marketSnapshot?.runners || []).find(runner =>
  teamEq(runner?.runnerName || runner?.name || runner?.team, teamName)
) || null


export default function MatchDetail({ sport }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn, isFreeMode, authReady } = useOutletContext() || {}

  // Try to get prefetched bundle from socket cache (server pushes all active bundles on connect)
  const prefetched = getMatchBundle(matchId)
  const seedData = location.state?.matchData || null
  const seedCrex = (prefetched?.crex?.scorecard || prefetched?.crex?.ballFeeds) ? prefetched.crex
    : (seedData?.crex?.scorecard || seedData?.crex?.ballFeeds) ? seedData.crex
    : null

  // Build initial snapshot: prefetch cache first, then navigation state fallback
  const buildInitialSnapshot = () => {
    // prefetched?.cricket from cricket:matches snapshot — real data, no skeleton needed
    if (prefetched?.cricket && !prefetched._seeded) return prefetched.cricket
    // seeded bundle from cricket:matches list
    if (prefetched?.cricket) return { ...prefetched.cricket, _seeded: true }
    const m = seedData
    if (!m?.matchName) return null
    const parts = m.matchName.split(' v ')
    const t1 = parts[0]?.trim() || 'Team 1'
    const t2 = parts[1]?.trim() || 'Team 2'
    return {
      teamNames: [t1, t2],
      competitionName: m.competitionName || '',
      startTime: m.startTime || null,
      inPlay: m.inPlay || false,
      status: m.status || '',
      totalMatched: m.totalMatched || 0,
      runners: m.runners || [],
      matchLoad: m.matchLoad || null,
      teams: m.snapshot?.teams || {
        [t1]: {
          totalBet: m.matchLoad?.team1?.money || 0,
          trades: [],
          odds: m.matchLoad?.team1?.odds || m.runners?.[0]?.price || null,
        },
        [t2]: {
          totalBet: m.matchLoad?.team2?.money || 0,
          trades: [],
          odds: m.matchLoad?.team2?.odds || m.runners?.[1]?.price || null,
        },
      },
      deepMetrics: m.snapshot?.deepMetrics || {},
      advancedMetrics: m.snapshot?.advancedMetrics || {},
      preMatchPnl: m.snapshot?.preMatchPnl || {},
      preMatchTotalBets: m.snapshot?.preMatchTotalBets || {},
      inPlayPnl: m.snapshot?.inPlayPnl || {},
      inPlayTotalBets: m.snapshot?.inPlayTotalBets || {},
      preMatchVolume: m.snapshot?.preMatchVolume || {},
      inPlayVolume: m.snapshot?.inPlayVolume || {},
      bookmakerExposure: m.snapshot?.bookmakerExposure || {},
      netSupport: m.snapshot?.netSupport || {},
      sentimentScore: m.snapshot?.sentimentScore || {},
      aiPrediction: m.snapshot?.aiPrediction || null,
      _seeded: true,
    }
  }

  const [snapshot, setSnapshot] = useState(buildInitialSnapshot)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [requiresLogin, setRequiresLogin] = useState(() => authReady && !isLoggedIn)
  const [requiresPro, setRequiresPro] = useState(false)
  const [, setLastUpdated] = useState(null)
  const [crexData, setCrexData] = useState(seedCrex)
  const crexDataRef = useRef(seedCrex)
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(`tab_${matchId}`) || 'simple')
  const handleTabChange = (key) => {
    sessionStorage.setItem(`tab_${matchId}`, key)
    setActiveTab(key)
  }
  const [timeFilter, setTimeFilter] = useState('all')
  const [marketType, setMarketType] = useState('match_odds')
  const [metricsPeriod, setMetricsPeriod] = useState('pre')
  const [tossSnapshot, setTossSnapshot] = useState(prefetched?.toss || null)
  const [lockedStartPred, setLockedStartPred] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`match_start_${PREDICTOR_VERSION}_${matchId}`)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [frozenPreMatchProviderTotals, setFrozenPreMatchProviderTotals] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`pre_match_provider_totals_v2_${matchId}`)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [frozenPreMatchFields, setFrozenPreMatchFields] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`pre_match_fields_v1_${matchId}`)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [sessionTrades, setSessionTrades] = useState([])
  const [sessionOdds, setSessionOdds] = useState([])
  const [sessionMarkets, setSessionMarkets] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [timingNow, setTimingNow] = useState(() => Date.now())

  const isSessionMarket = marketType.startsWith('session_')
  const selectedSessionName = isSessionMarket ? marketType.replace('session_', '') : ''
  const selectedSessionTrades = isSessionMarket ? sessionTrades.filter(t => tradeMatchesMarket(t, selectedSessionName)) : []

  useEffect(() => {
    let cancelled = false
    // A cached snapshot is only the initial view; always refresh this route.
    setTossSnapshot(getMatchBundle(matchId)?.toss || null)

    let lastSessionFp = ''
    const applySessionData = (sessionData) => {
      if (!sessionData?.trades && !sessionData?.odds?.length) return
      const fp = sessionDataFingerprint(sessionData)
      if (fp === lastSessionFp) return
      lastSessionFp = fp
      if (sessionData.trades) setSessionTrades(sessionData.trades)
      if (sessionData.odds) setSessionOdds(sessionData.odds)
      if (sessionData.markets) {
        setSessionMarkets(Array.isArray(sessionData.markets) ? sessionData.markets : Object.values(sessionData.markets))
      }
      let activeSessionNames = []
      if (sessionData.odds?.length > 0) {
        activeSessionNames = [...new Set(sessionData.odds.map(o => o.marketName))]
      } else if (sessionData.markets?.length > 0) {
        activeSessionNames = [...new Set(sessionData.markets.map(m => m.marketName))]
      } else if (sessionData.trades) {
        activeSessionNames = [...new Set(sessionData.trades.map(t => t.team))]
      }
      setActiveSessions(activeSessionNames)
    }

    const handleBundle = (bundle) => {
      if (cancelled || !bundle) return
      // Update cache with latest data
      if (bundle.matchId) setMatchBundle(bundle.matchId, bundle)
      if (isLoginRequiredError(bundle) || bundle?.error === 'login_required') {
        setRequiresLogin(true)
        setLoading(false)
        return
      }
      if ((bundle?.code === 'SUBSCRIPTION_REQUIRED' || bundle?.status === 403 || bundle?.error === 'subscription_required') && !isFreeMode) {
        setRequiresPro(true)
        setLoading(false)
        return
      }

      const data = bundle?.cricket
      if (isLoginRequiredError(data)) {
        setRequiresLogin(true)
      } else if (data && !data.error) {
        setSnapshot(data)
        setFetchError(null)
        const now = new Date()
        setLastUpdated(now)
        window.dispatchEvent(new CustomEvent('data-refreshed', { detail: { time: now } }))
      } else if (!snapshot && data?.error) {
        setFetchError(data.error)
      }

      if (bundle?.toss && !bundle.toss.error) {
        setTossSnapshot(bundle.toss)
      } else if (bundle?.toss === null) {
        setTossSnapshot(null)
      }

      if (bundle?.session) applySessionData(bundle.session)

      if (bundle?.crex) {
        handleCrex(bundle.crex)
      } else if (data?.crex) {
        handleCrex(data.crex)
      }
      setLoading(false)
    }

    const handleCrex = (crex) => {
      if (cancelled || !crex) return
      const prev = crexDataRef.current
      // Never replace a live full scorecard with a stale/partial one
      // A full scorecard has team1/team2 objects; a partial one (odds-only) does not
      const newHasScorecard = Boolean(crex?.scorecard?.team1 || crex?.scorecard?.team2)
      const prevHasScorecard = Boolean(prev?.scorecard?.team1 || prev?.scorecard?.team2)
      // Skip update if prev has full scorecard but new is partial/lightweight (seed data or transient gap)
      if (prevHasScorecard && !newHasScorecard) return
      crexDataRef.current = crex
      setCrexData(crex)
    }

    // WebSocket Room Subscription
    const socket = getSocket()

    const onSpecificBundle = (bundle) => {
      if (String(bundle?.matchId) === String(matchId) && isCompleteMatchBundle(bundle)) {
        handleBundle(bundle)
      }
    }
    const onSpecificCrex = (crex) => {
      handleCrex(crex)
    }

    socket.on(`match:bundle:${matchId}`, onSpecificBundle)
    socket.on('match:bundle', onSpecificBundle)
    socket.on(`match:crex:${matchId}`, onSpecificCrex)

    if (socket.connected) {
      subscribeMatch(matchId, sport)
    } else {
      socket.once('connect', () => {
        if (!cancelled) subscribeMatch(matchId, sport)
      })
    }

    // Refresh even a full sessionStorage bundle: it may contain an old toss snapshot.
    // Keep the room subscription for subsequent live updates.
    getCricketMatchBundle(matchId)
      .then(data => {
        if (!cancelled && data) handleBundle(data)
      })
      .catch(() => { })

    // Safety timeout — agar 8s mein data nahi aaya toh loading hatao
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
      unsubscribeMatch(matchId)
      socket.off(`match:bundle:${matchId}`, onSpecificBundle)
      socket.off('match:bundle', onSpecificBundle)
      socket.off(`match:crex:${matchId}`, onSpecificCrex)
    }
  }, [matchId, sport, isLoggedIn])

  const liveStartPred = useMemo(() => {
    if (!snapshot) return null
    return predictMatchStart(snapshot)
  }, [snapshot])

  const effectiveInPlay = isMatchLiveByStart(snapshot, timingNow)

  useEffect(() => {
    const start = getMatchStartTimestamp({
      startTime: snapshot?.startTime,
      openDate: snapshot?.openDate,
      marketStartTime: snapshot?.marketStartTime,
    })
    if (start == null) return
    const delay = start - Date.now()
    if (delay <= 0) return
    const timer = setTimeout(() => setTimingNow(Date.now()), Math.min(delay + 25, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [snapshot?.startTime, snapshot?.openDate, snapshot?.marketStartTime, timingNow])

  useEffect(() => {
    if (liveStartPred) {
      setLockedStartPred((prev) => {
        const next = lockMatchStartPrediction(liveStartPred, prev, { inPlay: effectiveInPlay })
        if (next && matchId) {
          try {
            sessionStorage.setItem(`match_start_${PREDICTOR_VERSION}_${matchId}`, JSON.stringify(next))
          } catch { }
        }
        return next
      })
    }
  }, [liveStartPred, effectiveInPlay, matchId])

  useEffect(() => {
    if (!snapshot || !matchId) return
    const storageKey = `pre_match_provider_totals_v2_${matchId}`
    let stored = null
    try {
      const raw = sessionStorage.getItem(storageKey)
      stored = raw ? JSON.parse(raw) : null
    } catch { }

    if (canCapturePreMatchProviderTotals(snapshot)) {
      const current = getLiveProviderTotals(snapshot)
      if (!current) {
        setFrozenPreMatchProviderTotals(getFrozenPreMatchProviderTotals(snapshot, stored))
        return
      }
      setFrozenPreMatchProviderTotals(current)
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(current))
      } catch { }
      return
    }

    // Once scheduled start/live status is reached, only a previously captured
    // value or the provider's explicit frozen pre-match fields may be shown.
    setFrozenPreMatchProviderTotals(getFrozenPreMatchProviderTotals(snapshot, stored))
  }, [snapshot, matchId])

  useEffect(() => {
    if (!snapshot || !matchId) return
    const storageKey = `pre_match_fields_v1_${matchId}`
    let stored = null
    try {
      const raw = sessionStorage.getItem(storageKey)
      stored = raw ? JSON.parse(raw) : null
    } catch { }

    if (!canCapturePreMatchProviderTotals(snapshot)) {
      setFrozenPreMatchFields(stored)
      return
    }

    const current = {
      pnl: { ...(snapshot.preMatchPnl || {}) },
      bets: { ...(snapshot.preMatchTotalBets || {}) },
      volume: {
        team1: { ...(snapshot.preMatchVolume?.team1 || {}) },
        team2: { ...(snapshot.preMatchVolume?.team2 || {}) },
      },
    }
    const hasValues = [current.pnl, current.bets, current.volume.team1, current.volume.team2]
      .some(group => Object.keys(group).length > 0)
    if (!hasValues) return
    setFrozenPreMatchFields(current)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(current))
    } catch { }
  }, [snapshot, matchId])

  const hasTossData = useMemo(() => {
    if (sport !== 'cricket' || !tossSnapshot || tossSnapshot.error) return false
    const m1 = tossSnapshot.advancedMetricsV2?.team1 || tossSnapshot.supportMetrics?.team1 || null
    const m2 = tossSnapshot.advancedMetricsV2?.team2 || tossSnapshot.supportMetrics?.team2 || null
    const mTotal = ((m1?.totalBet || 0) + (m2?.totalBet || 0)) || ((m1?.back || 0) + (m2?.back || 0)) || ((m1?.lay || 0) + (m2?.lay || 0))
    const hasTrades = Array.isArray(tossSnapshot.trades) && tossSnapshot.trades.length > 0
    const hasOdds = Array.isArray(tossSnapshot.odds) && tossSnapshot.odds.length > 0
    const hasPnl = Boolean(tossSnapshot.preMatchPnl && (tossSnapshot.preMatchPnl.team1 !== undefined || tossSnapshot.preMatchPnl.team2 !== undefined))
    const hasSynthetic = Boolean(tossSnapshot.syntheticSupport && (tossSnapshot.syntheticSupport.teamA || tossSnapshot.syntheticSupport.strongerTeam))
    const hasSimplePl = Boolean(tossSnapshot.deepMetrics?.simplePL && (tossSnapshot.deepMetrics.simplePL.team1_win !== undefined || tossSnapshot.deepMetrics.simplePL.team2_win !== undefined))
    const hasTeamPl = Boolean(tossSnapshot.teams && Object.values(tossSnapshot.teams).some(t => t?.pnlIfWins !== undefined || (Array.isArray(t?.trades) && t.trades.length > 0)))

    return Boolean(mTotal > 0 || hasTrades || hasOdds || hasPnl || hasSynthetic || hasSimplePl || hasTeamPl)
  }, [sport, tossSnapshot])


  useEffect(() => {
    if (authReady && !isLoggedIn) setRequiresLogin(true)
  }, [authReady, isLoggedIn])

  useEffect(() => {
    if (!loading && activeTab === 'toss' && !hasTossData) {
      setActiveTab('simple')
    }
  }, [loading, activeTab, hasTossData])

  // On slow networks: if token exists, show skeleton instead of blank null
  // authReady false only blocks when no token at all (truly logged out)
  if (!authReady && !localStorage.getItem('auth_token')) return null

  if (requiresPro && !isFreeMode) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-4">
        <div className="rounded-2xl p-8 max-w-sm w-full text-center" style={{ background: '#fff', border: '2px solid #fbbf24', boxShadow: '0 4px 32px rgba(251,191,36,0.15)' }}>
          <div className="text-5xl mb-4">⭐</div>
          <h2 className="text-xl font-black text-text-primary mb-2">Pro Plan Needed</h2>
          <p className="text-text-secondary text-sm mb-2">Yeh match sirf <b>Pro subscribers</b> ke liye available hai.</p>
          <p className="text-text-muted text-xs mb-6">Live predictions, bookie fingerprint, aur deep metrics dekhne ke liye Pro plan lo.</p>
          <a
            href="https://t.me/cricket_edgeonline"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 rounded-xl font-bold text-white text-sm mb-3"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)' }}
          >
            🚀 Buy Pro — Telegram pe Contact Karo
          </a>
          <p className="text-xs text-text-muted mb-4">Telegram: <span className="font-bold text-[#229ED9]">@cricket_edgeonline</span></p>
          <button onClick={() => navigate(-1)} className="text-sm text-text-muted hover:text-primary">← Back</button>
        </div>
      </div>
    )
  }

  if (requiresLogin) {
    return <LoginRequiredGate />
  }

  if (fetchError && !snapshot) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-4">
        <div className="rounded-2xl p-8 max-w-md w-full text-center" style={{ background: '#111', border: '1px solid #2c2c2e' }}>
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-text-primary mb-2">Data load nahi ho paya</h2>
          <p className="text-text-muted text-sm mb-4">{fetchError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)' }}
          >
            Dubara try karo
          </button>
        </div>
      </div>
    )
  }

  if (!snapshot) return (
    <div className="p-3 sm:p-4 space-y-3 animate-pulse">
      {/* Header skeleton */}
      <div className="h-10 rounded-xl bg-[#0f1422] border border-[#1b2234]" />
      {/* Score banner skeleton */}
      <div className="h-16 rounded-xl bg-[#0f1422] border border-[#1b2234]" />
      {/* Main card skeleton */}
      <div className="rounded-xl bg-[#0c101d] border border-[#1e2538] p-4 space-y-3">
        <div className="h-4 w-1/3 rounded bg-[#1b2234]" />
        <div className="h-8 rounded bg-[#1b2234]" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 rounded-lg bg-[#1b2234]" />
          <div className="h-16 rounded-lg bg-[#1b2234]" />
        </div>
        <div className="h-4 rounded bg-[#1b2234]" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 rounded-lg bg-[#1b2234]" />
          <div className="h-16 rounded-lg bg-[#1b2234]" />
        </div>
      </div>
      {/* Stats skeleton */}
      <div className="rounded-xl bg-[#0c101d] border border-[#1e2538] p-4 space-y-2">
        <div className="h-4 w-1/4 rounded bg-[#1b2234]" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 rounded-lg bg-[#1b2234]" />
          <div className="h-12 rounded-lg bg-[#1b2234]" />
        </div>
      </div>
      <div className="rounded-xl bg-[#0c101d] border border-[#1e2538] p-4 space-y-2">
        <div className="h-4 w-1/4 rounded bg-[#1b2234]" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 rounded-lg bg-[#1b2234]" />
          <div className="h-12 rounded-lg bg-[#1b2234]" />
        </div>
      </div>
    </div>
  )

  const cachedStart =
    location.state?.startTime ?? location.state?.matchData?.startTime ??
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`match_start_${matchId}`) : null)
  const matchStartTime = snapshot.startTime ?? snapshot.openDate ?? snapshot.marketStartTime ?? cachedStart
  const matchSchedule = formatMatchSchedule(matchStartTime)
  const preMatchActivity = getPreMatchTradeActivity(snapshot, { startTime: matchStartTime })
  const { t1, t2, drawName } = splitMatchOutcomes(snapshot.teamNames)
  const hasDraw = !!drawName
  const t1Trades = (snapshot.teams?.[t1] || {}).trades || []
  const t2Trades = (snapshot.teams?.[t2] || {}).trades || []
  const drawTrades = hasDraw ? ((snapshot.teams?.[drawName] || {}).trades || []) : []

  const getLatestOdds = (trades, teamKey) => {
    const sorted = [...trades].sort((a, b) => (timestamp(b.updatedAt) || 0) - (timestamp(a.updatedAt) || 0))
    let back = sorted.find(t => tradeSide(t) === 'back')?.price
    let lay = sorted.find(t => tradeSide(t) === 'lay')?.price

    // Fallback to runners from seed snapshot / matchLoad
    if (back == null || lay == null) {
      const runner = (snapshot?.runners || []).find(r =>
        (r.runnerName && teamKey && r.runnerName.toLowerCase().includes(teamKey.toLowerCase())) ||
        (teamKey && r.runnerName && teamKey.toLowerCase().includes(r.runnerName.toLowerCase()))
      )
      if (runner) {
        if (back == null) back = runner.back || runner.backPrice || runner.ex?.availableToBack?.[0]?.price || null
        if (lay == null) lay = runner.lay || runner.layPrice || runner.ex?.availableToLay?.[0]?.price || null
      }
    }

    return { back: finiteNumber(back) > 1 ? finiteNumber(back) : null, lay: finiteNumber(lay) > 1 ? finiteNumber(lay) : null }
  }
  const t1Odds = getLatestOdds(t1Trades, t1)
  const t2Odds = getLatestOdds(t2Trades, t2)
  const drawOdds = hasDraw ? getLatestOdds(drawTrades, drawName) : null
  const am1 = getSelectionStakes(snapshot, t1)
  const am2 = getSelectionStakes(snapshot, t2)

  const { pl1, pl2, plDraw } = getBookiePl(snapshot, t1, t2, drawName)
  const matchStartPred = lockedStartPred || liveStartPred

  const pickName = matchStartPred?.winnerName
  const isPickT1 = pickName ? teamEq(pickName, t1) : false
  const pickBackOdds = isPickT1 ? t1Odds?.back : t2Odds?.back
  const oppBackOdds = isPickT1 ? t2Odds?.back : t1Odds?.back
  const exitAdvice = (matchStartPred && effectiveInPlay && pickName)
    ? getMatchStartExitAdvice({
      lockedPick: matchStartPred,
      inPlay: effectiveInPlay,
      pickBackOdds: typeof pickBackOdds === 'number' ? pickBackOdds : parseFloat(pickBackOdds),
      opponentBackOdds: typeof oppBackOdds === 'number' ? oppBackOdds : parseFloat(oppBackOdds),
    })
    : null

  const validMarketTrades = (trades) => trades.filter(trade => (
    finiteNumber(trade?.size) > 0 && finiteNumber(trade?.price) > 1 && tradeSide(trade)
  ))
  const t1ValidTrades = validMarketTrades(t1Trades)
  const t2ValidTrades = validMarketTrades(t2Trades)
  const drawValidTrades = hasDraw ? validMarketTrades(drawTrades) : []

  // The provider exposes two different metrics: this total-bet/activity ledger,
  // and an exposure-based provider total shown separately in Period data.
  const marketBetActivity = getMarketBetActivity(snapshot, {
    live: effectiveInPlay,
    frozenPreMatchBets: frozenPreMatchFields?.bets,
  })
  const [marketBets1, marketBets2] = marketBetActivity.values

  // Second bar is money matched per selection. The declared metric is a fallback
  // for older snapshots which do not contain the complete trade array.
  const sumTradeMoney = (trades) => trades.reduce((sum, trade) => sum + finiteNumber(trade.size), 0)
  const drawMetrics = hasDraw ? getSelectionStakes(snapshot, drawName) : null
  const marketMoney1 = sumTradeMoney(t1ValidTrades) || am1.totalBet || 0
  const marketMoney2 = sumTradeMoney(t2ValidTrades) || am2.totalBet || 0
  const marketMoneyDraw = hasDraw ? (sumTradeMoney(drawValidTrades) || drawMetrics?.totalBet || 0) : 0
  const marketMoneyTotal = marketMoney1 + marketMoney2 + marketMoneyDraw
  const marketMoneyPct1 = marketMoneyTotal > 0 ? (marketMoney1 / marketMoneyTotal) * 100 : 50
  const marketMoneyPct2 = marketMoneyTotal > 0 ? (marketMoney2 / marketMoneyTotal) * 100 : 50
  const marketMoneyPctDraw = marketMoneyTotal > 0 ? (marketMoneyDraw / marketMoneyTotal) * 100 : 0

  // ━━━━━━━━━━ BACK/LAY RATIO BASED PREDICTION ━━━━━━━━━━
  const aBack = am1.back || 0
  const aLay = am1.lay || 0
  const bBack = am2.back || 0
  const bLay = am2.lay || 0

  // lay/back ratio — >1 means lay dominant = bookie team (predicted winner)
  const aRatio = aLay > 0 ? aBack / aLay : null
  const bRatio = bLay > 0 ? bBack / bLay : null
  const aTotalBL = aBack + aLay
  const bTotalBL = bBack + bLay
  const aBackPct = aTotalBL > 0 ? (aBack / aTotalBL) * 100 : 50
  const bBackPct = bTotalBL > 0 ? (bBack / bTotalBL) * 100 : 50
  const lowerRatioTeam = aRatio != null && bRatio != null && aRatio !== bRatio
    ? (aRatio < bRatio ? t1 : t2)
    : null

  // Original provider period metrics shown on the first version of this page.
  const ip = snapshot.inPlayPnl || {}
  const ib = snapshot.inPlayTotalBets || {}
  const currentPreMatchFields = {
    pnl: snapshot.preMatchPnl || {},
    bets: snapshot.preMatchTotalBets || {},
    volume: snapshot.preMatchVolume || {},
  }
  const preMatchFields = canCapturePreMatchProviderTotals(snapshot, timingNow)
    ? currentPreMatchFields
    : (frozenPreMatchFields || currentPreMatchFields)
  const pp = preMatchFields.pnl || {}
  const pb = preMatchFields.bets || {}
  const iv = snapshot.inPlayVolume || {}
  const pv = preMatchFields.volume || {}
  const tmp = snapshot.threeMinPnl || {}
  const tmb = snapshot.threeMinTotalBets || {}
  const tmv = snapshot.threeMinVolume || {}

  const get3mMetrics = (teamName) => {
    const trades = snapshot?.teams?.[teamName]?.trades || []
    if (!trades.length) return { back: 0, lay: 0, total: 0 }
    const cutoff = Date.now() - 3 * 60 * 1000
    let back = 0
    let lay = 0
    for (const trade of trades) {
      if (new Date(trade.updatedAt).getTime() < cutoff) continue
      const size = parseFloat(trade.size) || 0
      const side = tradeSide(trade)
      if (side === 'back') back += size
      else if (side === 'lay') lay += size
    }
    return { back, lay, total: back + lay }
  }

  const finalTmv = {
    team1: (tmv.team1 && (tmv.team1.total > 0 || tmv.team1.back > 0 || tmv.team1.lay > 0)) ? tmv.team1 : get3mMetrics(t1),
    team2: (tmv.team2 && (tmv.team2.total > 0 || tmv.team2.back > 0 || tmv.team2.lay > 0)) ? tmv.team2 : get3mMetrics(t2),
  }
  const finalTmb = {
    team1: tmb.team1 ?? (snapshot.teams?.[t1]?.trades?.filter(t => (Date.now() - new Date(t.updatedAt).getTime()) <= 180000).length || 0),
    team2: tmb.team2 ?? (snapshot.teams?.[t2]?.trades?.filter(t => (Date.now() - new Date(t.updatedAt).getTime()) <= 180000).length || 0),
  }
  const finalTmp = tmp

  const exp = snapshot.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const sent = snapshot.sentimentScore || {}
  const ns = snapshot.netSupport || {}

  const graphSnap = snapshot
  const graphT1 = t1
  const graphT2 = t2
  const effectiveTimeFilter = timeFilter
  const t1GraphData = processTeamData(graphT1, graphSnap?.teams?.[graphT1], effectiveTimeFilter, findMarketRunner(graphSnap, graphT1))
  const t2GraphData = processTeamData(graphT2, graphSnap?.teams?.[graphT2], effectiveTimeFilter, findMarketRunner(graphSnap, graphT2))
  const sessionGraphData = isSessionMarket ? processTeamData('Total Runs', { trades: selectedSessionTrades }, timeFilter) : null

  const tossT1Name = tossSnapshot?.teamNames?.[0] || t1
  const tossT2Name = tossSnapshot?.teamNames?.[1] || t2
  const { pl1: tossT1BookiePL, pl2: tossT2BookiePL } = getBookiePlFromMatchedTrades(tossSnapshot, tossT1Name, tossT2Name)
  const tossT1GraphData = tossSnapshot ? processTeamData(tossT1Name, tossSnapshot.teams?.[tossT1Name], effectiveTimeFilter, findMarketRunner(tossSnapshot, tossT1Name)) : null
  const tossT2GraphData = tossSnapshot ? processTeamData(tossT2Name, tossSnapshot.teams?.[tossT2Name], effectiveTimeFilter, findMarketRunner(tossSnapshot, tossT2Name)) : null
  const tossMarketVol = (tossT1GraphData?.totalBet || 0) + (tossT2GraphData?.totalBet || 0)

  // Keep graph settlement values aligned with their respective summaries.
  if (t1GraphData) t1GraphData.bookieProfitIfWins = pl1
  if (t2GraphData) t2GraphData.bookieProfitIfWins = pl2
  if (tossT1GraphData) tossT1GraphData.bookieProfitIfWins = tossT1BookiePL
  if (tossT2GraphData) tossT2GraphData.bookieProfitIfWins = tossT2BookiePL
  const marketVol = (t1GraphData?.totalBet || 0) + (t2GraphData?.totalBet || 0)


  const marketSelections = [
    { name: t1, odds: t1Odds, pl: pl1, money: marketMoney1, moneyPct: marketMoneyPct1, bets: marketBets1 },
    { name: t2, odds: t2Odds, pl: pl2, money: marketMoney2, moneyPct: marketMoneyPct2, bets: marketBets2 },
    ...(hasDraw ? [{ name: drawName, odds: drawOdds, pl: plDraw, money: marketMoneyDraw, moneyPct: marketMoneyPctDraw, bets: null }] : []),
  ]
  const periods = [
    { key: 'pre', label: 'Pre-match', pnl: pp, bets: pb, vol: pv },
    { key: 'live', label: 'In-play', pnl: ip, bets: ib, vol: iv },
    { key: '3min', label: 'Last 3 min', pnl: finalTmp, bets: finalTmb, vol: finalTmv },
  ]
  const period = periods.find(item => item.key === metricsPeriod) || periods[0]
  const liveProviderTotals = getLiveProviderTotals(snapshot) || getFrozenPreMatchProviderTotals(snapshot) || [null, null]
  const preMatchProviderTotals = frozenPreMatchProviderTotals || getFrozenPreMatchProviderTotals(snapshot) || [null, null]
  const flowRows = [
    { label: 'Back stake', values: [am1.back, am2.back], format: 'currency', tone: 'back' },
    { label: 'Lay stake', values: [am1.lay, am2.lay], format: 'currency', tone: 'lay' },
    { label: 'Back / lay ratio', values: [aRatio, bRatio], format: 'ratio' },
    { label: 'Back / lay share', values: [aTotalBL > 0 ? aBackPct : null, bTotalBL > 0 ? bBackPct : null], format: 'split' },
    { label: 'Net exposure', values: [exp1.netExposure, exp2.netExposure], format: 'signed' },
    { label: 'Back risk', values: [exp1.backExposure, exp2.backExposure], format: 'currency', tone: 'back' },
    { label: 'Lay risk', values: [exp1.layExposure, exp2.layExposure], format: 'currency', tone: 'lay' },
    ...(liveProviderTotals.some(value => value != null) ? [{ label: 'Provider total', values: liveProviderTotals, format: 'currency', emphasis: true }] : []),
    ...(ns.teamA && sent.teamA ? [{ label: 'Market sentiment', values: [ns.percentageA, ns.percentageB], format: 'percent' }] : []),
  ]
  const periodRows = [
    { label: 'Bookie P/L', values: [period.pnl?.team1, period.pnl?.team2], format: 'signed' },
    { label: 'Reported activity', values: [period.bets?.team1, period.bets?.team2], format: 'number' },
    ...(metricsPeriod === 'pre' && preMatchProviderTotals.some(value => value != null) ? [{ label: 'Provider total', values: preMatchProviderTotals, format: 'currency', emphasis: true }] : []),
    ...(metricsPeriod === 'pre' ? [{
      label: 'Recorded trades',
      values: [t1, t2].map(name => preMatchActivity.available ? {
        count: preMatchActivity.counts[name],
        pct: preMatchActivity.total > 0 ? preMatchActivity.counts[name] / preMatchActivity.total * 100 : null,
      } : null),
      format: 'activity',
    }] : []),
    { label: 'Back volume', values: [period.vol?.team1?.back, period.vol?.team2?.back], format: 'currency', tone: 'back' },
    { label: 'Lay volume', values: [period.vol?.team1?.lay, period.vol?.team2?.lay], format: 'currency', tone: 'lay' },
  ]
  const insightRows = metricsPeriod === 'exposure' ? flowRows : periodRows
  const evidence = matchStartPred?.marketEvidence
  const percentage = value => Number.isFinite(value) ? `${value.toFixed(0)}%` : '—'
  const formatInsightValue = (row, value) => {
    if (row.format === 'activity') return value == null ? '—' : <>{value.count.toLocaleString('en-IN')} <small>{value.pct == null ? '(—)' : `(${percentage(value.pct)})`}</small></>
    if (row.format === 'signed') return fmtRs(value)
    if (row.format === 'currency') return value == null ? '—' : `€${fmt(value)}`
    if (row.format === 'ratio') return value == null ? '—' : `${value.toFixed(2)}×`
    if (row.format === 'split') return value == null ? '—' : `${value.toFixed(0)}% / ${(100 - value).toFixed(0)}%`
    if (row.format === 'percent') return value == null ? '—' : `${Number(value).toFixed(1)}%`
    return fmt(value)
  }

  return (
    <div className="detail-page match-workbench w-full">

      {/* Header with Tabs */}
      <div className="match-detail-toolbar sticky top-0 z-30">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="match-detail-back"
        >
          <ArrowLeft size={14} /> <span>Back</span>
        </button>

        <div className="match-detail-tabs" role="tablist" aria-label="Match views">
          {[
            { key: 'simple', label: 'Market', icon: <BookOpen size={13} /> },
            sport === 'cricket' && crexData ? {
              key: 'crex',
              label: 'Live',
              icon: <Radio size={13} />
            } : null,
            sport === 'cricket' && hasTossData ? {
              key: 'toss',
              label: 'Toss',
              icon: <Coins size={13} />
            } : null,
          ].filter(Boolean).map(({ key, label, icon }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-label={label}
                aria-selected={isActive}
                onClick={() => handleTabChange(key)}
                className={`match-detail-tab${isActive ? ' is-active' : ''}`}
              >
                {icon}
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {activeTab !== 'toss' && <header className="match-page-heading">
        <div><span className="match-eyebrow">{snapshot.competitionName || 'Match market'}</span><h1>{t1} <span>vs</span> {t2}</h1></div>
        <div className="match-schedule">{effectiveInPlay && <span className="match-live-tag"><span />Live</span>}{matchSchedule && <span>{matchSchedule.date} · {matchSchedule.time}</span>}</div>
      </header>}

      {/* ── Live Scorecard Hero Banner — cricket only ── */}
      {sport === 'cricket' && activeTab !== 'toss' && <CrexScorecardBanner crexData={crexData} t1={t1} t2={t2} matchInPlay={effectiveInPlay} />}

      {activeTab === 'toss' ? (
        <div className="space-y-4">
          {tossSnapshot ? (
            <>
              <TossSnapshotDetails snap={tossSnapshot} isEmbedded />

              {/* Toss Graph Team Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                <TeamCard teamData={tossT1GraphData} isToss={true} marketVol={tossMarketVol} />
                <TeamCard teamData={tossT2GraphData} isToss={true} marketVol={tossMarketVol} />
              </div>
            </>
          ) : (
            <div className="rounded-xl p-6 max-w-md mx-auto text-center border border-[#1e2538] my-6 bg-[#0c101d] shadow-xl">
              <div className="text-3xl mb-2">🪙</div>
              <h3 className="text-sm font-bold text-white mb-1">Toss Market Synchronizing</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Toss orderbook and live bookie load for <b>{t1} vs {t2}</b> will appear here as soon as the toss market is opened on the exchange.
              </p>
            </div>
          )}
        </div>
      ) : activeTab === 'session' ? (
        <SessionPanel odds={sessionOdds} trades={sessionTrades} markets={sessionMarkets} t1={t1} t2={t2} />
      ) : activeTab === 'crex' && sport === 'cricket' && crexData ? (
        <CrexLiveTab crexData={crexData} t1={t1} t2={t2} />
      ) : (
        <div className="match-v2-shell">
          {exitAdvice && <div className={`match-exit-advice is-${exitAdvice.level}`} role="alert"><AlertTriangle size={16} /><div><strong>{exitAdvice.title}</strong><p>{exitAdvice.message}</p></div></div>}
          {matchStartPred?.winnerName && <section className="match-v2-prediction" aria-label="Match winner prediction">
              <div className="match-v2-prediction-title"><span><Sparkles size={14} />League prediction</span><div><span className="match-rule-tag">Rule based</span><RiskBadge risk={matchStartPred.risk} compact /></div></div>
              <div className="match-v2-pick"><span className="match-v2-pick-icon"><Trophy size={18} /></span><div><small>{matchStartPred.risk?.avoidEntry || matchStartPred.risk?.tier === 'high' ? 'Market lean · no bet' : 'Predicted winner'}</small><h2>{matchStartPred.winnerName}</h2></div></div>
              <div className="match-v2-prediction-copy">
                {matchStartPred.confidence?.calibrated && <strong>{matchStartPred.confidence.pct}% calibrated confidence</strong>}
                {(matchStartPred.risk?.avoidEntry || matchStartPred.risk?.tier === 'high') && <span className="match-risk-notice" role="alert"><AlertTriangle size={13} />High risk: entry avoid karein</span>}
                <p>{matchStartPred.reason}</p>
                <div><span><LockKeyhole size={10} />Start pick locked</span>{!matchStartPred.confidence?.calibrated && <span>Accuracy unvalidated</span>}</div>
              </div>
              {evidence && <details className="match-v2-evidence"><summary><span>Market evidence</span><span>{evidence.agreeingSignals}/{evidence.signalCount} signals</span></summary>
                <table className="match-data-table" aria-label="Prediction market evidence"><thead><tr><th scope="col">Signal</th><th scope="col">{t1}</th><th scope="col">{t2}</th></tr></thead><tbody>
                  <tr><th scope="row">Corrected support</th><td>{percentage(evidence.support?.pct1)}</td><td>{percentage(evidence.support?.pct2)}</td></tr>
                  <tr><th scope="row">Pre-match activity</th><td>{percentage(evidence.activity?.pct1)}</td><td>{percentage(evidence.activity?.pct2)}</td></tr>
                  <tr><th scope="row">Bookie liability</th><td>{evidence.bookmakerPressureIdx === 0 ? 'Pressure' : '—'}</td><td>{evidence.bookmakerPressureIdx === 1 ? 'Pressure' : '—'}</td></tr>
                </tbody></table>
              </details>}
            </section>}

          <section className="match-v2-card" aria-labelledby="match-market-heading">
            <header className="match-v2-section-head"><div><h2 id="match-market-heading">Market overview</h2><p>Latest recorded odds and settlement</p></div><span><strong>€{fmt(marketMoneyTotal)}</strong> matched · {formatTotalBets(marketBetActivity.total)} total bets</span></header>
            <div className={`match-market-cards${hasDraw ? ' has-three' : ''}`} aria-label="Market activity, odds and bookmaker profit">
              {marketSelections.map((side, index) => <article className={`match-market-team team-${index}`} key={side.name}>
                <header className="match-market-team-name"><span>{side.name.split(/\s+/).map(word=>word[0]).join('').slice(0,3)}</span><h3>{side.name}</h3></header>
                <div className="match-market-team-odds" aria-label={`${side.name} best odds`}>
                  <div><small>Back</small><strong>{formatOdds(side.odds?.back)}</strong></div>
                  <div><small>Lay</small><strong>{formatOdds(side.odds?.lay)}</strong></div>
                </div>
                <div className="match-market-team-stats">
                  <div><small>Total bets</small><strong>{formatTotalBets(side.bets)}</strong></div>
                  <div><small>Bookie P/L</small><strong className={pnlCls(side.pl)}>{fmtRs(side.pl)}</strong></div>
                </div>
                <div className="match-market-team-matched">
                  <div><small>Total matched</small><strong>€{fmt(side.money)}</strong><span>of €{fmt(marketMoneyTotal)}</span></div>
                  <b>{marketMoneyTotal > 0 ? percentage(side.moneyPct) : '—'}</b>
                </div>
                <div className="match-market-team-bar" aria-label={`${side.name} ${marketMoneyTotal > 0 ? percentage(side.moneyPct) : 'matched share unavailable'}`}><span style={{ width: `${marketMoneyTotal > 0 ? Math.max(0, Math.min(100, side.moneyPct)) : 0}%` }} /></div>
              </article>)}
            </div>
          </section>

          <section className="match-v2-card match-v2-insights">
            <header className="match-v2-section-head"><div><h2>Period data</h2><p>{metricsPeriod === 'exposure' ? 'Recorded market totals' : metricsPeriod === 'pre' ? 'Values captured before match start' : 'Provider-reported period values'}</p></div></header>
            <div className="match-v2-tabs" role="tablist" aria-label="Metrics period">{[...periods, { key: 'exposure', label: 'Exposure' }].map(item => <button key={item.key} type="button" role="tab" aria-selected={metricsPeriod === item.key} onClick={()=>setMetricsPeriod(item.key)}>{item.label}</button>)}</div>
            <div className="match-v2-table" style={{ '--team-count': 2 }} role="table" aria-label={metricsPeriod === 'exposure' ? 'Market stakes ratios and exposure' : `${period.label} metrics`}>
              <div className="match-v2-table-head" role="row"><span role="columnheader">Metric</span>{[t1, t2].map(name => <div role="columnheader" key={name}><span>{name.split(/\s+/).map(word=>word[0]).join('').slice(0,3)}</span><strong>{name}</strong></div>)}</div>
              {insightRows.map(row => <div className={`match-v2-table-row${row.emphasis ? ' is-emphasis' : ''}`} role="row" key={row.label}>
                <span role="rowheader">{row.label}</span>
                {row.values.map((value,index) => <strong role="cell" key={index} className={row.format === 'signed' ? pnlCls(value) : row.tone ? `match-tone-${row.tone}` : ''}>{formatInsightValue(row, value)}</strong>)}
              </div>)}
            </div>
            {metricsPeriod === 'exposure' && lowerRatioTeam && <p className="match-panel-note">Lower back/lay ratio: <strong>{lowerRatioTeam}</strong></p>}
            {metricsPeriod === 'pre' && <p className="match-panel-note">{preMatchActivity.available ? <>Captured Back + Lay entries before scheduled start.{hasDraw && <> Draw: {preMatchActivity.counts[drawName].toLocaleString('en-IN')} ({preMatchActivity.total > 0 ? percentage(preMatchActivity.counts[drawName] / preMatchActivity.total * 100) : '—'}).</>}</> : `Recorded trades unavailable: ${preMatchActivity.reason}`}</p>}
          </section>

          <details className="match-v2-card match-depth-panel">
            <summary className="match-depth-summary"><span><BarChart3 size={16} /><strong>Market depth &amp; trades</strong><small>€{formatVolStr(marketVol)} volume</small></span><ChevronDown size={16} /></summary>
            <div className="match-depth-content">
            <header className="match-depth-toolbar"><div><h2>Recorded trades</h2><p>Filter price history and market depth</p></div>
              <div className="match-depth-controls"><div className="match-period-tabs" aria-label="Trade history range">{[['all','All'],['3h','3H'],['1h','1H']].map(([key,label])=><button key={key} type="button" aria-pressed={timeFilter===key} onClick={()=>setTimeFilter(key)}>{label}</button>)}</div>
                {activeSessions?.length > 0 && <select aria-label="Recorded market" value={marketType} onChange={event=>setMarketType(event.target.value)}><option value="match_odds">Match odds</option>{activeSessions.map(session=><option key={session} value={`session_${session}`}>{session}</option>)}</select>}
              </div>
            </header>
            {isSessionMarket ? <div><h3 className="match-session-title">{selectedSessionName} · €{formatVolStr(sessionGraphData?.totalBet || 0)}</h3><TeamCard teamData={sessionGraphData} isToss={false} isSession={true} marketVol={sessionGraphData?.totalBet || 0} /></div>
              : <div className="match-price-grid"><TeamCard teamData={t1GraphData} isToss={false} marketVol={marketVol} /><TeamCard teamData={t2GraphData} isToss={false} marketVol={marketVol} /></div>}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
