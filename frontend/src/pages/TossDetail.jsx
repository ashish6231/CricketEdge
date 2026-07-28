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

  const tossPrediction = (() => {
    if (!hasTossRuleData) return null
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
        // Women: lower sentiment = winner
        const t1wins = sent1Pct < sent2Pct
        rules.push({ label: 'Kam Overall Sentiment', t1wins, v1: `${sent1Pct?.toFixed(1)}%`, v2: `${sent2Pct?.toFixed(1)}%` })
        if (t1wins) t1Score++; else t2Score++
      } else {
        // Mens: higher sentiment = winner
        const t1wins = sent1Pct > sent2Pct
        rules.push({ label: 'Zyada Overall Sentiment', t1wins, v1: `${sent1Pct?.toFixed(1)}%`, v2: `${sent2Pct?.toFixed(1)}%` })
        if (t1wins) t1Score++; else t2Score++
      }
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
  function calcFakeVolume(backVol, layVol) {
    const matched = Math.min(backVol, layVol)
    return { fakeBack: backVol - matched, oppFakeLay: layVol - matched, total: (backVol - matched) + (layVol - matched) }
  }
  const t1Fake = calcFakeVolume(am1.back || 0, am1.lay || 0)
  const t2Fake = calcFakeVolume(am2.back || 0, am2.lay || 0)
  const totalFake = t1Fake.total + t2Fake.total
  const t1Pct = totalFake > 0 ? (t1Fake.total / totalFake) * 100 : 50
  const t2Pct = 100 - t1Pct
  const mostFakeTeam = t1Fake.total >= t2Fake.total ? t1 : t2

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
      {(exp1.netExposure != null || exp2.netExposure != null) && (() => {
        const t1ifWins = exp1.netExposure != null ? -exp1.netExposure : null
        const t2ifWins = exp2.netExposure != null ? -exp2.netExposure : null
        return (
          <div className="glass-card rounded-2xl p-4">
            <div className="text-xs font-bold text-text-muted uppercase mb-3">📈 Bookie P/L (Agar Team Jeete)</div>
            <div className="grid grid-cols-2 gap-3">
              {[{ name: t1, pl: t1ifWins }, { name: t2, pl: t2ifWins }].map(({ name, pl }) => (
                <div key={name} className="rounded-xl p-3 text-center" style={{ background: pl >= 0 ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)', border: `1px solid ${pl >= 0 ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}` }}>
                  <div className="text-base font-bold text-text-primary mb-1 truncate">{name}</div>
                  <div className={`text-xl font-black ${pnlCls(pl)}`}>{fmtRs(pl)}</div>
                  <div className={`text-xs font-bold mt-1 ${pnlCls(pl)}`}>{pl >= 0 ? '✅ PROFIT' : '❌ LOSS'}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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

      {/* Spoofing Detector */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #fde8e8 0%, #fdf0e8 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🚨</span>
          <span className="text-xl font-bold text-text-primary">Spoofing Detector</span>
          <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>LIVE</span>
        </div>
        <p className="text-xs text-text-muted mb-4">Cumulative fake orders — canceled volume not matched as trades</p>
        <div className="h-3 rounded-full overflow-hidden flex mb-2" style={{ background: '#fecaca' }}>
          <div className="h-full" style={{ width: `${t1Pct}%`, background: 'linear-gradient(90deg,#dc2626,#f87171)' }} />
          <div className="h-full" style={{ width: `${t2Pct}%`, background: 'linear-gradient(90deg,#f97316,#fbbf24)' }} />
        </div>
        <div className="flex justify-between text-xs font-semibold mb-4">
          <span className="text-primary">{t1}: {t1Pct.toFixed(1)}%</span>
          <span className="text-text-muted">{t2}: {t2Pct.toFixed(1)}%</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[{ team: t1, fake: t1Fake, isMain: true }, { team: t2, fake: t2Fake, isMain: false }].map(({ team, fake, isMain }) => (
            <div key={team} className="bg-white rounded-xl p-3" style={{ border: '1px solid #fecaca' }}>
              <div className={`text-xs font-bold mb-3 truncate ${isMain ? 'text-primary' : 'text-text-secondary'}`}>{team}</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3b82f6' }} />
                    <span className="text-xs text-text-muted">Fake Back</span>
                  </div>
                  <span className="text-xs font-bold text-text-primary">{fmtVol(fake.fakeBack)}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f87171' }} />
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
        <div className="rounded-xl py-4 px-5 text-center" style={{ background: 'linear-gradient(135deg,#fca5a5,#fcd9b0)' }}>
          <div className="text-xs font-bold tracking-widest text-primary/60 uppercase mb-1">Most Fake Orders On</div>
          <div className="text-2xl font-bold text-primary">{mostFakeTeam}</div>
        </div>
      </div>



    </div>
  )
}
