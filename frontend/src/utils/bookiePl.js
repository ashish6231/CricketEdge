/**
 * Shared bookie P/L helpers — single source of truth for MatchDetail & TossDetail.
 *
 * Bookie takes the other side of every customer bet.
 * If Team A wins:
 *   PL = −BackLiab_A + LayLiab_A + BackStake_B − LayStake_B
 * (same for other runners in a multi-way market, e.g. Test + Draw)
 *
 * Prefer API deepMetrics.simplePL (the original provider calculation).
 * Fall back to the named team P/L, then trade-based calculation only when the
 * provider value is missing.
 */

export function finiteNumber(value) {
  if (value == null || (typeof value === 'string' && !value.trim()) || !['string', 'number'].includes(typeof value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function tradeSide(trade) {
  const side = String(trade?.type || trade?.side || '').trim().toLowerCase()
  return side === 'back' || side === 'b' ? 'back' : side === 'lay' || side === 'l' ? 'lay' : null
}

export function timestamp(value) {
  if (value == null || value === '') return null
  const numeric = finiteNumber(value)
  const time = numeric == null ? Date.parse(value) : numeric < 1e11 ? numeric * 1000 : numeric
  return Number.isFinite(time) ? time : null
}

/** Exchange snapshots currently use updatedAt, while older retained rows may
 * use one of the other common matched-trade timestamp keys. */
export function tradeTimestamp(trade) {
  return timestamp(trade?.updatedAt ?? trade?.matchedAt ?? trade?.createdAt ?? trade?.timestamp ?? trade?.time)
}

export function getTradeStats(trades = []) {
  let tBack = 0, tLay = 0, tBackLiab = 0, tLayLiab = 0
  let invalid = 0
  for (const t of trades) {
    const size = finiteNumber(t?.size)
    const price = finiteNumber(t?.price)
    const side = tradeSide(t)
    if (size == null || size < 0 || price == null || price <= 1 || !side) { invalid++; continue }
    if (side === 'back') {
      tBack += size
      tBackLiab += size * (price - 1)
    } else {
      tLay += size
      tLayLiab += size * (price - 1)
    }
  }
  return { tBack, tLay, tBackLiab, tLayLiab, invalid }
}

const DRAW_NAME_RE = /^(the\s+)?draw$/i

export function isDrawOutcomeName(name) {
  return DRAW_NAME_RE.test(String(name || '').trim())
}

/** Split Match Odds runners into two sides + optional Draw (Test matches). */
export function splitMatchOutcomes(teamNames = []) {
  const names = (teamNames || []).filter(Boolean)
  const drawName = names.find(isDrawOutcomeName) || null
  const mains = names.filter((n) => !isDrawOutcomeName(n))
  return {
    t1: mains[0] || names[0] || 'Team 1',
    t2: mains[1] || names[1] || 'Team 2',
    drawName,
    outcomes: [
      ...(mains[0] ? [mains[0]] : []),
      ...(mains[1] ? [mains[1]] : []),
      ...(drawName ? [drawName] : []),
    ],
  }
}

/** Bookie P/L if team1 wins / if team2 wins — from trade lists */
export function calcBookiePlFromTrades(t1Trades, t2Trades) {
  const s1 = getTradeStats(t1Trades)
  const s2 = getTradeStats(t2Trades)
  return {
    team1Win: s1.invalid || s2.invalid ? null : -s1.tBackLiab + s1.tLayLiab + s2.tBack - s2.tLay,
    team2Win: s1.invalid || s2.invalid ? null : -s2.tBackLiab + s2.tLayLiab + s1.tBack - s1.tLay,
    s1, s2,
  }
}

/** Multi-runner bookie P/L (2-way or 3-way with Draw). */
export function calcBookiePlMulti(tradeMap = {}) {
  const names = Object.keys(tradeMap)
  const stats = Object.fromEntries(names.map((n) => [n, getTradeStats(tradeMap[n] || [])]))
  const byName = {}
  for (const winner of names) {
    if (Object.values(stats).some(s => s.invalid)) { byName[winner] = null; continue }
    let pl = 0
    for (const name of names) {
      const s = stats[name]
      if (name === winner) pl += -s.tBackLiab + s.tLayLiab
      else pl += s.tBack - s.tLay
    }
    byName[winner] = pl
  }
  return byName
}

/** Filter trades by time window (same logic as MatchDetail processTeamData) */
export function filterTradesByTime(trades = [], timeFilter = 'all') {
  if (timeFilter === 'all' || !trades.length) return trades
  const hours = timeFilter === '1h' ? 1 : 3
  const maxTime = Math.max(...trades.map(t => tradeTimestamp(t) ?? 0))
  const cutoff = maxTime - hours * 60 * 60 * 1000
  return trades.filter(t => (tradeTimestamp(t) ?? 0) >= cutoff)
}

const close = (a, b) => a != null && b != null && Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 1e-8)
const namesFor = (snap, names) => [...new Set([...(snap?.teamNames || []), ...names].filter(Boolean))]
const resultFor = (byName, names, source, extra = {}) => ({ byName, pl1: byName[names[0]] ?? null, pl2: byName[names[1]] ?? null, plDraw: names[2] ? byName[names[2]] ?? null : null, source, ...extra })

function ledger(snap, names) {
  const trades = Object.fromEntries(names.map(name => [name, Array.isArray(snap?.teams?.[name]?.trades) ? snap.teams[name].trades : []]))
  const stats = Object.fromEntries(names.map(name => [name, getTradeStats(trades[name])]))
  return { trades, stats, valid: names.every(name => Array.isArray(snap?.teams?.[name]?.trades) && !stats[name].invalid) }
}

function volumeMatches(snap, stats, volumes) {
  if (!Array.isArray(snap?.teamNames) || snap.teamNames.length < 2 || Object.keys(stats).some(name => !snap.teamNames.includes(name))) return false
  return (snap.teamNames || []).every((name, i) => {
    const volume = volumes?.[`team${i + 1}`]
    return stats[name] && close(stats[name].tBack, finiteNumber(volume?.back)) && close(stats[name].tLay, finiteNumber(volume?.lay))
  })
}

function capturedPeriodResult(snap, selected, names, volumeField, pnlField) {
  if (!Array.isArray(snap?.teamNames) || snap.teamNames.length < 2) return null
  const byName = {}
  const stats = {}
  for (const name of names) {
    const index = snap.teamNames.indexOf(name)
    if (index < 0) return null
    const key = `team${index + 1}`
    const pnl = finiteNumber(snap?.[pnlField]?.[key])
    const back = finiteNumber(snap?.[volumeField]?.[key]?.back)
    const lay = finiteNumber(snap?.[volumeField]?.[key]?.lay)
    if (pnl == null || back == null || lay == null || back < 0 || lay < 0) return null
    byName[name] = pnl
    stats[name] = { tBack: back, tLay: lay, tBackLiab: null, tLayLiab: null, invalid: 0 }
  }
  // The upstream period P/L is useful as a historical snapshot, but the
  // period stake totals do not contain prices/liabilities. It therefore
  // cannot be independently reproduced from these aggregates alone.
  return resultFor(byName, selected, 'provider', { verified: false, stats })
}

/** Original bookie P/L behavior used by the first match and toss screens. */
export function getBookiePl(snap, t1, t2, drawName = null) {
  const selected = [t1, t2, ...(drawName ? [drawName] : [])]
  const simplePl = snap?.deepMetrics?.simplePL || {}
  const team1 = snap?.teams?.[t1] || {}
  const team2 = snap?.teams?.[t2] || {}
  const draw = drawName ? (snap?.teams?.[drawName] || {}) : null

  const apiPl1 = finiteNumber(simplePl.team1_win ?? team1.pnlIfWins)
  const apiPl2 = finiteNumber(simplePl.team2_win ?? team2.pnlIfWins)
  const apiPlDraw = drawName
    ? finiteNumber(simplePl.draw_win ?? simplePl.team3_win ?? draw?.pnlIfWins)
    : null

  const tradeMap = {
    [t1]: Array.isArray(team1.trades) ? team1.trades : [],
    [t2]: Array.isArray(team2.trades) ? team2.trades : [],
  }
  if (drawName) tradeMap[drawName] = Array.isArray(draw?.trades) ? draw.trades : []
  const stats = Object.fromEntries(selected.map(name => [name, getTradeStats(tradeMap[name])]))

  if (apiPl1 != null && apiPl2 != null && (!drawName || apiPlDraw != null)) {
    return resultFor({
      [t1]: apiPl1,
      [t2]: apiPl2,
      ...(drawName ? { [drawName]: apiPlDraw } : {}),
    }, selected, 'api', { verified: false, stats })
  }

  const calculated = calcBookiePlMulti(tradeMap)
  return resultFor({
    [t1]: apiPl1 ?? calculated[t1] ?? null,
    [t2]: apiPl2 ?? calculated[t2] ?? null,
    ...(drawName ? { [drawName]: apiPlDraw ?? calculated[drawName] ?? null } : {}),
  }, selected, 'trades', { verified: true, stats })
}

/** Same settlement formula for every window. Volumes must cover the selected
 * ledger; otherwise do not substitute current odds or an unrelated period P/L. */
export function getBookiePlWindows(snap, t1, t2, drawName = null, options = {}) {
  const selected = [t1, t2, ...(drawName ? [drawName] : [])]
  const names = namesFor(snap, selected)
  const { trades, valid } = ledger(snap, names)
  const start = timestamp(snap?.startTime ?? options.startTime)
  const asOf = timestamp(snap?.serverTime ?? snap?.updatedAt) ?? timestamp(options.now)
  const all = getBookiePl(snap, t1, t2, drawName)
  const windows = { all }
  for (const [key, field, pnlField] of [
    ['preMatch', 'preMatchVolume', 'preMatchPnl'],
    ['live', 'inPlayVolume', 'inPlayPnl'],
    ['threeMin', 'threeMinVolume', 'threeMinPnl'],
  ]) {
    const unavailable = resultFor({}, selected, 'unavailable', { reason: 'Complete trades for this time window are unavailable.' })
    windows[key] = unavailable
    // Keep a provider snapshot visible when its full pair of values and stake
    // totals exists, but do not label it as an independently verified result.
    const captured = capturedPeriodResult(snap, selected, names, field, pnlField)
    if (captured) { windows[key] = captured; continue }

    if (!valid || start == null || (key !== 'preMatch' && asOf == null)) continue
    const hasTimes = names.every(name => trades[name].every(trade => tradeTimestamp(trade) != null))
    if (!hasTimes) continue
    const filtered = Object.fromEntries(names.map(name => [name, trades[name].filter(trade => {
      const time = tradeTimestamp(trade)
      if (asOf != null && time > asOf) return false
      return key === 'preMatch'
        ? time < start
        : key === 'live'
          ? time >= start
          : time >= Math.max(start, asOf - 180000)
    })]))
    const stats = Object.fromEntries(names.map(name => [name, getTradeStats(filtered[name])]))
    const declaredVolumes = snap?.[field]
    if (declaredVolumes ? !volumeMatches(snap, stats, declaredVolumes) : snap?.tradesComplete !== true) continue
    windows[key] = resultFor(calcBookiePlMulti(filtered), selected, 'trades', { verified: true, stats, asOf })
  }
  return windows
}

/** advancedMetricsV2 preferred; falls back to advancedMetrics */
export function getTeamMetrics(snap, teamIdx) {
  const key = teamIdx === 0 ? 'team1' : 'team2'
  const v2 = snap?.advancedMetricsV2?.[key] || {}
  const v1 = snap?.advancedMetrics?.[key] || {}
  return {
    back: v2.back ?? v1.back ?? 0,
    lay: v2.lay ?? v1.lay ?? 0,
    totalBet: v2.totalBet ?? v1.totalVolume ?? 0,
    backPercentage: v1.backPercentage ?? 50,
  }
}

/** Display only matched stakes; V2 back/lay are liabilities, not volumes. */
export function getSelectionStakes(snap, name) {
  const index = snap?.teamNames?.indexOf(name) ?? -1
  const declared = index >= 0 ? snap?.advancedMetrics?.[`team${index + 1}`] : null
  const back = finiteNumber(declared?.back)
  const lay = finiteNumber(declared?.lay)
  if (back != null && lay != null && back >= 0 && lay >= 0) return { back, lay, totalBet: back + lay }
  const rows = snap?.teams?.[name]?.trades
  if (snap?.tradesComplete === true && Array.isArray(rows)) {
    const stats = getTradeStats(rows)
    if (!stats.invalid) return { back: stats.tBack, lay: stats.tLay, totalBet: stats.tBack + stats.tLay }
  }
  return { back: null, lay: null, totalBet: null }
}

export function latestMatchedPrice(trades = []) {
  const rows = trades.filter(trade => finiteNumber(trade?.price) > 1 && finiteNumber(trade?.size) >= 0 && tradeSide(trade) && tradeTimestamp(trade) != null)
  rows.sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a))
  return finiteNumber(rows[0]?.price)
}

export default getBookiePl
