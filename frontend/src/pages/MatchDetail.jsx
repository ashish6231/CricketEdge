import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from "recharts"
import TossDetail from './TossDetail'

import { useEffect, useState, useContext, useMemo, useRef } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, BarChart3, ChevronDown, ChevronUp, TrendingUp, Radio, Trophy, Sparkles, Shield, Zap, Flame, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
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
import { startVisibleInterval, LIVE_POLL_MS, CREX_POLL_MS } from '../lib/visiblePoll'

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
  return `${sign}€${fmt(n)}`
}

const fmtTossRs = (n) => {
  if (n === null || n === undefined) return '—'
  const rounded = Math.round(Number(n))
  return `${rounded >= 0 ? '+' : ''}€${rounded.toLocaleString('en-IN')}`
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

const getPredictionVisuals = (pred) => {
  if (!pred) return null
  const tier = pred.tier

  if (tier === 'WOMENS_ASIA_CUP_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(20, 184, 166, 0.22) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(20, 184, 166, 0.5)',
      shadow: '0 8px 30px rgba(20, 184, 166, 0.2)',
      textColor: 'text-teal-400',
      badgeBg: 'bg-teal-400 text-black',
      tagText: "👩 WOMEN'S ASIA CUP (100% BACKTESTED)",
      pill: '100% Verified (9/9 Won)',
      desc: "Women's Asia Cup matches evaluate Pre-Match smart money inflow margins, dominant volume leadership, and bookmaker lay resistance. Verified 100% accuracy on tournament history.",
      meterPct: 100,
    }
  }

  if (tier === 'INTERNATIONAL_T20_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(16, 185, 129, 0.45)',
      shadow: '0 8px 30px rgba(16, 185, 129, 0.18)',
      textColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-400 text-black',
      tagText: '🌍 INTL T20 SPECIAL ALGO',
      pill: 'High Liquidity Flow',
      desc: 'International T20 matches rely on high-liquidity Pre-Match data. The AI evaluates Pre-Match Bookmaker P/L exposure, Smart Lay Pressure, and Public Overload Traps to predict the true winner.',
      meterPct: 92,
    }
  }

  if (tier === 'WCPL_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.22) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(236, 72, 153, 0.5)',
      shadow: '0 8px 30px rgba(236, 72, 153, 0.2)',
      textColor: 'text-pink-400',
      badgeBg: 'bg-pink-500 text-black',
      tagText: "👩 WCPL SPECIAL ALGO",
      pill: 'Dual Flow Margin',
      desc: "Women's Caribbean Premier League (WCPL) matches evaluate Pre-Match Lay Resistance Dumps, dual flow advantages, and smart money margins to predict the true winner.",
      meterPct: 95,
    }
  }

  if (tier === 'CPL_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(168, 85, 247, 0.45)',
      shadow: '0 8px 30px rgba(168, 85, 247, 0.18)',
      textColor: 'text-purple-400',
      badgeBg: 'bg-purple-400 text-black',
      tagText: '⚡ CPL BOOKIE TRAP FADE',
      pill: 'Public Trap Fade',
      desc: 'CPL matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.',
      meterPct: 90,
    }
  }

  if (tier === 'KERALA_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(20, 184, 166, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(20, 184, 166, 0.45)',
      shadow: '0 8px 30px rgba(20, 184, 166, 0.18)',
      textColor: 'text-teal-400',
      badgeBg: 'bg-teal-400 text-black',
      tagText: '🌴 KERALA T20 SPECIAL',
      pill: 'Dominant Inflow Leader',
      desc: 'Kerala matches evaluate Pre-Match Lay Resistance Dumps and Dominant Inflow Margins to identify the true market winner.',
      meterPct: 88,
    }
  }

  if (tier === 'DELHI_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(244, 63, 94, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(244, 63, 94, 0.45)',
      shadow: '0 8px 30px rgba(244, 63, 94, 0.18)',
      textColor: 'text-rose-400',
      badgeBg: 'bg-rose-500 text-black',
      tagText: '🇮🇳 DELHI T20 SPECIAL',
      pill: 'Bookie Trap Fade',
      desc: 'Delhi matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.',
      meterPct: 87,
    }
  }

  if (tier === 'UP_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(99, 102, 241, 0.45)',
      shadow: '0 8px 30px rgba(99, 102, 241, 0.18)',
      textColor: 'text-indigo-400',
      badgeBg: 'bg-indigo-400 text-black',
      tagText: '🇮🇳 UP T20 SPECIAL',
      pill: 'Engagement Margin',
      desc: 'Uttar Pradesh matches evaluate Pre-Match market activity engagement, smart volume accumulation, and bookmaker lay resistance to pinpoint the true winner.',
      meterPct: 89,
    }
  }

  if (tier === 'PUNJAB_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(245, 158, 11, 0.5)',
      shadow: '0 8px 30px rgba(245, 158, 11, 0.2)',
      textColor: 'text-amber-400',
      badgeBg: 'bg-amber-400 text-black',
      tagText: '🦁 SHER-E-PUNJAB ALGO',
      pill: 'Bookmaker Trap Alignment',
      desc: 'Sher-e-Punjab T20 matches strictly act as Bookie Traps. The AI strictly fades the heavy public money to pick the team with maximum bookmaker profitability.',
      meterPct: 91,
    }
  }

  if (tier === 'SRILANKA_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(234, 88, 12, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(234, 88, 12, 0.45)',
      shadow: '0 8px 30px rgba(234, 88, 12, 0.18)',
      textColor: 'text-orange-400',
      badgeBg: 'bg-orange-400 text-black',
      tagText: '🇱🇰 SRI LANKA MAJOR CLUBS',
      pill: 'Reversed Result Fade',
      desc: 'Sri Lanka Major Clubs T20 matches show a strong trend of reversed results. The AI strictly fades the public money to align with the bookmaker trap.',
      meterPct: 86,
    }
  }

  if (tier === 'ECS_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(14, 165, 233, 0.45)',
      shadow: '0 8px 30px rgba(14, 165, 233, 0.18)',
      textColor: 'text-sky-400',
      badgeBg: 'bg-sky-400 text-black',
      tagText: '🇪🇺 ECS SPECIAL ALGO',
      pill: 'High Odds Trap Fade',
      desc: 'European Cricket Series (ECS) matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.',
      meterPct: 88,
    }
  }

  if (tier === 'WOMENS_T20_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(217, 70, 239, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(217, 70, 239, 0.45)',
      shadow: '0 8px 30px rgba(217, 70, 239, 0.18)',
      textColor: 'text-fuchsia-400',
      badgeBg: 'bg-fuchsia-400 text-black',
      tagText: "👩 WOMEN'S T20 SPECIAL",
      pill: 'Smart Inflow Margin',
      desc: "Women's T20 matches evaluate Pre-Match smart money inflow margins and dual volume leadership to identify the true market winner.",
      meterPct: 90,
    }
  }

  if (tier === 'TNPL_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(234, 179, 8, 0.45)',
      shadow: '0 8px 30px rgba(234, 179, 8, 0.18)',
      textColor: 'text-amber-400',
      badgeBg: 'bg-amber-400 text-black',
      tagText: '🇮🇳 TNPL SPECIAL ALGO',
      pill: 'Bookie Trap Fade',
      desc: 'TNPL matches consistently act as Bookie Traps. The AI strictly fades the public money and picks the team that yields maximum profitability for the bookmaker.',
      meterPct: 89,
    }
  }

  if (tier === 'HUNDRED_SPECIAL') {
    return {
      gradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(6, 182, 212, 0.45)',
      shadow: '0 8px 30px rgba(6, 182, 212, 0.18)',
      textColor: 'text-cyan-400',
      badgeBg: 'bg-cyan-400 text-black',
      tagText: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 THE HUNDRED SPECIAL',
      pill: 'Volume Accumulation Margin',
      desc: 'The Hundred matches evaluate Pre-Match volume accumulation margins and dual volume advantages.',
      meterPct: 87,
    }
  }

  if (tier === 1) {
    return {
      gradient: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(13, 17, 23, 0.95) 100%)',
      border: 'rgba(234, 179, 8, 0.45)',
      shadow: '0 8px 30px rgba(234, 179, 8, 0.18)',
      textColor: 'text-amber-400',
      badgeBg: 'bg-amber-400 text-black',
      tagText: '⭐ TIER 1 PREDICTION (100% BACKTESTED)',
      pill: 'Triple Volume Alignment',
      desc: '100% backtested accuracy. PreMatch Back Volume, Lay Volume, and Liability all strongly align towards this team winning.',
      meterPct: 98,
    }
  }

  return {
    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.18) 0%, rgba(13, 17, 23, 0.95) 100%)',
    border: 'rgba(59, 130, 246, 0.4)',
    shadow: '0 8px 30px rgba(59, 130, 246, 0.15)',
    textColor: 'text-blue-400',
    badgeBg: 'bg-blue-400 text-black',
    tagText: '🎯 QUANT MARKET PREDICTION',
    pill: 'Volume Leadership Margin',
    desc: 'PreMatch market orderbook analysis shows a significant volume accumulation and odds resilience for this team.',
    meterPct: 82,
  }
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
    <div className="bg-[#0c101d] rounded-xl border border-[#1e2538] shadow-xl overflow-hidden mb-3.5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 sm:px-4 py-2.5 border-b border-[#1b2234] bg-[#0f1422]/60">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] shrink-0" />
          <div className="font-bold text-white text-sm sm:text-base tracking-tight truncate">{teamData.name}</div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
          <div className={`text-[11px] flex items-center gap-1 font-bold px-2 py-0.5 rounded-md ${
            teamData.trend === 'Rising' ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' : teamData.trend === 'Dropping' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-slate-400 bg-slate-800/40 border border-slate-700/30'
          }`}>
            {teamData.trend === 'Rising' ? <TrendingUp size={11} /> : teamData.trend === 'Dropping' ? <TrendingUp size={11} className="rotate-180" /> : <span>—</span>}
            <span>Odds {teamData.trend}</span>
          </div>
          <div className="flex bg-[#07090e] rounded-lg p-0.5 border border-[#1e273b]">
            <button onClick={() => setActiveTab('volume')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${activeTab === 'volume' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>Chart</button>
            <button onClick={() => setActiveTab('time')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${activeTab === 'time' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>History</button>
            <button onClick={() => setActiveTab('book')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${activeTab === 'book' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>Order Book</button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-3 sm:p-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-medium">Odds Range</span>
            <div className="text-right">
              <span className="text-slate-500 text-[11px] mr-1">L:</span>
              <span className="text-white text-xs font-mono font-bold">{formatOdds(teamData.low)}</span>
              <span className="text-slate-600 text-xs mx-1">|</span>
              <span className="text-slate-500 text-[11px] mr-1">H:</span>
              <span className="text-white text-xs font-mono font-bold">{formatOdds(teamData.high)}</span>
            </div>
          </div>

          <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-medium">Last Price Matched</span>
            <span className="text-emerald-400 text-xs font-mono font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">{formatOdds(teamData.lastPrice)}</span>
          </div>

          <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
            <span className="text-slate-400 text-[11px] font-medium">Market Vol / Selection</span>
            <div className="text-right">
              <span className="text-slate-300 text-xs font-bold font-mono">€{formatVolStr(teamData.totalBet)}</span>
              <span className="text-slate-500 text-[10px] ml-1 font-mono">/ €{formatVolStr(marketVol)}</span>
            </div>
          </div>

          {!isSession ? (
            <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
              <span className="text-slate-400 text-[11px] font-medium">Bookie P/L</span>
              <span className={`text-xs font-mono font-bold px-1.5 py-0.2 rounded ${pl >= 0 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25' : 'text-rose-400 bg-rose-500/10 border border-rose-500/25'}`}>
                {pl >= 0 ? '+' : ''}€{formatVolStr(pl)}
              </span>
            </div>
          ) : (
            <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
              <span className="text-slate-400 text-[11px] font-medium">Market Type</span>
              <span className="text-blue-400 text-xs font-bold">Session Market</span>
            </div>
          )}

          {isToss && (
            <>
              <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
                <span className="text-slate-400 text-[11px] font-medium">Back Stake</span>
                <span className="text-sky-400 text-xs font-mono font-bold">€{formatVolStr(teamData.totalBack)}</span>
              </div>
              <div className="bg-[#080b14] border border-[#1b2234] rounded-lg p-2 flex justify-between items-center">
                <span className="text-slate-400 text-[11px] font-medium">Lay Stake</span>
                <span className="text-rose-400 text-xs font-mono font-bold">€{formatVolStr(teamData.totalLay)}</span>
              </div>
            </>
          )}
        </div>
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
  const { isLoggedIn } = useOutletContext()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [showAdvancedGraph, setShowAdvancedGraph] = useState(false)
  const [crexData, setCrexData] = useState(null)
  const crexDataRef = useRef(null)
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
            if (bundle?.toss && !bundle.toss.error) {
              setTossSnapshot(bundle.toss)
            } else if (sport === 'cricket') {
              getTossSnapshot(matchId).catch(() => null).then(tossData => {
                if (cancelled || !tossData || tossData.error) return
                setTossSnapshot(tossData)
              })
            }
            if (bundle?.session) applySessionData(bundle.session)
            if (sport === 'cricket') {
              if (bundle?.crex) {
                crexDataRef.current = bundle.crex
                setCrexData(bundle.crex)
              } else if (data?.crex) {
                crexDataRef.current = data.crex
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

    // Dedicated fast CREX poll — runs independently so scores update without waiting for bundle
    let crexCancelled = false
    const stopCrexPoll = sport === 'cricket'
      ? startVisibleInterval(() => {
        if (crexCancelled) return
        getCrexMatchDetail(matchId).catch(() => null).then(res => {
          if (crexCancelled || !res?.crex) return
          crexDataRef.current = res.crex
          setCrexData(res.crex)
        })
      }, CREX_POLL_MS)
      : () => { }

    return () => { cancelled = true; crexCancelled = true; stopPoll(); stopCrexPoll() }
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

  const tossTrades1 = (tossSnap?.teams?.[tossT1Name] || {}).trades || []
  const tossTrades2 = (tossSnap?.teams?.[tossT2Name] || {}).trades || []
  const { pl1: tossT1BookiePL, pl2: tossT2BookiePL, source: tossPlSource } = tossSnap
    ? getBookiePl(tossSnap, tossT1Name, tossT2Name)
    : {}

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
  if (tossT1GraphData) tossT1GraphData.bookieProfitIfWins = tossT1BookiePL
  if (tossT2GraphData) tossT2GraphData.bookieProfitIfWins = tossT2BookiePL
  const marketVol = (t1GraphData?.totalBet || 0) + (t2GraphData?.totalBet || 0)
  const t1PctVol = marketVol > 0 ? ((t1GraphData?.totalBet || 0) / marketVol) * 100 : 50
  const t2PctVol = marketVol > 0 ? ((t2GraphData?.totalBet || 0) / marketVol) * 100 : 50


  return (
    <div className="p-2 sm:p-3 md:p-4 w-full fade-in stagger space-y-2.5 sm:space-y-3">

      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-2.5 sticky top-0 py-1.5 z-30 -mx-2 sm:-mx-3 md:-mx-4 px-2 sm:px-3 md:px-4 border-b border-[#1f2638] backdrop-blur-xl bg-[#080a12]/90 shadow-md">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 hover:text-white bg-[#141824] hover:bg-[#1a2030] border border-[#222a3e] transition-all shadow-sm"
        >
          <ArrowLeft size={13} /> <span>Back</span>
        </button>

        <div className="flex rounded-lg p-0.5 gap-1 overflow-x-auto max-w-[calc(100vw-90px)] bg-[#10131e] border border-[#1f273b]">
          {[
            { key: 'simple', label: 'Simple Book' },
            { key: 'graph', label: 'Graphs', icon: <BarChart3 size={11} /> },
            sport === 'cricket' && crexData ? { key: 'crex', label: 'Live & Commentary', icon: <Radio size={11} className="text-red-400 animate-pulse" /> } : null,
            sport === 'cricket' && hasTossData ? { key: 'toss', label: 'Toss Market' } : null,
          ].filter(Boolean).map(({ key, label, icon }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                style={isActive ? {
                  background: key === 'graph' ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)'
                    : key === 'crex' ? 'linear-gradient(135deg,#059669,#10b981)'
                      : key === 'toss' ? 'linear-gradient(135deg,#7c3aed,#a855f7)'
                        : key === 'session' ? 'linear-gradient(135deg,#b45309,#f59e0b)'
                          : 'linear-gradient(135deg,#dc2626,#ea580c)'
                } : {}}
              >
                {icon}{label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Live Scorecard Hero Banner — cricket only ── */}
      {sport === 'cricket' && activeTab !== 'toss' && <CrexScorecardBanner crexData={crexData} t1={t1} t2={t2} />}

      {activeTab === 'graph' ? (
        <div className="w-full bg-[#0a0d16] border border-[#1b2234] min-h-screen p-3.5 sm:p-6 -mx-3 sm:mx-0 rounded-2xl font-sans shadow-2xl">
          {/* Top Header Row */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 mb-6 sm:mb-8">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-white text-lg sm:text-2xl font-black tracking-tight">{t1} vs {t2}</h1>
                <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 border border-rose-500/30">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                  LIVE
                </span>
              </div>
              <div className="text-slate-400 text-xs sm:text-[13px] mt-1 font-medium tracking-wide">
                {snapshot.competitionName || 'Cricket Match'}
                {matchSchedule && ` · ${matchSchedule.label}`}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
              <div className="flex bg-[#07090e] p-0.5 rounded-xl border border-[#1e273b]">
                <button onClick={() => setTimeFilter('all')} className={`px-2.5 sm:px-3 py-1.5 text-xs rounded-lg font-bold transition-all ${timeFilter === 'all' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>All</button>
                <button onClick={() => setTimeFilter('3h')} className={`px-2.5 sm:px-3 py-1.5 text-xs rounded-lg font-bold transition-all ${timeFilter === '3h' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>3H</button>
                <button onClick={() => setTimeFilter('1h')} className={`px-2.5 sm:px-3 py-1.5 text-xs rounded-lg font-bold transition-all ${timeFilter === '1h' ? 'bg-[#1e273d] text-white shadow' : 'text-slate-400 hover:text-white'}`}>1H</button>
              </div>
              <div className="relative">
                <div
                  onClick={() => setShowMarketMenu(!showMarketMenu)}
                  className="bg-[#0e121e] text-white text-xs sm:text-[13px] px-3.5 py-2 rounded-xl border border-[#1f273b] flex items-center gap-3 cursor-pointer font-semibold shadow-sm hover:bg-[#151b2c] transition-colors"
                >
                  <span className="truncate max-w-[120px]">{marketType.startsWith('session_') ? marketType.replace('session_', '') : 'Match Odds'}</span>
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                </div>
                {showMarketMenu && (
                  <div className="absolute top-full right-0 mt-2 w-44 bg-[#0e1320] border border-[#222b40] rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                    <div
                      onClick={() => { setMarketType('match_odds'); setShowMarketMenu(false); }}
                      className="px-4 py-2.5 text-xs sm:text-[13px] font-bold text-white hover:bg-white/5 cursor-pointer"
                    >
                      Match Odds
                    </div>
                    {activeSessions.map(session => (
                      <div key={session} onClick={() => { setMarketType('session_' + session); setShowMarketMenu(false); }} className="px-4 py-2.5 text-xs sm:text-[13px] font-bold text-white hover:bg-white/5 cursor-pointer border-t border-[#1f2638]">
                        {session}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {isSessionMarket ? (
            <div className="mt-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-4 px-1">
                <h2 className="text-white font-extrabold text-base tracking-wide">{selectedSessionName}</h2>
                <div className="text-slate-400 text-xs sm:text-sm font-medium">
                  On this market: <span className="text-emerald-400 font-mono font-bold ml-1">€{formatVolStr(sessionGraphData?.totalBet || 0)}</span>
                </div>
              </div>
              <TeamCard teamData={sessionGraphData} isToss={false} isSession={true} marketVol={sessionGraphData?.totalBet || 0} />
            </div>
          ) : (
            <>
              <div className="mb-4 mt-2 flex items-center justify-between">
                <h2 className="text-white font-extrabold text-sm sm:text-base tracking-wide flex items-center gap-2">
                  <BarChart3 size={16} className="text-blue-400" />
                  <span>Market Odds & Depth Analysis</span>
                </h2>
                <span className="text-xs text-slate-400">Vol: <b className="text-white font-mono">€{formatVolStr(marketVol)}</b></span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
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
                <div className="flex justify-between items-center mb-2.5">
                  <h2 className="text-white font-extrabold text-sm sm:text-base tracking-wide flex items-center gap-2">
                    <span>🪙</span> Toss Market Load
                  </h2>
                  <span className="text-xs text-slate-400 font-semibold font-mono">
                    Total: <b className="text-white">€{formatVolStr(tossMarketVol)}</b>
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="h-2 w-full bg-[#07090e] border border-[#1b2234] mb-2 flex rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: `${tossT1PctVol}%` }} />
                  <div className="bg-sky-500 h-full transition-all duration-500" style={{ width: `${tossT2PctVol}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-bold font-mono">
                  <span className="text-purple-400">{tossT1Name} <span className="text-white ml-1">{tossT1PctVol.toFixed(0)}%</span></span>
                  <span className="text-sky-400">{tossT2Name} <span className="text-white ml-1">{tossT2PctVol.toFixed(0)}%</span></span>
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
                        const isProf = (pl ?? 0) >= 0
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
                            <div className={`text-xs font-bold mt-1 ${pnlCls(pl)}`}>{isProf ? '✅ PROFIT' : '❌ LOSS'}</div>
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
                      { label: 'Total Bet', v1: <span className="text-[11px] text-white font-bold">€{formatVolStr(tossM1?.totalBet)}</span>, v2: <span className="text-[11px] text-white font-bold">€{formatVolStr(tossM2?.totalBet)}</span> },
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
          {isSessionMarket ? (
            <div className="p-4 text-center text-[#8e8e93] py-10">
              <BarChart3 className="mx-auto mb-3 opacity-20" size={48} />
              <p>Session data is only available in Graphs view.</p>
              <button onClick={() => setShowAdvancedGraph(true)} className="mt-4 px-4 py-2 bg-[#16a34a] text-white rounded-lg text-sm font-bold">Switch to Graphs</button>
            </div>
          ) : (
            <>
              {/* 🪙 Toss Market Quick Bar */}
              {sport === 'cricket' && hasTossData && (
                <button
                  type="button"
                  onClick={() => setActiveTab('toss')}
                  className="w-full text-left rounded-xl p-2.5 sm:p-3 border border-purple-500/30 bg-purple-500/[0.08] hover:bg-purple-500/[0.14] transition-all flex items-center justify-between gap-2 shadow-sm mb-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">🪙</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Toss Market Data Available</span>
                        {tossPrediction?.winnerName && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Winner: {tossPrediction.winnerName}
                          </span>
                        )}
                      </div>
                      {(tossT1BookiePL != null || tossT2BookiePL != null) && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                          📈 Toss Bookie P/L: <span className={pnlCls(tossT1BookiePL)}>{tossT1Name} ({fmtTossRs(tossT1BookiePL)})</span> • <span className={pnlCls(tossT2BookiePL)}>{tossT2Name} ({fmtTossRs(tossT2BookiePL)})</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-purple-400 flex items-center gap-1 shrink-0 font-sans">
                    View Toss Section →
                  </span>
                </button>
              )}

              {/* ━━━━━━━━━━ 🤖 QUANT AI PREDICTION ━━━━━━━━━━ */}
              {snapshot.aiPrediction && snapshot.aiPrediction.winner && (() => {
                const pv = getPredictionVisuals(snapshot.aiPrediction)
                if (!pv) return null
                return (
                  <div
                    className="relative overflow-hidden rounded-xl border p-3 sm:p-3.5 shadow-xl transition-all duration-300 backdrop-blur-md"
                    style={{
                      background: pv.gradient,
                      borderColor: pv.border,
                      boxShadow: pv.shadow,
                    }}
                  >
                    {/* Top Tag & Confidence Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="p-1 rounded-md bg-white/10 backdrop-blur-sm">
                          <Sparkles size={13} className={`${pv.textColor} animate-pulse`} />
                        </div>
                        <span className={`text-[11px] font-black uppercase tracking-wider ${pv.textColor}`}>
                          {pv.tagText}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-sm ${pv.badgeBg}`}>
                          {pv.pill}
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-white/90 font-mono">
                          {snapshot.aiPrediction.confidence}
                        </span>
                      </div>
                    </div>

                    {/* Winner Display */}
                    <div className="my-2">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                        <Trophy size={11} className="text-amber-400" />
                        <span>PREDICTED MATCH WINNER</span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <span>{snapshot.aiPrediction.winner}</span>
                      </h3>
                    </div>

                    {/* Confidence Meter Bar */}
                    <div className="mt-2 mb-1.5">
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 mb-0.5">
                        <span>Algorithmic Backtested Confidence</span>
                        <span className={`font-mono ${pv.textColor}`}>{pv.meterPct}% Confidence</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-black/50 border border-white/5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pv.meterPct}%`,
                            background: pv.textColor.includes('teal') ? 'linear-gradient(90deg, #14b8a6, #2dd4bf)'
                              : pv.textColor.includes('emerald') ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : pv.textColor.includes('pink') ? 'linear-gradient(90deg, #ec4899, #f472b6)'
                              : pv.textColor.includes('purple') ? 'linear-gradient(90deg, #a855f7, #c084fc)'
                              : pv.textColor.includes('rose') ? 'linear-gradient(90deg, #f43f5e, #fb7185)'
                              : pv.textColor.includes('amber') ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                              : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                            boxShadow: '0 0 8px rgba(255,255,255,0.3)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Intelligence Insight Note */}
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-1.5 text-[11px] text-slate-300 leading-snug">
                      <Shield size={12} className={`${pv.textColor} shrink-0 mt-0.5`} />
                      <p>{pv.desc}</p>
                    </div>
                  </div>
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

                  {(marketBetTotal > 0 || marketVol > 0) && (() => {
                    const leaderAmt = Math.max(marketBet1, marketBet2, hasDraw ? marketBetDraw : 0)
                    const colorFor = (amt) => amt === leaderAmt && leaderAmt > 0 ? '#fb7185' : '#34d399'
                    const c1 = colorFor(marketBet1)
                    const c2 = colorFor(marketBet2)
                    const cDraw = colorFor(marketBetDraw)
                    return (
                      <div className="mt-2.5 space-y-2 pt-2 border-t border-[#1b2234]">
                        {marketBetTotal > 0 && (
                          <div>
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              <span>Total Bets Ratio</span>
                              <span className="text-slate-500 font-mono">€{fmt(marketBetTotal)} bets</span>
                            </div>
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-[#07090e] border border-[#1b2234] mb-1">
                              <div className="transition-all duration-500" style={{ width: `${marketBetPct1}%`, background: c1 }} />
                              {hasDraw && <div className="transition-all duration-500" style={{ width: `${marketBetPctDraw}%`, background: cDraw }} />}
                              <div className="transition-all duration-500" style={{ width: `${marketBetPct2}%`, background: c2 }} />
                            </div>
                            <div className="flex justify-between gap-2 text-[10px] font-bold font-mono">
                              <span className="truncate" style={{ color: c1 }}>
                                {t1} {marketBetPct1.toFixed(0)}%
                                <span className="text-slate-500 font-normal ml-1">· €{fmt(marketBet1)}</span>
                              </span>
                              {hasDraw && (
                                <span className="truncate" style={{ color: cDraw }}>
                                  {drawName} {marketBetPctDraw.toFixed(0)}%
                                  <span className="text-slate-500 font-normal ml-1">· €{fmt(marketBetDraw)}</span>
                                </span>
                              )}
                              <span className="truncate text-right" style={{ color: c2 }}>
                                {t2} {marketBetPct2.toFixed(0)}%
                                <span className="text-slate-500 font-normal ml-1">· €{fmt(marketBet2)}</span>
                              </span>
                            </div>
                          </div>
                        )}
                        {marketVol > 0 && (() => {
                          const vol1 = t1GraphData?.totalBet || 0
                          const vol2 = t2GraphData?.totalBet || 0
                          const moneyLeader = Math.max(vol1, vol2)
                          const moneyColor = (amt) => (amt === moneyLeader && moneyLeader > 0 ? '#34d399' : '#fb7185')
                          const mc1 = moneyColor(vol1)
                          const mc2 = moneyColor(vol2)
                          return (
                            <div>
                              <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                <span>Traded Volume Ratio</span>
                                <span className="text-slate-500 font-mono">€{fmt(marketVol)}</span>
                              </div>
                              <div className="flex h-1.5 rounded-full overflow-hidden bg-[#07090e] border border-[#1b2234] mb-1">
                                <div className="transition-all duration-500" style={{ width: `${t1PctVol}%`, background: mc1 }} />
                                <div className="transition-all duration-500" style={{ width: `${t2PctVol}%`, background: mc2 }} />
                              </div>
                              <div className="flex justify-between gap-2 text-[10px] font-bold font-mono">
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
                            className={`rounded-lg p-2.5 text-center border transition-all ${
                              isProf
                                ? 'bg-emerald-500/[0.07] border-emerald-500/30 shadow-sm'
                                : 'bg-rose-500/[0.07] border-rose-500/30 shadow-sm'
                            }`}
                          >
                            <div className="text-[11px] font-bold text-slate-300 mb-0.5 truncate">{name}</div>
                            <div className={`text-sm sm:text-base font-black font-mono tracking-tight ${isProf ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {fmtRs(pl)}
                            </div>
                            <div className="mt-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                isProf ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
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

              {/* ━━━━━━━━━━ 1b. GATED FADE PICK ━━━━━━━━━━ */}
              {gatedFade && (
                <div className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl">
                  <div className="px-3 sm:px-3.5 py-2 flex items-center justify-between border-b border-[#1b2234] bg-[#0f1422]/60">
                    <div className="flex items-center gap-1.5">
                      <Zap size={13} className="text-amber-400" />
                      <span className="text-xs sm:text-sm font-extrabold text-white">Gated Fade Pick</span>
                    </div>
                    {gatedFade.winnerName && (
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {gatedFade.winnerName}
                      </span>
                    )}
                  </div>
                  <div className="p-3 sm:p-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
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
                        const role = side.isFade ? 'Fade Selection' : isOther ? 'Public Trap' : 'Neutral'
                        return (
                          <div
                            key={side.name}
                            className="rounded-lg p-2.5 text-center border transition-all"
                            style={
                              side.isFade
                                ? { background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.4)' }
                                : isOther
                                  ? { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.4)' }
                                  : { background: '#080b14', borderColor: '#1b2234' }
                            }
                          >
                            <div className="text-[9px] font-extrabold uppercase tracking-wider mb-0.5" style={{ color: isOther ? '#fb7185' : side.isFade ? '#34d399' : '#94a3b8' }}>
                              {role}
                            </div>
                            <div className="text-xs sm:text-sm font-bold text-white truncate">{side.name}</div>
                            <div className={`text-[11px] font-mono font-bold mt-0.5 ${typeof side.exposure === 'number' ? pnlCls(side.exposure) : 'text-slate-400'}`}>
                              {typeof side.exposure === 'number' ? fmtRs(side.exposure) : 'Exp —'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-[#1b2234]">
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
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all"
                          style={chip.ok
                            ? { color: '#34d399', borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)' }
                            : { color: '#64748b', borderColor: '#1e2538', background: '#080b14' }}
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
                      borderColor: isLower ? 'rgba(16,185,129,0.45)' : '#1b2234',
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
                            <div className="flex justify-between"><span className="text-slate-400">Back Expo</span><span className="font-bold text-sky-400">{back != null ? Number(back).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}</span></div>
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
                      <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Total Bets Count</div>
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

          {/* ━━━━━━━━━━ 5. QUICK STATS ━━━━━━━━━━ */}
          <div className="space-y-2.5">
            {[{ title: 'In-Play Live Metrics', pnl: ip, bets: ib, vol: iv, isLive: true },
              { title: 'Pre-Match Baseline', pnl: pp, bets: pb, vol: pv, isLive: false }].map(({ title, pnl, bets, vol, isLive }) => (
              <div key={title} className="rounded-xl overflow-hidden bg-[#0c101d] border border-[#1e2538] shadow-xl">
                <div className="px-3 sm:px-3.5 py-2 border-b border-[#1b2234] bg-[#0f1422]/60 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-white">{title}</span>
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${
                    isLive ? 'text-rose-400 bg-rose-500/10 border-rose-500/25' : 'text-sky-400 bg-sky-500/10 border-sky-500/25'
                  }`}>
                    {isLive ? 'IN-PLAY' : 'PRE-MATCH'}
                  </span>
                </div>
                <div className="p-2.5 sm:p-3">
                  <div className="grid grid-cols-3 gap-1 mb-1.5 px-1">
                    <div />
                    <div className="text-center text-[10px] font-extrabold text-slate-300 truncate px-1">{t1}</div>
                    <div className="text-center text-[10px] font-extrabold text-slate-300 truncate px-1">{t2}</div>
                  </div>
                  {[
                    { label: 'Bookie P/L', v1: <span className={`font-bold font-mono text-xs ${pnlCls(pnl.team1)}`}>{fmtRs(pnl.team1)}</span>, v2: <span className={`font-bold font-mono text-xs ${pnlCls(pnl.team2)}`}>{fmtRs(pnl.team2)}</span> },
                    { label: 'Total Bets', v1: <span className="text-[11px] font-mono text-slate-300">{fmt(bets.team1)}</span>, v2: <span className="text-[11px] font-mono text-slate-300">{fmt(bets.team2)}</span> },
                    { label: 'Back Vol', v1: <span className="text-[11px] font-mono text-sky-400">€{fmt(vol.team1?.back)}</span>, v2: <span className="text-[11px] font-mono text-sky-400">€{fmt(vol.team2?.back)}</span> },
                    { label: 'Lay Vol', v1: <span className="text-[11px] font-mono text-rose-400">€{fmt(vol.team1?.lay)}</span>, v2: <span className="text-[11px] font-mono text-rose-400">€{fmt(vol.team2?.lay)}</span> },
                  ].map(({ label, v1, v2 }, i) => (
                    <div key={label} className={`grid grid-cols-3 gap-1 py-1 px-1 rounded ${i % 2 === 0 ? 'bg-[#080b14]' : ''}`}>
                      <div className="text-[10px] text-slate-400 flex items-center font-bold">{label}</div>
                      <div className="text-center flex items-center justify-center">{v1}</div>
                      <div className="text-center flex items-center justify-center">{v2}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ━━━━━━━━━━ 10. SPOOFING DETECTOR ━━━━━━━━━━ */}
          <div className="rounded-xl p-3 sm:p-3.5 bg-[#0c101d] border border-[#1e2538] shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-rose-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-extrabold text-white">Spoofing & Fake Order Detector</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold border border-rose-500/30 text-rose-400 bg-rose-500/10">LIVE DETECTOR</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden flex mb-1.5 bg-[#07090e] border border-[#1b2234]">
              <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${t1Pct}%` }} />
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${t2Pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] font-mono font-bold mb-3">
              <span className="text-rose-400">{t1}: {t1Pct.toFixed(1)}%</span>
              <span className="text-emerald-400">{t2}: {t2Pct.toFixed(1)}%</span>
            </div>

            {/* Team cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              {[{ team: t1, fake: t1Fake, isMain: true }, { team: t2, fake: t2Fake, isMain: false }].map(({ team, fake, isMain }) => (
                <div key={team} className="rounded-lg p-2.5 border border-[#1b2234] bg-[#080b14]">
                  <div className={`text-xs font-bold mb-2 truncate ${isMain ? 'text-white' : 'text-slate-300'}`}>{team}</div>
                  <div className="space-y-1.5 font-mono">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-slate-400">Fake Back</span>
                      <span className="text-[11px] font-bold text-sky-400">{fmtVol(fake.fakeBack)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-slate-400">Fake Lay</span>
                      <span className="text-[11px] font-bold text-rose-400">{fmtVol(fake.oppFakeLay)}</span>
                    </div>
                  </div>
                  <div className="border-t border-[#1b2234] mt-2 pt-1.5 flex justify-between items-center font-mono">
                    <span className="text-[10px] font-bold text-slate-400">Total Fake</span>
                    <span className="text-[11px] font-bold text-white">{fmtVol(fake.total)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom banner */}
            <div className="rounded-lg py-2 px-3 text-center border border-[#1b2234] bg-[#080b14]">
              <div className="text-[9px] font-extrabold tracking-widest text-slate-400 uppercase mb-0.5">Most Fake Orders Detected</div>
              <div className="text-xs sm:text-sm font-bold text-rose-400">{mostFakeTeam}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
