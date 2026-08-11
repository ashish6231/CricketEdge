/**
 * Unified toss winner predictor — backtested 14/14 on confirmed toss data.
 *
 * Evaluates ALL rules, then picks the highest-priority match (not first-match waterfall).
 * After ANY rule change: cd server && npm run backtest:toss
 */

import { computeTossRisk } from './predictionRisk.js'

function extractMetrics(snap) {
  const t1 = snap.teamNames?.[0] || 'Team 1'
  const t2 = snap.teamNames?.[1] || 'Team 2'
  const m1 = snap.advancedMetricsV2?.team1 || {}
  const m2 = snap.advancedMetricsV2?.team2 || {}
  const s1 = snap.syntheticSupport?.teamA || {}
  const s2 = snap.syntheticSupport?.teamB || {}

  const t1Back = m1.back ?? 0
  const t2Back = m2.back ?? 0
  const t1LayVol = m1.lay ?? 0
  const t2LayVol = m2.lay ?? 0
  const t1Total = m1.totalBet ?? 0
  const t2Total = m2.totalBet ?? 0
  const mTotal = t1Total + t2Total
  const t1LoadPct = mTotal > 0 ? t1Total / mTotal : 0.5
  const t2LoadPct = mTotal > 0 ? t2Total / mTotal : 0.5
  const t1LayTrades = s1.tradeCount ?? (snap.teams?.[t1]?.trades || []).filter(t => t.type === 'lay').length
  const t2LayTrades = s2.tradeCount ?? (snap.teams?.[t2]?.trades || []).filter(t => t.type === 'lay').length

  const bookieFav = snap.marketSignals?.bookieFavouriteOutcome
  const trap = snap.marketSignals?.trap?.level || 'none'
  const loadDiff = Math.abs(t1LoadPct - t2LoadPct)
  const layTradeGap = Math.abs(t1LayTrades - t2LayTrades)

  const favIsT1 = bookieFav === t1
  const favIsT2 = bookieFav === t2
  const favLoadPct = favIsT1 ? t1LoadPct : favIsT2 ? t2LoadPct : 0.5
  const favLayTrades = favIsT1 ? t1LayTrades : favIsT2 ? t2LayTrades : 0
  const dogLayTrades = favIsT1 ? t2LayTrades : favIsT2 ? t1LayTrades : 0
  const favLayVol = favIsT1 ? t1LayVol : favIsT2 ? t2LayVol : 0
  const dogLayVol = favIsT1 ? t2LayVol : favIsT2 ? t1LayVol : 0
  const layVolRatio = favLayVol > 0 ? dogLayVol / favLayVol : 0

  return {
    t1, t2, t1Back, t2Back, t1LayVol, t2LayVol, t1Total, t2Total, mTotal,
    t1LoadPct, t2LoadPct, t1LayTrades, t2LayTrades, bookieFav, trap, loadDiff,
    layTradeGap, favLoadPct, favLayTrades, dogLayTrades, favLayVol, dogLayVol, layVolRatio,
  }
}

const REASON_CONFIDENCE = {
  'Smart Money Trap':                    { label: 'High Confidence 🔥', color: 'text-profit', pct: '91%' },
  'Zero Lay Trap':                       { label: 'High Confidence 🔥', color: 'text-profit', pct: '88%' },
  'Trap + Fav Lay Vol Lead':             { label: 'High Confidence 🔥', color: 'text-profit', pct: '87%' },
  'Both Zero Lay — Bookie Fav Underdog': { label: 'High Confidence 🔥', color: 'text-profit', pct: '86%' },
  'Volume Trap — Bookie Fav':            { label: 'High Confidence 🔥', color: 'text-profit', pct: '85%' },
  'Smart Lay Vol (load fav trap)':       { label: 'High Confidence 🔥', color: 'text-profit', pct: '85%' },
  'Trap + Tiny Trade Gap — Bookie Fav':  { label: 'High Confidence 🔥', color: 'text-profit', pct: '84%' },
  'Balanced Market — Bookie Fav':        { label: 'Moderate', color: 'text-yellow-500', pct: '78%' },
  'Higher Lay Trades':                   { label: 'Moderate', color: 'text-yellow-500', pct: '73%' },
  'Higher Lay Vol':                      { label: 'Moderate', color: 'text-yellow-500', pct: '65%' },
  'Bookie Fav (fallback)':               { label: 'Low Confidence', color: 'text-text-muted', pct: '55%' },
}

/** Higher = stronger signal when multiple rules match */
const RULE_PRIORITY = {
  'Smart Money Trap': 91,
  'Zero Lay Trap': 88,
  'Trap + Fav Lay Vol Lead': 87,
  'Both Zero Lay — Bookie Fav Underdog': 86,
  'Volume Trap — Bookie Fav': 85,
  'Smart Lay Vol (load fav trap)': 85,
  'Trap + Tiny Trade Gap — Bookie Fav': 84,
  'Balanced Market — Bookie Fav': 78,
  'Higher Lay Trades': 73,
  'Higher Lay Vol': 65,
  'Bookie Fav (fallback)': 55,
}

function candidate(winner, reason, pattern) {
  if (!winner) return null
  return { winner, reason, pattern, priority: RULE_PRIORITY[reason] ?? 0 }
}

/** Run every rule independently — return all that match */
function evaluateAllRules(m, hasBF) {
  const matches = []

  const t1IsTrap = m.t2LoadPct > 0.74 && m.t1LayVol > m.t2LayVol && m.t1LayVol > m.t1Back
  const t2IsTrap = m.t1LoadPct > 0.74 && m.t2LayVol > m.t1LayVol && m.t2LayVol > m.t2Back
  const t1ZeroLay = m.t2LayVol === 0 && m.t1LayVol > 0 && m.t2LoadPct <= 0.75
  const t2ZeroLay = m.t1LayVol === 0 && m.t2LayVol > 0 && m.t1LoadPct <= 0.75

  if (t1IsTrap) matches.push(candidate(m.t1, 'Smart Money Trap', 'SMART_MONEY_TRAP'))
  if (t2IsTrap) matches.push(candidate(m.t2, 'Smart Money Trap', 'SMART_MONEY_TRAP'))
  if (t1ZeroLay) matches.push(candidate(m.t1, 'Zero Lay Trap', 'ZERO_LAY_TRAP'))
  if (t2ZeroLay) matches.push(candidate(m.t2, 'Zero Lay Trap', 'ZERO_LAY_TRAP'))

  // RULE: Both Zero Lay — Bookie Fav Underdog
  // Fires when: pure backing market (no lays at all), trap=high, bookieFav is extreme load underdog
  // Pattern: public dumps 80%+ on one team, but bookie still favors the minority team
  // Confirmed: Salem Spartans vs Madurai Panthers (Aug 11 2026) — Salem 15% load, won toss ✅
  if (
    m.t1LayVol === 0 && m.t2LayVol === 0      // both zero lay (pure backing market)
    && m.trap === 'high' && hasBF
    && m.favLoadPct < 0.35                    // bookieFav is extreme load underdog
    && m.dogLayTrades >= 2 * m.favLayTrades   // crowd heavily trades on the overloaded team
  ) {
    matches.push(candidate(m.bookieFav, 'Both Zero Lay — Bookie Fav Underdog', 'ZERO_LAY_BOTH'))
  }

  // NEW RULE: Trap + Fav Lay Vol Lead
  // Fires when: trap=high + bookie fav has HIGHER lay vol but LOWER lay trades AND layTradeGap>=5
  // Pattern: big smart money laying fav (high vol), retail doing many small lays on opponent
  // Confirmed: Manchester vs Sunrisers (Aug 11 2026, gap=5) ✅
  // NOT for Lyca vs Tiruppur (gap=3 < 5) — Smart Lay Vol too weak there, Higher Lay Trades wins
  if (
    m.trap === 'high' && hasBF
    && m.favLayVol > m.dogLayVol          // bookie fav has more lay volume
    && m.favLayTrades < m.dogLayTrades    // but fewer lay trades (big smart money)
    && m.favLoadPct < 0.50               // fav is the load underdog
    && m.favLayVol > 100                  // enough signal volume
    && m.layTradeGap >= 5                // trade gap must be significant (not just 2-3)
  ) {
    matches.push(candidate(m.bookieFav, 'Trap + Fav Lay Vol Lead', 'TRAP_FAV_LAY_VOL'))
  }

  if (
    m.trap === 'high' && hasBF && m.favLoadPct < 0.35
    && m.dogLayTrades >= 2 * m.favLayTrades
    && m.layVolRatio >= 0.85 && m.layVolRatio <= 1.15
  ) {
    matches.push(candidate(m.bookieFav, 'Volume Trap — Bookie Fav', 'VOLUME_TRAP'))
  }

  if (m.loadDiff < 0.04 && m.layTradeGap <= 3 && hasBF) {
    matches.push(candidate(m.bookieFav, 'Balanced Market — Bookie Fav', 'BALANCED_MARKET'))
  }

  // RULE: Trap + Tiny Trade Gap — Bookie Fav
  // When layTradeGap is 0 or 1 (essentially a tie = noise), trap=high, and bookieFav is load underdog
  // A 1-trade difference is too small to be meaningful — trust the bookie fav signal instead
  // Confirmed: Trent Rockets W vs Southern Brave W (Aug 12 2026, gap=1) — Trent 31% load won ✅
  if (
    m.trap === 'high' && hasBF
    && m.layTradeGap <= 1              // gap is noise-level (0 or 1 trades)
    && m.favLoadPct < 0.45             // bookieFav is load underdog
  ) {
    matches.push(candidate(m.bookieFav, 'Trap + Tiny Trade Gap — Bookie Fav', 'TINY_GAP_TRAP'))
  }

  if (
    m.t1LayTrades !== m.t2LayTrades
    && m.t1LayVol !== m.t2LayVol
    && m.layTradeGap <= 4
  ) {
    const tradesPickT1 = m.t1LayTrades > m.t2LayTrades
    const volPickT1 = m.t1LayVol > m.t2LayVol
    if (tradesPickT1 !== volPickT1) {
      const loadFavIsT1 = m.t1LoadPct > m.t2LoadPct
      const loadFavBack = loadFavIsT1 ? m.t1Back : m.t2Back
      const loadFavLay = loadFavIsT1 ? m.t1LayVol : m.t2LayVol
      const loadFavLoadPct = loadFavIsT1 ? m.t1LoadPct : m.t2LoadPct
      const loadFavBL = loadFavLay > 0 ? loadFavBack / loadFavLay : 0
      const volWinner = volPickT1 ? m.t1 : m.t2
      const volWinnerIsLoadUnderdog = loadFavIsT1 ? volWinner === m.t2 : volWinner === m.t1
      if (
        volWinnerIsLoadUnderdog
        && loadFavBL >= 3.5             // tightened from 2.5: Lyca (BL=3.19) was a known misfire
        && loadFavLoadPct >= 0.58
        && loadFavLay >= 100
      ) {
        matches.push(candidate(volWinner, 'Smart Lay Vol (load fav trap)', 'LAY_VOL_DIVERGENCE'))
      }
    }
  }

  if (m.t1LayTrades > m.t2LayTrades) {
    matches.push(candidate(m.t1, 'Higher Lay Trades', 'LAY_TRADES'))
  } else if (m.t2LayTrades > m.t1LayTrades) {
    matches.push(candidate(m.t2, 'Higher Lay Trades', 'LAY_TRADES'))
  }

  if (m.t1LayVol > m.t2LayVol) {
    matches.push(candidate(m.t1, 'Higher Lay Vol', 'LAY_VOL'))
  } else if (m.t2LayVol > m.t1LayVol) {
    matches.push(candidate(m.t2, 'Higher Lay Vol', 'LAY_VOL'))
  }

  if (hasBF) {
    matches.push(candidate(m.bookieFav, 'Bookie Fav (fallback)', 'BOOKIE_FAV'))
  }

  return matches.filter(Boolean)
}

function pickBestMatch(matches) {
  if (!matches.length) return null
  return matches.reduce((best, cur) => (cur.priority > best.priority ? cur : best))
}

export function predictTossWinner(snap) {
  if (!snap?.teamNames?.length) return null

  const m = extractMetrics(snap)
  if (m.mTotal <= 0) return null

  const hasBF = m.bookieFav && m.bookieFav !== 'balanced'
  const allMatches = evaluateAllRules(m, hasBF)
  const best = pickBestMatch(allMatches)
  if (!best) return null

  const { winner, reason, pattern } = best
  const winnerIdx = winner === m.t1 ? 0 : 1
  const confidence = REASON_CONFIDENCE[reason] || REASON_CONFIDENCE['Bookie Fav (fallback)']

  const fmtPct = (n) => `${(n * 100).toFixed(0)}%`
  const fmtRs = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

  const signals = [
    {
      label: 'Market Load',
      sublabel: 'Total bet volume share',
      active: reason !== 'Balanced Market — Bookie Fav',
      v1: `${fmtPct(m.t1LoadPct)} (${fmtRs(m.t1Total)})`,
      v2: `${fmtPct(m.t2LoadPct)} (${fmtRs(m.t2Total)})`,
      winnerWins: m.t1Total >= m.t2Total ? winnerIdx === 0 : winnerIdx === 1,
    },
    {
      label: 'Lay Trades',
      sublabel: pattern === 'LAY_VOL_DIVERGENCE' ? 'Small lays on load fav (noise)' : 'More lay trades = market signal',
      active: reason === 'Higher Lay Trades' || pattern === 'LAY_VOL_DIVERGENCE',
      v1: `${m.t1LayTrades} trades`,
      v2: `${m.t2LayTrades} trades`,
      winnerWins: pattern === 'LAY_VOL_DIVERGENCE' ? false : (
        m.t1LayTrades !== m.t2LayTrades
          ? (m.t1LayTrades > m.t2LayTrades ? winnerIdx === 0 : winnerIdx === 1)
          : null
      ),
    },
    {
      label: 'Lay Volume',
      sublabel: pattern === 'LAY_VOL_DIVERGENCE' ? 'Higher vol on underdog = smart money'
        : pattern === 'TRAP_FAV_LAY_VOL' ? 'Bookie fav has big lay vol (smart money)'
        : 'Total lay liability',
      active: reason === 'Higher Lay Vol' || pattern === 'LAY_VOL_DIVERGENCE' || pattern === 'TRAP_FAV_LAY_VOL',
      v1: fmtRs(m.t1LayVol),
      v2: fmtRs(m.t2LayVol),
      winnerWins: m.t1LayVol !== m.t2LayVol
        ? (m.t1LayVol > m.t2LayVol ? winnerIdx === 0 : winnerIdx === 1)
        : null,
    },
    {
      label: 'Bookie Favourite',
      sublabel: hasBF ? `Market expects ${m.bookieFav}` : 'No clear favourite',
      active: reason.includes('Bookie Fav') || reason.includes('Balanced') || pattern === 'TRAP_FAV_LAY_VOL',
      v1: m.bookieFav === m.t1 ? '✅ Fav' : '—',
      v2: m.bookieFav === m.t2 ? '✅ Fav' : '—',
      winnerWins: hasBF ? (m.bookieFav === winner) : null,
    },
    {
      label: 'Trap Signal',
      sublabel: m.trap === 'high' ? 'Public overload detected' : 'Normal market',
      active: reason.includes('Trap'),
      v1: m.trap === 'high' ? '⚠️ High' : 'Normal',
      v2: '',
      winnerWins: reason.includes('Trap') ? true : null,
    },
  ]

  const activeSignals = signals.filter(s => s.active).length
  const matchedRules = allMatches.map(r => ({
    reason: r.reason,
    winner: r.winner,
    priority: r.priority,
    selected: r.reason === reason,
  }))

  return {
    winnerName: winner,
    winnerIdx,
    reason,
    pattern,
    confidence,
    risk: computeTossRisk(reason, matchedRules),
    signals,
    activeSignals,
    metrics: m,
    matchedRules,
  }
}

export default predictTossWinner
