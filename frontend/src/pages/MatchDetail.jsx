import { getPreMatchPeriod } from '../utils/preMatchPeriod'
import { capturePreMatchExposure } from '../../../server/utils/preMatchExposure.mjs'
import { getLiveProviderTotals, getFrozenPreMatchProviderTotals, canCapturePreMatchProviderTotals } from '../utils/selectionVolume'
import { TossSnapshotDetails } from './TossDetail'
import MarketWorkbench from '../components/MarketWorkbench'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, BookOpen, Coins, Radio } from 'lucide-react'
import { CrexScorecardBanner, CrexLiveTab } from '../components/CrexLiveSection'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import SubscriptionRequiredGate from '../components/SubscriptionRequiredGate'
import { requiresPaidMatchAccess, isSubscriptionRequiredError } from '../utils/matchAccess'
import { predictMatchStart, lockMatchStartPrediction, PREDICTOR_VERSION } from '../utils/matchStartPredictor'
import { splitMatchOutcomes, finiteNumber } from '../utils/bookiePl'
import { sessionDataFingerprint } from '../utils/sessionMetrics'
import SessionPanel from '../components/SessionPanel'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle, setMatchBundle } from '../socket'
import { getCricketMatchBundle, getCricketOdds, getTennisSnapshot } from '../api'
import { isCompleteMatchBundle } from '../utils/matchBundle'
import { getMatchStartTimestamp, isMatchEnded, isMatchLiveByStart } from '../utils/matchTiming'

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


export default function MatchDetail({ sport }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn, isFreeMode, authReady, user } = useOutletContext() || {}

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
  const requiredFeature = sport === 'tennis' ? 'tennis' : 'cricket'
  const subscriptionBlocked = requiresPaidMatchAccess({ authReady, isLoggedIn, isFreeMode, user, match: snapshot || seedData, feature: requiredFeature })
  const [, setLastUpdated] = useState(null)
  const [crexData, setCrexData] = useState(seedCrex)
  const [liveOdds, setLiveOdds] = useState(null)
  const crexDataRef = useRef(seedCrex)
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(`tab_${matchId}`) || 'simple')
  const handleTabChange = (key) => {
    sessionStorage.setItem(`tab_${matchId}`, key)
    setActiveTab(key)
  }
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
      const saved = sessionStorage.getItem(`pre_match_provider_totals_v3_${matchId}`)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [frozenPreMatchFields, setFrozenPreMatchFields] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`pre_match_fields_v2_${matchId}`)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [completePreMatchCapture,setCompletePreMatchCapture]=useState(null)
  const [sessionTrades, setSessionTrades] = useState([])
  const [sessionOdds, setSessionOdds] = useState([])
  const [sessionMarkets, setSessionMarkets] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [timingNow, setTimingNow] = useState(() => Date.now())

  useEffect(() => {
    if (subscriptionBlocked) return
    let cancelled = false
    let receivedBundle = false
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
      receivedBundle = true
      // Update cache with latest data
      if (bundle.matchId) setMatchBundle(bundle.matchId, bundle)
      if (isLoginRequiredError(bundle) || bundle?.error === 'login_required') {
        setRequiresLogin(true)
        setLoading(false)
        return
      }
      if (isSubscriptionRequiredError(bundle) && !isFreeMode) {
        setRequiresPro(true)
        setLoading(false)
        return
      }

      const data = bundle?.cricket
      if (isLoginRequiredError(data)) {
        setRequiresLogin(true)
      } else if (data && !data.error) {
        setRequiresPro(false)
        setRequiresLogin(false)
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
        receivedBundle = true
        handleBundle(bundle)
      }
    }
    const onSpecificCrex = (crex) => {
      handleCrex(crex)
    }

    socket.on(`match:bundle:${matchId}`, onSpecificBundle)
    socket.on('match:bundle', onSpecificBundle)
    socket.on(`match:crex:${matchId}`, onSpecificCrex)

    subscribeMatch(matchId, sport)

    // Socket normally supplies the initial bundle. Use HTTP only as a delayed
    // fallback so opening MatchDetail does not download the same large payload twice.
    const bundleFallbackTimer = setTimeout(() => {
      if (cancelled || receivedBundle || document.hidden) return
      const requestBundle = sport === 'tennis'
        ? getTennisSnapshot(matchId).then(cricket => ({ matchId, sport: 'tennis', cricket }))
        : getCricketMatchBundle(matchId)
      requestBundle
        .then(data => {
          if (!cancelled && !receivedBundle && data) handleBundle(data)
        })
        .catch(error => {
          if (!cancelled && !receivedBundle) handleBundle(error)
        })
    }, 6000)

    // Safety timeout — agar 8s mein data nahi aaya toh loading hatao
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
      clearTimeout(bundleFallbackTimer)
      unsubscribeMatch(matchId)
      socket.off(`match:bundle:${matchId}`, onSpecificBundle)
      socket.off('match:bundle', onSpecificBundle)
      socket.off(`match:crex:${matchId}`, onSpecificCrex)
    }
  }, [matchId, sport, isLoggedIn, isFreeMode, subscriptionBlocked])

  const matchEnded = isMatchEnded(snapshot)

  useEffect(() => {
    setLiveOdds(null)
    if (sport !== 'cricket' || !matchId || !authReady || !isLoggedIn || requiresLogin || requiresPro || subscriptionBlocked || matchEnded) return
    let cancelled = false
    let requestInFlight = false

    const socket = getSocket()

    const onOddsUpdate = (data) => {
      if (cancelled) return
      if (String(data?.matchId) === String(matchId) && data?.odds) {
        setLiveOdds(data)
      }
    }

    socket.on('match:odds', onOddsUpdate)
    socket.on(`match:odds:${matchId}`, onOddsUpdate)

    const refreshOdds = async () => {
      if (cancelled || requestInFlight || document.hidden) return
      // When socket is connected and already delivering live updates, skip redundant HTTP polling
      if (socket.connected && liveOdds) return
      requestInFlight = true
      try {
        const data = await getCricketOdds(matchId)
        if (!cancelled && data?.odds && !data.error) setLiveOdds(data)
      } catch {
        // The full bundle remains the fallback if the lightweight odds request fails.
      } finally {
        requestInFlight = false
      }
    }

    const onVisibilityChange = () => {
      if (!document.hidden) refreshOdds()
    }

    refreshOdds()
    const oddsTimer = setInterval(refreshOdds, 20000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(oddsTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      socket.off('match:odds', onOddsUpdate)
      socket.off(`match:odds:${matchId}`, onOddsUpdate)
    }
  }, [matchId, sport, authReady, isLoggedIn, requiresLogin, requiresPro, subscriptionBlocked, matchEnded])

  const effectiveInPlay = isMatchLiveByStart(snapshot, timingNow)

  const { matchStartTime, preMatchSnapshot, preMatchFields, predictionSnapshot } = useMemo(() => {
    const cachedStart = location.state?.startTime ?? location.state?.matchData?.startTime ??
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`match_start_${matchId}`) : null)
    const startTime = snapshot?.startTime ?? snapshot?.openDate ?? snapshot?.marketStartTime ?? cachedStart
    const periodSnapshot = snapshot
      ? capturePreMatchExposure({ ...snapshot, startTime }, completePreMatchCapture, { now: Date.now() })
      : null
    const periodFields = periodSnapshot ? getPreMatchPeriod(periodSnapshot, {
      startTime,
      captured: frozenPreMatchFields,
      capturedTotals: frozenPreMatchProviderTotals,
    }) : null
    const predictionBase = periodSnapshot && periodFields?.providerTotals?.some(value => value != null)
      ? {
        ...periodSnapshot,
        preMatchProviderTotals: { team1: periodFields.providerTotals[0], team2: periodFields.providerTotals[1] },
        deepMetrics: {
          ...(periodSnapshot.deepMetrics || {}),
          preMatchTotals: { team1: periodFields.providerTotals[0], team2: periodFields.providerTotals[1] },
        },
      }
      : snapshot
    const livePnl = snapshot?.inPlayPnl ?? predictionBase?.inPlayPnl
    const pnl1 = livePnl?.team1 == null || String(livePnl.team1).trim() === '' ? null : Number(livePnl.team1)
    const pnl2 = livePnl?.team2 == null || String(livePnl.team2).trim() === '' ? null : Number(livePnl.team2)
    const hasLivePnlValues = Number.isFinite(pnl1) && Number.isFinite(pnl2) && (pnl1 !== 0 || pnl2 !== 0)
    const predictionInput = predictionBase ? {
      ...predictionBase,
      inPlay: effectiveInPlay,
      inPlayPnl: livePnl,
      status: snapshot?.status ?? predictionBase.status,
      useInPlayPnl: hasLivePnlValues,
    } : null
    return { matchStartTime: startTime, preMatchSnapshot: periodSnapshot, preMatchFields: periodFields,
      predictionSnapshot: predictionInput }
  }, [snapshot, completePreMatchCapture, frozenPreMatchFields, frozenPreMatchProviderTotals,
    location.state?.startTime, location.state?.matchData?.startTime, matchId, effectiveInPlay])

  const liveStartPred = useMemo(() => predictionSnapshot ? predictMatchStart(predictionSnapshot) : null, [predictionSnapshot])

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
    if (!liveStartPred) {
      setLockedStartPred(null)
      try { sessionStorage.removeItem(`match_start_${PREDICTOR_VERSION}_${matchId}`) } catch { }
      return
    }
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
  }, [liveStartPred, effectiveInPlay, matchId, snapshot?.competitionName])

  useEffect(() => {
    if (!snapshot || !matchId) return
    const storageKey = `pre_match_provider_totals_v3_${matchId}`
    let stored = null
    try {
      const raw = sessionStorage.getItem(storageKey)
      stored = raw ? JSON.parse(raw) : null
    } catch { }

    if (canCapturePreMatchProviderTotals(snapshot)) {
      const current = getFrozenPreMatchProviderTotals(snapshot,
        getFrozenPreMatchProviderTotals({ preMatchProviderTotals: getLiveProviderTotals(snapshot) }, stored))
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
    const storageKey = `pre_match_fields_v2_${matchId}`
    let stored = null
    try {
      const raw = sessionStorage.getItem(storageKey)
      stored = raw ? JSON.parse(raw) : null
    } catch { }

    if (snapshot._seeded || !canCapturePreMatchProviderTotals(snapshot)) {
      setFrozenPreMatchFields(stored)
      return
    }

    const current = {
      startTime: snapshot.startTime ?? snapshot.openDate ?? snapshot.marketStartTime,
      teamNames: snapshot.teamNames,
      pnl: { ...(snapshot.preMatchPnl || {}) },
      bets: { ...(snapshot.preMatchTotalBets || {}) },
      volume: {
        ...snapshot.preMatchVolume,
      },
    }
    const hasValues = [current.pnl, current.bets, ...Object.values(current.volume)]
      .some(group => Object.values(group || {}).some(value => finiteNumber(value) != null && Number(value) !== 0))
    if (!hasValues) return
    setFrozenPreMatchFields(current)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(current))
    } catch { }
  }, [snapshot, matchId])

  useEffect(()=>{
    if(!snapshot || !matchId)return
    const key=`pre_match_complete_capture_v2_${matchId}`
    let stored=null
    try { stored=JSON.parse(sessionStorage.getItem(key)||'null') } catch {}
    const resolved=capturePreMatchExposure(snapshot,stored,{now:Date.now()})
    const locked=resolved?.preMatchCapture?.state==='locked' ? resolved.preMatchCapture : null
    setCompletePreMatchCapture(locked)
    if(locked)try { sessionStorage.setItem(key,JSON.stringify(locked)) } catch {}
  },[snapshot,matchId])

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

  if ((requiresPro || subscriptionBlocked) && !isFreeMode) {
    return <SubscriptionRequiredGate featureLabel={sport === 'tennis' ? 'Tennis' : 'Cricket'} onBack={() => navigate(sport === 'tennis' ? '/tennis' : '/cricket')} />
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

  const matchSchedule = formatMatchSchedule(matchStartTime)
  const { t1, t2 } = splitMatchOutcomes(snapshot.teamNames)
  const matchStartPred = liveStartPred?.inPlayPnlEvidence
    ? liveStartPred
    : lockedStartPred || liveStartPred
  const predictionProviderTotals = matchStartPred?.providerTotalEvidence
    ? [matchStartPred.providerTotalEvidence.team1, matchStartPred.providerTotalEvidence.team2]
    : preMatchFields?.providerTotals || [null, null]

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
            <TossSnapshotDetails snap={tossSnapshot} isEmbedded />
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
        <MarketWorkbench
          snapshot={snapshot}
          prediction={matchStartPred}
          predictionLabel="Predicted winner"
          loadLabel="Match Load"
          liveOdds={liveOdds}
          startTime={matchStartTime}
          preMatchCapture={completePreMatchCapture}
          preMatchFields={preMatchFields}
          preMatchProviderTotals={frozenPreMatchProviderTotals}
          predictionProviderTotals={predictionProviderTotals}
          activeSessions={activeSessions}
          sessionTrades={sessionTrades}
        />
      )}
    </div>
  )
}
