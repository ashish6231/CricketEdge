import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import SubscriptionRequiredGate from '../components/SubscriptionRequiredGate'
import { isSubscriptionRequiredError, requiresPaidMatchAccess } from '../utils/matchAccess'
import { predictTossWinner } from '../utils/tossPredictor'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle } from '../socket'
import { getCricketMatchBundle, getTossSnapshot } from '../api'
import { hasTossSnapshot } from '../utils/matchBundle'
import { createTossSnapshotSync } from '../utils/tossSnapshotSync'
import { getTossMarketStatus, formatTossTime } from '../utils/tossMarketStatus'
import MarketWorkbench from '../components/MarketWorkbench'

export default function TossDetail({ isEmbedded = false }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn, isFreeMode, authReady, user } = useOutletContext()
  const [snap, setSnap] = useState(null)
  const [marketInfo, setMarketInfo] = useState(location.state?.matchData)
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const socket = getSocket()
    let cancelled = false
    let resolved = false
    let receivedBundle = false
    let sync

    setLoading(true)
    setSnap(null)
    setMarketInfo(location.state?.matchData)
    setLoadError('')
    setRequiresLogin(false)
    setRequiresPro(false)

    const handleBundle = (bundle) => {
      if (cancelled || !bundle) return false
      if (isLoginRequiredError(bundle) || bundle?.error === 'login_required') {
        setRequiresLogin(true)
        setLoading(false)
        resolved = true
        return true
      }
      if (isSubscriptionRequiredError(bundle)) {
        setRequiresPro(true)
        setLoading(false)
        resolved = true
        return true
      }
      const tossData = bundle?.toss
      if (tossData && !tossData.error) {
        return handleSnapshot(tossData)
      }
      return false
    }

    const handleSnapshot = snapshot => cancelled ? false : sync.apply(snapshot)
    const handleRequestError = error => {
      if (cancelled) return true
      if (isLoginRequiredError(error)) {
        setRequiresLogin(true)
        setLoading(false)
        resolved = true
        return true
      }
      if (isSubscriptionRequiredError(error)) {
        setRequiresPro(true)
        setLoading(false)
        resolved = true
        return true
      }
      return false
    }

    sync=createTossSnapshotSync({matchId,fetchSnapshot:getTossSnapshot,onSummary:setMarketInfo,
      onSnapshot:snapshot=>{
        setSnap(snapshot)
        setLoadError('')
        setLoading(false)
        resolved=true
      },onError:handleRequestError})
    const onTossFeed=payload=>{sync.refreshFromFeed(payload)}
    const onBundle = bundle => {
      receivedBundle = true
      handleBundle(bundle)
    }
    const onGenericBundle = bundle => {
      if (String(bundle?.matchId) === String(matchId)) onBundle(bundle)
    }
    const cached = getMatchBundle(matchId)
    if (hasTossSnapshot(cached)) handleBundle(cached)
    sync.refresh(location.state?.matchData?.tossLoad)

    const loadFromHttp = async () => {
      try {
        const bundle = await getCricketMatchBundle(matchId)
        if (handleBundle(bundle)) return
      } catch (error) {
        if (handleRequestError(error)) return
      }
      try {
        const snapshot = await getTossSnapshot(matchId)
        if (handleSnapshot(snapshot)) return
      } catch (error) {
        if (handleRequestError(error)) return
        if (!cancelled) setLoadError(error?.detail || 'Toss data is not available for this match yet.')
      }
      if (!cancelled) setLoading(false)
    }
    const fallbackTimer = setTimeout(() => {
      if (!cancelled && (!receivedBundle || !resolved) && !document.hidden) loadFromHttp()
    }, 6000)
    // Keep checking this open detail even when list/socket notifications stop
    // or the amount stays unchanged while a toss result arrives separately.
    const refreshOpenMarket=()=>{if(!cancelled && !document.hidden)sync.refreshNow()}
    const refreshTimer=setInterval(refreshOpenMarket,15000)
    document.addEventListener('visibilitychange',refreshOpenMarket)
    socket.on(`match:bundle:${matchId}`, onBundle)
    socket.on('match:bundle', onGenericBundle)
    socket.on('toss:matches', onTossFeed)

    subscribeMatch(matchId, 'toss')

    const loadingTimeout = setTimeout(() => {
      if (!cancelled && !resolved) {
        setLoading(false)
        setLoadError(current => current || 'Toss data is taking longer than expected. Please retry.')
      }
    }, 12000)

    return () => {
      cancelled = true
      sync.cancel()
      clearTimeout(loadingTimeout)
      clearTimeout(fallbackTimer)
      clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange',refreshOpenMarket)
      unsubscribeMatch(matchId)
      socket.off(`match:bundle:${matchId}`, onBundle)
      socket.off('match:bundle', onGenericBundle)
      socket.off('toss:matches', onTossFeed)
    }
  }, [matchId, isLoggedIn, isFreeMode, location.state?.matchData])

  if (requiresPaidMatchAccess({ authReady, isLoggedIn, isFreeMode, user, match: snap || marketInfo, feature: 'toss' })) return <SubscriptionRequiredGate featureLabel="Toss" onBack={() => navigate('/toss')} />

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (requiresPro && !isFreeMode) return <SubscriptionRequiredGate featureLabel="Toss" onBack={() => navigate('/toss')} />

  if (requiresLogin) {
    return (
      <LoginRequiredGate
        description="Sign in to view live and upcoming toss data."
      />
    )
  }

  if (!snap) return (
    <div className="detail-page flex min-h-[65vh] items-center justify-center p-4">
      <div className="glass-card max-w-md w-full rounded-2xl p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Toss data unavailable</h2>
        <p className="mt-2 text-sm text-text-muted">{loadError || 'The market opened, but its detailed snapshot has not arrived yet.'}</p>
        {location.state?.matchData?.matchName && <p className="mt-3 text-sm font-semibold text-text-secondary">{location.state.matchData.matchName}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="ui-button-primary rounded-lg px-4 py-2 text-sm font-semibold">Retry</button>
          <button type="button" onClick={() => navigate('/toss')} className="ui-button-secondary rounded-lg border px-4 py-2 text-sm font-semibold">Back to matches</button>
        </div>
      </div>
    </div>
  )

  return <TossSnapshotDetails snap={snap} matchInfo={marketInfo} isEmbedded={isEmbedded} onBack={() => navigate(-1)} />
}

// Shared by the dedicated toss page and Match Detail's toss section.
export function TossSnapshotDetails({ snap, matchInfo, isEmbedded = false, onBack }) {
  const [statusNow, setStatusNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setStatusNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const marketStatus = getTossMarketStatus(snap, matchInfo, statusNow)
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const competition = snap.competitionName || snap.seriesName || matchInfo?.competitionName || ''
  const ruleContext = { ...matchInfo, competitionName: competition }
  const prediction = predictTossWinner(snap, ruleContext)
  const snapshotTime = formatTossTime(marketStatus.sourceTime)

  const workbench = (
    <MarketWorkbench
      snapshot={snap}
      prediction={prediction}
      predictionLabel={marketStatus.closed ? 'Rule-selected team (not the result)' : 'Predicted toss winner'}
      loadLabel="Toss Load"
      isToss={true}
      startTime={snap.startTime ?? matchInfo?.startTime ?? null}
    />
  )

  if (isEmbedded) {
    return workbench
  }

  return (
    <div className="detail-page match-workbench w-full">
      <div className="match-detail-toolbar sticky top-0 z-30">
        <button type="button" onClick={onBack} className="match-detail-back" aria-label="Back to toss matches">
          <ArrowLeft size={14} /> <span>Back</span>
        </button>
      </div>

      <header className="match-page-heading">
        <div>
          <span className="match-eyebrow">{competition || 'Toss market'}</span>
          <h1 id="toss-detail-title">{t1} <span>vs</span> {t2}</h1>
        </div>
        <div className="match-schedule">
          {marketStatus.resultReported ? (
            <span className="toss-risk-pill">Toss: {marketStatus.winner}</span>
          ) : (
            snap.inPlay && <span className="match-live-tag"><span />Live</span>
          )}
          {snapshotTime && <span>{snapshotTime}</span>}
        </div>
      </header>

      {workbench}
    </div>
  )
}
