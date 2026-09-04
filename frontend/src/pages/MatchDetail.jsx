import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from "recharts"
import TossDetail from './TossDetail'

import { useEffect, useState, useContext, useMemo } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, BarChart3, ChevronDown, ChevronUp, TrendingUp, Radio } from 'lucide-react'
import { getCricketSnapshot, getCricketMatchBundle, getTennisSnapshot, getTossSnapshot, getSessionTrades, getCrexMatchDetail } from '../api'
import { CrexScorecardBanner, CrexLiveTab } from '../components/CrexLiveSection'
import { isLoginRequiredError } from '../utils/publicAuth'
import LoginRequiredGate from '../components/LoginRequiredGate'
import { predictTossWinner } from '../utils/tossPredictor'
import { predictMatchWinner, predictSmartMarketWinner } from '../utils/matchWinnerPredictor'
import { predictMatchStart, lockMatchStartPrediction, getMatchStartExitAdvice } from '../utils/matchStartPredictor'
import { getBookiePl, splitMatchOutcomes } from '../utils/bookiePl'
import { predictGatedFade, teamEq } from '../utils/gatedFadePredictor'
import { getSpoofingMetrics } from '../utils/spoofingDetector'
import { tradeMatchesMarket, sessionDataFingerprint } from '../utils/sessionMetrics'
import SessionPanel from '../components/SessionPanel'
import { RiskBadge, MatchedRulesPanel, AvoidEntryBanner } from '../components/PredictionMeta'
import { startVisibleInterval, LIVE_POLL_MS } from '../lib/visiblePoll'

// Map sport to the right API function
const API_MAP = {
  cricket: getCricketSnapshot,
  tennis: getTennisSnapshot,
  toss: getTossSnapshot,
  session: getSessionTrades,
}

const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return formatVolStr(n)
}

const fmtRs = (n) => {
  if (n === null || n === undefined) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}₹${fmt(n)}`
}

const pnlCls = (n) => n >= 0 ? 'text-profit' : 'text-loss'

const fmtVol = (n) => {
  if (!n) return '0.00'
  return formatVolStr(n)
}

const formatMoney = (val) => {
  if (!val) return '0.00'
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

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

const formatVolTooltip = (val) => {
  if (!val) return '0.00'
  return formatVolStr(val)
}

const formatOdds = (val) => {
  if (!val) return '—'
  return val.toFixed(2)
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

  const pl = teamData.bookieProfitIfWins || 0

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
    <div className="bg-[#111111] rounded-xl border border-[#2c2c2e] overflow-hidden mb-4 shadow-xl">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-4 border-b border-[#2c2c2e]">
        <div className="font-bold text-white text-lg tracking-wide">{teamData.name}</div>
        <div className="flex items-center gap-4">
          <div className={`text-xs flex items-center gap-1.5 font-medium ${teamData.trend === 'Rising' ? 'text-red-500' : teamData.trend === 'Dropping' ? 'text-[#10b981]' : 'text-[#8e8e93]'}`}>
            {teamData.trend === 'Rising' ? <TrendingUp size={14} /> : teamData.trend === 'Dropping' ? <TrendingUp size={14} className="rotate-180" /> : <span>—</span>}
            Odds {teamData.trend}
          </div>
          <div className="flex bg-[#000000] rounded-lg p-0.5 border border-[#2c2c2e]/50">
            <button onClick={() => setActiveTab('volume')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'volume' ? 'bg-[#222222] text-white' : 'text-[#8e8e93] hover:text-white'}`}>Chart</button>
            <button onClick={() => setActiveTab('time')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'time' ? 'bg-[#222222] text-white' : 'text-[#8e8e93] hover:text-white'}`}>History</button>
            <button onClick={() => setActiveTab('book')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'book' ? 'bg-[#222222] text-white' : 'text-[#8e8e93] hover:text-white'}`}>Order Book</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 py-5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[#8e8e93] text-sm">Range:</span>
          <span className="text-white text-sm font-bold tracking-wide">Low: {formatOdds(teamData.low)} <span className="ml-2">High: {formatOdds(teamData.high)}</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#8e8e93] text-sm">On this market:</span>
          <span className="text-white text-sm font-bold tracking-wide">{formatVolStr(marketVol)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#8e8e93] text-sm">On this selection:</span>
          <span className="text-white text-sm font-bold tracking-wide">{formatVolStr(teamData.totalBet)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#8e8e93] text-sm">Last price matched:</span>
          <span className="text-[#10b981] text-sm font-bold tracking-wide">{formatOdds(teamData.lastPrice)}</span>
        </div>
        {!isSession && (
          <div className="flex justify-between items-center mt-1 pt-3 border-t border-[#2c2c2e]/50">
            <span className="text-[#8e8e93] text-sm font-bold">Bookie P/L:</span>
            <span className={`text-sm font-black tracking-wide ${pl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {pl >= 0 ? '+' : ''}{formatVolStr(pl)}
            </span>
          </div>
        )}
        {isToss && (
          <div className="mt-2 pt-3 border-t border-[#2c2c2e] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#8e8e93] text-sm">Back Stake:</span>
              <span className="text-[#3b82f6] text-sm font-bold tracking-wide">{formatVolStr(teamData.totalBack)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8e8e93] text-sm">Lay Stake:</span>
              <span className="text-[#ef4444] text-sm font-bold tracking-wide">{formatVolStr(teamData.totalLay)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'volume' && (
        <div className="px-5 pb-5">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#8e8e93] text-[10px] font-bold uppercase tracking-widest">VOLUME BY PRICE</span>
            <span className="text-[#8e8e93] text-xs font-medium">Peak @ {formatOdds(teamData.peakPrice)}</span>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamData.orderBook} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                <XAxis dataKey="price" stroke="#8e8e93" tick={{ fontSize: 10 }} tickFormatter={(val) => formatOdds(val)} minTickGap={20} />
                <YAxis stroke="#8e8e93" tick={{ fontSize: 10 }} tickFormatter={(val) => formatVolStr(val)} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2c2c2e', opacity: 0.4 }} />
                <Bar dataKey="totalVol" radius={[2, 2, 0, 0]}>
                  {teamData.orderBook.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.price === teamData.peakPrice ? '#3b82f6' : '#4b4b4b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'time' && (
        <div className="px-5 pb-5">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#8e8e93] text-[10px] font-bold uppercase tracking-widest">PRICE HISTORY</span>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={teamData.timeSeries} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" vertical={false} />
                <XAxis dataKey="time" stroke="#8e8e93" tick={{ fontSize: 10 }} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} stroke="#8e8e93" tick={{ fontSize: 10 }} tickFormatter={(val) => formatOdds(val)} />
                <Tooltip content={<TimeTooltip />} />
                <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'book' && (
        <div className="px-5 pb-5">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[#8e8e93] text-xs font-medium">Showing {teamData.orderBook.length} of {teamData.orderBook.length} price levels</span>
            <div className="flex bg-[#0a0a0a] rounded-lg p-1">
              <button onClick={() => setActiveOnly(true)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${activeOnly ? 'bg-[#2c2c2e] text-white' : 'text-gray-400 hover:text-white'}`}>Active Only</button>
              <button onClick={() => setActiveOnly(false)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${!activeOnly ? 'bg-[#2c2c2e] text-white' : 'text-gray-400 hover:text-white'}`}>All Prices</button>
            </div>
          </div>

          <div className="w-full text-sm">
            <div className={`grid ${isSession ? 'grid-cols-5' : 'grid-cols-4'} pb-3 border-b border-[#2c2c2e] mt-2`}>
              <div className="text-[#8e8e93] text-xs font-semibold pl-2">Price</div>
              <div className="text-[#3b82f6] text-xs font-semibold text-right">To Back</div>
              <div className="text-[#10b981] text-xs font-semibold text-right">To Lay</div>
              <div className="text-[#10b981] text-xs font-semibold text-right pr-2">Traded</div>
              {isSession && <div className="text-[#a855f7] text-xs font-semibold text-right pr-2">P/L</div>}
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {teamData.orderBook.filter(item => !activeOnly || item.totalVol > 0).map((item, idx) => (
                <div key={idx} className={`grid ${isSession ? 'grid-cols-5' : 'grid-cols-4'} py-2.5 border-b border-[#2c2c2e]/40 hover:bg-[#2c2c2e]/60 transition-colors`}>
                  <div className="text-white font-bold pl-2">{formatOdds(item.price)}</div>
                  <div className="text-[#3b82f6] text-right font-medium">{item.back > 0 ? formatVolStr(item.back) : '-'}</div>
                  <div className="text-[#10b981] text-right font-medium">{item.lay > 0 ? formatVolStr(item.lay) : '-'}</div>
                  <div className="text-[#10b981] text-right font-medium pr-2">{item.traded > 0 ? formatVolStr(item.traded) : '-'}</div>
                  {isSession && (
                    <div className={`text-right font-bold pr-2 ${getSessionPlForLine(item) >= 0 ? 'text-[#16a34a]' : 'text-[#ef4444]'}`}>
                      {formatVolStr(getSessionPlForLine(item))}
                    </div>
                  )}
                </div>
              ))}
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
  const { isLoggedIn } = useOutletContext()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showAdvancedGraph, setShowAdvancedGraph] = useState(false)
  const [crexData, setCrexData] = useState(null)
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(`tab_${matchId}`) || 'simple')

  const handleTabChange = (key) => {
    sessionStorage.setItem(`tab_${matchId}`, key)
    setActiveTab(key)
  }
  const [timeFilter, setTimeFilter] = useState('all')
  const [marketType, setMarketType] = useState('match_odds')
  const [showMarketMenu, setShowMarketMenu] = useState(false)
  const [tossSnapshot, setTossSnapshot] = useState(null)
  const [lockedStartPred, setLockedStartPred] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`match_start_rawvol_${matchId}`)
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
    const apiFn = API_MAP[sport] || getCricketSnapshot
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

    const fetchSecondary = () => {
      if (sport !== 'cricket') return
      getTossSnapshot(matchId).catch(() => null).then(tossData => {
        if (cancelled || !tossData || tossData.error) return
        setTossSnapshot(tossData)
      })
      getSessionTrades(matchId).catch(() => null).then(sessionData => {
        if (cancelled) return
        applySessionData(sessionData)
      })
      // crex only for cricket
      getCrexMatchDetail(matchId).catch(() => null).then(res => {
        if (cancelled || !res?.crex) return
        setCrexData(res.crex)
      })
    }

    const fetchData = (isInitial = false) => {
      if (typeof document !== 'undefined' && document.hidden && !isInitial) return
      if (isInitial) {
        setLoading(true)
        setFetchError(null)
        setRequiresLogin(false)
        setRequiresPro(false)
        setSnapshot(null)
        setTossSnapshot(null)
      }

      if (sport === 'cricket') {
        getCricketMatchBundle(matchId)
          .then(bundle => {
            if (cancelled) return
            const data = bundle?.cricket
            if (isLoginRequiredError(data) || isLoginRequiredError(bundle)) {
              setRequiresLogin(true)
            } else if (data && !data.error) {
              setSnapshot(data)
              setFetchError(null)
              const now = new Date()
              setLastUpdated(now)
              window.dispatchEvent(new CustomEvent('data-refreshed', { detail: { time: now } }))
            } else if (isInitial) {
              setFetchError(data?.error || data?.message || 'Match data load nahi ho paya')
            }
            if (bundle?.toss && !bundle.toss.error) setTossSnapshot(bundle.toss)
            if (bundle?.session) applySessionData(bundle.session)
            // crex only for cricket
            if (sport === 'cricket') {
              if (bundle?.crex) {
                setCrexData(bundle.crex)
              } else if (data?.crex) {
                setCrexData(data.crex)
              }
            }
            if (isInitial) setLoading(false)
          })
          .catch(err => {
            if (cancelled) return
            if (isLoginRequiredError(err)) {
              setRequiresLogin(true)
            } else if (err?.code === 'SUBSCRIPTION_REQUIRED' || err?.status === 403) {
              setRequiresPro(true)
            } else if (isInitial) {
              setFetchError(err?.detail || 'Network error — dubara try karo')
            }
            if (isInitial) setLoading(false)
          })
        return
      }

      // Tennis / other — single snapshot + optional secondary
      apiFn(matchId)
        .then(data => {
          if (cancelled) return
          if (isLoginRequiredError(data)) {
            setRequiresLogin(true)
          } else if (data && !data.error) {
            setSnapshot(data)
            setFetchError(null)
            const now = new Date()
            setLastUpdated(now)
            window.dispatchEvent(new CustomEvent('data-refreshed', { detail: { time: now } }))
          } else if (isInitial) {
            setFetchError(data?.error || data?.message || 'Match data load nahi ho paya')
          }
          if (isInitial) setLoading(false)
        })
        .catch(err => {
          if (cancelled) return
          if (isLoginRequiredError(err)) {
            setRequiresLogin(true)
          } else if (err?.code === 'SUBSCRIPTION_REQUIRED' || err?.status === 403) {
            setRequiresPro(true)
          } else if (isInitial) {
            setFetchError(err?.detail || 'Network error — dubara try karo')
          }
          if (isInitial) setLoading(false)
        })

      fetchSecondary()
    }

    fetchData(true)
    const stopPoll = startVisibleInterval(() => fetchData(false), LIVE_POLL_MS)
    return () => { cancelled = true; stopPoll() }
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
            sessionStorage.setItem(`match_start_rawvol_${matchId}`, JSON.stringify(next))
          } catch {}
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

    return Boolean(mTotal > 0 || hasTrades || hasOdds || hasPnl || hasSynthetic)
  }, [sport, tossSnapshot])

  const hasSessionData = useMemo(() => {
    if (sport !== 'cricket') return false
    const hasOdds = Array.isArray(sessionOdds) && sessionOdds.length > 0
    const hasTrades = Array.isArray(sessionTrades) && sessionTrades.length > 0
    return hasOdds || hasTrades
  }, [sport, sessionOdds, sessionTrades])

  useEffect(() => {
    if (!loading && activeTab === 'toss' && !hasTossData) {
      setActiveTab('simple')
    }
  }, [loading, activeTab, hasTossData])

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  if (requiresPro) {
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
            style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
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
            style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
          >
            Dubara try karo
          </button>
        </div>
      </div>
    )
  }

  if (!snapshot) return null

  const cachedStart =
    location.state?.startTime ??
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
    const sorted = [...trades].sort((a, b) => b.updatedAt - a.updatedAt)
    let back = sorted.find(t => t.type === 'back')?.price
    let lay = sorted.find(t => t.type === 'lay')?.price

    // Fallback to CREX live rates only for cricket
    if (sport === 'cricket' && (back == null || lay == null) && crexData?.odds) {
      const co = crexData.odds
      const r1 = co.rate != null ? Number(co.rate) : (co.back != null ? Number(co.back) : null)
      const r2 = co.rate2 != null ? Number(co.rate2) : (co.lay != null ? Number(co.lay) : null)
      if (r1 !== null && back == null) {
        back = r1 > 0 ? (r1 < 10 ? (1 + r1 / 100).toFixed(2) : (r1 < 100 ? (1 + r1 / 100).toFixed(2) : (r1 / 100).toFixed(2))) : '1.01'
      }
      if (r2 !== null && lay == null) {
        lay = r2 > 0 ? (r2 < 10 ? (1 + r2 / 100).toFixed(2) : (r2 < 100 ? (1 + r2 / 100).toFixed(2) : (r2 / 100).toFixed(2))) : '1.02'
      }
    }

    return { back, lay }
  }
  const t1Odds = getLatestOdds(t1Trades, t1)
  const t2Odds = getLatestOdds(t2Trades, t2)
  const drawOdds = hasDraw ? getLatestOdds(drawTrades, drawName) : null
  const am1 = snapshot.advancedMetrics?.team1 || {}
  const am2 = snapshot.advancedMetrics?.team2 || {}
  const { t1Fake, t2Fake, t1Pct, t2Pct, mostFakeTeam } = getSpoofingMetrics(snapshot)
  const sp = dm.simplePL || {}
  const dp = dm.derivedPL || {}
  const teams = snapshot.teams || {}
  const t1Data = teams[t1] || {}
  const t2Data = teams[t2] || {}

  const { pl1, pl2, plDraw } = getBookiePl(snapshot, t1, t2, drawName)
  const gatedFade = predictGatedFade(snapshot)
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

  const dpl1 = dp.team1_win
  const dpl2 = dp.team2_win

  const marketBet1 = dm.totals?.totalBetTeam1 ?? t1Data.totalBet ?? 0
  const marketBet2 = dm.totals?.totalBetTeam2 ?? t2Data.totalBet ?? 0
  const marketBetDraw = hasDraw ? (teams[drawName]?.totalBet ?? 0) : 0
  const marketBetTotal = marketBet1 + marketBet2 + marketBetDraw
  const marketBetPct1 = marketBetTotal > 0 ? (marketBet1 / marketBetTotal) * 100 : 50
  const marketBetPct2 = marketBetTotal > 0 ? (marketBet2 / marketBetTotal) * 100 : 50
  const marketBetPctDraw = marketBetTotal > 0 ? (marketBetDraw / marketBetTotal) * 100 : 0

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

  const ip = snapshot.inPlayPnl || {}
  const ib = snapshot.inPlayTotalBets || {}
  const pp = snapshot.preMatchPnl || {}
  const pb = snapshot.preMatchTotalBets || {}
  const iv = snapshot.inPlayVolume || {}
  const pv = snapshot.preMatchVolume || {}
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
  const tossM1 = tossSnap?.advancedMetricsV2?.team1 || tossSnap?.supportMetrics?.team1 || (tossSnap?.teams?.[tossT1Name] ? { totalBet: tossSnap.teams[tossT1Name].totalBet || 0, back: tossSnap.teams[tossT1Name].totalBet || 0, lay: 0 } : null)
  const tossM2 = tossSnap?.advancedMetricsV2?.team2 || tossSnap?.supportMetrics?.team2 || (tossSnap?.teams?.[tossT2Name] ? { totalBet: tossSnap.teams[tossT2Name].totalBet || 0, back: tossSnap.teams[tossT2Name].totalBet || 0, lay: 0 } : null)
  const tossS1 = tossSnap?.syntheticSupport?.teamA
  const tossS2 = tossSnap?.syntheticSupport?.teamB
  const tossSup1 = tossSnap?.supportMetrics?.team1
  const tossSup2 = tossSnap?.supportMetrics?.team2

  const tossT1GraphData = tossSnap ? processTeamData(tossT1Name, tossSnap?.teams?.[tossT1Name], effectiveTimeFilter) : null
  const tossT2GraphData = tossSnap ? processTeamData(tossT2Name, tossSnap?.teams?.[tossT2Name], effectiveTimeFilter) : null
  const tossMarketVol = (tossT1GraphData?.totalBet || 0) + (tossT2GraphData?.totalBet || 0)
  const tossT1PctVol = tossMarketVol > 0 ? ((tossT1GraphData?.totalBet || 0) / tossMarketVol) * 100 : 50
  const tossT2PctVol = tossMarketVol > 0 ? ((tossT2GraphData?.totalBet || 0) / tossMarketVol) * 100 : 50

  const tossPrediction = tossSnap ? predictTossWinner(tossSnap, tossSnap?.competitionName || snapshot?.competitionName || '') : null
  const predictedTossWinner = tossPrediction?.winnerName || 'Waiting for more data...'
  const tossPredictionReason = tossPrediction?.reason || ''

  // Bookie P/L on graph — same source as Simple Book (simplePL), not sampled-trade pnlIfWins
  if (t1GraphData) t1GraphData.bookieProfitIfWins = pl1
  if (t2GraphData) t2GraphData.bookieProfitIfWins = pl2
  const marketVol = (t1GraphData?.totalBet || 0) + (t2GraphData?.totalBet || 0)
  const t1PctVol = marketVol > 0 ? ((t1GraphData?.totalBet || 0) / marketVol) * 100 : 50
  const t2PctVol = marketVol > 0 ? ((t2GraphData?.totalBet || 0) / marketVol) * 100 : 50


  return (
    <div className="p-3 w-full fade-in stagger space-y-4">

      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-4 sticky top-0 pt-3 pb-2 z-30 -mx-3 px-3 border-b border-[#2c2c2e]/50 backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.85)' }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-text-muted hover:text-primary text-sm font-medium">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex rounded-lg p-0.5 gap-0.5 overflow-x-auto max-w-[calc(100vw-80px)]" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
          {[
            { key: 'simple', label: 'Simple Book' },
            { key: 'graph', label: 'Graphs', icon: <BarChart3 size={11} /> },
            sport === 'cricket' && crexData ? { key: 'crex', label: '🏏 Live & Commentary', icon: <Radio size={11} className="text-red-400 animate-pulse" /> } : null,
            sport === 'cricket' && hasTossData ? { key: 'toss', label: 'Toss' } : null,
          ].filter(Boolean).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 ${
                activeTab === key ? 'text-white' : 'text-[#8e8e93] hover:text-white'
              }`}
              style={activeTab === key ? {
                background: key === 'graph' ? 'linear-gradient(135deg,#2563eb,#3b82f6)'
                  : key === 'crex' ? 'linear-gradient(135deg,#059669,#10b981)'
                  : key === 'toss' ? 'linear-gradient(135deg,#7c3aed,#a855f7)'
                  : key === 'session' ? 'linear-gradient(135deg,#b45309,#f59e0b)'
                  : 'linear-gradient(135deg,#dc2626,#10b981)'
              } : {}}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live Scorecard Hero Banner — cricket only ── */}
      {sport === 'cricket' && activeTab !== 'toss' && <CrexScorecardBanner crexData={crexData} t1={t1} t2={t2} />}

      {activeTab === 'graph' ? (
        <div className="w-full bg-[#0a0a0a] min-h-screen p-6 -mx-3 sm:mx-0 rounded-xl font-sans">
          {/* Top Header Row */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <div className="flex items-center gap-4">
                <h1 className="text-white text-[22px] font-bold tracking-wide">{t1} vs {t2}</h1>
                <span className="px-2 py-0.5 bg-red-900/40 text-red-500 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-red-800/50"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>LIVE</span>
              </div>
              <div className="text-[#8e8e93] text-[13px] mt-1.5 font-medium tracking-wide">
                The Hundred - Womens
                {matchSchedule && ` · ${matchSchedule.label}`}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex bg-[#111111] p-0.5 rounded-lg border border-[#2c2c2e]/50">
                <button onClick={() => setTimeFilter('all')} className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${timeFilter === 'all' ? 'bg-[#222222] text-white' : 'text-[#8e8e93] hover:text-white'}`}>All Time</button>
                <button onClick={() => setTimeFilter('3h')} className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${timeFilter === '3h' ? 'bg-[#222222] text-white' : 'text-[#8e8e93] hover:text-white'}`}>3H</button>
                <button onClick={() => setTimeFilter('1h')} className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${timeFilter === '1h' ? 'bg-[#222222] text-white' : 'text-[#8e8e93] hover:text-white'}`}>1H</button>
              </div>
              <div className="relative">
                <div
                  onClick={() => setShowMarketMenu(!showMarketMenu)}
                  className="bg-[#111111] text-white text-[13px] px-4 py-2 rounded-lg border border-[#2c2c2e]/50 flex items-center gap-8 cursor-pointer font-semibold shadow-sm hover:bg-[#1a1a1a] transition-colors"
                >
                  <span>{marketType.startsWith('session_') ? marketType.replace('session_', '') : 'Match Odds'}</span>
                  <ChevronDown size={14} className="text-[#8e8e93]" />
                </div>
                {showMarketMenu && (
                  <div className="absolute top-full right-0 mt-2 w-36 bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg shadow-2xl z-50 overflow-hidden">
                    <div
                      onClick={() => { setMarketType('match_odds'); setShowMarketMenu(false); }}
                      className="px-4 py-3 text-[13px] font-bold text-white hover:bg-[#2c2c2e] cursor-pointer"
                    >
                      Match Odds
                    </div>
                    {activeSessions.map(session => (
                      <div key={session} onClick={() => { setMarketType('session_' + session); setShowMarketMenu(false); }} className="px-4 py-3 text-[13px] font-bold text-white hover:bg-[#2c2c2e] cursor-pointer border-t border-[#2c2c2e]">
                        {session}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>


          {isSessionMarket ? (
            <div className="mt-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-5 px-1">
                <h2 className="text-white font-bold text-base tracking-wide">{selectedSessionName}</h2>
                <div className="text-[#8e8e93] text-sm font-medium tracking-wide">
                  On this market: <span className="text-white font-bold ml-1">${formatMoney(sessionGraphData?.totalBet || 0)}</span>
                </div>
              </div>
              <TeamCard teamData={sessionGraphData} isToss={false} isSession={true} marketVol={sessionGraphData?.totalBet || 0} />
            </div>
          ) : (
            <>
              <div className="mb-6 mt-6">
                <h2 className="text-white font-bold text-base tracking-wide">Match Odds</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">
                <TeamCard teamData={t1GraphData} isToss={false} marketVol={marketVol} />
                <TeamCard teamData={t2GraphData} isToss={false} marketVol={marketVol} />
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'toss' ? (
        <div className="space-y-4">
          {/* Crex Toss Winner Banner */}
          {crexData?.scorecard?.statusEquation && /opt|chose|elected|toss/i.test(crexData.scorecard.statusEquation) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-sm font-bold text-amber-400">
              <span>🪙</span>
              <span>{crexData.scorecard.statusEquation}</span>
            </div>
          )}
          {tossSnapshot ? (
            <>
              {/* Toss Odds Total Bar */}
              <div className="mb-4 mt-2">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-white font-bold text-base tracking-wide flex items-center gap-2">
                    <span>🪙</span> Toss Market Load
                  </h2>
                  <span className="text-xs text-[#8e8e93] font-semibold">
                    Total: ₹{formatVolStr(tossMarketVol)}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="h-[6px] w-full bg-[#2c2c2e] mb-2 flex rounded-sm overflow-hidden">
                  <div className="bg-[#a855f7] h-full transition-all duration-500" style={{ width: `${tossT1PctVol}%` }} />
                  <div className="bg-[#3b82f6] h-full transition-all duration-500" style={{ width: `${tossT2PctVol}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-[#8e8e93] tracking-wide">
                  <span className="text-[#a855f7]">{tossT1Name} <span className="text-white ml-1">{tossT1PctVol.toFixed(0)}%</span></span>
                  <span className="text-[#3b82f6]">{tossT2Name} <span className="text-white ml-1">{tossT2PctVol.toFixed(0)}%</span></span>
                </div>
              </div>

              {/* 🎯 TOSS SMART MONEY & INFLOW PREDICTOR */}
              <div
                className="rounded-2xl overflow-hidden border shadow-2xl relative p-4 space-y-4"
                style={{
                  background: 'linear-gradient(180deg, #161616 0%, #111111 100%)',
                  borderColor: '#2c2c2e',
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white flex items-center gap-1.5">
                      🎯 Toss Smart Money & Inflow Predictor
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/30">
                    EXCHANGE INFLOW
                  </span>
                </div>

                <p className="text-xs text-[#8e8e93]">
                  Toss market smart money accumulation, back-volume dominance, and syndicate trade flow detection.
                </p>

                {/* 🏆 PREDICTED TOSS WINNER */}
                <div
                  className="rounded-xl p-4 border"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#10b981] flex items-center gap-1">
                      🏆 PREDICTED TOSS WINNER
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tossPrediction?.algoName && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {tossPrediction.algoName}
                        </span>
                      )}
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-[#10b981] text-black">
                        {tossPrediction?.verdictTag || 'SMART MONEY INFLOW'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xl font-black text-white mb-2 flex items-center gap-2">
                    <span>{predictedTossWinner}</span>
                    <span className="text-xs font-semibold text-[#10b981]">
                      (🏆 Predicted Toss Winner)
                    </span>
                  </div>

                  <div className="text-xs text-[#d1d5db] leading-relaxed space-y-1">
                    <div className="text-[12px] text-[#9ca3af]">
                      💡 <b>Inflow Analysis:</b> {tossPredictionReason || 'Analyzing orderbook accumulation...'}
                    </div>
                    {tossPrediction?.algoName && (
                      <div className="text-[11px] text-sky-400 font-medium flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 border border-sky-500/30 text-sky-300 font-bold uppercase tracking-wider">Algo</span>
                        <span>{tossPrediction.algoName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 1. PRE-MATCH INFLOW BREAKDOWN */}
                {(() => {
                  const b1 = tossM1?.back ?? 0
                  const l1 = tossM1?.lay ?? 0
                  const b2 = tossM2?.back ?? 0
                  const l2 = tossM2?.lay ?? 0
                  const pnl1 = tossSnap?.preMatchPnl?.team1 ?? (l1 - b1)
                  const pnl2 = tossSnap?.preMatchPnl?.team2 ?? (l2 - b2)
                  const totBack = b1 + b2
                  const b1Pct = totBack > 0 ? (b1 / totBack) * 100 : 50
                  const b2Pct = totBack > 0 ? (b2 / totBack) * 100 : 50

                  return (
                    <div className="rounded-xl p-3.5 border border-[#2c2c2e]" style={{ background: '#181818' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-[#38bdf8] flex items-center gap-1.5">
                          📌 1. Pre-Match Back Accumulation & Inflow
                        </span>
                        <span className="text-[10px] text-[#8e8e93] font-semibold">Toss Inflow Base</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Team 1 Pre-match */}
                        <div
                          className="rounded-lg p-3 border"
                          style={{
                            background: b1 >= b2 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            borderColor: b1 >= b2 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-white truncate">{tossT1Name}</span>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                b1 >= b2
                                  ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                                  : 'bg-[#8e8e93]/20 text-[#8e8e93] border border-[#8e8e93]/40'
                              }`}
                            >
                              {b1 >= b2 ? '🔥 Back Dominance Leader' : 'Secondary Inflow'}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[10px] text-[#8e8e93]">Back Inflow:</span>
                            <span className={`text-base font-black font-mono ${b1 >= b2 ? 'text-[#10b981]' : 'text-white'}`}>
                              ₹{formatVolStr(b1)} <span className="text-xs text-[#8e8e93]">({b1Pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="mt-1.5 pt-1.5 border-t border-[#2c2c2e] text-[10px] flex justify-between text-[#8e8e93]">
                            <span>Lay: <b className="text-gray-300">₹{formatVolStr(l1)}</b></span>
                            <span>P/L: <b className={pnl1 >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>{pnl1 >= 0 ? `+${pnl1.toFixed(1)}` : pnl1.toFixed(1)}</b></span>
                          </div>
                        </div>

                        {/* Team 2 Pre-match */}
                        <div
                          className="rounded-lg p-3 border"
                          style={{
                            background: b2 > b1 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            borderColor: b2 > b1 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-white truncate">{tossT2Name}</span>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                b2 > b1
                                  ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                                  : 'bg-[#8e8e93]/20 text-[#8e8e93] border border-[#8e8e93]/40'
                              }`}
                            >
                              {b2 > b1 ? '🔥 Back Dominance Leader' : 'Secondary Inflow'}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[10px] text-[#8e8e93]">Back Inflow:</span>
                            <span className={`text-base font-black font-mono ${b2 > b1 ? 'text-[#10b981]' : 'text-white'}`}>
                              ₹{formatVolStr(b2)} <span className="text-xs text-[#8e8e93]">({b2Pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="mt-1.5 pt-1.5 border-t border-[#2c2c2e] text-[10px] flex justify-between text-[#8e8e93]">
                            <span>Lay: <b className="text-gray-300">₹{formatVolStr(l2)}</b></span>
                            <span>P/L: <b className={pnl2 >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>{pnl2 >= 0 ? `+${pnl2.toFixed(1)}` : pnl2.toFixed(1)}</b></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 2. 6-Metric Breakdown Table */}
                <div className="pt-2">
                  <div className="grid grid-cols-3 gap-1 mb-2 px-1">
                    <div className="text-[10px] font-bold text-[#8e8e93] uppercase">Metrics</div>
                    <div className="text-center text-[10px] font-bold text-[#8e8e93] truncate">{tossT1Name}</div>
                    <div className="text-center text-[10px] font-bold text-[#8e8e93] truncate">{tossT2Name}</div>
                  </div>
                  <div className="rounded-xl border border-[#2c2c2e] p-2 bg-[#121214]">
                    {[
                      { label: 'Back Val', v1: <span className="text-[11px] text-[#3b82f6] font-bold">₹{formatVolStr(tossM1?.back)}</span>, v2: <span className="text-[11px] text-[#3b82f6] font-bold">₹{formatVolStr(tossM2?.back)}</span> },
                      { label: 'Lay Liab', v1: <span className="text-[11px] text-[#ef4444] font-bold">₹{formatVolStr(tossM1?.lay)}</span>, v2: <span className="text-[11px] text-[#ef4444] font-bold">₹{formatVolStr(tossM2?.lay)}</span> },
                      { label: 'Total Bet', v1: <span className="text-[11px] text-white font-bold">₹{formatVolStr(tossM1?.totalBet)}</span>, v2: <span className="text-[11px] text-white font-bold">₹{formatVolStr(tossM2?.totalBet)}</span> },
                      { label: 'Lay Trades', v1: <span className="text-[11px] text-white font-bold">{tossS1?.tradeCount ?? '—'}</span>, v2: <span className="text-[11px] text-white font-bold">{tossS2?.tradeCount ?? '—'}</span> },
                      { label: 'Support %', v1: <span className="text-[11px] font-bold" style={{color:(tossSup1?.support??0)>(tossSup2?.support??0)?'#10b981':'#8e8e93'}}>{tossSup1?tossSup1.support.toFixed(1)+'%':'—'}</span>, v2: <span className="text-[11px] font-bold" style={{color:(tossSup2?.support??0)>(tossSup1?.support??0)?'#10b981':'#8e8e93'}}>{tossSup2?tossSup2.support.toFixed(1)+'%':'—'}</span> },
                      { label: 'B/L Ratio', v1: <span className="text-[11px] text-[#10b981] font-bold">{tossM1?.lay>0?(tossM1.back/tossM1.lay).toFixed(2):'—'}</span>, v2: <span className="text-[11px] text-[#10b981] font-bold">{tossM2?.lay>0?(tossM2.back/tossM2.lay).toFixed(2):'—'}</span> },
                    ].map(({ label, v1, v2 }, i, arr) => (
                      <div key={label} className={`grid grid-cols-3 gap-1 py-1.5 px-2 ${i !== arr.length - 1 ? 'border-b border-[#2c2c2e]/60' : ''}`}>
                        <div className="text-[10px] text-[#8e8e93] flex items-center font-semibold">{label}</div>
                        <div className="text-center flex items-center justify-center">{v1}</div>
                        <div className="text-center flex items-center justify-center">{v2}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Toss Graph Team Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
                <TeamCard teamData={tossT1GraphData} isToss={true} marketVol={tossMarketVol} />
                <TeamCard teamData={tossT2GraphData} isToss={true} marketVol={tossMarketVol} />
              </div>
            </>
          ) : (
            <div className="rounded-2xl p-8 max-w-md mx-auto text-center border border-[#2c2c2e] my-8" style={{ background: '#111111' }}>
              <div className="text-4xl mb-3">🪙</div>
              <h3 className="text-base font-bold text-white mb-1">Toss Market Synchronizing</h3>
              <p className="text-xs text-[#8e8e93] leading-relaxed">
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
          {isSessionMarket ? (
            <div className="p-4 text-center text-[#8e8e93] py-10">
              <BarChart3 className="mx-auto mb-3 opacity-20" size={48} />
              <p>Session data is only available in Graphs view.</p>
              <button onClick={() => setShowAdvancedGraph(true)} className="mt-4 px-4 py-2 bg-[#16a34a] text-white rounded-lg text-sm font-bold">Switch to Graphs</button>
            </div>
          ) : (
            <>
              {/* ━━━━━━━━━━ 🤖 AI PREDICTION (TIER 1 & TIER 2) ━━━━━━━━━━ */}
              {snapshot.aiPrediction && snapshot.aiPrediction.winner && (
                  <div 
                    className="relative overflow-hidden rounded-xl border p-4 shadow-2xl transition-all duration-500"
                    style={{
                      background: snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'CPL_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'KERALA_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(20, 184, 166, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'DELHI_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'UP_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(234, 88, 12, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'ECS_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(217, 70, 239, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'TNPL_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL'
                        ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : snapshot.aiPrediction.tier === 1 
                        ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(13, 17, 23, 0.9) 100%)'
                        : 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(13, 17, 23, 0.9) 100%)',
                      borderColor: snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL'
                        ? 'rgba(16, 185, 129, 0.3)'
                        : snapshot.aiPrediction.tier === 'CPL_SPECIAL'
                        ? 'rgba(168, 85, 247, 0.3)'
                        : snapshot.aiPrediction.tier === 'KERALA_SPECIAL'
                        ? 'rgba(20, 184, 166, 0.3)'
                        : snapshot.aiPrediction.tier === 'DELHI_SPECIAL'
                        ? 'rgba(244, 63, 94, 0.3)'
                        : snapshot.aiPrediction.tier === 'UP_SPECIAL'
                        ? 'rgba(99, 102, 241, 0.3)'
                        : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL'
                        ? 'rgba(245, 158, 11, 0.4)'
                        : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL'
                        ? 'rgba(234, 88, 12, 0.3)'
                        : snapshot.aiPrediction.tier === 'ECS_SPECIAL'
                        ? 'rgba(14, 165, 233, 0.3)'
                        : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL'
                        ? 'rgba(217, 70, 239, 0.3)'
                        : snapshot.aiPrediction.tier === 'TNPL_SPECIAL'
                        ? 'rgba(234, 179, 8, 0.3)'
                        : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL'
                        ? 'rgba(6, 182, 212, 0.3)'
                        : snapshot.aiPrediction.tier === 1 
                        ? 'rgba(234, 179, 8, 0.3)'
                        : 'rgba(59, 130, 246, 0.2)',
                      boxShadow: snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL'
                        ? '0 4px 20px rgba(16, 185, 129, 0.1)'
                        : snapshot.aiPrediction.tier === 'CPL_SPECIAL'
                        ? '0 4px 20px rgba(168, 85, 247, 0.1)'
                        : snapshot.aiPrediction.tier === 'KERALA_SPECIAL'
                        ? '0 4px 20px rgba(20, 184, 166, 0.1)'
                        : snapshot.aiPrediction.tier === 'DELHI_SPECIAL'
                        ? '0 4px 20px rgba(244, 63, 94, 0.1)'
                        : snapshot.aiPrediction.tier === 'UP_SPECIAL'
                        ? '0 4px 20px rgba(99, 102, 241, 0.1)'
                        : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL'
                        ? '0 4px 20px rgba(245, 158, 11, 0.15)'
                        : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL'
                        ? '0 4px 20px rgba(234, 88, 12, 0.1)'
                        : snapshot.aiPrediction.tier === 'ECS_SPECIAL'
                        ? '0 4px 20px rgba(14, 165, 233, 0.1)'
                        : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL'
                        ? '0 4px 20px rgba(217, 70, 239, 0.1)'
                        : snapshot.aiPrediction.tier === 'TNPL_SPECIAL'
                        ? '0 4px 20px rgba(234, 179, 8, 0.1)'
                        : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL'
                        ? '0 4px 20px rgba(6, 182, 212, 0.1)'
                        : snapshot.aiPrediction.tier === 1 
                        ? '0 4px 20px rgba(234, 179, 8, 0.05)'
                        : 'none'
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm animate-bounce">🤖</span>
                          <span className={`text-xs font-black uppercase tracking-wider ${
                            snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL' ? 'text-emerald-500'
                            : snapshot.aiPrediction.tier === 'CPL_SPECIAL' ? 'text-purple-500' 
                            : snapshot.aiPrediction.tier === 'KERALA_SPECIAL' ? 'text-teal-500'
                            : snapshot.aiPrediction.tier === 'DELHI_SPECIAL' ? 'text-rose-500'
                            : snapshot.aiPrediction.tier === 'UP_SPECIAL' ? 'text-indigo-500'
                            : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL' ? 'text-amber-400'
                            : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL' ? 'text-orange-500'
                            : snapshot.aiPrediction.tier === 'ECS_SPECIAL' ? 'text-sky-500'
                            : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL' ? 'text-fuchsia-500'
                            : snapshot.aiPrediction.tier === 'TNPL_SPECIAL' ? 'text-amber-500'
                            : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL' ? 'text-cyan-500'
                            : snapshot.aiPrediction.tier === 1 ? 'text-yellow-500' 
                            : 'text-blue-500'
                          }`}>
                            AI Match Winner Prediction
                          </span>
                        </div>
                        <h3 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                          <span className="text-xl">🏆</span> {snapshot.aiPrediction.winner}
                        </h3>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded text-black flex items-center gap-1 shadow-sm ${
                        snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL' ? 'bg-emerald-500'
                        : snapshot.aiPrediction.tier === 'CPL_SPECIAL' ? 'bg-purple-500' 
                        : snapshot.aiPrediction.tier === 'KERALA_SPECIAL' ? 'bg-teal-500'
                        : snapshot.aiPrediction.tier === 'DELHI_SPECIAL' ? 'bg-rose-500'
                        : snapshot.aiPrediction.tier === 'UP_SPECIAL' ? 'bg-indigo-500'
                        : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL' ? 'bg-amber-400'
                        : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL' ? 'bg-orange-500'
                        : snapshot.aiPrediction.tier === 'ECS_SPECIAL' ? 'bg-sky-500'
                        : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL' ? 'bg-fuchsia-500'
                        : snapshot.aiPrediction.tier === 'TNPL_SPECIAL' ? 'bg-amber-500'
                        : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL' ? 'bg-cyan-500'
                        : snapshot.aiPrediction.tier === 1 ? 'bg-yellow-500' 
                        : 'bg-blue-500'
                      }`}>
                        {snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL' ? '🌍 LEAGUE SPECIAL (INTL T20 ALGO USED)'
                         : snapshot.aiPrediction.tier === 'CPL_SPECIAL' ? '⚡ LEAGUE SPECIAL (CPL ALGO USED)' 
                         : snapshot.aiPrediction.tier === 'KERALA_SPECIAL' ? '🌴 LEAGUE SPECIAL (KERALA ALGO USED)'
                         : snapshot.aiPrediction.tier === 'DELHI_SPECIAL' ? '🇮🇳 LEAGUE SPECIAL (DELHI ALGO USED)'
                         : snapshot.aiPrediction.tier === 'UP_SPECIAL' ? '🇮🇳 LEAGUE SPECIAL (UP ALGO USED)'
                         : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL' ? '🦁 LEAGUE SPECIAL (SHER-E-PUNJAB ALGO USED)'
                         : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL' ? '🇱🇰 LEAGUE SPECIAL (SRI LANKA ALGO)'
                         : snapshot.aiPrediction.tier === 'ECS_SPECIAL' ? '🇪🇺 LEAGUE SPECIAL (ECS ALGO)'
                         : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL' ? '👩 LEAGUE SPECIAL (WOMENS T20 ALGO USED)'
                         : snapshot.aiPrediction.tier === 'TNPL_SPECIAL' ? '🇮🇳 LEAGUE SPECIAL (TNPL ALGO USED)'
                         : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL' ? '🏴󠁧󠁢󠁥󠁮󠁧󠁿 LEAGUE SPECIAL (THE HUNDRED ALGO)'
                         : `TIER ${snapshot.aiPrediction.tier}`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full bg-black/50 border ${
                        snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL' ? 'border-emerald-500/40 text-emerald-500'
                        : snapshot.aiPrediction.tier === 'CPL_SPECIAL' ? 'border-purple-500/40 text-purple-500' 
                        : snapshot.aiPrediction.tier === 'KERALA_SPECIAL' ? 'border-teal-500/40 text-teal-500'
                        : snapshot.aiPrediction.tier === 'DELHI_SPECIAL' ? 'border-rose-500/40 text-rose-500'
                        : snapshot.aiPrediction.tier === 'UP_SPECIAL' ? 'border-indigo-500/40 text-indigo-500'
                        : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL' ? 'border-amber-500/40 text-amber-400'
                        : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL' ? 'border-orange-500/40 text-orange-500'
                        : snapshot.aiPrediction.tier === 'ECS_SPECIAL' ? 'border-sky-500/40 text-sky-500'
                        : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL' ? 'border-fuchsia-500/40 text-fuchsia-500'
                        : snapshot.aiPrediction.tier === 'TNPL_SPECIAL' ? 'border-amber-500/40 text-amber-500'
                        : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL' ? 'border-cyan-500/40 text-cyan-500'
                        : snapshot.aiPrediction.tier === 1 ? 'border-yellow-500/40 text-yellow-500' 
                        : 'border-blue-500/40 text-blue-500'
                      }`}>
                        {snapshot.aiPrediction.confidence}
                      </span>
                    </div>

                    <p className="text-xs text-[#8e8e93] mt-3 leading-relaxed border-t border-white/5 pt-3">
                      {snapshot.aiPrediction.tier === 'INTERNATIONAL_T20_SPECIAL'
                        ? 'International T20 matches rely on high-liquidity Pre-Match data. The AI evaluates Pre-Match Bookmaker P/L exposure, Smart Lay Pressure, and Public Overload Traps to predict the true winner.'
                        : snapshot.aiPrediction.tier === 'CPL_SPECIAL'
                        ? 'CPL matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.'
                        : snapshot.aiPrediction.tier === 'KERALA_SPECIAL'
                        ? 'Kerala matches evaluate Pre-Match Lay Resistance Dumps and Dominant Inflow Margins to identify the true market winner.'
                        : snapshot.aiPrediction.tier === 'DELHI_SPECIAL'
                        ? 'Delhi matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.'
                        : snapshot.aiPrediction.tier === 'UP_SPECIAL'
                        ? 'Uttar Pradesh matches evaluate Pre-Match market activity engagement, smart volume accumulation, and bookmaker lay resistance to pinpoint the true winner.'
                        : snapshot.aiPrediction.tier === 'PUNJAB_SPECIAL'
                        ? 'Sher-e-Punjab T20 matches strictly act as Bookie Traps. The AI strictly fades the heavy public money to pick the team with maximum bookmaker profitability.'
                        : snapshot.aiPrediction.tier === 'SRILANKA_SPECIAL'
                        ? 'Sri Lanka Major Clubs T20 matches show a strong trend of reversed results. The AI strictly fades the public money to align with the bookmaker trap.'
                        : snapshot.aiPrediction.tier === 'ECS_SPECIAL'
                        ? 'European Cricket Series (ECS) matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.'
                        : snapshot.aiPrediction.tier === 'WOMENS_T20_SPECIAL'
                        ? 'Women\'s T20 matches evaluate Pre-Match smart money inflow margins and dual volume leadership to identify the true market winner.'
                        : snapshot.aiPrediction.tier === 'TNPL_SPECIAL'
                        ? 'TNPL matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.'
                        : snapshot.aiPrediction.tier === 'HUNDRED_SPECIAL'
                        ? 'The Hundred matches evaluate Pre-Match volume accumulation margins and dual volume advantages.'
                        : snapshot.aiPrediction.tier === 1 
                        ? '100% backtested accuracy. PreMatch Back Volume, Lay Volume, and Liability all strongly align towards this team winning.'
                        : '76% backtested accuracy. This team holds a massive 1.5x volume margin in the PreMatch markets.'}
                    </p>
                  </div>
              )}


              {/* ━━━━━━━━━━ 1. MATCH HEADER + ODDS + P/L ━━━━━━━━━━ */}
              <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                {/* Date / Title */}
                <div className="px-5 pt-4 pb-3" style={{ background: '#111111', borderBottom: '1px solid #2c2c2e' }}>
                  {matchSchedule && (
                    <div className="text-xs text-[#8e8e93] mb-1">
                      📅 {matchSchedule.date} &nbsp;⏰ {matchSchedule.time}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <h1 className="text-lg font-bold text-white">{t1} vs {t2}</h1>
                    {snapshot.inPlay && <span className="text-[#3b82f6] text-xs font-bold flex items-center gap-1 shrink-0"><span className="pulse-dot h-2 w-2 rounded-full bg-[#3b82f6]" /> LIVE</span>}
                  </div>
                  {snapshot.competitionName && <div className="text-xs text-[#8e8e93] mt-0.5">{snapshot.competitionName}</div>}
                  {(marketBetTotal > 0 || marketVol > 0) && (() => {
                    const leaderAmt = Math.max(marketBet1, marketBet2, hasDraw ? marketBetDraw : 0)
                    const colorFor = (amt) => amt === leaderAmt && leaderAmt > 0 ? '#ef4444' : '#10b981'
                    const c1 = colorFor(marketBet1)
                    const c2 = colorFor(marketBet2)
                    const cDraw = colorFor(marketBetDraw)
                    return (
                    <div className="mt-3 space-y-3">
                      {marketBetTotal > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider mb-1.5">Total bets</div>
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#2c2c2e] mb-1.5">
                            <div className="transition-all" style={{ width: `${marketBetPct1}%`, background: c1 }} />
                            {hasDraw && <div className="transition-all" style={{ width: `${marketBetPctDraw}%`, background: cDraw }} />}
                            <div className="transition-all" style={{ width: `${marketBetPct2}%`, background: c2 }} />
                          </div>
                          <div className="flex justify-between gap-2 text-[10px] font-semibold">
                            <span className="truncate" style={{ color: c1 }}>
                              {t1} {marketBetPct1.toFixed(0)}%
                              <span className="text-[#636366] font-normal"> · {fmt(marketBet1)}</span>
                            </span>
                            {hasDraw && (
                              <span className="truncate" style={{ color: cDraw }}>
                                {drawName} {marketBetPctDraw.toFixed(0)}%
                                <span className="text-[#636366] font-normal"> · {fmt(marketBetDraw)}</span>
                              </span>
                            )}
                            <span className="truncate text-right" style={{ color: c2 }}>
                              {t2} {marketBetPct2.toFixed(0)}%
                              <span className="text-[#636366] font-normal"> · {fmt(marketBet2)}</span>
                            </span>
                          </div>
                        </div>
                      )}
                      {marketVol > 0 && (() => {
                        const vol1 = t1GraphData?.totalBet || 0
                        const vol2 = t2GraphData?.totalBet || 0
                        const moneyLeader = Math.max(vol1, vol2)
                        const moneyColor = (amt) => (amt === moneyLeader && moneyLeader > 0 ? '#10b981' : '#ef4444')
                        const mc1 = moneyColor(vol1)
                        const mc2 = moneyColor(vol2)
                        return (
                        <div>
                          <div className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider mb-1.5">Money</div>
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#2c2c2e] mb-1.5">
                            <div className="transition-all" style={{ width: `${t1PctVol}%`, background: mc1 }} />
                            <div className="transition-all" style={{ width: `${t2PctVol}%`, background: mc2 }} />
                          </div>
                          <div className="flex justify-between gap-2 text-[10px] font-semibold">
                            <span className="truncate" style={{ color: mc1 }}>
                              {t1} {t1PctVol.toFixed(0)}%
                            </span>
                            <span className="truncate text-right" style={{ color: mc2 }}>
                              {t2} {t2PctVol.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        )
                      })()}
                    </div>
                    )
                  })()}
                </div>

                {/* Odds — 2-way or 3-way (Test + Draw) */}
                <div
                  className={`grid divide-x divide-[#2c2c2e] ${hasDraw ? 'grid-cols-3' : 'grid-cols-2'}`}
                  style={{ borderBottom: '1px solid #2c2c2e' }}
                >
                  {[
                    { name: t1, odds: t1Odds },
                    { name: t2, odds: t2Odds },
                    ...(hasDraw ? [{ name: drawName, odds: drawOdds }] : []),
                  ].map(({ name, odds }) => (
                    <div key={name} className="px-3 py-2.5">
                      <div className="text-xs font-semibold text-gray-300 truncate mb-1.5">{name}</div>
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-lg py-1.5 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                          <div className="text-[10px] text-[#8e8e93]">Back</div>
                          <div className="text-sm font-bold text-[#3b82f6]">{odds?.back ?? '—'}</div>
                        </div>
                        <div className="flex-1 rounded-lg py-1.5 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                          <div className="text-[10px] text-[#8e8e93]">Lay</div>
                          <div className="text-sm font-bold text-[#ef4444]">{odds?.lay ?? '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* P/L */}
                {pl1 != null && pl2 != null && (
                  <div className="p-4">
                    <div className="text-xs font-bold text-[#8e8e93] uppercase tracking-wider mb-2">Bookie P/L</div>
                    <div className={`grid gap-3 ${hasDraw ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {[
                        { name: t1, pl: pl1 },
                        { name: t2, pl: pl2 },
                        ...(hasDraw && plDraw != null ? [{ name: drawName, pl: plDraw }] : []),
                      ].map(({ name, pl }) => (
                        <div key={name} className="rounded-xl p-3 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                          <div className="text-sm font-bold text-gray-300 mb-1 truncate">{name}</div>
                          <div className={`text-lg font-bold tracking-wide ${pnlCls(pl)}`}>{fmtRs(pl)}</div>
                          <div className={`text-xs font-semibold mt-1 ${pnlCls(pl)}`}>{pl >= 0 ? 'PROFIT' : 'LOSS'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ━━━━━━━━━━ 1b. GATED FADE PICK ━━━━━━━━━━ */}
              {gatedFade && (
                <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                  <div className="px-3 py-2 flex items-center gap-2 border-b border-[#2c2c2e]">
                    <span className="text-sm font-bold text-white">Gated Fade Pick</span>
                    {gatedFade.winnerName && (
                      <span className="ml-auto text-[11px] font-bold truncate" style={{ color: '#10b981' }}>
                        {gatedFade.winnerName}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[{
                        name: gatedFade.t1,
                        isFade: teamEq(gatedFade.winnerName, gatedFade.t1),
                        exposure: gatedFade.t1Exposure,
                      }, {
                        name: gatedFade.t2,
                        isFade: teamEq(gatedFade.winnerName, gatedFade.t2),
                        exposure: gatedFade.t2Exposure,
                      }].map((side) => {
                        const hasPick = !!gatedFade.winnerName
                        const isOther = hasPick && !side.isFade
                        const role = side.isFade ? 'Fade' : isOther ? 'Public' : 'Team'
                        return (
                        <div
                          key={side.name}
                          className="rounded-xl p-3 text-center border"
                          style={
                            side.isFade
                              ? { background: 'rgba(16,185,129,0.14)', borderColor: 'rgba(16,185,129,0.45)' }
                              : isOther
                                ? { background: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.45)' }
                                : { background: '#1a1a1a', borderColor: '#2c2c2e' }
                          }
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: isOther ? '#ef4444' : side.isFade ? '#10b981' : '#8e8e93' }}>
                            {role}
                          </div>
                          <div className="text-sm font-bold text-white truncate">{side.name}</div>
                          <div className={`text-[11px] font-bold mt-1 ${typeof side.exposure === 'number' ? pnlCls(side.exposure) : 'text-[#8e8e93]'}`}>
                            {typeof side.exposure === 'number' ? fmtRs(side.exposure) : 'Exp —'}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { ok: gatedFade.confirms.plProfit, label: 'P/L' },
                        { ok: gatedFade.confirms.moreMoney, label: 'Money' },
                        { ok: gatedFade.confirms.fewerBets, label: 'Bets' },
                        { ok: gatedFade.trap === 'none', label: `Trap ${gatedFade.trap || '—'}` },
                        { ok: gatedFade.fadeExposure != null, label: gatedFade.fadeExposure != null ? `Exp ${fmtRs(gatedFade.fadeExposure)}` : 'Exp' },
                        { ok: gatedFade.confirms.lowerRatio, label: 'B/L' },
                        { ok: gatedFade.confirms.totGap, label: gatedFade.totGapPct != null ? `Gap ${(gatedFade.totGapPct * 100).toFixed(0)}%` : 'Gap' },
                      ].map((chip) => (
                        <span
                          key={chip.label}
                          className="text-[10px] font-bold px-2 py-1 rounded-md border"
                          style={chip.ok
                            ? { color: '#10b981', borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)' }
                            : { color: '#8e8e93', borderColor: '#2c2c2e', background: '#1a1a1a' }}
                        >
                          {chip.ok ? '✓' : '·'} {chip.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </>
          )}

          {/* ━━━━━━━━━━ B/L RATIO ━━━━━━━━━━ */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
            <div className="px-4 py-3 border-b border-[#2c2c2e] flex items-center justify-between">
              <span className="text-sm font-bold text-white">Back / Lay Ratio</span>
              {lowerRatioTeam && (
                <span className="text-[10px] font-bold text-[#10b981]">Lower: {lowerRatioTeam}</span>
              )}
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {[{ name: t1, ratio: aRatio, back: aBack, lay: aLay, backPct: aBackPct },
                { name: t2, ratio: bRatio, back: bBack, lay: bLay, backPct: bBackPct }].map((side) => {
                const isLower = lowerRatioTeam === side.name
                return (
                  <div
                    key={side.name}
                    className="rounded-xl p-3 border"
                    style={{
                      background: '#1a1a1a',
                      borderColor: isLower ? 'rgba(16,185,129,0.4)' : '#2c2c2e',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-bold text-white truncate">{side.name}</div>
                      {isLower && (
                        <span className="text-[9px] font-bold text-[#10b981] border border-[#10b981]/30 px-1.5 py-0.5 rounded shrink-0">LOWER</span>
                      )}
                    </div>
                    <div className="text-2xl font-black tracking-tight text-white mb-1">
                      {side.ratio != null ? `${side.ratio.toFixed(2)}x` : '—'}
                    </div>
                    <div className="text-[10px] text-[#8e8e93] mb-2">B / L</div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-[#2c2c2e] mb-1.5">
                      <div className="bg-[#3b82f6]" style={{ width: `${side.backPct}%` }} />
                      <div className="bg-[#ef4444]" style={{ width: `${100 - side.backPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#3b82f6]">Back {side.backPct.toFixed(0)}%</span>
                      <span className="text-[#ef4444]">Lay {(100 - side.backPct).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-[#8e8e93] mt-2 pt-2 border-t border-[#2c2c2e]">
                      <span>₹{fmt(side.back)}</span>
                      <span>₹{fmt(side.lay)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ━━━━━━━━━━ 8. BOOKMAKER EXPOSURE ━━━━━━━━━━ */}
          <div className="rounded-2xl p-4" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
            <div className="text-sm font-bold text-gray-300 mb-3">Bookie Exposure</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                <div className="text-sm font-medium mb-2 text-white">{exp1.teamName || t1}</div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-[#8e8e93]">Net Exp</span><span className={`font-bold ${pnlCls(exp1.netExposure)}`}>{fmtRs(exp1.netExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-[#8e8e93]">Back</span><span className="text-[#3b82f6]">₹{fmt(exp1.backExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-[#8e8e93]">Lay</span><span className="text-[#ef4444]">₹{fmt(exp1.layExposure)}</span></div>
                </div>
              </div>
              <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                <div className="text-sm font-medium mb-2 text-white">{exp2.teamName || t2}</div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-[#8e8e93]">Net Exp</span><span className={`font-bold ${pnlCls(exp2.netExposure)}`}>{fmtRs(exp2.netExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-[#8e8e93]">Back</span><span className="text-[#3b82f6]">₹{fmt(exp2.backExposure)}</span></div>
                  <div className="flex justify-between"><span className="text-[#8e8e93]">Lay</span><span className="text-[#ef4444]">₹{fmt(exp2.layExposure)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* ━━━━━━━━━━ 4. DEEP BETTING METRICS ━━━━━━━━━━ */}
          {(dm.raw || dm.totals) && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
              <div className="px-4 py-3 border-b border-[#2c2c2e] flex items-center gap-2" style={{ background: '#111111' }}>
                <BarChart3 size={15} className="text-white" />
                <span className="text-sm font-bold text-white">Deep Betting Metrics</span>
              </div>
              <div className="p-4 space-y-4">
                {dm.raw && Object.keys(dm.raw).length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-[#8e8e93] mb-2 uppercase tracking-wide">Raw Accumulated Values</div>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ team: t1, back: am1.back, lay: am1.lay }, { team: t2, back: am2.back, lay: am2.lay }].map(({ team, back, lay }) => (
                        <div key={team} className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                          <div className="text-xs font-bold text-white mb-2 truncate">{team}</div>
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between"><span className="text-[#8e8e93]">Back Expo</span><span className="font-bold text-[#3b82f6]">{back != null ? Number(back).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</span></div>
                            <div className="flex justify-between"><span className="text-[#8e8e93]">Lay Stake</span><span className="font-bold text-[#ef4444]">{lay != null ? Number(lay).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</span></div>
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
                      <div className="text-xs font-bold text-[#8e8e93] mb-2 uppercase tracking-wide">Total Bets</div>
                      <div className="grid grid-cols-2 gap-3">
                        {[{ team: t1, val: v1 }, { team: t2, val: v2 }].map(({ team, val }) => {
                          const isLower = (v1 != null && v2 != null) && (team === t1 ? v1 < v2 : v2 < v1)
                          const isHigher = (v1 != null && v2 != null) && (team === t1 ? v1 > v2 : v2 > v1)
                          return (
                            <div key={team} className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                              <div className="text-xs font-bold text-white mb-1 truncate">{team}</div>
                              <div className="flex items-center gap-1">
                                <div className="text-sm font-bold text-text-primary">{val != null ? Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</div>
                                {isLower && <ChevronDown size={18} className="text-loss shrink-0" />}
                                {isHigher && <ChevronUp size={18} className="text-profit shrink-0" />}
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
            <div className="rounded-2xl p-4" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
              <div className="text-sm font-bold text-gray-300 mb-3">Sentiment Support</div>
              <div className="mb-3">
                {[t1, t2].map((team, i) => {
                  const key = i === 0 ? 'teamA' : 'teamB'
                  const pct = i === 0 ? ns.percentageA : ns.percentageB
                  return (
                    <div key={key} className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white">{team}</span>
                        <span className={`font-bold ${pct >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{pct?.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#2c2c2e' }}>
                        <div className={`h-full rounded-full ${pct >= 50 ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="text-xs text-[#8e8e93] text-center border-t border-[#2c2c2e] pt-3 mt-1">
                Highest Support: <span className="text-white font-bold">{sent.strongerTeam}</span>
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━ 5. QUICK STATS ━━━━━━━━━━ */}
          <div className="space-y-2">
            {[{ title: 'In-Play', pnl: ip, bets: ib, vol: iv }, { title: 'Pre-Match', pnl: pp, bets: pb, vol: pv }].map(({ title, pnl, bets, vol }) => (
              <div key={title} className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                <div className="px-4 py-2 border-b border-[#2c2c2e]" style={{ background: '#111111' }}>
                  <span className="text-xs font-bold uppercase tracking-wider text-white">{title}</span>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-3 gap-1 mb-1.5">
                    <div />
                    <div className="text-center text-[10px] font-bold text-[#8e8e93] truncate px-1">{t1}</div>
                    <div className="text-center text-[10px] font-bold text-[#8e8e93] truncate px-1">{t2}</div>
                  </div>
                  {[
                    { label: 'P/L', v1: <span className={`font-bold text-xs ${pnlCls(pnl.team1)}`}>{fmtRs(pnl.team1)}</span>, v2: <span className={`font-bold text-xs ${pnlCls(pnl.team2)}`}>{fmtRs(pnl.team2)}</span> },
                    { label: 'Bets', v1: <span className="text-[11px] text-[#8e8e93]">{fmt(bets.team1)}</span>, v2: <span className="text-[11px] text-[#8e8e93]">{fmt(bets.team2)}</span> },
                    { label: 'Back', v1: <span className="text-[11px] text-[#3b82f6]">₹{fmt(vol.team1?.back)}</span>, v2: <span className="text-[11px] text-[#3b82f6]">₹{fmt(vol.team2?.back)}</span> },
                    { label: 'Lay', v1: <span className="text-[11px] text-[#ef4444]">₹{fmt(vol.team1?.lay)}</span>, v2: <span className="text-[11px] text-[#ef4444]">₹{fmt(vol.team2?.lay)}</span> },
                  ].map(({ label, v1, v2 }, i) => (
                    <div key={label} className={`grid grid-cols-3 gap-1 py-1.5 ${i !== 3 ? 'border-b border-[#2c2c2e]' : ''}`}>
                      <div className="text-[10px] text-[#8e8e93] flex items-center font-semibold">{label}</div>
                      <div className="text-center flex items-center justify-center">{v1}</div>
                      <div className="text-center flex items-center justify-center">{v2}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ━━━━━━━━━━ 10. SPOOFING DETECTOR ━━━━━━━━━━ */}
          <div className="rounded-2xl p-4" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-gray-300">Spoofing Detector</span>
              <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold border border-[#ef4444]/30 text-[#ef4444]">LIVE</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden flex mb-2" style={{ background: '#2c2c2e' }}>
              <div className="h-full bg-[#ef4444]" style={{ width: `${t1Pct}%` }} />
              <div className="h-full bg-[#10b981]" style={{ width: `${t2Pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-semibold mb-4">
              <span className="text-white">{t1}: {t1Pct.toFixed(1)}%</span>
              <span className="text-[#8e8e93]">{t2}: {t2Pct.toFixed(1)}%</span>
            </div>

            {/* Team cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[{ team: t1, fake: t1Fake, isMain: true }, { team: t2, fake: t2Fake, isMain: false }].map(({ team, fake, isMain }) => (
                <div key={team} className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                  <div className={`text-xs font-bold mb-3 truncate ${isMain ? 'text-white' : 'text-gray-400'}`}>{team}</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#8e8e93]">Fake Back</span>
                      </div>
                      <span className="text-[10px] font-bold text-white">{fmtVol(fake.fakeBack)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#8e8e93]">Fake Lay</span>
                      </div>
                      <span className="text-[10px] font-bold text-white">{fmtVol(fake.oppFakeLay)}</span>
                    </div>
                  </div>
                  <div className="border-t border-[#2c2c2e] mt-2 pt-2 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-[#8e8e93]">Total</span>
                    <span className={`text-xs font-bold ${isMain ? 'text-white' : 'text-[#8e8e93]'}`}>{fmtVol(fake.total)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom banner */}
            <div className="rounded-xl py-3 px-4 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
              <div className="text-[10px] font-bold tracking-widest text-[#8e8e93] uppercase mb-1">Most Fake Orders</div>
              <div className="text-sm font-bold text-white">{mostFakeTeam}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
