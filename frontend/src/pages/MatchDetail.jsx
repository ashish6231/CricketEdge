import { useEffect, useState, useContext } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Target, Lock, TrendingUp, Shield, BarChart3 } from 'lucide-react'
import { getCricketSnapshot, getTennisSnapshot, getTossSnapshot, getSessionTrades } from '../api'

// Map sport to the right API function
const API_MAP = {
  cricket: getCricketSnapshot,
  tennis: getTennisSnapshot,
  toss: getTossSnapshot,
  session: getSessionTrades,
}

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return Math.round(n).toLocaleString('en-IN')
}

const fmtRs = (n) => {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}₹${fmt(n)}`
}

const pnlCls = (n) => n >= 0 ? 'text-profit' : 'text-loss'

// Fake volume from advancedMetricsV2 back/lay data (same as source site)
function calcFakeVolume(backVol, layVol) {
  const matched = Math.min(backVol, layVol)
  const fakeBack = backVol - matched
  const oppFakeLay = layVol - matched
  return { fakeBack, oppFakeLay, total: fakeBack + oppFakeLay }
}

const fmtVol = (n) => {
  if (!n) return '0'
  return Math.round(n).toLocaleString('en-IN')
}

export default function MatchDetail({ sport }) {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    const apiFn = API_MAP[sport] || getCricketSnapshot

    const fetchData = (isInitial = false) => {
      if (isInitial) {
        setLoading(true)
        setRequiresLogin(false)
        setSnapshot(null)
      }
      apiFn(matchId).then(data => {
        if (data?.error === 'login_required') {
          setRequiresLogin(true)
        } else if (data && !data.error) {
          setSnapshot(data)
          setRequiresLogin(false)
          const now = new Date()
          setLastUpdated(now)
          window.dispatchEvent(new CustomEvent('data-refreshed', { detail: { time: now } }))
        }
        if (isInitial) setLoading(false)
      })
    }

    fetchData(true)
    const interval = setInterval(() => fetchData(false), 1500)
    return () => clearInterval(interval)
  }, [matchId, sport, isLoggedIn])

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  if (requiresLogin) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="rounded-2xl p-8 max-w-md text-center" style={{ background: '#fff', border: '1px solid #fecaca', boxShadow: '0 4px 24px rgba(220,38,38,0.08)' }}>
          <div className="text-xs text-text-muted mb-4">
            📅 {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} &nbsp;⏰ {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="p-4 rounded-2xl border mb-4 inline-block" style={{ background: '#fee2e2', borderColor: '#fca5a5' }}><Lock className="h-8 w-8 text-primary" /></div>
          <h2 className="text-xl font-bold text-text-primary mb-2">🔒 Login Zaruri Hai</h2>
          <p className="text-text-secondary mb-4">Live/upcoming match ka data dekhne ke liye login karo.</p>
          <p className="text-text-muted text-xs mb-6">Account ke liye Telegram: <span className="text-[#229ED9]">@CricketMan2026</span></p>
          <div className="flex gap-3">
            <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-text-secondary text-sm font-medium" style={{ background: '#fff0f0', border: '1px solid #fecaca' }}>← Wapas</button>
            <button onClick={() => {
              window.dispatchEvent(new CustomEvent('open-login-modal'))
            }} className="px-6 py-2 text-white rounded-xl font-semibold text-sm" style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>🔑 Login karo</button>
          </div>
        </div>
      </div>
    )
  }

  if (!snapshot) return null

  const t1 = snapshot.teamNames?.[0] || 'Team 1'
  const t2 = snapshot.teamNames?.[1] || 'Team 2'
  const dm = snapshot.deepMetrics || {}
  const t1Trades = (snapshot.teams?.[t1] || {}).trades || []
  const t2Trades = (snapshot.teams?.[t2] || {}).trades || []

  const getLatestOdds = (trades) => {
    const sorted = [...trades].sort((a, b) => b.updatedAt - a.updatedAt)
    const back = sorted.find(t => t.type === 'back')?.price
    const lay  = sorted.find(t => t.type === 'lay')?.price
    return { back, lay }
  }
  const t1Odds = getLatestOdds(t1Trades)
  const t2Odds = getLatestOdds(t2Trades)
  const am1 = snapshot.advancedMetricsV2?.team1 || {}
  const am2 = snapshot.advancedMetricsV2?.team2 || {}
  const t1Fake = calcFakeVolume(am1.back || 0, am1.lay || 0)
  const t2Fake = calcFakeVolume(am2.back || 0, am2.lay || 0)
  const totalFake = t1Fake.total + t2Fake.total
  const t1Pct = totalFake > 0 ? (t1Fake.total / totalFake) * 100 : 50
  const t2Pct = 100 - t1Pct
  const mostFakeTeam = t1Fake.total >= t2Fake.total ? t1 : t2
  const sp = dm.simplePL || {}
  const dp = dm.derivedPL || {}
  const teams = snapshot.teams || {}
  const t1Data = teams[t1] || {}
  const t2Data = teams[t2] || {}

  // P/L if win — deepMetrics.simplePL is the correct source (all trades combined)
  const pl1 = sp.team1_win ?? t1Data.pnlIfWins
  const pl2 = sp.team2_win ?? t2Data.pnlIfWins
  const dpl1 = dp.team1_win
  const dpl2 = dp.team2_win

  // ━━━━━━━━━━ BACK/LAY RATIO BASED PREDICTION ━━━━━━━━━━
  const raw = dm.raw || {}
  const aBack = raw.A_back_expo || am1.back || 0
  const aLay  = raw.A_lay_stake || am1.lay  || 0
  const bBack = raw.B_back_expo || am2.back || 0
  const bLay  = raw.B_lay_stake || am2.lay  || 0

  // lay/back ratio — >1 means lay dominant = bookie team (predicted winner)
  const aRatio = aLay > 0 ? aBack / aLay : 0
  const bRatio = bLay > 0 ? bBack / bLay : 0
  // back/lay < 1 means lay dominant = bookie team
  const bookieTeam  = aRatio <= bRatio ? t1 : t2
  const publicTeam  = aRatio <= bRatio ? t2 : t1
  const bookieRatioVal = Math.min(aRatio || 999, bRatio || 999)
  const bookieRatio = bookieRatioVal === 999 ? 0 : bookieRatioVal
  // lower back/lay = stronger bookie signal
  const signalStrength = bookieRatio < 0.5 ? 'Strong 🔥' : bookieRatio < 0.8 ? 'Moderate' : 'Weak'
  const signalColor    = bookieRatio < 0.5 ? 'text-profit' : bookieRatio < 0.8 ? 'text-yellow-500' : 'text-text-muted'

  const aTotal   = aBack + aLay
  const bTotal   = bBack + bLay
  const aBackPct = aTotal > 0 ? (aBack / aTotal * 100) : 50
  const bBackPct = bTotal > 0 ? (bBack / bTotal * 100) : 50
  const hasBLPrediction = aBack > 0 || aLay > 0 || bBack > 0 || bLay > 0

  const ip = snapshot.inPlayPnl || {}
  const ib = snapshot.inPlayTotalBets || {}
  const pp = snapshot.preMatchPnl || {}
  const pb = snapshot.preMatchTotalBets || {}
  const iv = snapshot.inPlayVolume || {}
  const pv = snapshot.preMatchVolume || {}
  const sup = snapshot.supportMetrics || {}
  const ml = snapshot.matchLoadV2 || {}
  const am = snapshot.advancedMetricsV2 || {}
  const sig = snapshot.marketSignals || {}
  const pred = sig.prediction || {}
  const trap = sig.trap || {}
  const exp = snapshot.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const sent = snapshot.sentimentScore || {}
  const ns = snapshot.netSupport || {}

  return (
    <div className="p-4 max-w-3xl mx-auto fade-in stagger space-y-4">

      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-text-muted hover:text-primary text-sm">
        <ArrowLeft size={16} /> Back
      </button>

      {/* ━━━━━━━━━━ 1. MATCH HEADER ━━━━━━━━━━ */}
      <div className="glass-card rounded-2xl p-5">
        {snapshot.serverTime && (
          <div className="text-xs text-text-muted mb-1">
            📅 {new Date(snapshot.serverTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} &nbsp;⏰ {new Date(snapshot.serverTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t1} vs {t2}</h1>
          {snapshot.inPlay && <span className="text-back text-sm font-semibold flex items-center gap-1"><span className="pulse-dot h-2 w-2 rounded-full bg-back" /> LIVE</span>}
        </div>
        <div className="text-xs text-text-muted mt-1">{snapshot.competitionName || ''}</div>

        <div className="text-xs font-bold text-text-muted uppercase tracking-wider mt-3 mb-1.5">📊 Latest Odds</div>
        <div className="flex gap-3">
          {[{ name: t1, odds: t1Odds }, { name: t2, odds: t2Odds }].map(({ name, odds }) => (
            <div key={name} className="flex-1 rounded-xl p-2.5" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
              <div className="text-xs font-semibold text-text-secondary truncate mb-1.5">{name}</div>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg py-1 text-center" style={{ background: 'rgba(37,99,235,0.08)' }}>
                  <div className="text-xs text-text-muted">Back</div>
                  <div className="text-sm font-bold text-back">{odds.back ?? '—'}</div>
                </div>
                <div className="flex-1 rounded-lg py-1 text-center" style={{ background: 'rgba(220,38,38,0.08)' }}>
                  <div className="text-xs text-text-muted">Lay</div>
                  <div className="text-sm font-bold text-loss">{odds.lay ?? '—'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━━━━━━━━ 2. P/L IF WIN — SABSE UPAR ━━━━━━━━━━ */}
      {(pl1 !== undefined || pl2 !== undefined) && (
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)', border: '2px solid #fecaca' }}>
          <div className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <Target size={16} /> Bookie Profit & Loss
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-3 text-center`} style={{ background: pl1 >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${pl1 >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
              <div className="text-xl font-bold text-text-primary mb-1">{t1}</div>
              <div className={`text-lg font-bold ${pnlCls(pl1)}`}>{fmtRs(pl1)}</div>
              <div className={`text-xs mt-0.5 ${pnlCls(pl1)}`}>{pl1 >= 0 ? '✅ PROFIT' : '❌ LOSS'}</div>
            </div>
            <div className={`rounded-xl p-3 text-center`} style={{ background: pl2 >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${pl2 >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
              <div className="text-xl font-bold text-text-primary mb-1">{t2}</div>
              <div className={`text-lg font-bold ${pnlCls(pl2)}`}>{fmtRs(pl2)}</div>
              <div className={`text-xs mt-0.5 ${pnlCls(pl2)}`}>{pl2 >= 0 ? '✅ PROFIT' : '❌ LOSS'}</div>
            </div>
          </div>
          {/* Simple verdict */}
          <div className="mt-3 text-center text-sm">
            {pl1 >= 0 && pl2 < 0 && <span className="text-profit">Bookie ko <b>{t1}</b> ki jeet se profit, <b>{t2}</b> ki jeet se loss</span>}
            {pl2 >= 0 && pl1 < 0 && <span className="text-profit">Bookie ko <b>{t2}</b> ki jeet se profit, <b>{t1}</b> ki jeet se loss</span>}
            {pl1 >= 0 && pl2 >= 0 && <span className="text-profit">Bookie ko dono outcome me profit — balanced market ✅</span>}
            {pl1 < 0 && pl2 < 0 && <span className="text-loss">⚠️ Bookie ko dono outcome me loss — heavy risk!</span>}
          </div>
          {dpl1 !== undefined && dpl2 !== undefined && (
            <div className="mt-2 border-t border-border/50 pt-2 text-xs text-text-muted text-center">
              Adjusted P/L: {t1} jeete = <span className={pnlCls(dpl1)}>{fmtRs(dpl1)}</span> • {t2} jeete = <span className={pnlCls(dpl2)}>{fmtRs(dpl2)}</span>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━ 3. MATCH PREDICTION ━━━━━━━━━━ */}
      {hasBLPrediction && (
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)', border: '2px solid #fecaca' }}>
          <div className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={16} /> 🧠 CricketEdge Prediction
          </div>

          {/* Predicted Winner Banner */}
          <div className="rounded-xl p-4 text-center mb-4" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)' }}>
            <div className="text-xs text-text-muted uppercase tracking-widest mb-1">Predicted Winner</div>
            <div className="text-2xl font-black text-profit">{bookieTeam}</div>
            <div className="text-xs mt-1 text-text-muted">Bookie is team ki jeet chahta hai</div>
          </div>

          {/* Back/Lay ratio bars — both teams */}
          <div className="space-y-3 mb-4">
            {[{ team: t1, backPct: aBackPct, ratio: aRatio, isBookie: aRatio <= bRatio },
              { team: t2, backPct: bBackPct, ratio: bRatio, isBookie: bRatio < aRatio }]
              .map(({ team, backPct, ratio, isBookie }) => (
              <div key={team}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-text-secondary">{team}</span>
                  <div className="flex items-center gap-2">
                    {isBookie && <span className="text-xs font-bold text-profit bg-profit/10 px-2 py-0.5 rounded-full">Bookie Team</span>}
                    <span className="text-xs text-text-muted">Back/Lay: <b className={isBookie ? 'text-loss' : 'text-profit'}>{ratio.toFixed(2)}x</b></span>
                  </div>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden">
                  <div className="bg-back transition-all" style={{ width: `${backPct}%` }} />
                  <div className="bg-loss/70 transition-all" style={{ width: `${100 - backPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-text-muted mt-0.5">
                  <span className="text-back">Back {backPct.toFixed(0)}%</span>
                  <span className="text-loss">Lay {(100 - backPct).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Signal strength + logic */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
              <div className="text-xs text-text-muted mb-1">Signal Strength</div>
              <div className={`text-sm font-bold ${signalColor}`}>{signalStrength}</div>
              <div className="text-xs text-text-muted mt-0.5">Back/Lay: {bookieRatio.toFixed(2)}x</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
              <div className="text-xs text-text-muted mb-1">Public Favourite</div>
              <div className="text-sm font-bold text-loss">{publicTeam}</div>
              <div className="text-xs text-text-muted mt-0.5">Log is team pe back kar rahe hain</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-text-muted p-2.5 rounded-xl" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.1)' }}>
            💡 <b>{bookieTeam}</b> pe lay zyada hai → public is team ke against bet kar raha hai → bookie ko is team ki jeet se profit hoga
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━ 4. DEEP BETTING METRICS ━━━━━━━━━━ */}
      {(dm.raw || dm.totals) && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
            <BarChart3 size={15} className="text-primary" />
            <span className="text-sm font-bold text-primary">Deep Betting Metrics</span>
          </div>
          <div className="p-4 space-y-4">
            {dm.raw && Object.keys(dm.raw).length > 0 && (
              <div>
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Raw Accumulated Values</div>
                <div className="space-y-1.5">
                  {[
                    { key: 'A_back_expo', label: `${t1} Back Expo` },
                    { key: 'A_lay_stake', label: `${t1} Lay Stake` },
                    { key: 'B_back_expo', label: `${t2} Back Expo` },
                    { key: 'B_lay_stake', label: `${t2} Lay Stake` },
                  ].filter(({ key }) => dm.raw[key] != null).map(({ key, label }) => (
                    <div key={key} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-xs text-text-secondary font-medium">{label}</span>
                      <span className="text-xs font-bold text-text-primary">{Number(dm.raw[key]).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dm.totals && Object.keys(dm.totals).length > 0 && (
              <div>
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Total Bets</div>
                <div className="space-y-1.5">
                  {Object.entries(dm.totals).map(([team, val]) => {
                    const displayName = team === 'team1' ? t1 : team === 'team2' ? t2 : team === 'totalBetTeam1' ? t1 : team === 'totalBetTeam2' ? t2 : team
                    return (
                      <div key={team} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-xs text-text-secondary font-medium">{displayName}</span>
                        <span className="text-xs font-bold text-text-primary">{Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━ 5. QUICK STATS ━━━━━━━━━━ */}
      <div className="space-y-3">
        {[{ title: 'In-Play', pnl: ip, bets: ib, vol: iv }, { title: 'Pre-Match', pnl: pp, bets: pb, vol: pv }].map(({ title, pnl, bets, vol }) => (
          <div key={title} className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
              <span className="text-xs font-black uppercase tracking-wider text-primary">{title}</span>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div />
                <div className="text-center text-xs font-bold text-text-secondary truncate px-1">{t1}</div>
                <div className="text-center text-xs font-bold text-text-secondary truncate px-1">{t2}</div>
              </div>
              {[
                { label: 'P/L', v1: <span className={`font-bold text-xs ${pnlCls(pnl.team1)}`}>{fmtRs(pnl.team1)}</span>, v2: <span className={`font-bold text-xs ${pnlCls(pnl.team2)}`}>{fmtRs(pnl.team2)}</span> },
                { label: 'Bets', v1: <span className="font-semibold text-xs text-text-secondary">₹{fmt(bets.team1)}</span>, v2: <span className="font-semibold text-xs text-text-secondary">₹{fmt(bets.team2)}</span> },
                { label: 'Back', v1: <span className="font-semibold text-xs text-back">₹{fmt(vol.team1?.back)}</span>, v2: <span className="font-semibold text-xs text-back">₹{fmt(vol.team2?.back)}</span> },
                { label: 'Lay',  v1: <span className="font-semibold text-xs text-loss">₹{fmt(vol.team1?.lay)}</span>,  v2: <span className="font-semibold text-xs text-loss">₹{fmt(vol.team2?.lay)}</span> },
              ].map(({ label, v1, v2 }, i) => (
                <div key={label} className={`grid grid-cols-3 gap-2 py-2 ${i !== 3 ? 'border-b border-border/40' : ''}`}>
                  <div className="text-xs text-text-muted flex items-center font-medium">{label}</div>
                  <div className="text-center flex items-center justify-center">{v1}</div>
                  <div className="text-center flex items-center justify-center">{v2}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ━━━━━━━━━━ 6. KAUNSE TEAM PE ZYADA LAGA? ━━━━━━━━━━ */}
      <div className="glass-card rounded-2xl p-5">
        <div className="text-sm font-bold text-text-secondary mb-3 flex items-center gap-2">
          <Shield size={16} /> Kaunse team pe logon ne zyada paisa laga?
        </div>
        {[t1, t2].map((team, i) => {
          const key = i === 0 ? 'team1' : 'team2'
          const s = sup[key] || {}
          const pct = s.support || 0
          return (
            <div key={key} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{team}</span>
                <span className={`font-bold ${pct >= 50 ? 'text-profit' : 'text-loss'}`}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#fee2e2" }}>
                <div className={`h-full rounded-full ${pct >= 50 ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-text-muted mt-0.5">₹{fmt(s.supportMoney)} total support</div>
            </div>
          )
        })}
        <div className="border-t border-border pt-2 mt-2 text-xs text-text-muted">
          Match Load: {t1} = {ml.team1 || '—'} • {t2} = {ml.team2 || '—'}
        </div>
      </div>

      {/* ━━━━━━━━━━ 7. MARKET SIGNALS ━━━━━━━━━━ */}
      <div className="glass-card rounded-2xl p-5">
        <div className="text-sm font-bold text-primary mb-3 flex items-center gap-2">📡 Market ke signals</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Zyada paisa kispe?', value: sig.moreBettedTeam, cls: 'text-text-primary' },
            { label: 'Bookie favourite?', value: sig.bookieFavouriteOutcome, cls: 'text-profit' },
            { label: 'Risk wali team?', value: sig.riskTeam, cls: 'text-loss' },
            { label: 'Trap hai?', value: trap.level === 'none' ? '✅ Nahi' : `⚠️ ${trap.level}`, cls: trap.level === 'none' ? 'text-profit' : 'text-loss' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
              <div className="text-xs text-text-muted mb-1">{label}</div>
              <div className={`text-sm font-bold truncate ${cls}`}>{value || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━━━━━━━━ 8. BOOKMAKER EXPOSURE ━━━━━━━━━━ */}
      <div className="glass-card rounded-2xl p-5">
        <div className="text-sm font-bold text-text-secondary mb-3">Bookie ka risk — Kitna exposed hai?</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
            <div className="text-sm font-medium mb-2">{exp1.teamName || t1}</div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-text-muted">Net exposure</span><span className={`font-bold ${pnlCls(exp1.netExposure)}`}>{fmtRs(exp1.netExposure)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Back risk</span><span className="text-back">₹{fmt(exp1.backExposure)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Lay risk</span><span className="text-loss">₹{fmt(exp1.layExposure)}</span></div>
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
            <div className="text-sm font-medium mb-2">{exp2.teamName || t2}</div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-text-muted">Net exposure</span><span className={`font-bold ${pnlCls(exp2.netExposure)}`}>{fmtRs(exp2.netExposure)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Back risk</span><span className="text-back">₹{fmt(exp2.backExposure)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Lay risk</span><span className="text-loss">₹{fmt(exp2.layExposure)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━ 9. NET SUPPORT & SENTIMENT ━━━━━━━━━━ */}
      {ns.teamA && sent.teamA && (
        <div className="glass-card rounded-2xl p-5">
          <div className="text-sm font-bold text-text-secondary mb-3">Overall sentiment — Logon ka mood</div>
          
          {/* Support bars */}
          <div className="mb-3">
            {[t1, t2].map((team, i) => {
              const key = i === 0 ? 'teamA' : 'teamB'
              const pct = i === 0 ? ns.percentageA : ns.percentageB
              const nsVal = ns[key]?.netSupportValue
              return (
                <div key={key} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{team}</span>
                    <span className={`font-bold ${pct >= 50 ? 'text-profit' : 'text-loss'}`}>{pct?.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "#fee2e2" }}>
                    <div className={`h-full rounded-full ${pct >= 50 ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="text-xs text-text-muted text-center">
            Zyada support: <span className="text-profit font-bold">{sent.strongerTeam}</span> • 
            Difference: <span className="text-text-secondary">₹{fmt(sent.scoreDifference)}</span>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━ 10. SPOOFING DETECTOR ━━━━━━━━━━ */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #fde8e8 0%, #fdf0e8 100%)' }}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🚨</span>
          <span className="text-xl font-bold text-text-primary">Spoofing Detector</span>
          <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>LIVE</span>
        </div>
        <p className="text-xs text-text-muted mb-4">Cumulative fake orders — canceled volume not matched as trades</p>

        {/* Progress bar */}
        <div className="h-3 rounded-full overflow-hidden flex mb-2"style={{ background: '#fecaca' }}>
          <div className="h-full" style={{ width: `${t1Pct}%`, background: 'linear-gradient(90deg,#dc2626,#f87171)' }} />
          <div className="h-full" style={{ width: `${t2Pct}%`, background: 'linear-gradient(90deg,#f97316,#fbbf24)' }} />
        </div>
        <div className="flex justify-between text-xs font-semibold mb-4">
          <span className="text-primary">{t1}: {t1Pct.toFixed(1)}%</span>
          <span className="text-text-muted">{t2}: {t2Pct.toFixed(1)}%</span>
        </div>

        {/* Team cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[{ team: t1, fake: t1Fake, isMain: true }, { team: t2, fake: t2Fake, isMain: false }].map(({ team, fake, isMain }) => (
            <div key={team} className="bg-white rounded-xl p-3" style={{ border: '1px solid #fecaca' }}>
              <div className={`text-xs font-bold mb-3 truncate ${isMain ? 'text-primary' : 'text-text-secondary'}`}>{team}</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#3b82f6' }} />
                    <span className="text-xs text-text-muted">Fake Back</span>
                  </div>
                  <span className="text-xs font-bold text-text-primary">{fmtVol(fake.fakeBack)}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#f87171' }} />
                    <span className="text-xs text-text-muted">Fake Lay</span>
                  </div>
                  <span className="text-xs font-bold text-text-primary">{fmtVol(fake.oppFakeLay)}</span>
                </div>
              </div>
              <div className="border-t border-border mt-2.5 pt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-text-secondary">Total</span>
                <span className={`text-sm font-black ${isMain ? 'text-primary' : 'text-text-muted'}`}>{fmtVol(fake.total)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom banner */}
        <div className="rounded-xl py-4 px-5 text-center" style={{ background: 'linear-gradient(135deg,#fca5a5,#fcd9b0)' }}>
          <div className="text-xs font-bold tracking-widest text-primary/60 uppercase mb-1">Most Fake Orders On</div>
          <div className="text-2xl font-bold text-primary">{mostFakeTeam}</div>
        </div>
      </div>
    </div>
  )
}
