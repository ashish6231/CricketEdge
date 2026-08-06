import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from "recharts"
import TossDetail from './TossDetail'

import { useEffect, useState, useContext, useMemo } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Lock, BarChart3, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'
import { getCricketSnapshot, getTennisSnapshot, getTossSnapshot, getSessionTrades } from '../api'
import { predictTossWinner } from '../utils/tossPredictor'
import { predictMatchWinner } from '../utils/matchWinnerPredictor'
import { getBookiePl, calcBookiePlFromTrades } from '../utils/bookiePl'

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

// Fake volume from advancedMetricsV2 back/lay data (same as source site)
function calcFakeVolume(backVol, layVol) {
  const matched = Math.min(backVol, layVol)
  const fakeBack = backVol - matched
  const oppFakeLay = layVol - matched
  return { fakeBack, oppFakeLay, total: fakeBack + oppFakeLay }
}

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
  const { isLoggedIn } = useOutletContext()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showAdvancedGraph, setShowAdvancedGraph] = useState(false)
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(`tab_${matchId}`) || 'simple')

  const handleTabChange = (key) => {
    sessionStorage.setItem(`tab_${matchId}`, key)
    setActiveTab(key)
  }
  const [timeFilter, setTimeFilter] = useState('all')
  const [marketType, setMarketType] = useState('match_odds')
  const [showMarketMenu, setShowMarketMenu] = useState(false)
  const [tossSnapshot, setTossSnapshot] = useState(null)
  const [sessionTrades, setSessionTrades] = useState([])
  const [activeSessions, setActiveSessions] = useState([])

  const isSessionMarket = marketType.startsWith('session_')
  const selectedSessionName = isSessionMarket ? marketType.replace('session_', '') : ''
  const selectedSessionTrades = isSessionMarket ? sessionTrades.filter(t => t.team === selectedSessionName) : []

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

    const applySessionData = (sessionData) => {
      if (!sessionData?.trades) return
      setSessionTrades(sessionData.trades)
      let activeSessionNames = []
      if (sessionData.odds?.length > 0) {
        activeSessionNames = [...new Set(sessionData.odds.map(o => o.marketName))]
      } else if (sessionData.markets?.length > 0) {
        activeSessionNames = [...new Set(sessionData.markets.map(m => m.marketName))]
      } else {
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
    }

    const fetchData = (isInitial = false) => {
      if (isInitial) {
        setLoading(true)
        setFetchError(null)
        setRequiresLogin(false)
        setRequiresPro(false)
        setSnapshot(null)
        setTossSnapshot(null)
      }

      // Main snapshot first — don't wait for toss/session (they load in background)
      apiFn(matchId)
        .then(data => {
          if (cancelled) return
          if (data?.error === 'login_required') {
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
          if (err?.code === 'SUBSCRIPTION_REQUIRED' || err?.status === 403) {
            setRequiresPro(true)
          } else if (isInitial) {
            setFetchError(err?.detail || 'Network error — dubara try karo')
          }
          if (isInitial) setLoading(false)
        })

      fetchSecondary()
    }

    fetchData(true)
    const interval = setInterval(() => fetchData(false), 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [matchId, sport, isLoggedIn])

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
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="rounded-2xl p-8 max-w-md text-center" style={{ background: '#111111', border: '1px solid #2c2c2e', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div className="text-xs text-text-muted mb-4">
            📅 {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} &nbsp;⏰ {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="p-4 rounded-2xl border mb-4 inline-block" style={{ background: 'rgba(220,38,38,0.15)', borderColor: '#3a3a3c' }}><Lock className="h-8 w-8 text-primary" /></div>
          <h2 className="text-xl font-bold text-text-primary mb-2">🔒 Login Zaruri Hai</h2>
          <p className="text-text-secondary mb-4">Live/upcoming match ka data dekhne ke liye login karo.</p>
          <p className="text-text-muted text-xs mb-6">Account ke liye Telegram: <span className="text-[#229ED9]">@CricketMan2026</span></p>
          <div className="flex gap-3">
            <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-text-secondary text-sm font-medium" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>← Wapas</button>
            <button onClick={() => {
              window.dispatchEvent(new CustomEvent('open-login-modal'))
            }} className="px-6 py-2 text-white rounded-xl font-semibold text-sm" style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>🔑 Login karo</button>
          </div>
        </div>
      </div>
    )
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

  const t1 = snapshot.teamNames?.[0] || 'Team 1'
  const t2 = snapshot.teamNames?.[1] || 'Team 2'
  const dm = snapshot.deepMetrics || {}
  const t1Trades = (snapshot.teams?.[t1] || {}).trades || []
  const t2Trades = (snapshot.teams?.[t2] || {}).trades || []

  const getLatestOdds = (trades) => {
    const sorted = [...trades].sort((a, b) => b.updatedAt - a.updatedAt)
    const back = sorted.find(t => t.type === 'back')?.price
    const lay = sorted.find(t => t.type === 'lay')?.price
    return { back, lay }
  }
  const t1Odds = getLatestOdds(t1Trades)
  const t2Odds = getLatestOdds(t2Trades)
  const am1 = snapshot.advancedMetrics?.team1 || {}
  const am2 = snapshot.advancedMetrics?.team2 || {}
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

  const { pl1, pl2 } = getBookiePl(snapshot, t1, t2)
  const dpl1 = dp.team1_win
  const dpl2 = dp.team2_win

  // ━━━━━━━━━━ BACK/LAY RATIO BASED PREDICTION ━━━━━━━━━━
  const raw = dm.raw || {}
  const aBack = am1.back || 0
  const aLay = am1.lay || 0
  const bBack = am2.back || 0
  const bLay = am2.lay || 0

  // lay/back ratio — >1 means lay dominant = bookie team (predicted winner)
  const aRatio = aLay > 0 ? aBack / aLay : 0
  const bRatio = bLay > 0 ? bBack / bLay : 0
  // back/lay < 1 means lay dominant = bookie team
  const bookieTeam = aRatio <= bRatio ? t1 : t2
  const publicTeam = aRatio <= bRatio ? t2 : t1
  const bookieRatioVal = Math.min(aRatio || 999, bRatio || 999)
  const bookieRatio = bookieRatioVal === 999 ? 0 : bookieRatioVal
  const signalStrength = bookieRatio < 0.5 ? 'Strong 🔥' : bookieRatio < 0.8 ? 'Moderate' : 'Weak'
  const signalColor = bookieRatio < 0.5 ? 'text-profit' : bookieRatio < 0.8 ? 'text-yellow-500' : 'text-text-muted'
  const aTotal = aBack + aLay
  const bTotal = bBack + bLay
  const aBackPct = aTotal > 0 ? (aBack / aTotal * 100) : 50
  const bBackPct = bTotal > 0 ? (bBack / bTotal * 100) : 50

  const matchWinnerPrediction = predictMatchWinner(snapshot)
  const predictedMatchWinner = matchWinnerPrediction?.winnerName || bookieTeam
  const matchWinnerReason = matchWinnerPrediction?.reason || 'Bookie back/lay ratio'
  const hasBLPrediction = aBack > 0 || aLay > 0 || bBack > 0 || bLay > 0 || !!matchWinnerPrediction

  const ip = snapshot.inPlayPnl || {}
  const ib = snapshot.inPlayTotalBets || {}
  const pp = snapshot.preMatchPnl || {}
  const pb = snapshot.preMatchTotalBets || {}
  const iv = snapshot.inPlayVolume || {}
  const pv = snapshot.preMatchVolume || {}
  const sup = snapshot.supportMetrics || {}
  const ml = snapshot.matchLoadV2 || {}
  const am = snapshot.advancedMetrics || {}
  const sig = snapshot.marketSignals || {}
  const trap = sig.trap || {}
  const exp = snapshot.bookmakerExposure || {}
  const exp1 = exp.team1 || {}
  const exp2 = exp.team2 || {}
  const sent = snapshot.sentimentScore || {}
  const ns = snapshot.netSupport || {}

  // ━━━━━━━━━━ 5-RULE BOOKIE FINGERPRINT ━━━━━━━━━━
  const bkp = (() => {
    const totalBets1 = dm.totals?.totalBetTeam1 ?? ((ib.team1 || 0) + (pb.team1 || 0))
    const totalBets2 = dm.totals?.totalBetTeam2 ?? ((ib.team2 || 0) + (pb.team2 || 0))
    const sent1 = ns.percentageA ?? (sup.team1?.support ?? 50)
    const sent2 = ns.percentageB ?? (sup.team2?.support ?? 50)
    const netExp1 = Math.abs(exp1.netExposure || 0)
    const netExp2 = Math.abs(exp2.netExposure || 0)
    const isWomens = /women/i.test(snapshot.competitionName || '') ||
      [t1, t2].some(name => /\bW\b/.test(name) || /\(W\)/i.test(name))

    // Exposure override: agar exposure negative hai BUT ratio 2x+ aur bets 1.5x+ hain
    // toh yeh public noise hai, bookie signal nahi — exposure weight 0 karo
    const exp1Net = exp1.netExposure || 0
    const exp2Net = exp2.netExposure || 0
    const t1HasMoreNegExp = exp1Net < exp2Net  // t1 zyada negative
    const t2HasMoreNegExp = exp2Net < exp1Net  // t2 zyada negative
    const exposedTeamRatio = t1HasMoreNegExp ? aRatio : bRatio
    const nonExposedTeamRatio = t1HasMoreNegExp ? bRatio : aRatio
    const exposedTeamBets = t1HasMoreNegExp ? totalBets1 : totalBets2
    const nonExposedTeamBets = t1HasMoreNegExp ? totalBets2 : totalBets1
    const noExposureData = exp1Net === 0 && exp2Net === 0
    const isExposureMisleading =
      noExposureData || (
        (t1HasMoreNegExp || t2HasMoreNegExp) &&
        nonExposedTeamRatio > 0 &&
        exposedTeamRatio / (nonExposedTeamRatio || 1) >= 2 &&
        exposedTeamBets / (nonExposedTeamBets || 1) >= 1.5
      )

    // Weighted scoring: exposure=3, ratio=1.5, total bets=1
    const rules = [
      { label: 'Zyada Negative Exposure', weight: isExposureMisleading ? 0 : 3, t1wins: exp1Net < exp2Net, v1: fmtRs(exp1Net), v2: fmtRs(exp2Net), overridden: isExposureMisleading },
      { label: 'Kam Back/Lay Ratio', weight: 1.5, t1wins: aRatio < bRatio, v1: `${aRatio.toFixed(2)}x`, v2: `${bRatio.toFixed(2)}x` },
      { label: 'Kam Total Bets', weight: 1, t1wins: totalBets1 < totalBets2, v1: `₹${fmt(totalBets1)}`, v2: `₹${fmt(totalBets2)}` },
    ]

    const maxScore = rules.reduce((s, r) => s + r.weight, 0)
    const t1Score = rules.reduce((s, r) => s + (r.t1wins ? r.weight : 0), 0)
    const t2Score = rules.reduce((s, r) => s + (!r.t1wins ? r.weight : 0), 0)
    const bookieIdx = t1Score >= t2Score ? 0 : 1
    const matchedRules = rules.filter((r, _) => bookieIdx === 0 ? r.t1wins : !r.t1wins).length
    const totalRules = rules.filter(r => r.weight > 0).length
    const matchScore = matchedRules
    const confidence = matchedRules === totalRules ? { label: '99% Confirmed 🔥', color: 'text-profit' }
      : matchedRules >= totalRules * 0.7 ? { label: '90% Strong ⚡', color: 'text-profit' }
        : matchedRules >= totalRules * 0.4 ? { label: '70% Moderate', color: 'text-yellow-500' }
          : { label: 'Weak Signal', color: 'text-text-muted' }
    return {
      bookieName: bookieIdx === 0 ? t1 : t2,
      matchScore,
      maxScore,
      totalRules,
      confidence,
      bookieIdx,
      isWomens,
      rules: rules.map(r => ({ ...r, bookieWins: bookieIdx === 0 ? r.t1wins : !r.t1wins }))
    }
  })()

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
  const tossM1 = tossSnap?.advancedMetricsV2?.team1
  const tossM2 = tossSnap?.advancedMetricsV2?.team2
  const tossS1 = tossSnap?.syntheticSupport?.teamA
  const tossS2 = tossSnap?.syntheticSupport?.teamB
  const tossSup1 = tossSnap?.supportMetrics?.team1
  const tossSup2 = tossSnap?.supportMetrics?.team2

  const tossT1GraphData = tossSnap ? processTeamData(tossT1Name, tossSnap?.teams?.[tossT1Name], effectiveTimeFilter) : null
  const tossT2GraphData = tossSnap ? processTeamData(tossT2Name, tossSnap?.teams?.[tossT2Name], effectiveTimeFilter) : null
  const tossMarketVol = (tossT1GraphData?.totalBet || 0) + (tossT2GraphData?.totalBet || 0)
  const tossT1PctVol = tossMarketVol > 0 ? ((tossT1GraphData?.totalBet || 0) / tossMarketVol) * 100 : 50
  const tossT2PctVol = tossMarketVol > 0 ? ((tossT2GraphData?.totalBet || 0) / tossMarketVol) * 100 : 50

  const tossPrediction = tossSnap ? predictTossWinner(tossSnap) : null
  const predictedTossWinner = tossPrediction?.winnerName || 'Waiting for more data...'
  const tossPredictionReason = tossPrediction?.reason || ''

  // Betfair bookie P/L — prefer API simplePL; fallback to trade calc (same formula as TossDetail)
  if (t1GraphData && t2GraphData) {
    const calc = calcBookiePlFromTrades(
      snapshot?.teams?.[t1]?.trades || [],
      snapshot?.teams?.[t2]?.trades || [],
    )
    t1GraphData.bookieProfitIfWins = calc.team1Win
    t2GraphData.bookieProfitIfWins = calc.team2Win

    // All-time match odds: use server-side simplePL (authoritative)
    if (marketType === 'match_odds' && timeFilter === 'all') {
      t1GraphData.bookieProfitIfWins = pl1 ?? t1GraphData.bookieProfitIfWins
      t2GraphData.bookieProfitIfWins = pl2 ?? t2GraphData.bookieProfitIfWins
    }
  }
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
        <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
          {[
            { key: 'simple', label: 'Simple Book' },
            { key: 'graph', label: 'Graphs', icon: <BarChart3 size={11} /> },
            (tossM1 && tossM2) ? { key: 'toss', label: 'Toss' } : null,
            { key: 'session', label: 'Session' },
          ].filter(Boolean).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === key ? 'text-white' : 'text-[#8e8e93] hover:text-white'
              }`}
              style={activeTab === key ? {
                background: key === 'graph' ? 'linear-gradient(135deg,#2563eb,#3b82f6)'
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
                {snapshot.serverTime && ` · ${new Date(snapshot.serverTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(snapshot.serverTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
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
              {/* Match Odds Total Bar */}
              <div className="mb-6 mt-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-white font-bold text-base tracking-wide">Match Odds</h2>
                </div>

                {/* Progress Bar (White vs Dark Grey) */}
                <div className="h-[6px] w-full bg-[#2c2c2e] mb-3 flex rounded-sm">
                  <div className="bg-white h-full transition-all duration-500 rounded-l-sm" style={{ width: `${t1PctVol}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-[#8e8e93] tracking-wide">
                  <span>{t1GraphData?.name} <span className="text-white ml-1">{t1PctVol.toFixed(0)}%</span></span>
                  <span>{t2GraphData?.name} <span className="text-white ml-1">{t2PctVol.toFixed(0)}%</span></span>
                </div>
              </div>

              {/* Side by Side Grid for Team Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">
                <TeamCard teamData={t1GraphData} isToss={false} marketVol={marketVol} />
                <TeamCard teamData={t2GraphData} isToss={false} marketVol={marketVol} />
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'toss' ? (
        <div className="space-y-4">
          {tossM1 && tossM2 ? (
            <>
              {/* Toss Odds Total Bar */}
              <div className="mb-6 mt-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-white font-bold text-base tracking-wide">Toss Odds</h2>
                </div>

                {/* Progress Bar (White vs Dark Grey) */}
                <div className="h-[6px] w-full bg-[#2c2c2e] mb-3 flex rounded-sm">
                  <div className="bg-white h-full transition-all duration-500 rounded-l-sm" style={{ width: `${tossT1PctVol}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-[#8e8e93] tracking-wide">
                  <span>{tossT1Name} <span className="text-white ml-1">{tossT1PctVol.toFixed(0)}%</span></span>
                  <span>{tossT2Name} <span className="text-white ml-1">{tossT2PctVol.toFixed(0)}%</span></span>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                <div className="px-4 py-3 flex items-center justify-start border-b border-[#2c2c2e]">
                  <span className="text-sm font-bold text-white flex items-center gap-2"><TrendingUp size={15} className="text-[#a855f7]" /> CricketEdge Toss Winner</span>
                </div>
                <div className="p-4">
                  <div className="rounded-xl p-4 text-center mb-5 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                    <div className="text-2xl font-black text-[#10b981] mb-1">{predictedTossWinner}</div>
                    <div className="text-[10px] text-[#8e8e93]">{tossPredictionReason || 'Analyzing market signals...'} • Not guaranteed</div>
                  </div>
                  <div className="px-1">
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      <div />
                      <div className="text-center text-[10px] font-bold text-[#8e8e93] truncate">{tossT1Name}</div>
                      <div className="text-center text-[10px] font-bold text-[#8e8e93] truncate">{tossT2Name}</div>
                    </div>
                    {[
                      { label: 'Back Val', v1: <span className="text-[11px] text-[#3b82f6] font-bold">₹{formatVolStr(tossM1.back)}</span>, v2: <span className="text-[11px] text-[#3b82f6] font-bold">₹{formatVolStr(tossM2.back)}</span> },
                      { label: 'Lay Liab', v1: <span className="text-[11px] text-[#ef4444] font-bold">₹{formatVolStr(tossM1.lay)}</span>, v2: <span className="text-[11px] text-[#ef4444] font-bold">₹{formatVolStr(tossM2.lay)}</span> },
                      { label: 'Total Bet', v1: <span className="text-[11px] text-white font-bold">₹{formatVolStr(tossM1.totalBet)}</span>, v2: <span className="text-[11px] text-white font-bold">₹{formatVolStr(tossM2.totalBet)}</span> },
                      { label: 'Lay Trades', v1: <span className="text-[11px] text-white font-bold">{tossS1?.tradeCount ?? '—'}</span>, v2: <span className="text-[11px] text-white font-bold">{tossS2?.tradeCount ?? '—'}</span> },
                      { label: 'Support %', v1: <span className="text-[11px] font-bold" style={{color:(tossSup1?.support??0)>(tossSup2?.support??0)?'#10b981':'#8e8e93'}}>{tossSup1?tossSup1.support.toFixed(1)+'%':'—'}</span>, v2: <span className="text-[11px] font-bold" style={{color:(tossSup2?.support??0)>(tossSup1?.support??0)?'#10b981':'#8e8e93'}}>{tossSup2?tossSup2.support.toFixed(1)+'%':'—'}</span> },
                      { label: 'B/L Ratio', v1: <span className="text-[11px] text-[#10b981] font-bold">{tossM1.lay>0?(tossM1.back/tossM1.lay).toFixed(2):'—'}</span>, v2: <span className="text-[11px] text-[#10b981] font-bold">{tossM2.lay>0?(tossM2.back/tossM2.lay).toFixed(2):'—'}</span> },
                    ].map(({ label, v1, v2 }, i, arr) => (
                      <div key={label} className={`grid grid-cols-3 gap-1 py-1.5 ${i !== arr.length - 1 ? 'border-b border-[#2c2c2e]' : ''}`}>
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
            <div className="flex h-[40vh] items-center justify-center text-center">
              <div className="text-3xl mb-3">🪙</div>
              <p className="text-[#8e8e93] text-sm mt-2">No toss data available</p>
            </div>
          )}
        </div>
      ) : activeTab === 'session' ? (
        <div className="space-y-3">
          {activeSessions.length > 0 ? activeSessions.map(sessionName => {
            const trades = sessionTrades.filter(t => t.team === sessionName)
            const lineMap = {}
            trades.forEach(t => {
              const p = t.price
              if (!lineMap[p]) lineMap[p] = { price: p, yes: 0, no: 0 }
              if (t.type === 'back') lineMap[p].yes += t.size
              else lineMap[p].no += t.size
            })
            const lines = Object.values(lineMap).sort((a, b) => a.price - b.price)
            const bestYes = lines.reduce((best, l) => l.yes > 0 ? l.price : best, null)
            const bestNo = lines.reduce((best, l) => l.no > 0 ? l.price : best, null)
            const predicted = bestYes != null && bestNo != null ? Math.round((bestYes + bestNo) / 2 * 2) / 2 : bestYes ?? bestNo

            // Bookie P/L at each run score using Betfair formula:
            // score > line.price → yes wins: back loses (-yes), lay wins (+no)
            // score <= line.price → no wins: back wins (+yes), lay loses (-no)
            const calcPlAtScore = (score) => lines.reduce((pl, l) => {
              return score > l.price
                ? pl - l.yes + l.no
                : pl + l.yes - l.no
            }, 0)

            const allPrices = lines.map(l => l.price)
            const minScore = allPrices.length ? Math.floor(Math.min(...allPrices)) - 1 : 0
            const maxScore = allPrices.length ? Math.ceil(Math.max(...allPrices)) + 1 : 0
            const plRows = []
            for (let s = minScore; s <= maxScore; s++) plRows.push({ score: s, pl: calcPlAtScore(s) })
            const bestPlRow = plRows.reduce((best, r) => r.pl > best.pl ? r : best, plRows[0] || { score: 0, pl: 0 })

            return (
              <div key={sessionName} className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                <div className="px-4 py-2.5 border-b border-[#2c2c2e]">
                  <span className="text-xs font-bold text-white">{sessionName}</span>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg p-2 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                      <div className="text-[10px] text-[#8e8e93] mb-0.5">Best Yes</div>
                      <div className="text-sm font-bold text-[#3b82f6]">{bestYes ?? '—'}</div>
                    </div>
                    <div className="rounded-lg p-2 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                      <div className="text-[10px] text-[#8e8e93] mb-0.5">Predicted</div>
                      <div className="text-sm font-bold text-white">~{predicted ?? '—'}</div>
                    </div>
                    <div className="rounded-lg p-2 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                      <div className="text-[10px] text-[#8e8e93] mb-0.5">Best No</div>
                      <div className="text-sm font-bold text-[#ef4444]">{bestNo ?? '—'}</div>
                    </div>
                  </div>

                  {/* Bookie P/L by score */}
                  {plRows.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-[#8e8e93] font-bold uppercase tracking-wide">Bookie P/L by Score</span>
                        <span className="text-[10px] text-[#10b981] font-bold">Best: {bestPlRow.score} runs ({fmtRs(bestPlRow.pl)})</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto rounded-lg" style={{ border: '1px solid #2c2c2e' }}>
                        <div className="grid grid-cols-2 text-[10px] text-[#8e8e93] font-semibold px-2 py-1 border-b border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
                          <span>Score</span><span className="text-right">Bookie P/L</span>
                        </div>
                        {plRows.map(r => (
                          <div key={r.score} className={`grid grid-cols-2 text-[10px] px-2 py-1 border-b border-[#2c2c2e]/30 ${r.score === bestPlRow.score ? 'bg-[#10b981]/10' : ''}`}>
                            <span className={`font-bold ${r.score === bestPlRow.score ? 'text-[#10b981]' : 'text-white'}`}>{r.score}</span>
                            <span className={`text-right font-bold ${r.pl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{fmtRs(r.pl)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lines.length > 0 && (
                    <div className="max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-3 text-[10px] text-[#8e8e93] font-semibold pb-1 border-b border-[#2c2c2e] mb-1">
                        <span>Price</span><span className="text-center text-[#3b82f6]">Yes</span><span className="text-right text-[#ef4444]">No</span>
                      </div>
                      {lines.map(l => (
                        <div key={l.price} className="grid grid-cols-3 text-[10px] py-1 border-b border-[#2c2c2e]/30">
                          <span className="text-white font-bold">{l.price}</span>
                          <span className="text-center text-[#3b82f6]">{l.yes > 0 ? formatVolStr(l.yes) : '—'}</span>
                          <span className="text-right text-[#ef4444]">{l.no > 0 ? formatVolStr(l.no) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          }) : (
            <div className="flex h-[40vh] items-center justify-center text-center">
              <div className="text-3xl mb-3">📊</div>
              <p className="text-[#8e8e93] text-sm mt-2">No session data available</p>
            </div>
          )}
        </div>
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
              {/* ━━━━━━━━━━ 1. MATCH HEADER + ODDS + P/L ━━━━━━━━━━ */}
              <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                {/* Date / Title */}
                <div className="px-5 pt-4 pb-3" style={{ background: '#111111', borderBottom: '1px solid #2c2c2e' }}>
                  {snapshot.serverTime && (
                    <div className="text-xs text-[#8e8e93] mb-1">
                      📅 {new Date(snapshot.serverTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} &nbsp;⏰ {new Date(snapshot.serverTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <h1 className="text-lg font-bold text-white">{t1} vs {t2}</h1>
                    {snapshot.inPlay && <span className="text-[#3b82f6] text-xs font-bold flex items-center gap-1 shrink-0"><span className="pulse-dot h-2 w-2 rounded-full bg-[#3b82f6]" /> LIVE</span>}
                  </div>
                  {snapshot.competitionName && <div className="text-xs text-[#8e8e93] mt-0.5">{snapshot.competitionName}</div>}
                </div>

                {/* Odds */}
                <div className="grid grid-cols-2 divide-x divide-[#2c2c2e]" style={{ borderBottom: '1px solid #2c2c2e' }}>
                  {[{ name: t1, odds: t1Odds }, { name: t2, odds: t2Odds }].map(({ name, odds }) => (
                    <div key={name} className="px-3 py-2.5">
                      <div className="text-xs font-semibold text-gray-300 truncate mb-1.5">{name}</div>
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-lg py-1.5 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                          <div className="text-[10px] text-[#8e8e93]">Back</div>
                          <div className="text-sm font-bold text-[#3b82f6]">{odds.back ?? '—'}</div>
                        </div>
                        <div className="flex-1 rounded-lg py-1.5 text-center border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                          <div className="text-[10px] text-[#8e8e93]">Lay</div>
                          <div className="text-sm font-bold text-[#ef4444]">{odds.lay ?? '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* P/L */}
                {pl1 != null && pl2 != null && (
                  <div className="p-4">
                    <div className="text-xs font-bold text-[#8e8e93] uppercase tracking-wider mb-2">Bookie P/L</div>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ name: t1, pl: pl1 }, { name: t2, pl: pl2 }].map(({ name, pl }) => (
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

              {/* ━━━━━━━━━━ 1b. MATCH WINNER PREDICTION ━━━━━━━━━━ */}
              {hasBLPrediction && (
                <div className="rounded-2xl p-5" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
                  <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#3b82f6]" /> Prediction
                  </div>

                  {/* Predicted Winner Banner */}
                  <div className="rounded-xl p-4 text-center mb-4 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                    <div className="text-xs text-[#8e8e93] uppercase tracking-widest mb-1">Predicted Winner</div>
                    <div className="text-xl font-bold text-white">{predictedMatchWinner}</div>
                    <div className="text-xs mt-1 text-[#8e8e93]">{matchWinnerReason} • Lower odds = favorite</div>
                    {matchWinnerPrediction?.odds && (
                      <div className="flex justify-center gap-4 mt-2 text-[10px] text-[#8e8e93]">
                        <span>{t1}: {matchWinnerPrediction.odds.recent.t1?.toFixed(2) ?? matchWinnerPrediction.odds.preMatch.t1?.toFixed(2) ?? '—'}</span>
                        <span>{t2}: {matchWinnerPrediction.odds.recent.t2?.toFixed(2) ?? matchWinnerPrediction.odds.preMatch.t2?.toFixed(2) ?? '—'}</span>
                      </div>
                    )}
                  </div>

                  {/* Back/Lay ratio bars — both teams */}
                  <div className="space-y-3 mb-4">
                    {[{ team: t1, backPct: aBackPct, ratio: aRatio, isBookie: aRatio <= bRatio },
                    { team: t2, backPct: bBackPct, ratio: bRatio, isBookie: bRatio < aRatio }]
                      .map(({ team, backPct, ratio, isBookie }) => (
                        <div key={team}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-gray-300">{team}</span>
                            <div className="flex items-center gap-2">
                              {isBookie && <span className="text-[10px] font-bold text-[#10b981] border border-[#10b981]/30 px-1.5 py-0.5 rounded">Bookie</span>}
                              <span className="text-xs text-[#8e8e93]">B/L: <b className="text-white">{ratio.toFixed(2)}x</b></span>
                            </div>
                          </div>
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#2c2c2e]">
                            <div className="bg-[#3b82f6] transition-all" style={{ width: `${backPct}%` }} />
                            <div className="bg-[#ef4444] transition-all" style={{ width: `${100 - backPct}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-[#8e8e93] mt-1">
                            <span className="text-[#3b82f6]">Back {backPct.toFixed(0)}%</span>
                            <span className="text-[#ef4444]">Lay {(100 - backPct).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Signal strength + logic */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                      <div className="text-xs text-[#8e8e93] mb-1">Signal Strength</div>
                      <div className="text-sm font-bold text-white">{signalStrength}</div>
                      <div className="text-xs text-[#8e8e93] mt-0.5">Ratio: {bookieRatio.toFixed(2)}x</div>
                    </div>
                    <div className="rounded-xl p-3 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                      <div className="text-xs text-[#8e8e93] mb-1">Public Team</div>
                      <div className="text-sm font-bold text-white">{publicTeam}</div>
                      <div className="text-[10px] text-[#8e8e93] mt-0.5">Highly backed</div>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}

          {/* ━━━━━━━━━━ 1b. BOOKIE FINGERPRINT (5 RULES) ━━━━━━━━━━ */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#111111', border: '1px solid #2c2c2e' }}>
            <div className="px-4 py-3 flex items-center gap-2 border-b border-[#2c2c2e]" style={{ background: '#111111' }}>
              <span className="text-sm font-bold text-white">Bookie Fingerprint</span>
              {bkp.isWomens && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#f472b6]/30 text-[#f472b6]">Women's</span>}
              <span className={`ml-auto text-xs font-bold ${bkp.confidence.color}`}>{bkp.confidence.label}</span>
            </div>

            <div className="p-4">
              {/* Winner banner */}
              <div className="rounded-xl p-3 text-center mb-4 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                <div className="text-xs text-[#8e8e93] uppercase tracking-widest mb-0.5">Predicted Team</div>
                <div className="text-xl font-bold text-white">{bkp.bookieName}</div>
                <div className="text-xs text-[#8e8e93] mt-0.5">{bkp.matchScore}/{bkp.totalRules} rules match</div>
              </div>

              {/* Rules checklist */}
              <div className="space-y-2">
                {bkp.rules.map((r, idx) => (
                  <div key={r.label} className="flex items-center gap-2 rounded-xl px-3 py-2 border border-[#2c2c2e]" style={{ background: '#1a1a1a' }}>
                    <span className="text-xs font-bold shrink-0" style={{ color: r.bookieWins ? '#10b981' : '#ef4444' }}>{r.bookieWins ? '✓' : '✗'} {r.label}{r.overridden ? ' ⚠️' : ''}</span>
                    <div className="flex-1 text-right">
                      <span className={`text-xs font-bold ${bkp.bookieIdx === 0 ? 'text-white' : 'text-[#8e8e93]'}`}>{r.v1}</span>
                      <span className="text-xs text-[#8e8e93] mx-1">vs</span>
                      <span className={`text-xs font-bold ${bkp.bookieIdx === 1 ? 'text-white' : 'text-[#8e8e93]'}`}>{r.v2}</span>
                    </div>
                  </div>
                ))}
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
                    { label: 'Bets', v1: <span className="text-[11px] text-[#8e8e93]">₹{fmt(bets.team1)}</span>, v2: <span className="text-[11px] text-[#8e8e93]">₹{fmt(bets.team2)}</span> },
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
