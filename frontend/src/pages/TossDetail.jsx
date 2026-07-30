import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Lock, BarChart3 } from 'lucide-react'
import { getTossSnapshot } from '../api'

const fmt    = (n) => n == null ? '—' : Math.round(n).toLocaleString('en-IN')
const fmtRs  = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}₹${fmt(n)}`
const pnlCls = (n) => n >= 0 ? 'text-profit' : 'text-loss'

export default function TossDetail() {
  const { matchId } = useParams()
  const navigate    = useNavigate()
  const { isLoggedIn } = useOutletContext()
  const [snap, setSnap]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)

  useEffect(() => {
    const fetch = (isInitial = false) => {
      if (isInitial) { setLoading(true); setRequiresLogin(false); setSnap(null) }
      getTossSnapshot(matchId).then(res => {
        if (res?.error === 'login_required') setRequiresLogin(true)
        else if (res && !res.error) setSnap(res)
        if (isInitial) setLoading(false)
      }).catch(() => { if (isInitial) setLoading(false) })
    }
    fetch(true)
    const interval = setInterval(() => fetch(false), 1500)
    return () => clearInterval(interval)
  }, [matchId, isLoggedIn])

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (requiresLogin) return (
    <div className="flex h-[80vh] items-center justify-center px-4">
      <div className="glass-card rounded-2xl p-8 w-full max-w-sm text-center">
        <div className="inline-flex p-4 rounded-2xl mb-4" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">🔒 Login Zaruri Hai</h2>
        <p className="text-text-secondary text-sm mb-6">Live/upcoming toss data dekhne ke liye login karo.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary" style={{ background: '#fff0f0', border: '1px solid #fecaca' }}>← Wapas</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-login-modal'))} className="px-6 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>🔑 Login karo</button>
        </div>
      </div>
    </div>
  )

  if (!snap) return null

  const t1  = snap.teamNames?.[0] || 'Team 1'
  const t2  = snap.teamNames?.[1] || 'Team 2'
  const raw = snap.deepMetrics?.raw    || {}
  const tot = snap.deepMetrics?.totals || {}
  const sp  = snap.deepMetrics?.simplePL || {}
  const sup = snap.supportMetrics || {}
  const am1 = snap.advancedMetricsV2?.team1 || {}
  const am2 = snap.advancedMetricsV2?.team2 || {}
  const exp = snap.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const ns = snap.netSupport || {}
  const sent = snap.sentimentScore || {}
  const ip  = snap.inPlayPnl        || {}
  const ib  = snap.inPlayTotalBets  || {}
  const iv  = snap.inPlayVolume     || {}
  const pp  = snap.preMatchPnl      || {}
  const pb  = snap.preMatchTotalBets|| {}
  const pv  = snap.preMatchVolume   || {}
  const tp  = snap.threeMinPnl      || {}
  const tb  = snap.threeMinTotalBets|| {}
  const tv  = snap.threeMinVolume   || {}

  // Back/Lay ratio prediction
  const aBack = raw.A_back_expo || am1.back || 0
  const aLay  = raw.A_lay_stake || am1.lay  || 0
  const bBack = raw.B_back_expo || am2.back || 0
  const bLay  = raw.B_lay_stake || am2.lay  || 0
  const t1Trades = (snap.teams?.[t1] || {}).trades || []
  const t2Trades = (snap.teams?.[t2] || {}).trades || []
  const t1Bets = tot.totalBetTeam1 || tot.team1 || 0
  const t2Bets = tot.totalBetTeam2 || tot.team2 || 0

  const isWomens = /women/i.test(snap.competitionName || '') ||
    [t1, t2].some(name => /\bW\b/.test(name) || /\(W\)/i.test(name))

  // Toss Winner Prediction
  const exp1Net = exp1.netExposure || 0
  const exp2Net = exp2.netExposure || 0
  const sent1Pct = ns.percentageA ?? (sup.team1?.support ?? 50)
  const sent2Pct = ns.percentageB ?? (sup.team2?.support ?? 50)
  const hasExpData = exp1Net !== 0 || exp2Net !== 0
  const hasSentData = sent1Pct !== 50 || sent2Pct !== 50
  const hasTossRuleData = hasExpData || hasSentData

  // Highest single-odds money across all trades per team
  const t1MaxBet = t1Trades.reduce((max, t) => t.size > max ? t.size : max, 0)
  const t2MaxBet = t2Trades.reduce((max, t) => t.size > max ? t.size : max, 0)
  const hasMaxBetData = t1MaxBet > 0 || t2MaxBet > 0

  const tossPrediction = (() => {
    if (!hasTossRuleData && !hasMaxBetData) return null
    let t1Score = 0, t2Score = 0
    const rules = []

    if (hasExpData) {
      if (isWomens) {
        // Women: lower net exposure = winner
        const t1wins = exp1Net < exp2Net
        rules.push({ label: 'Kam Net Exposure', t1wins, v1: fmtRs(exp1Net), v2: fmtRs(exp2Net) })
        if (t1wins) t1Score++; else t2Score++
      } else {
        // Mens: higher positive net exposure = winner
        const t1wins = exp1Net > exp2Net
        rules.push({ label: 'Zyada Positive Exposure', t1wins, v1: fmtRs(exp1Net), v2: fmtRs(exp2Net) })
        if (t1wins) t1Score++; else t2Score++
      }
    }

    if (hasSentData) {
      if (isWomens) {
        const t1wins = sent1Pct < sent2Pct
        rules.push({ label: 'Kam Overall Sentiment', t1wins, v1: `${sent1Pct?.toFixed(1)}%`, v2: `${sent2Pct?.toFixed(1)}%` })
        if (t1wins) t1Score++; else t2Score++
      } else {
        const t1wins = sent1Pct > sent2Pct
        rules.push({ label: 'Zyada Overall Sentiment', t1wins, v1: `${sent1Pct?.toFixed(1)}%`, v2: `${sent2Pct?.toFixed(1)}%` })
        if (t1wins) t1Score++; else t2Score++
      }
    }

    // Highest single-odds money — jis team pe kisi ek odds pe sabse zyada paisa lga
    if (hasMaxBetData && t1MaxBet !== t2MaxBet) {
      const t1wins = t1MaxBet > t2MaxBet
      rules.push({
        label: 'Sabse Bada Single Bet',
        t1wins,
        v1: `₹${Math.round(t1MaxBet).toLocaleString('en-IN')}`,
        v2: `₹${Math.round(t2MaxBet).toLocaleString('en-IN')}`,
      })
      if (t1wins) t1Score++; else t2Score++
    }

    const winnerIdx = t1Score >= t2Score ? 0 : 1
    const winnerName = winnerIdx === 0 ? t1 : t2
    const matchScore = Math.max(t1Score, t2Score)
    const totalRules = rules.length
    const confidence = matchScore === totalRules ? { label: 'High Confidence 🔥', color: 'text-profit' }
                     : { label: 'Low Confidence', color: 'text-yellow-500' }
    return {
      winnerName, winnerIdx, matchScore, totalRules, confidence, isWomens,
      rules: rules.map(r => ({ ...r, winnerWins: winnerIdx === 0 ? r.t1wins : !r.t1wins }))
    }
  })()
  const fmtVol = (n) => !n ? '0' : Math.round(n).toLocaleString('en-IN')
  function getTop5Bets(trades) {
    const byKey = {}
    trades.forEach(t => {
      const key = `${t.price}_${t.type}`
      if (!byKey[key]) byKey[key] = { price: t.price, type: t.type, size: 0 }
      byKey[key].size += t.size
    })
    return Object.values(byKey).sort((a, b) => b.size - a.size).slice(0, 5)
  }
  const t1Top5 = getTop5Bets(t1Trades)
  const t2Top5 = getTop5Bets(t2Trades)

  return (
    <div className="p-3 w-full fade-in space-y-4">

      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-text-muted hover:text-primary text-sm font-medium transition-colors">
        <ArrowLeft size={15} /> Back
      </button>

      {/* Header */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t1} vs {t2}</h1>
            <div className="text-xs text-text-muted mt-1">🪙 Toss Market • {snap.serverTime?.split('T')[0]}</div>
          </div>
          {snap.inPlay && (
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: '#dc2626' }} /> LIVE
            </span>
          )}
        </div>
      </div>



      {/* Toss Winner Prediction */}
      {tossPrediction && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${tossPrediction.matchScore === tossPrediction.totalRules ? '#86efac' : '#fde68a'}` }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: tossPrediction.matchScore === tossPrediction.totalRules ? 'linear-gradient(135deg,#f0fdf4,#fefce8)' : 'linear-gradient(135deg,#fefce8,#fff8f0)' }}>
            <span className="text-base">🪙</span>
            <span className="text-sm font-bold text-text-primary">Predicted Toss Winner</span>
            {tossPrediction.isWomens
              ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fce7f3', color: '#be185d' }}>♀️ Women's Rules</span>
              : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#eff6ff', color: '#1d4ed8' }}>👨 Men's Rules</span>
            }
            <span className={`ml-auto text-xs font-black ${tossPrediction.confidence.color}`}>{tossPrediction.confidence.label}</span>
          </div>
          <div className="p-4">
            <div className="rounded-xl p-3 text-center mb-4" style={{ background: tossPrediction.matchScore === tossPrediction.totalRules ? 'rgba(22,163,74,0.08)' : 'rgba(234,179,8,0.08)', border: `1px solid ${tossPrediction.matchScore === tossPrediction.totalRules ? 'rgba(22,163,74,0.3)' : 'rgba(234,179,8,0.3)'}` }}>
              <div className="text-xs text-text-muted uppercase tracking-widest mb-0.5">Toss Jeetega</div>
              <div className={`text-2xl font-black ${tossPrediction.matchScore === tossPrediction.totalRules ? 'text-profit' : 'text-yellow-600'}`}>{tossPrediction.winnerName}</div>
              <div className="text-xs text-text-muted mt-0.5">{tossPrediction.matchScore}/{tossPrediction.totalRules} signals match</div>
            </div>
            <div className="space-y-2">
              {tossPrediction.rules.map(r => (
                <div key={r.label} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: r.winnerWins ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.04)', border: `1px solid ${r.winnerWins ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.12)'}` }}>
                  <span className="text-xs font-bold shrink-0" style={{ color: r.winnerWins ? '#16a34a' : '#dc2626' }}>{r.winnerWins ? '✅' : '❌'} {r.label}</span>
                  <div className="flex-1 text-right">
                    <span className={`text-xs font-bold ${tossPrediction.winnerIdx === 0 ? 'text-profit' : 'text-text-muted'}`}>{r.v1}</span>
                    <span className="text-xs text-text-muted mx-1">vs</span>
                    <span className={`text-xs font-bold ${tossPrediction.winnerIdx === 1 ? 'text-profit' : 'text-text-muted'}`}>{r.v2}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Deep Betting Metrics */}
      {(Object.keys(raw).length > 0 || Object.keys(tot).length > 0) && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
            <BarChart3 size={15} className="text-primary" />
            <span className="text-sm font-bold text-primary">Deep Betting Metrics</span>
          </div>
          <div className="p-4 space-y-4">
            {Object.keys(raw).length > 0 && (
              <div>
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Raw Accumulated Values</div>
                <div className="space-y-1.5">
                  {[
                    { key: 'A_back_expo', label: `${t1} Back Expo` },
                    { key: 'A_lay_stake', label: `${t1} Lay Stake` },
                    { key: 'B_back_expo', label: `${t2} Back Expo` },
                    { key: 'B_lay_stake', label: `${t2} Lay Stake` },
                  ].filter(({ key }) => raw[key] != null).map(({ key, label }) => (
                    <div key={key} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-xs text-text-secondary font-medium">{label}</span>
                      <span className="text-xs font-bold text-text-primary">{Number(raw[key]).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(tot).length > 0 && (
              <div>
                <div className="text-xs font-bold text-back mb-2 uppercase tracking-wide">Total Bets</div>
                <div className="space-y-1.5">
                  {Object.entries(tot).map(([key, val]) => {
                    const name = key === 'team1' ? t1 : key === 'team2' ? t2 : key === 'totalBetTeam1' ? t1 : key === 'totalBetTeam2' ? t2 : key
                    return (
                      <div key={key} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-xs text-text-secondary font-medium">{name}</span>
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



      {/* Bookie ka risk */}
      {(exp1.netExposure != null || exp2.netExposure != null) && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-sm font-bold text-text-secondary mb-3">Bookie ka risk — Kitna exposed hai?</div>
          <div className="grid grid-cols-2 gap-3">
            {[{ e: exp1, team: t1 }, { e: exp2, team: t2 }].map(({ e, team }) => (
              <div key={team} className="rounded-xl p-3" style={{ background: '#fff8f8', border: '1px solid #fecaca' }}>
                <div className="text-sm font-medium mb-2">{e.teamName || team}</div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-text-muted">Net exposure</span><span className={`font-bold ${pnlCls(e.netExposure)}`}>{fmtRs(e.netExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Back risk</span><span className="text-back">₹{fmt(e.backExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">Lay risk</span><span className="text-loss">₹{fmt(e.layExposure)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookie P/L from exposure */}
      {(snap.teams?.[t1]?.pnlIfWins != null || snap.teams?.[t2]?.pnlIfWins != null) && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs font-bold text-text-muted uppercase mb-3">📈 Bookie P/L (Agar Team Jeete)</div>
          <div className="grid grid-cols-2 gap-3">
            {[{ name: t1, pl: snap.teams?.[t1]?.pnlIfWins }, { name: t2, pl: snap.teams?.[t2]?.pnlIfWins }].map(({ name, pl }) => (
              <div key={name} className="rounded-xl p-3 text-center" style={{ background: pl >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${pl >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
                <div className="text-base font-bold text-text-primary mb-1 truncate">{name}</div>
                <div className={`text-xl font-black ${pnlCls(pl)}`}>{fmtRs(pl)}</div>
                <div className={`text-xs font-bold mt-1 ${pnlCls(pl)}`}>{pl >= 0 ? '✅ PROFIT' : '❌ LOSS'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-Play / Pre-Match Stats */}
      <div className="space-y-2">
        {[{ title: 'In-Play', pnl: ip, bets: ib, vol: iv }, { title: 'Pre-Match', pnl: pp, bets: pb, vol: pv }, { title: 'Last 3 Min', pnl: tp, bets: tb, vol: tv }].map(({ title, pnl, bets, vol }) => (
          <div key={title} className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
              <span className="text-xs font-black uppercase tracking-wider text-primary">{title}</span>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-3 gap-1 mb-1.5">
                <div />
                <div className="text-center text-[10px] font-bold text-text-secondary truncate px-1">{t1}</div>
                <div className="text-center text-[10px] font-bold text-text-secondary truncate px-1">{t2}</div>
              </div>
              {[
                { label: 'P/L',  v1: <span className={`font-bold text-xs ${pnlCls(pnl.team1)}`}>{fmtRs(pnl.team1)}</span>,  v2: <span className={`font-bold text-xs ${pnlCls(pnl.team2)}`}>{fmtRs(pnl.team2)}</span> },
                { label: 'Bets', v1: <span className="text-[11px] text-text-secondary">₹{fmt(bets.team1)}</span>,             v2: <span className="text-[11px] text-text-secondary">₹{fmt(bets.team2)}</span> },
                { label: 'Back', v1: <span className="text-[11px] text-back">₹{fmt(vol.team1?.back)}</span>,                v2: <span className="text-[11px] text-back">₹{fmt(vol.team2?.back)}</span> },
                { label: 'Lay',  v1: <span className="text-[11px] text-loss">₹{fmt(vol.team1?.lay)}</span>,                 v2: <span className="text-[11px] text-loss">₹{fmt(vol.team2?.lay)}</span> },
              ].map(({ label, v1, v2 }, i) => (
                <div key={label} className={`grid grid-cols-3 gap-1 py-1.5 ${i !== 3 ? 'border-b border-border/30' : ''}`}>
                  <div className="text-[10px] text-text-muted flex items-center font-semibold">{label}</div>
                  <div className="text-center flex items-center justify-center">{v1}</div>
                  <div className="text-center flex items-center justify-center">{v2}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Overall sentiment */}
      {ns.teamA && sent.teamA && (
        <div className="glass-card rounded-2xl p-4">
          <div className="text-sm font-bold text-text-secondary mb-3">Overall sentiment — Logon ka mood</div>
          <div className="mb-3">
            {[t1, t2].map((team, i) => {
              const key = i === 0 ? 'teamA' : 'teamB'
              const pct = i === 0 ? ns.percentageA : ns.percentageB
              return (
                <div key={key} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{team}</span>
                    <span className={`font-bold ${pct >= 50 ? 'text-profit' : 'text-loss'}`}>{pct?.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#fee2e2' }}>
                    <div className={`h-full rounded-full ${pct >= 50 ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="text-xs text-text-muted text-center">
            Zyada support: <span className="text-profit font-bold">{sent.strongerTeam}</span> •{' '}
            Difference: <span className="text-text-secondary">₹{fmt(sent.scoreDifference)}</span>
          </div>
        </div>
      )}

      {/* Top 5 Bets */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)' }}>
          <span className="text-sm font-bold text-primary">💰 Top 5 Bets (Poore Match Mein)</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border">
          {[{ team: t1, bets: t1Top5 }, { team: t2, bets: t2Top5 }].map(({ team, bets }) => (
            <div key={team} className="p-3">
              <div className="text-xs font-bold text-text-secondary truncate mb-2">{team}</div>
              <div className="space-y-1.5">
                {bets.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.type === 'back' ? 'bg-blue-100 text-back' : 'bg-red-100 text-loss'}`}>{b.type === 'back' ? 'B' : 'L'}</span>
                      <span className="text-xs font-semibold text-text-primary">{b.price}</span>
                    </div>
                    <span className="text-xs font-bold text-text-primary">₹{fmtVol(b.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
