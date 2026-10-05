import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from "recharts"
import TossDetail from './TossDetail'

import { useEffect, useState, useContext, useMemo, useRef } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, BarChart3, BookOpen, ChevronDown, ChevronUp, Coins, TrendingUp, Radio, Trophy, Sparkles, Shield, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
import { CrexScorecardBanner, CrexLiveTab } from '../components/CrexLiveSection'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { predictTossWinner } from '../utils/tossPredictor'
import { predictMatchWinner, predictSmartMarketWinner } from '../utils/matchWinnerPredictor'
import { predictMatchStart, lockMatchStartPrediction, getMatchStartExitAdvice, PREDICTOR_VERSION } from '../utils/matchStartPredictor'
import { getBookiePl, splitMatchOutcomes, finiteNumber, timestamp, tradeSide, getSelectionStakes, latestMatchedPrice } from '../utils/bookiePl'
import { teamEq } from '../utils/gatedFadePredictor'
import { tradeMatchesMarket, sessionDataFingerprint } from '../utils/sessionMetrics'
import SessionPanel from '../components/SessionPanel'
import { RiskBadge } from '../components/PredictionMeta'
import { getSocket, subscribeMatch, unsubscribeMatch, getMatchBundle, setMatchBundle } from '../socket'
import { getCricketMatchBundle } from '../api'
import { isCompleteMatchBundle } from '../utils/matchBundle'

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return formatVolStr(n)
}

const fmtRs = (n) => {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}€${fmt(Math.abs(n))}`
}

const fmtTossRs = (n) => {
  if (n === null || n === undefined) return '—'
  const rounded = Math.round(Number(n))
  return `${rounded >= 0 ? '+' : '−'}€${Math.abs(rounded).toLocaleString('en-IN')}`
}

const pnlCls = (n) => n == null ? 'text-text-muted' : n >= 0 ? 'text-profit' : 'text-loss'

const fmtVol = (n) => {
  if (!n) return '0.00'
  return formatVolStr(n)
}

const formatMoney = (val) => {
  if (!val) return '0.00'
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatBetfairVol = (val) => {
  if (val === null || val === undefined) return '—'
  if (val === 0 || val === '0') return '0.00'
  const num = Number(val)
  if (isNaN(num)) return String(val)
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(2)}M`
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}k`
  return `${sign}${abs.toFixed(2)}`
}

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

const formatVolTooltip = (val) => {
  if (!val) return '0.00'
  return formatVolStr(val)
}

const formatOdds = (val) => {
  if (val === null || val === undefined || val === 0 || isNaN(Number(val))) return '—'
  return Number(val).toFixed(2)
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

const getPredictionVisuals = pred => pred ? {
  gradient: '#eff6ff', border: '#bfdbfe', shadow: 'none',
  textColor: 'text-primary', badgeBg: 'bg-primary text-white',
  tagText: 'LEAGUE ALGORITHM', pill: 'Rule based', desc: pred.reason,
  meterPct: pred.confidence?.calibrated ? finiteNumber(pred.confidence.pct) : null,
} : null

const processTeamData = (teamName, teamData, timeFilter = 'all') => {
  let trades = teamData?.trades || []

  if (timeFilter !== 'all' && trades.length > 0) {
    const hours = timeFilter === '1h' ? 1 : 3
    const maxTime = Math.max(...trades.map(t => t.updatedAt))
    const cutoff = maxTime - (hours * 60 * 60 * 1000)
    trades = trades.filter(t => t.updatedAt >= cutoff)
  }

  if (trades.length === 0) return {
    name: teamName, low: 0, high: 0, totalBet: 0, lastPrice: 0, trend: 'Neutral', orderBook: [], maxVol: 0, peakPrice: 0, timeSeries: []
  }

  const prices = trades.map(t => t.price)
  const low = Math.min(...prices)
  const high = Math.max(...prices)

  const totalBet = trades.reduce((sum, t) => sum + (parseFloat(t.size) || 0), 0)

  const sortedTrades = [...trades].sort((a, b) => b.updatedAt - a.updatedAt)
  const lastPrice = parseFloat(sortedTrades[0]?.price) || 0

  let trend = 'Neutral'
  if (sortedTrades.length >= 2) {
    const last = parseFloat(sortedTrades[0].price) || 0
    const prev = parseFloat(sortedTrades.find(t => t.price !== sortedTrades[0].price)?.price) || last
    if (last > prev) trend = 'Rising'
    else if (last < prev) trend = 'Dropping'
  }

  let totalBack = 0
  let totalLay = 0
  let totalBackLiability = 0
  let totalLayLiability = 0
  let backValue = 0
  let layTradeCount = 0

  const priceMap = {}
  trades.forEach(t => {
    const p = parseFloat(t.price) || 0
    const s = parseFloat(t.size) || 0

    if (!priceMap[p]) {
      priceMap[p] = { price: p, back: 0, lay: 0, traded: 0, totalVol: 0 }
    }
    if (t.type === 'back') {
      priceMap[p].back += s
      totalBack += s
      totalBackLiability += s * (p - 1)
      backValue += p * s
    } else if (t.type === 'lay') {
      priceMap[p].lay += s
      totalLay += s
      totalLayLiability += s * (p - 1)
      layTradeCount++
    }

    priceMap[p].traded += s
    priceMap[p].totalVol += s
  })

  const orderBook = Object.values(priceMap).sort((a, b) => a.price - b.price)
  const maxVol = orderBook.length > 0 ? Math.max(...orderBook.map(o => o.totalVol)) : 0
  const peakPrice = orderBook.find(o => o.totalVol === maxVol)?.price

  const timeSeries = sortedTrades.slice().reverse().map(t => ({
    time: new Date(t.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: parseFloat(t.price) || 0,
    volume: parseFloat(t.size) || 0
  }))

  const backLayRatio = totalLayLiability > 0 ? backValue / totalLayLiability : 0

  return {
    name: teamName,
    low, high, totalBet, lastPrice, trend, orderBook, maxVol, peakPrice, timeSeries,
    totalBack, totalLay, totalBackLiability, totalLayLiability, backValue, backLayRatio, layTradeCount
  }
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1c1c1e] border border-[#2c2c2e] p-2 rounded text-xs shadow-xl">
        <p className="text-gray-300 font-bold mb-1">{`Price: ${formatOdds(payload[0].payload.price)}`}</p>
        <p className="text-[#3b82f6] font-medium">{`Traded: ${formatVolTooltip(payload[0].payload.totalVol)}`}</p>
      </div>
    );
  }
  return null;
};

const TimeTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1c1c1e] border border-[#2c2c2e] p-2 rounded text-xs shadow-xl">
        <p className="text-gray-300 font-bold mb-1">{`Time: ${label}`}</p>
        <p className="text-[#10b981] font-medium">{`Price: ${formatOdds(payload[0].payload.price)}`}</p>
        <p className="text-[#3b82f6] font-medium">{`Vol: ${formatVolTooltip(payload[0].payload.volume)}`}</p>
      </div>
    );
  }
  return null;
};

const TeamCard = ({ teamData, isToss = false, isSession = false, marketVol = 0 }) => {
  const [activeTab, setActiveTab] = useState('volume')
  const [activeOnly, setActiveOnly] = useState(true)

  if (!teamData) return null


  const getSessionPlForLine = (lineItem) => {
    if (!isSession || !teamData.orderBook) return 0
    const score = Math.floor(lineItem.price)
    let sessionPl = 0
    teamData.orderBook.forEach(line => {
      if (score > line.price) {
        sessionPl -= line.back
        sessionPl += line.lay
      } else {
        sessionPl += line.back
        sessionPl -= line.lay
      }
    })
    return sessionPl
  }
  return (
    <div className="bg-[#0c101d] rounded-xl border border-[#1e2538] shadow-xl overflow-hidden mb-3.5 backdrop-blur-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 sm:px-4 py-2.5 border-b border-[#1b2234] bg-[#0f1422]/60 min-h-[46px]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] shrink-0" />
          <div className="font-bold text-white text-sm sm:text-base tracking-tight truncate">{teamData.name}</div>
          {teamData.trend && (
            <div className={`hidden sm:flex text-[10px] items-center gap-1 font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
              teamData.trend === 'Rising' 
                ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' 
                : teamData.trend === 'Dropping' 
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' 
                  : 'text-slate-400 bg-slate-800/40 border border-slate-700/30'
            }`}>
              {teamData.trend === 'Rising' ? <TrendingUp size={10} /> : teamData.trend === 'Dropping' ? <TrendingUp size={10} className="rotate-180" /> : null}
              <span>{teamData.trend}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex bg-[#07090e] rounded-lg p-0.5 border border-[#1e273b]">
            <button onClick={() => setActiveTab('volume')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${activeTab === 'volume' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>Chart</button>
            <button onClick={() => setActiveTab('time')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${activeTab === 'time' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>History</button>
            <button onClick={() => setActiveTab('book')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${activeTab === 'book' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>Order Book</button>
          </div>
        </div>
      </div>

      {/* Stats Card (Betfair Selection Info) */}
      <div className="p-3 sm:p-3.5 pb-2.5">
        <div className="bg-[#121622] border border-[#22293a] rounded-xl px-4 py-3 sm:px-5 sm:py-3.5 space-y-2.5 shadow-inner">
          <div className="flex justify-between items-center text-xs sm:text-[13px]">
            <span className="text-[#9ca3af] font-normal">Range:</span>
            <span className="text-white font-mono font-bold tracking-tight">
              Low: {formatOdds(teamData.low)} High: {formatOdds(teamData.high)}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs sm:text-[13px]">
            <span className="text-[#9ca3af] font-normal">On this selection:</span>
            <span className="text-white font-mono font-bold tracking-tight">
              €{formatBetfairVol(teamData.totalBet)}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs sm:text-[13px]">
            <span className="text-[#9ca3af] font-normal">Last price matched:</span>
            <span className="text-white font-mono font-bold tracking-tight">
              {formatOdds(teamData.lastPrice)}
            </span>
          </div>
        </div>

        {/* Toss specific Stakes if present */}
        {isToss && (teamData.totalBack > 0 || teamData.totalLay > 0) && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-[#121622] border border-[#22293a] rounded-lg px-3 py-1.5 flex justify-between items-center">
              <span className="text-[#9ca3af] text-[11px]">Back Stake:</span>
              <span className="text-sky-400 text-xs font-mono font-bold">€{formatBetfairVol(teamData.totalBack)}</span>
            </div>
            <div className="bg-[#121622] border border-[#22293a] rounded-lg px-3 py-1.5 flex justify-between items-center">
              <span className="text-[#9ca3af] text-[11px]">Lay Stake:</span>
              <span className="text-rose-400 text-xs font-mono font-bold">€{formatBetfairVol(teamData.totalLay)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'volume' && (
        <div className="px-3.5 sm:px-4 pb-3.5">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <BarChart3 size={11} className="text-blue-400" /> Volume by Price
            </span>
            <span className="text-slate-400 text-[11px] font-medium">Peak @ <b className="text-white font-mono">{formatOdds(teamData.peakPrice)}</b></span>
          </div>
          <div className="h-[175px] w-full bg-[#080a12]/50 rounded-lg p-1.5 border border-[#181f30]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamData.orderBook} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f273b" vertical={false} />
                <XAxis dataKey="price" stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(val) => formatOdds(val)} minTickGap={20} />
                <YAxis stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(val) => formatVolStr(val)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1f273b', opacity: 0.35 }} />
                <Bar dataKey="totalVol" radius={[2, 2, 0, 0]}>
                  {teamData.orderBook.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.price === teamData.peakPrice ? '#38bdf8' : '#334155'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'time' && (
        <div className="px-3.5 sm:px-4 pb-3.5">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={11} className="text-emerald-400" /> Price History
            </span>
          </div>
          <div className="h-[175px] w-full bg-[#080a12]/50 rounded-lg p-1.5 border border-[#181f30]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={teamData.timeSeries} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f273b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 9 }} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(val) => formatOdds(val)} />
                <Tooltip content={<TimeTooltip />} />
                <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#34d399' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'book' && (
        <div className="px-3.5 sm:px-4 pb-3.5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 mb-2">
            <span className="text-slate-400 text-[11px] font-medium">Showing {teamData.orderBook.length} price levels</span>
            <div className="flex bg-[#07090e] rounded-lg p-0.5 border border-[#1e273b]">
              <button onClick={() => setActiveOnly(true)} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${activeOnly ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>Active Only</button>
              <button onClick={() => setActiveOnly(false)} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${!activeOnly ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>All Prices</button>
            </div>
          </div>

          <div className="w-full overflow-x-auto rounded-lg border border-[#1b2234] bg-[#080b14]">
            <div className="min-w-[320px] text-xs">
              <div className={`grid ${isSession ? 'grid-cols-5' : 'grid-cols-4'} py-1.5 px-2.5 border-b border-[#1b2234] bg-[#0e1322] font-bold text-slate-400 text-[10px]`}>
                <div>Price</div>
                <div className="text-right text-sky-400">To Back</div>
                <div className="text-right text-rose-400">To Lay</div>
                <div className="text-right text-emerald-400">Traded</div>
                {isSession && <div className="text-right text-purple-400">P/L</div>}
              </div>
              <div className="max-h-[240px] overflow-y-auto divide-y divide-[#1b2234]/50">
                {teamData.orderBook.filter(item => !activeOnly || item.totalVol > 0).map((item, idx) => (
                  <div key={idx} className={`grid ${isSession ? 'grid-cols-5' : 'grid-cols-4'} py-1.5 px-2.5 hover:bg-white/[0.02] transition-colors items-center font-mono text-[11px]`}>
                    <div className="text-white font-bold">{formatOdds(item.price)}</div>
                    <div className="text-sky-400 text-right font-medium">{item.back > 0 ? formatVolStr(item.back) : '-'}</div>
                    <div className="text-rose-400 text-right font-medium">{item.lay > 0 ? formatVolStr(item.lay) : '-'}</div>
                    <div className="text-emerald-400 text-right font-medium">{item.traded > 0 ? formatVolStr(item.traded) : '-'}</div>
                    {isSession && (
                      <div className={`text-right font-bold ${getSessionPlForLine(item) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatVolStr(getSessionPlForLine(item))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showAdvancedGraph, setShowAdvancedGraph] = useState(false)
  const [crexData, setCrexData] = useState(seedCrex)
  const crexDataRef = useRef(seedCrex)
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(`tab_${matchId}`) || 'simple')
  const handleTabChange = (key) => {
    sessionStorage.setItem(`tab_${matchId}`, key)
    setActiveTab(key)
  }
  const [timeFilter, setTimeFilter] = useState('all')
  const [marketType, setMarketType] = useState('match_odds')
  const [showMarketMenu, setShowMarketMenu] = useState(false)
  const [tossSnapshot, setTossSnapshot] = useState(prefetched?.toss || null)
  const [lockedStartPred, setLockedStartPred] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`match_start_${PREDICTOR_VERSION}_${matchId}`)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [showTipperPick, setShowTipperPick] = useState(false)
  const [sessionTrades, setSessionTrades] = useState([])
  const [sessionOdds, setSessionOdds] = useState([])
  const [activeSessions, setActiveSessions] = useState([])

  const isSessionMarket = marketType.startsWith('session_')
  const selectedSessionName = isSessionMarket ? marketType.replace('session_', '') : ''
  const selectedSessionTrades = isSessionMarket ? sessionTrades.filter(t => tradeMatchesMarket(t, selectedSessionName)) : []

  const sessionOrderBook = useMemo(() => {
    if (!isSessionMarket || !selectedSessionTrades.length) return []
    const lineMap = {}
    selectedSessionTrades.forEach(t => {
      const p = t.price
      if (!lineMap[p]) lineMap[p] = { price: p, yesVol: 0, noVol: 0 }
      if (t.type === 'back') lineMap[p].yesVol += t.size
      else lineMap[p].noVol += t.size
    })
    return Object.values(lineMap).map(l => ({
      ...l,
      totalVol: l.yesVol + l.noVol
    })).sort((a, b) => a.price - b.price)
  }, [selectedSessionTrades, isSessionMarket])

  const sessionScoresPL = useMemo(() => {
    if (!isSessionMarket || !sessionOrderBook.length) return []
    const minLine = Math.floor(sessionOrderBook[0].price)
    const maxLine = Math.ceil(sessionOrderBook[sessionOrderBook.length - 1].price)

    const scores = []
    for (let score = minLine - 1; score <= maxLine + 1; score++) {
      let pl = 0
      sessionOrderBook.forEach(line => {
        if (score > line.price) {
          pl -= line.yesVol
          pl += line.noVol
        } else {
          pl += line.yesVol
          pl -= line.noVol
        }
      })
      scores.push({ score, pl })
    }
    return scores
  }, [sessionOrderBook, isSessionMarket])

  useEffect(() => {
    let cancelled = false

    let lastSessionFp = ''
    const applySessionData = (sessionData) => {
      if (!sessionData?.trades && !sessionData?.odds?.length) return
      const fp = sessionDataFingerprint(sessionData)
      if (fp === lastSessionFp) return
      lastSessionFp = fp
      if (sessionData.trades) setSessionTrades(sessionData.trades)
      if (sessionData.odds) setSessionOdds(sessionData.odds)
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

    // Fast delivery via WebSocket; fallback to HTTP only if socket is not connected or delayed
    let httpFetchTimeout = null
    if (!prefetched?.cricket || prefetched?._seeded) {
      if (!socket.connected) {
        setLoading(true)
        getCricketMatchBundle(matchId)
          .then(data => {
            if (!cancelled && data && !data.error) handleBundle(data)
          })
          .catch(() => { })
      } else {
        // Fallback after 1200ms only if socket hasn't delivered full bundle
        httpFetchTimeout = setTimeout(() => {
          if (!cancelled) {
            getCricketMatchBundle(matchId)
              .then(data => {
                if (!cancelled && data && !data.error) handleBundle(data)
              })
              .catch(() => { })
          }
        }, 1200)
      }
    }

    // Safety timeout — agar 8s mein data nahi aaya toh loading hatao
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
      if (httpFetchTimeout) clearTimeout(httpFetchTimeout)
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

  useEffect(() => {
    if (liveStartPred) {
      setLockedStartPred((prev) => {
        const next = lockMatchStartPrediction(liveStartPred, prev, { inPlay: snapshot?.inPlay })
        if (next && matchId) {
          try {
            sessionStorage.setItem(`match_start_${PREDICTOR_VERSION}_${matchId}`, JSON.stringify(next))
          } catch { }
        }
        return next
      })
    }
  }, [liveStartPred, snapshot?.inPlay, matchId])

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

  const hasSessionData = useMemo(() => {
    if (sport !== 'cricket') return false
    const hasOdds = Array.isArray(sessionOdds) && sessionOdds.length > 0
    const hasTrades = Array.isArray(sessionTrades) && sessionTrades.length > 0
    return hasOdds || hasTrades
  }, [sport, sessionOdds, sessionTrades])

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
  const matchSchedule = formatMatchSchedule(
    snapshot.startTime ?? snapshot.openDate ?? snapshot.marketStartTime ?? cachedStart
  )
  const { t1, t2, drawName } = splitMatchOutcomes(snapshot.teamNames)
  const hasDraw = !!drawName
  const dm = snapshot.deepMetrics || {}
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
  const exitAdvice = (matchStartPred && snapshot?.inPlay && pickName)
    ? getMatchStartExitAdvice({
      lockedPick: matchStartPred,
      inPlay: snapshot.inPlay,
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

  // First bar is the actual number of matched trade rows, not stake money.
  const marketBetCount1 = t1ValidTrades.length
  const marketBetCount2 = t2ValidTrades.length
  const marketBetCountDraw = drawValidTrades.length
  const marketBetCountTotal = marketBetCount1 + marketBetCount2 + marketBetCountDraw
  const marketBetPct1 = marketBetCountTotal > 0 ? (marketBetCount1 / marketBetCountTotal) * 100 : 50
  const marketBetPct2 = marketBetCountTotal > 0 ? (marketBetCount2 / marketBetCountTotal) * 100 : 50
  const marketBetPctDraw = marketBetCountTotal > 0 ? (marketBetCountDraw / marketBetCountTotal) * 100 : 0

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

  const comparisonColors = (values, preferHigher) => {
    const allEqual = values.every(value => value === values[0])
    if (allEqual) return values.map(() => '#64748b')
    const preferred = preferHigher ? Math.max(...values) : Math.min(...values)
    return values.map(value => value === preferred ? '#16a34a' : '#dc2626')
  }
  const [betColor1, betColor2] = comparisonColors([marketBetCount1, marketBetCount2], false)
  const [moneyColor1, moneyColor2] = comparisonColors([marketMoney1, marketMoney2], true)
  const drawColor = '#d97706'

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
  const pp = snapshot.preMatchPnl || {}
  const pb = snapshot.preMatchTotalBets || {}
  const iv = snapshot.inPlayVolume || {}
  const pv = snapshot.preMatchVolume || {}
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
  const t1GraphData = processTeamData(graphT1, graphSnap?.teams?.[graphT1], effectiveTimeFilter)
  const t2GraphData = processTeamData(graphT2, graphSnap?.teams?.[graphT2], effectiveTimeFilter)
  const sessionGraphData = isSessionMarket ? processTeamData('Total Runs', { trades: selectedSessionTrades }, timeFilter) : null

  // ━━━━━ TOSS AI PREDICTION LOGIC ━━━━━
  const tossSnap = tossSnapshot
  const tossT1Name = tossSnap?.teamNames?.[0] || t1
  const tossT2Name = tossSnap?.teamNames?.[1] || t2
  const tossM1 = getSelectionStakes(tossSnap, tossT1Name)
  const tossM2 = getSelectionStakes(tossSnap, tossT2Name)
  const tossS1 = tossSnap?.syntheticSupport?.teamA
  const tossS2 = tossSnap?.syntheticSupport?.teamB
  const tossSup1 = tossSnap?.supportMetrics?.team1
  const tossSup2 = tossSnap?.supportMetrics?.team2

  const tossTrades1 = (tossSnap?.teams?.[tossT1Name] || {}).trades || []
  const tossTrades2 = (tossSnap?.teams?.[tossT2Name] || {}).trades || []
  const { pl1: tossT1BookiePL, pl2: tossT2BookiePL, source: tossPlSource } = tossSnap
    ? getBookiePl(tossSnap, tossT1Name, tossT2Name)
    : {}

  const tossT1GraphData = tossSnap ? processTeamData(tossT1Name, tossSnap?.teams?.[tossT1Name], effectiveTimeFilter) : null
  const tossT2GraphData = tossSnap ? processTeamData(tossT2Name, tossSnap?.teams?.[tossT2Name], effectiveTimeFilter) : null
  const tossMarketVol = (tossT1GraphData?.totalBet || 0) + (tossT2GraphData?.totalBet || 0)


  const tossVol1 = tossM1.totalBet
  const tossVol2 = tossM2.totalBet

  const tossOdds1 = latestMatchedPrice(tossTrades1)
  const tossOdds2 = latestMatchedPrice(tossTrades2)

  const tossTot = tossVol1 != null && tossVol2 != null ? tossVol1 + tossVol2 : null
  const tossPct1 = tossTot > 0 ? Math.round(tossVol1 / tossTot * 100) : null
  const tossPct2 = tossPct1 == null ? null : 100 - tossPct1

  const tossPrediction = tossSnap ? predictTossWinner(tossSnap, tossSnap?.competitionName || snapshot?.competitionName || '') : null
  const predictedTossWinner = tossPrediction?.winnerName || 'Waiting for more data...'
  const tossPredictionReason = tossPrediction?.reason || ''

  // The summary and graphs use the same verified settlement calculation.
  if (t1GraphData) t1GraphData.bookieProfitIfWins = pl1
  if (t2GraphData) t2GraphData.bookieProfitIfWins = pl2
  if (tossT1GraphData) tossT1GraphData.bookieProfitIfWins = tossT1BookiePL
  if (tossT2GraphData) tossT2GraphData.bookieProfitIfWins = tossT2BookiePL
  const marketVol = (t1GraphData?.totalBet || 0) + (t2GraphData?.totalBet || 0)


  return (
    <div className="detail-page detail-page-compact w-full fade-in stagger space-y-4">

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

      {/* ── Live Scorecard Hero Banner — cricket only ── */}
      {sport === 'cricket' && activeTab !== 'toss' && <CrexScorecardBanner crexData={crexData} t1={t1} t2={t2} matchInPlay={snapshot?.inPlay || false} />}

      {activeTab === 'toss' ? (
        <div className="space-y-4">
          {tossSnapshot ? (
            <>
              {/* Toss Team Comparison Card (100% Width) */}
              <div className="w-full rounded-xl border border-[#1e2536] bg-[#0c1018] py-2.5 px-4 sm:px-6 shadow-md mb-3">
                <div className="flex items-center justify-around gap-4 sm:gap-12 w-full">
                  {/* Team 1 Column */}
                  <div className="flex flex-col items-center flex-1 min-w-0 text-center">
                    <span className="text-xs sm:text-sm font-semibold text-slate-300 truncate max-w-full leading-tight">
                      {tossT1Name}
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug my-0.5" title="Traded volume on this selection">
                      {formatVolStr(tossVol1)}
                    </span>
                    {/* Percentage Badge */}
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full inline-block leading-none my-0.5 ${tossPct1 >= 50
                          ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                          : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
                        }`}
                    >
                      {tossPct1 == null ? '—' : `${tossPct1}%`}
                    </span>
                    {/* Odds */}
                    <div className="flex items-center justify-center gap-0.5 text-[11px] sm:text-xs font-bold text-[#10b981] leading-tight mt-0.5" title="Last price matched">
                      <span className="text-[9px]">▲</span>
                      <span>{formatOdds(tossOdds1)}</span>
                    </div>
                  </div>

                  {/* Team 2 Column */}
                  <div className="flex flex-col items-center flex-1 min-w-0 text-center">
                    <span className="text-xs sm:text-sm font-semibold text-slate-300 truncate max-w-full leading-tight">
                      {tossT2Name}
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug my-0.5" title="Traded volume on this selection">
                      {formatVolStr(tossVol2)}
                    </span>
                    {/* Percentage Badge */}
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full inline-block leading-none my-0.5 ${tossPct2 >= 50
                          ? 'border border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                          : 'border border-slate-700/80 bg-slate-800/80 text-slate-400'
                        }`}
                    >
                      {tossPct2 == null ? '—' : `${tossPct2}%`}
                    </span>
                    {/* Odds */}
                    <div className="flex items-center justify-center gap-0.5 text-[11px] sm:text-xs font-bold text-[#10b981] leading-tight mt-0.5" title="Last price matched">
                      <span className="text-[9px]">▲</span>
                      <span>{formatOdds(tossOdds2)}</span>
                    </div>
                  </div>
                </div>

                {/* Micro Inflow Bar */}
                <div className="mt-2 h-1.5 w-full bg-[#1b2234] rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${tossPct1 ?? 0}%` }}
                    className={`h-full transition-all duration-300 ${
                      tossPct1 >= tossPct2
                        ? 'bg-gradient-to-r from-emerald-700 to-green-600'
                        : 'bg-gradient-to-r from-red-600 to-rose-600'
                    }`}
                  />
                  <div
                    style={{ width: `${tossPct2 ?? 0}%` }}
                    className={`h-full transition-all duration-300 ${
                      tossPct2 > tossPct1
                        ? 'bg-gradient-to-r from-emerald-700 to-green-600'
                        : 'bg-gradient-to-r from-red-600 to-rose-600'
                    }`}
                  />
                </div>
              </div>

              {/* 🎯 TOSS SMART MONEY & INFLOW PREDICTOR */}
              <div className="rounded-xl overflow-hidden border border-[#1e2538] shadow-xl bg-[#0c101d] p-3 sm:p-3.5 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                      🎯 Toss Smart Money & Inflow Predictor
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    EXCHANGE INFLOW
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Toss market smart money accumulation, back-volume dominance, and syndicate trade flow detection.
                </p>

                {/* 🏆 PREDICTED TOSS WINNER */}
                <div className="rounded-lg p-3 sm:p-3.5 border bg-emerald-500/[0.08] border-emerald-500/30 shadow-md">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                      <Trophy size={12} className="text-amber-400" />
                      <span>PREDICTED TOSS WINNER</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tossPrediction?.algoName && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {tossPrediction.algoName}
                        </span>
                      )}
                      <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-emerald-400 text-black shadow-sm">
                        {tossPrediction?.verdictTag || 'SMART MONEY INFLOW'}
                      </span>
                    </div>
                  </div>

                  <div className="text-lg sm:text-xl font-black text-white mb-1.5 flex items-center gap-2">
                    <span>{predictedTossWinner}</span>
                  </div>

                  <div className="text-xs text-slate-300 leading-relaxed space-y-1 pt-1 border-t border-white/5">
                    <div className="text-[11px] text-slate-300">
                      💡 <b>Inflow Analysis:</b> {tossPredictionReason || 'Analyzing orderbook accumulation...'}
                    </div>
                    {tossPrediction?.algoName && (
                      <div className="text-[10px] text-sky-400 font-medium flex items-center gap-1.5 pt-0.5">
                        <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500/20 border border-sky-500/30 text-sky-300 font-bold uppercase tracking-wider">Algo</span>
                        <span>{tossPrediction.algoName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 📈 Bookie P/L (Agar Team Jeete) — Just below Predicted Winner */}
                {(tossT1BookiePL != null || tossT2BookiePL != null || tossTrades1.length > 0 || tossTrades2.length > 0) && (
                  <div className="rounded-lg p-3 sm:p-3.5 border border-[#1b2234] bg-[#080b14]">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                      <span>📈 Bookie P/L (Agar Team Jeete){tossPlSource === 'api' ? ' • API' : ' • Trades'}</span>
                      <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                        TOSS P/L
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      {[{ name: tossT1Name, pl: tossT1BookiePL }, { name: tossT2Name, pl: tossT2BookiePL }].map(({ name, pl }) => {
                        const isProf = pl != null && pl >= 0
                        return (
                          <div
                            key={name}
                            className="rounded-xl p-3 text-center border transition-all"
                            style={{
                              background: isProf ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)',
                              border: `1px solid ${isProf ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`
                            }}
                          >
                            <div className="text-sm sm:text-base font-bold text-white mb-1 truncate">{name}</div>
                            <div className={`text-xl font-black font-mono ${pnlCls(pl)}`}>{fmtTossRs(pl)}</div>
                            <div className={`text-xs font-bold mt-1 ${pnlCls(pl)}`}>{pl == null ? 'Unavailable' : isProf ? '✅ PROFIT' : '❌ LOSS'}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 2. 6-Metric Breakdown Table */}
                <div className="pt-1">
                  <div className="grid grid-cols-3 gap-1 mb-1.5 px-1">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Metrics</div>
                    <div className="text-center text-[9px] font-bold text-slate-300 truncate">{tossT1Name}</div>
                    <div className="text-center text-[9px] font-bold text-slate-300 truncate">{tossT2Name}</div>
                  </div>
                  <div className="rounded-lg border border-[#1b2234] p-1.5 bg-[#080b14] font-mono">
                    {[
                      { label: 'Back Val', v1: <span className="text-[11px] text-sky-400 font-bold">€{formatVolStr(tossM1?.back)}</span>, v2: <span className="text-[11px] text-sky-400 font-bold">€{formatVolStr(tossM2?.back)}</span> },
                      { label: 'Lay Liab', v1: <span className="text-[11px] text-rose-400 font-bold">€{formatVolStr(tossM1?.lay)}</span>, v2: <span className="text-[11px] text-rose-400 font-bold">€{formatVolStr(tossM2?.lay)}</span> },
                      { label: 'Matched stakes', v1: <span className="text-[11px] text-white font-bold">€{formatVolStr(tossM1?.totalBet)}</span>, v2: <span className="text-[11px] text-white font-bold">€{formatVolStr(tossM2?.totalBet)}</span> },
                      { label: 'Lay Trades', v1: <span className="text-[11px] text-white font-bold">{tossS1?.tradeCount ?? '—'}</span>, v2: <span className="text-[11px] text-white font-bold">{tossS2?.tradeCount ?? '—'}</span> },
                      { label: 'Support %', v1: <span className="text-[11px] font-bold" style={{ color: (tossSup1?.support ?? 0) > (tossSup2?.support ?? 0) ? '#34d399' : '#94a3b8' }}>{tossSup1 ? tossSup1.support.toFixed(1) + '%' : '—'}</span>, v2: <span className="text-[11px] font-bold" style={{ color: (tossSup2?.support ?? 0) > (tossSup1?.support ?? 0) ? '#34d399' : '#94a3b8' }}>{tossSup2 ? tossSup2.support.toFixed(1) + '%' : '—'}</span> },
                      { label: 'B/L Ratio', v1: <span className="text-[11px] text-emerald-400 font-bold">{tossM1?.lay > 0 ? (tossM1.back / tossM1.lay).toFixed(2) : '—'}</span>, v2: <span className="text-[11px] text-emerald-400 font-bold">{tossM2?.lay > 0 ? (tossM2.back / tossM2.lay).toFixed(2) : '—'}</span> },
                    ].map(({ label, v1, v2 }, i, arr) => (
                      <div key={label} className={`grid grid-cols-3 gap-1 py-1 px-1.5 ${i !== arr.length - 1 ? 'border-b border-[#1b2234]/60' : ''}`}>
                        <div className="text-[9px] text-slate-400 flex items-center font-semibold font-sans">{label}</div>
                        <div className="text-center flex items-center justify-center">{v1}</div>
                        <div className="text-center flex items-center justify-center">{v2}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

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
        <SessionPanel odds={sessionOdds} trades={sessionTrades} t1={t1} t2={t2} />
      ) : activeTab === 'crex' && sport === 'cricket' && crexData ? (
        <CrexLiveTab crexData={crexData} t1={t1} t2={t2} />
      ) : (
        <>
          {/* ━━━━━━━━━━ 🤖 QUANT AI PREDICTION ━━━━━━━━━━ */}
              {matchStartPred && matchStartPred.winnerName && (() => {
                const pv = getPredictionVisuals(matchStartPred)
                if (!pv) return null
                const avoidEntry = matchStartPred.risk?.avoidEntry || matchStartPred.risk?.tier === 'high'
                return (
                  <>
                  <div
                    className="league-prediction-card"
                    style={{
                      background: pv.gradient,
                      borderColor: pv.border,
                      boxShadow: pv.shadow,
                    }}
                  >
                    <div className="league-prediction-top">
                      <div className="league-prediction-tag">
                        <Sparkles size={12} className={pv.textColor} />
                        <span className={pv.textColor}>
                          {pv.tagText}
                        </span>
                      </div>
                      <div className="league-prediction-badges">
                        <span className={`league-rule-badge ${pv.badgeBg}`}>
                          {pv.pill}
                        </span>
                        <RiskBadge risk={matchStartPred.risk} compact />
                      </div>
                    </div>

                    <div className="league-prediction-main">
                      <div className="min-w-0">
                        <div className="league-prediction-label">
                          <Trophy size={11} />
                          <span>{avoidEntry ? 'MARKET LEAN · NO BET' : 'PREDICTED WINNER'}</span>
                        </div>
                        <h3>{matchStartPred.winnerName}</h3>
                      </div>
                      {matchStartPred.confidence.calibrated && (
                        <div className="league-confidence" aria-label={`${pv.meterPct}% confidence`}>
                          <strong>{pv.meterPct}%</strong>
                          <span>confidence</span>
                        </div>
                      )}
                    </div>

                    {avoidEntry && (
                      <div className="league-risk-line" role="alert">
                        <AlertTriangle size={13} />
                        <span><strong>High risk:</strong> entry avoid karein</span>
                      </div>
                    )}

                    <div className="league-prediction-reason">
                      <Shield size={12} className={pv.textColor} />
                      <p>{pv.desc}</p>
                    </div>

                    <div className="league-prediction-meta">
                      <span>{matchStartPred.algorithmLeague || 'Unregistered league'}</span>
                      <span>Start pick locked</span>
                      {!matchStartPred.confidence.calibrated && <span>{matchStartPred.confidence.label}</span>}
                    </div>

                    {matchStartPred.marketEvidence && (
                      <details className="league-evidence">
                        <summary>
                          <span>Market evidence</span>
                          <span>{matchStartPred.marketEvidence.agreeingSignals}/{matchStartPred.marketEvidence.signalCount} signals</span>
                        </summary>
                        <div className="league-evidence-grid">
                          <div className="league-evidence-head">
                            <span>Signal</span>
                            <span>{t1}</span>
                            <span>{t2}</span>
                          </div>
                          <div>
                            <span>Corrected support</span>
                            <span>{matchStartPred.marketEvidence.support.pct1.toFixed(0)}%</span>
                            <span>{matchStartPred.marketEvidence.support.pct2.toFixed(0)}%</span>
                          </div>
                          <div>
                            <span>Pre-match activity</span>
                            <span>{matchStartPred.marketEvidence.activity.pct1.toFixed(0)}%</span>
                            <span>{matchStartPred.marketEvidence.activity.pct2.toFixed(0)}%</span>
                          </div>
                          <div>
                            <span>Bookie liability</span>
                            <span>{matchStartPred.marketEvidence.bookmakerPressureIdx === 0 ? 'Pressure' : '—'}</span>
                            <span>{matchStartPred.marketEvidence.bookmakerPressureIdx === 1 ? 'Pressure' : '—'}</span>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                  {exitAdvice && (
                    <div className={`league-exit-advice ${exitAdvice.level === 'danger' ? 'is-danger' : 'is-warning'}`} role="alert">
                      <AlertTriangle size={14} />
                      <div>
                        <strong>{exitAdvice.title}</strong>
                        <p>{exitAdvice.message}</p>
                      </div>
                    </div>
                  )}
                  </>
                )
              })()}


              {/* ━━━━━━━━━━ 1. MATCH HEADER + ODDS + P/L ━━━━━━━━━━ */}
              <div className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl">
                {/* Date / Title */}
                <div className="px-3.5 sm:px-4 py-2.5 border-b border-[#1b2234] bg-[#0f1422]/60">
                  {matchSchedule && (
                    <div className="text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                      <span>📅 {matchSchedule.date}</span>
                      <span>•</span>
                      <span>⏰ {matchSchedule.time}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">{t1} vs {t2}</h1>
                    {snapshot.inPlay && (
                      <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-rose-500" /> LIVE
                      </span>
                    )}
                  </div>
                  {snapshot.competitionName && <div className="text-[11px] font-medium text-slate-400 mt-0.5">{snapshot.competitionName}</div>}

                  {(marketBetCountTotal > 0 || marketMoneyTotal > 0) && (() => {
                    return (
                      <div className="mt-2.5 space-y-2 pt-2 border-t border-[#1b2234]">
                        {marketBetCountTotal > 0 && (
                          <div>
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              <span>Number of Bets</span>
                              <span className="text-slate-500 font-mono">{marketBetCountTotal.toLocaleString('en-IN')} bets</span>
                            </div>
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-[#07090e] border border-[#1b2234] mb-1">
                              <div className="transition-all duration-500" style={{ width: `${marketBetPct1}%`, background: betColor1 }} />
                              {hasDraw && <div className="transition-all duration-500" style={{ width: `${marketBetPctDraw}%`, background: drawColor }} />}
                              <div className="transition-all duration-500" style={{ width: `${marketBetPct2}%`, background: betColor2 }} />
                            </div>
                            <div className="flex justify-between gap-2 text-[10px] font-bold font-mono">
                              <span className="truncate" style={{ color: betColor1 }}>
                                {t1} {marketBetPct1.toFixed(0)}%
                                <span className="text-slate-500 font-normal ml-1">· {marketBetCount1.toLocaleString('en-IN')} bets</span>
                              </span>
                              {hasDraw && (
                                <span className="truncate" style={{ color: drawColor }}>
                                  {drawName} {marketBetPctDraw.toFixed(0)}%
                                  <span className="text-slate-500 font-normal ml-1">· {marketBetCountDraw.toLocaleString('en-IN')} bets</span>
                                </span>
                              )}
                              <span className="truncate text-right" style={{ color: betColor2 }}>
                                {t2} {marketBetPct2.toFixed(0)}%
                                <span className="text-slate-500 font-normal ml-1">· {marketBetCount2.toLocaleString('en-IN')} bets</span>
                              </span>
                            </div>
                          </div>
                        )}
                        {marketMoneyTotal > 0 && (
                            <div>
                              <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                <span>Total Money</span>
                                <span className="text-slate-500 font-mono">€{fmt(marketMoneyTotal)} matched</span>
                              </div>
                              <div className="flex h-1.5 rounded-full overflow-hidden bg-[#07090e] border border-[#1b2234] mb-1">
                                <div className="transition-all duration-500" style={{ width: `${marketMoneyPct1}%`, background: moneyColor1 }} />
                                {hasDraw && <div className="transition-all duration-500" style={{ width: `${marketMoneyPctDraw}%`, background: drawColor }} />}
                                <div className="transition-all duration-500" style={{ width: `${marketMoneyPct2}%`, background: moneyColor2 }} />
                              </div>
                              <div className="flex justify-between gap-2 text-[10px] font-bold font-mono">
                                <span className="truncate" style={{ color: moneyColor1 }}>
                                  {t1} {marketMoneyPct1.toFixed(0)}%
                                  <span className="text-slate-500 font-normal ml-1">· €{fmt(marketMoney1)}</span>
                                </span>
                                {hasDraw && (
                                  <span className="truncate" style={{ color: drawColor }}>
                                    {drawName} {marketMoneyPctDraw.toFixed(0)}%
                                    <span className="text-slate-500 font-normal ml-1">· €{fmt(marketMoneyDraw)}</span>
                                  </span>
                                )}
                                <span className="truncate text-right" style={{ color: moneyColor2 }}>
                                  {t2} {marketMoneyPct2.toFixed(0)}%
                                  <span className="text-slate-500 font-normal ml-1">· €{fmt(marketMoney2)}</span>
                                </span>
                              </div>
                            </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Betfair-Style Odds — Back (Azure) & Lay (Coral Pink) */}
                <div
                  className={`grid divide-x divide-[#1b2234] ${hasDraw ? 'grid-cols-3' : 'grid-cols-2'}`}
                  style={{ borderBottom: '1px solid #1b2234' }}
                >
                  {[
                    { name: t1, odds: t1Odds },
                    { name: t2, odds: t2Odds },
                    ...(hasDraw ? [{ name: drawName, odds: drawOdds }] : []),
                  ].map(({ name, odds }) => (
                    <div key={name} className="px-2.5 sm:px-3 py-2 bg-[#080b14]/50">
                      <div className="text-[11px] font-bold text-slate-200 truncate mb-1.5">{name}</div>
                      <div className="flex gap-1.5">
                        <div className="flex-1 rounded-lg py-1 px-1 text-center bg-[#0284c7]/10 border border-[#0284c7]/30 hover:bg-[#0284c7]/20 transition-all shadow-sm">
                          <div className="text-[9px] font-bold text-sky-400 uppercase tracking-wider">Back</div>
                          <div className="text-sm sm:text-base font-black font-mono text-sky-300">{odds?.back ?? '—'}</div>
                        </div>
                        <div className="flex-1 rounded-lg py-1 px-1 text-center bg-[#f43f5e]/10 border border-[#f43f5e]/30 hover:bg-[#f43f5e]/20 transition-all shadow-sm">
                          <div className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">Lay</div>
                          <div className="text-sm sm:text-base font-black font-mono text-rose-300">{odds?.lay ?? '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bookmaker P/L */}
                {pl1 != null && pl2 != null && (
                  <div className="p-3 sm:p-3.5 bg-[#080b14]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Bookmaker Profit & Loss</div>
                    <div className={`grid gap-2 ${hasDraw ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {[
                        { name: t1, pl: pl1 },
                        { name: t2, pl: pl2 },
                        ...(hasDraw && plDraw != null ? [{ name: drawName, pl: plDraw }] : []),
                      ].map(({ name, pl }) => {
                        const isProf = pl >= 0
                        return (
                          <div
                            key={name}
                            className={`rounded-lg p-2.5 text-center border transition-all ${isProf
                                ? 'bg-emerald-500/[0.07] border-emerald-500/30 shadow-sm'
                                : 'bg-rose-500/[0.07] border-rose-500/30 shadow-sm'
                              }`}
                          >
                            <div className="text-[11px] font-bold text-slate-300 mb-0.5 truncate">{name}</div>
                            <div className={`text-sm sm:text-base font-black font-mono tracking-tight ${isProf ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {fmtRs(pl)}
                            </div>
                            <div className="mt-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isProf ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}>
                                {isProf ? 'BOOKIE PROFIT' : 'BOOKIE LOSS'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

          {/* ━━━━━━━━━━ B/L RATIO ━━━━━━━━━━ */}
          <div className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl">
            <div className="px-3 sm:px-3.5 py-2 border-b border-[#1b2234] bg-[#0f1422]/60 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                <BarChart3 size={13} className="text-blue-400" />
                <span>Back / Lay Order Ratio</span>
              </span>
              {lowerRatioTeam && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  Lower: {lowerRatioTeam}
                </span>
              )}
            </div>
            <div className="p-3 sm:p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[{ name: t1, ratio: aRatio, back: aBack, lay: aLay, backPct: aBackPct },
              { name: t2, ratio: bRatio, back: bBack, lay: bLay, backPct: bBackPct }].map((side) => {
                const isLower = lowerRatioTeam === side.name
                return (
                  <div
                    key={side.name}
                    className="rounded-lg p-2.5 border bg-[#080b14] transition-all"
                    style={{
                      borderColor: isLower ? 'rgba(37,99,235,0.45)' : '#1b2234',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="text-xs font-bold text-white truncate">{side.name}</div>
                      {isLower && (
                        <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded shrink-0">LOWER</span>
                      )}
                    </div>
                    <div className="text-lg sm:text-xl font-black font-mono tracking-tight text-white mb-0.5">
                      {side.ratio != null ? `${side.ratio.toFixed(2)}x` : '—'}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Back / Lay Split</div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-[#07090e] border border-[#1b2234] mb-1">
                      <div className="bg-sky-400 transition-all duration-500" style={{ width: `${side.backPct}%` }} />
                      <div className="bg-rose-400 transition-all duration-500" style={{ width: `${100 - side.backPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold font-mono">
                      <span className="text-sky-400">Back {side.backPct.toFixed(0)}%</span>
                      <span className="text-rose-400">Lay {(100 - side.backPct).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-2 pt-1.5 border-t border-[#1b2234]">
                      <span>€{fmt(side.back)}</span>
                      <span>€{fmt(side.lay)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ━━━━━━━━━━ 8. BOOKMAKER EXPOSURE ━━━━━━━━━━ */}
          <div className="rounded-xl p-3 sm:p-3.5 bg-[#0c101d] border border-[#1e2538] shadow-xl">
            <div className="text-xs sm:text-sm font-extrabold text-white mb-2.5 flex items-center gap-1.5">
              <Shield size={13} className="text-emerald-400" />
              <span>Bookmaker Market Exposure</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-lg p-2.5 border border-[#1b2234] bg-[#080b14]">
                <div className="text-xs font-bold mb-1.5 text-white truncate">{exp1.teamName || t1}</div>
                <div className="text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between items-center"><span className="text-slate-400">Net Exp</span><span className={`font-bold ${pnlCls(exp1.netExposure)}`}>{fmtRs(exp1.netExposure)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">Back</span><span className="text-sky-400 font-bold">€{fmt(exp1.backExposure)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">Lay</span><span className="text-rose-400 font-bold">€{fmt(exp1.layExposure)}</span></div>
                </div>
              </div>
              <div className="rounded-lg p-2.5 border border-[#1b2234] bg-[#080b14]">
                <div className="text-xs font-bold mb-1.5 text-white truncate">{exp2.teamName || t2}</div>
                <div className="text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between items-center"><span className="text-slate-400">Net Exp</span><span className={`font-bold ${pnlCls(exp2.netExposure)}`}>{fmtRs(exp2.netExposure)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">Back</span><span className="text-sky-400 font-bold">€{fmt(exp2.backExposure)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400">Lay</span><span className="text-rose-400 font-bold">€{fmt(exp2.layExposure)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* ━━━━━━━━━━ 4. DEEP BETTING METRICS ━━━━━━━━━━ */}
          {(dm.raw || dm.totals) && (
            <div className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl">
              <div className="px-3 sm:px-3.5 py-2 border-b border-[#1b2234] bg-[#0f1422]/60 flex items-center gap-1.5">
                <BarChart3 size={13} className="text-sky-400" />
                <span className="text-xs sm:text-sm font-extrabold text-white">Deep Betting Quant Metrics</span>
              </div>
              <div className="p-3 sm:p-3.5 space-y-3">
                {dm.raw && Object.keys(dm.raw).length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Raw Accumulated Values</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[{ team: t1, back: am1.back, lay: am1.lay }, { team: t2, back: am2.back, lay: am2.lay }].map(({ team, back, lay }) => (
                        <div key={team} className="rounded-lg p-2.5 border border-[#1b2234] bg-[#080b14]">
                          <div className="text-xs font-bold text-white mb-1.5 truncate">{team}</div>
                          <div className="text-[11px] space-y-1 font-mono">
                            <div className="flex justify-between"><span className="text-slate-400">Back stake</span><span className="font-bold text-sky-400">{back != null ? Number(back).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Lay Stake</span><span className="font-bold text-rose-400">{lay != null ? Number(lay).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dm.totals && Object.keys(dm.totals).length > 0 && (() => {
                  const v1 = dm.totals.team1 ?? dm.totals.totalBetTeam1
                  const v2 = dm.totals.team2 ?? dm.totals.totalBetTeam2
                  return (
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Provider reported total</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[{ team: t1, val: v1 }, { team: t2, val: v2 }].map(({ team, val }) => {
                          const isLower = (v1 != null && v2 != null) && (team === t1 ? v1 < v2 : v2 < v1)
                          const isHigher = (v1 != null && v2 != null) && (team === t1 ? v1 > v2 : v2 > v1)
                          return (
                            <div key={team} className="rounded-lg p-2.5 border border-[#1b2234] bg-[#080b14]">
                              <div className="text-xs font-bold text-white mb-1 truncate">{team}</div>
                              <div className="flex items-center gap-1 font-mono">
                                <div className="text-xs sm:text-sm font-bold text-white">{val != null ? Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</div>
                                {isLower && <ChevronDown size={15} className="text-rose-400 shrink-0" />}
                                {isHigher && <ChevronUp size={15} className="text-emerald-400 shrink-0" />}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━ 9. NET SUPPORT & SENTIMENT ━━━━━━━━━━ */}
          {ns.teamA && sent.teamA && (
            <div className="rounded-xl p-3 sm:p-3.5 bg-[#0c101d] border border-[#1e2538] shadow-xl">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs sm:text-sm font-extrabold text-white">Sentiment & Net Support</span>
                {sent.strongerTeam && (
                  <span className="text-[9px] font-bold text-slate-300 bg-[#080b14] px-2 py-0.5 rounded border border-[#1b2234]">
                    Dominant: <b className="text-white ml-1">{sent.strongerTeam}</b>
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {[t1, t2].map((team, i) => {
                  const key = i === 0 ? 'teamA' : 'teamB'
                  const pct = i === 0 ? ns.percentageA : ns.percentageB
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-[11px] mb-1 font-semibold">
                        <span className="text-white">{team}</span>
                        <span className={`font-mono font-bold ${pct >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct?.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-[#07090e] border border-[#1b2234]">
                        <div className={`h-full rounded-full transition-all duration-500 ${pct >= 50 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━ Original P/L period cards ━━━━━━━━━━ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[
              { title: 'In-Play Live Metrics', pnl: ip, bets: ib, vol: iv, badge: 'IN-PLAY', badgeCls: 'text-rose-400 bg-rose-500/10 border-rose-500/25' },
              { title: '3-Minute Live Metrics', pnl: finalTmp, bets: finalTmb, vol: finalTmv, badge: '3-MIN LIVE', badgeCls: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
              { title: 'Pre-Match Baseline', pnl: pp, bets: pb, vol: pv, badge: 'PRE-MATCH', badgeCls: 'text-sky-400 bg-sky-500/10 border-sky-500/25' },
            ].map(({ title, pnl, bets, vol, badge, badgeCls }) => (
              <div key={title} className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl flex flex-col justify-between">
                <div>
                  <div className="px-3 sm:px-3.5 py-2 border-b border-[#1b2234] bg-[#0f1422]/60 flex items-center justify-between min-h-[38px]">
                    <span className="text-[11px] font-black uppercase tracking-wider text-white truncate mr-2">{title}</span>
                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${badgeCls}`}>{badge}</span>
                  </div>
                  <div className="p-2.5 sm:p-3">
                    <div className="grid grid-cols-3 gap-1 mb-1.5 px-1">
                      <div />
                      <div className="text-center text-[10px] font-extrabold text-emerald-400 truncate px-1">{t1}</div>
                      <div className="text-center text-[10px] font-extrabold text-rose-400 truncate px-1">{t2}</div>
                    </div>
                    {[
                      { label: 'Bookie P/L', v1: <span className={`font-bold font-mono text-xs ${pnlCls(pnl?.team1)}`}>{fmtRs(pnl?.team1)}</span>, v2: <span className={`font-bold font-mono text-xs ${pnlCls(pnl?.team2)}`}>{fmtRs(pnl?.team2)}</span> },
                      { label: 'Total Bets', v1: <span className="text-[11px] font-mono text-slate-300">{fmt(bets?.team1)}</span>, v2: <span className="text-[11px] font-mono text-slate-300">{fmt(bets?.team2)}</span> },
                      { label: 'Back Vol', v1: <span className="text-[11px] font-mono text-sky-400">€{fmt(vol?.team1?.back)}</span>, v2: <span className="text-[11px] font-mono text-sky-400">€{fmt(vol?.team2?.back)}</span> },
                      { label: 'Lay Vol', v1: <span className="text-[11px] font-mono text-rose-400">€{fmt(vol?.team1?.lay)}</span>, v2: <span className="text-[11px] font-mono text-rose-400">€{fmt(vol?.team2?.lay)}</span> },
                    ].map(({ label, v1, v2 }, index) => (
                      <div key={label} className={`grid grid-cols-3 gap-1 py-1 px-1 rounded ${index % 2 === 0 ? 'bg-[#080b14]' : ''}`}>
                        <div className="text-[10px] text-slate-400 flex items-center font-bold">{label}</div>
                        <div className="text-center flex items-center justify-center">{v1}</div>
                        <div className="text-center flex items-center justify-center">{v2}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ━━━━━━━━━━ 11. MARKET ODDS & DEPTH ANALYSIS (GRAPHS) ━━━━━━━━━━ */}
          <div className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl p-3 sm:p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 pb-2.5 border-b border-[#1b2234]">
              <div className="flex items-center gap-2 flex-wrap">
                <BarChart3 size={15} className="text-blue-400" />
                <span className="text-xs sm:text-sm font-extrabold text-white">Market Odds & Depth Analysis</span>
                <span className="text-[11px] font-mono text-slate-400 ml-1">Vol: <b className="text-white font-bold">€{formatVolStr(marketVol)}</b></span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex bg-[#07090e] p-0.5 rounded-lg border border-[#1e273b]">
                  <button onClick={() => setTimeFilter('all')} className={`px-2.5 py-1 text-xs rounded-md font-bold transition-all ${timeFilter === 'all' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>All</button>
                  <button onClick={() => setTimeFilter('3h')} className={`px-2.5 py-1 text-xs rounded-md font-bold transition-all ${timeFilter === '3h' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>3H</button>
                  <button onClick={() => setTimeFilter('1h')} className={`px-2.5 py-1 text-xs rounded-md font-bold transition-all ${timeFilter === '1h' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>1H</button>
                </div>
                {activeSessions && activeSessions.length > 0 && (
                  <div className="relative">
                    <div
                      onClick={() => setShowMarketMenu(!showMarketMenu)}
                      className="bg-[#0e121e] text-white text-xs px-3 py-1.5 rounded-lg border border-[#1f273b] flex items-center gap-2 cursor-pointer font-semibold hover:bg-[#151b2c] transition-colors"
                    >
                      <span className="truncate max-w-[120px]">{marketType.startsWith('session_') ? marketType.replace('session_', '') : 'Match Odds'}</span>
                      <ChevronDown size={13} className="text-slate-400 shrink-0" />
                    </div>
                    {showMarketMenu && (
                      <div className="absolute bottom-full right-0 mb-1 w-44 bg-[#0e1320] border border-[#222b40] rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                        <div
                          onClick={() => { setMarketType('match_odds'); setShowMarketMenu(false); }}
                          className="px-4 py-2 text-xs font-bold text-white hover:bg-white/5 cursor-pointer"
                        >
                          Match Odds
                        </div>
                        {activeSessions.map(session => (
                          <div key={session} onClick={() => { setMarketType('session_' + session); setShowMarketMenu(false); }} className="px-4 py-2 text-xs font-bold text-white hover:bg-white/5 cursor-pointer border-t border-[#1f2638]">
                            {session}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isSessionMarket ? (
              <div className="w-full">
                <div className="flex justify-between items-center mb-3 px-1">
                  <h3 className="text-white font-extrabold text-sm sm:text-base tracking-wide">{selectedSessionName}</h3>
                  <div className="text-slate-400 text-xs font-medium">
                    On this market: <span className="text-emerald-400 font-mono font-bold ml-1">€{formatVolStr(sessionGraphData?.totalBet || 0)}</span>
                  </div>
                </div>
                <TeamCard teamData={sessionGraphData} isToss={false} isSession={true} marketVol={sessionGraphData?.totalBet || 0} />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
                <TeamCard teamData={t1GraphData} isToss={false} marketVol={marketVol} />
                <TeamCard teamData={t2GraphData} isToss={false} marketVol={marketVol} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
