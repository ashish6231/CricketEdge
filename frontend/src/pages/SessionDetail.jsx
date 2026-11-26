import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Activity, AlertCircle, ArrowLeft, ChevronDown, Info, LoaderCircle, RefreshCw, TrendingUp } from 'lucide-react'
import { getSessionTrades } from '../api'
import LoginRequiredGate from '../components/LoginRequiredGate'
import SubscriptionRequiredGate from '../components/SubscriptionRequiredGate'
import { SessionSelector, SessionWorkspace } from '../components/SessionWorkspace'
import { getMatchBundle, getSocket, subscribeMatch, unsubscribeMatch } from '../socket'
import { isLoginRequiredError } from '../utils/publicAuth'
import { hasFeatureAccess } from '../lib/subscriptionAccess'
import { buildAllSessions, formatVolStr, sessionDataFingerprint } from '../utils/sessionMetrics'

export default function SessionDetail() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { isLoggedIn, authReady, user } = useOutletContext()
  const initialBundle = getMatchBundle(matchId)
  const cached = initialBundle?.session || null
  const [data, setData] = useState(cached)
  const [matchMeta, setMatchMeta] = useState(initialBundle?.cricket || null)
  const [loading, setLoading] = useState(!cached)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [activeInning, setActiveInning] = useState(1)
  const [inningTouched, setInningTouched] = useState(false)
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(cached ? new Date() : null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    const socket = getSocket()
    let cancelled = false
    let receivedSession = Boolean(data)

    const applySession = sessionData => {
      if (cancelled || !sessionData) return
      receivedSession = true
      setData(previous => previous && sessionDataFingerprint(previous) === sessionDataFingerprint(sessionData) ? previous : sessionData)
      setLastRefresh(new Date())
      setLoading(false)
    }
    const handleBundle = bundle => {
      if (cancelled || !bundle) return
      if (isLoginRequiredError(bundle) || bundle?.error === 'login_required') {
        setRequiresLogin(true); setLoading(false); return
      }
      if (bundle?.code === 'SUBSCRIPTION_REQUIRED' || bundle?.status === 403 || bundle?.error === 'subscription_required') {
        setRequiresPro(true); setLoading(false); return
      }
      if (bundle.cricket) setMatchMeta(bundle.cricket)
      if (bundle.session) applySession(bundle.session)
    }
    const onGenericBundle = bundle => {
      if (String(bundle?.matchId) === String(matchId)) handleBundle(bundle)
    }

    socket.on(`match:bundle:${matchId}`, handleBundle)
    socket.on('match:bundle', onGenericBundle)
    subscribeMatch(matchId, 'session')

    // Socket is primary. A single cache-backed fallback prevents blank pages;
    // there is no extra polling loop.
    const fallbackTimer = setTimeout(async () => {
      if (cancelled || receivedSession || document.hidden) return
      try {
        applySession(await getSessionTrades(matchId))
      } catch (error) {
        if (cancelled) return
        if (isLoginRequiredError(error)) setRequiresLogin(true)
        else if (error?.status === 403 || error?.code === 'SUBSCRIPTION_REQUIRED') setRequiresPro(true)
        setLoading(false)
      }
    }, 2500)
    const loadingTimer = setTimeout(() => { if (!cancelled) setLoading(false) }, 10000)

    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
      clearTimeout(loadingTimer)
      unsubscribeMatch(matchId)
      socket.off(`match:bundle:${matchId}`, handleBundle)
      socket.off('match:bundle', onGenericBundle)
    }
  // retryToken deliberately restarts this one-shot subscription/fallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, isLoggedIn, retryToken])

  const sessions = useMemo(() => buildAllSessions(
    data?.odds || [],
    data?.trades || [],
    Array.isArray(data?.markets) ? data.markets : Object.values(data?.markets || {}),
  ), [data])
  const innings = useMemo(() => [...new Set(sessions.map(session => session.inning))].sort(), [sessions])

  useEffect(() => {
    if (!sessions.length || inningTouched) return
    const complete = sessions.filter(session => session.ledgerStatus === 'verified')
    const active = complete.length ? Math.max(...complete.map(session => session.inning)) : sessions.find(session => session.hasTrades)?.inning
    if (active != null && active !== activeInning) setActiveInning(active)
  }, [sessions, activeInning, inningTouched])

  const filtered = useMemo(() => sessions
    .filter(session => innings.length <= 1 || session.inning === activeInning)
    .sort((a, b) => Number(b.hasTrades) - Number(a.hasTrades) || a.over - b.over),
  [sessions, activeInning, innings.length])

  useEffect(() => {
    if (!filtered.length) { setSelectedMarket(null); return }
    if (!filtered.some(session => session.marketName === selectedMarket)) {
      setSelectedMarket((filtered.find(session => session.ledgerStatus === 'verified') || filtered.find(session => session.hasTrades) || filtered[0]).marketName)
    }
  }, [filtered, selectedMarket])

  const selectedSession = filtered.find(session => session.marketName === selectedMarket) || null
  const summary = useMemo(() => ({
    markets: filtered.length,
    bets: filtered.reduce((sum, session) => sum + session.tradeCount, 0),
    matched: filtered.reduce((sum, session) => sum + session.totalVol, 0),
  }), [filtered])
  const statusText = String(matchMeta?.status || '').toLowerCase()
  const isLive = Boolean(matchMeta?.inPlay) || /live|in.?play/.test(statusText)
  const isEnded = /ended|complete|finished|result/.test(statusText)
  const matchName = data?.matchName || matchMeta?.matchName || (matchMeta?.teamNames || []).join(' v ') || 'Session Markets'

  if (authReady && !isLoggedIn) return <LoginRequiredGate description="Sign in and subscribe to view session markets." />
  if (authReady && !hasFeatureAccess(user, 'session')) return <SubscriptionRequiredGate featureLabel="Cricket session" onBack={() => navigate('/session')} />

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  if (requiresPro) return <SubscriptionRequiredGate featureLabel="Cricket session" onBack={() => navigate('/session')} />
  if (requiresLogin) return <LoginRequiredGate description="Sign in to view live session data." />

  if (!data) return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center p-4 text-center">
      <div className="w-full rounded-xl border border-border bg-white p-8 shadow-sm">
        <AlertCircle className="mx-auto mb-3 text-amber-600" size={36} />
        <h2 className="font-bold text-text-primary">Session data abhi nahi mila</h2>
        <p className="mt-1 text-xs text-text-muted">Live feed ko dobara connect karke cached data check karein.</p>
        <button type="button" onClick={() => { setLoading(true); setRetryToken(value => value + 1) }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white"><RefreshCw size={14} /> Retry</button>
      </div>
    </div>
  )

  return (
    <div className="detail-page session-shell">
      <div className="session-topbar">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/session'))} className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-primary"><ArrowLeft size={14} /> Back to Sessions</button>
        <div className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${isLive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
          {isLive ? '● LIVE' : isEnded ? 'COMPLETED' : 'UPDATED'}{lastRefresh && ` · ${lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      </div>

      <header className="session-card">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700"><TrendingUp size={11} /> Session Analysis</div>
            <h1 className="truncate text-base font-bold leading-tight text-text-primary sm:text-lg">{matchName}</h1>
          </div>
        </div>
        <div className="session-kpi-bar mt-2">
          {[['Markets', summary.markets], ['Bets', summary.bets], ['Matched', summary.matched ? `€${formatVolStr(summary.matched)}` : '—']].map(([label, value]) => (
            <div key={label} className="session-kpi-cell">
              <div className="text-[9px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
              <div className="text-sm font-bold tabular-nums text-text-primary">{value}</div>
            </div>
          ))}
        </div>
      </header>

      {innings.length > 1 && (
        <div className="session-innings-tabs" role="tablist" aria-label="Innings">
          {innings.map(inning => (
            <button key={inning} type="button" role="tab" aria-selected={activeInning === inning} onClick={() => { setInningTouched(true); setActiveInning(inning); setSelectedMarket(null) }} className={`session-innings-tab${activeInning === inning ? ' is-active' : ''}`}>
              {inning === 1 ? '1st' : inning === 2 ? '2nd' : `${inning}th`} Innings
            </button>
          ))}
        </div>
      )}

      {filtered.length ? <><SessionSelector sessions={filtered} selectedMarket={selectedMarket} onSelect={setSelectedMarket} /><SessionWorkspace session={selectedSession} completed={isEnded} /></> : <div className="session-card py-10 text-center"><Activity className="mx-auto mb-2 text-slate-400" size={28} /><p className="text-xs text-text-muted">Is innings mein session market nahi mila</p></div>}

      <details className="session-card p-0 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-bold text-text-primary hover:bg-slate-50"><Info size={14} className="text-primary" /> P/L kaise calculate hota hai? <ChevronDown size={14} className="ml-auto text-text-muted" /></summary>
        <div className="space-y-1.5 border-t border-border px-3 py-2.5 text-[11px] text-text-muted">
          <p><b className="text-rose-700">NO (Under / Betfair Back)</b>: score line par ya usse kam raha to NO customer jeetega.</p>
          <p><b className="text-sky-700">YES (Over / Betfair Lay)</b>: score line se upar gaya to YES customer jeetega.</p>
          <p><b className="text-text-primary">Bookie P/L</b>: Betfair Line markets fixed 2.0 (1:1 stake) par settle hote hain — losing customer stakes minus winning payouts.</p>
          <p><b className="text-emerald-700">Ledger complete</b>: received bet count aur money provider totals se match karte hain.</p>
        </div>
      </details>
    </div>
  )
}
