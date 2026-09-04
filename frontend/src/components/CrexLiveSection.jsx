import React from 'react'
import { Radio, Activity, TrendingUp, ShieldCheck, Zap } from 'lucide-react'

/**
 * Clean HTML formatting tags from string
 */
function stripHtml(str) {
  if (!str) return ''
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]*>?/gm, '')
    .trim()
}

/**
 * Pad single digit numbers to two digits (e.g. 4 -> "04", 5 -> "05")
 */
export function formatRateBox(val) {
  if (val === null || val === undefined || val === '' || val === '—') return '—'
  const str = String(val).trim()
  const num = Number(str)
  if (!isNaN(num) && Number.isInteger(num)) {
    return str.padStart(2, '0')
  }
  if (/^\d$/.test(str)) {
    return '0' + str
  }
  return str
}

/**
 * Brown cricket ball icon with diagonal stitched seam as per user reference
 */
export function CricketBallIcon({ size = 15, className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title="Live Rate"
    >
      <svg
        viewBox="0 0 20 20"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible drop-shadow-sm"
      >
        <circle cx="10" cy="10" r="9.5" fill="#9c4a16" />
        <line
          x1="3.5"
          y1="16.5"
          x2="16.5"
          y2="3.5"
          stroke="#ffffff"
          strokeWidth="1.3"
          strokeDasharray="1.8 1.2"
        />
        <line
          x1="4.5"
          y1="15.5"
          x2="15.5"
          y2="4.5"
          stroke="#fde68a"
          strokeWidth="0.5"
          strokeDasharray="1.8 1.2"
          opacity="0.8"
        />
      </svg>
    </span>
  )
}

/**
 * Exact replica of the reference image rate widget:
 * [Team Name] [Brown Cricket Ball Icon]    [ 04 ]  [ 05 ]
 */
export function MarketRateDisplay({
  team,
  rate,
  rate2,
  back = null,
  size = 'md',
  className = '',
}) {
  const hasRate = (rate !== null && rate !== undefined && rate !== '') || (rate2 !== null && rate2 !== undefined && rate2 !== '')
  if (!hasRate && !team) return null

  const isSm = size === 'sm'
  const isLg = size === 'lg'

  return (
    <div className={`flex items-center justify-between gap-2.5 sm:gap-4 ${className}`}>
      {/* Team Name + Brown Cricket Ball Icon */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {team && (
          <span
            className={`font-semibold truncate text-slate-200 ${
              isSm ? 'text-[11px]' : isLg ? 'text-sm sm:text-base text-white' : 'text-xs sm:text-sm'
            }`}
          >
            {team}
          </span>
        )}
        <CricketBallIcon size={isSm ? 13 : isLg ? 17 : 15} />
      </div>

      {/* Two white rounded rectangular boxes: [ 04 ] [ 05 ] */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <span
          className={`bg-white text-slate-950 font-black text-center font-mono rounded-lg border border-slate-200 shadow-sm leading-tight select-none ${
            isSm
              ? 'min-w-[28px] px-1.5 py-0.5 text-[11px]'
              : isLg
              ? 'min-w-[44px] px-3.5 py-1 text-base sm:text-lg'
              : 'min-w-[34px] px-2.5 py-0.5 text-xs sm:text-sm'
          }`}
        >
          {formatRateBox(rate)}
        </span>
        <span
          className={`bg-white text-slate-950 font-black text-center font-mono rounded-lg border border-slate-200 shadow-sm leading-tight select-none ${
            isSm
              ? 'min-w-[28px] px-1.5 py-0.5 text-[11px]'
              : isLg
              ? 'min-w-[44px] px-3.5 py-1 text-base sm:text-lg'
              : 'min-w-[34px] px-2.5 py-0.5 text-xs sm:text-sm'
          }`}
        >
          {formatRateBox(rate2 != null && rate2 !== '' ? rate2 : rate)}
        </span>
        {back && (
          <span className="text-[10px] text-emerald-400 font-mono font-bold ml-0.5">
            ({back})
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Format CREX outcome text (e.g. 'Caught Out', 'Over', 'Ball', '4', '6', '1', '2', 'Dot Ball')
 * Matching user reference images media_1788486157922.png ("Over") and media_1788486195891.png ("Caught Out")
 */
export function formatCrexOutcome(val, isRunning = false) {
  if (isRunning) return 'Ball'
  if (val === null || val === undefined || val === '' || val === '—') return 'Ball'
  const str = String(val).trim()

  // Match completion or stoppage
  if (/(won by|won the|match drawn|match tied|no result|innings break|concluded)/i.test(str)) {
    return 'Wicket'
  }
  // Toss or non-delivery phrases should never appear as delivery outcome
  if (/opt to|chose to|elected to|won toss|toss|yet to begin/i.test(str)) {
    return 'Ball'
  }

  if (/^over$/i.test(str)) return 'Over'
  if (/^ball/i.test(str)) return 'Ball'

  // Dismissals
  if (/^caught out/i.test(str)) return 'Caught Out'
  if (/^bowled/i.test(str)) return 'Bowled'
  if (/^lbw/i.test(str)) return 'LBW'
  if (/^run out/i.test(str)) return 'Run Out'
  if (/^stumped/i.test(str)) return 'Stumped'
  if (/^w$/i.test(str) || /^wicket/i.test(str) || /^out$/i.test(str)) return 'Wicket'

  // Boundaries
  if (/^four$/i.test(str) || str === '4') return 'FOUR'
  if (/^six$/i.test(str) || str === '6') return 'SIX'

  // Extras
  if (/^wide/i.test(str) || /^wd/i.test(str) || /^\d*wd$/i.test(str)) return 'Wide'
  if (/^no ball/i.test(str) || /^nb/i.test(str) || /^\d*nb$/i.test(str)) return 'No Ball'
  if (/^leg bye/i.test(str) || /^lb/i.test(str) || /lb$/i.test(str)) return 'Leg Bye'
  if (/^bye/i.test(str) || /^b$/i.test(str)) return 'Bye'

  // Dots & Running Runs
  if (str === '0' || /^dot/i.test(str)) return 'Dot Ball'
  if (str === '1' || /^1\s*run/i.test(str) || /^single/i.test(str)) return '1 Run'
  if (str === '2' || /^2\s*runs/i.test(str) || /^double/i.test(str)) return '2 Runs'
  if (str === '3' || /^3\s*runs/i.test(str) || /^triple/i.test(str)) return '3 Runs'
  if (str === '5' || /^5\s*runs/i.test(str)) return '5 Runs'
  if (str === '7' || /^7\s*runs/i.test(str)) return '7 Runs'

  return str
}

/**
 * Real-time Running Ball Outcome Badge
 * Styles match user reference image media_1788486157922.png ("Over") and media_1788486195891.png ("Caught Out"):
 * Dark navy (#0b1424) container with bold creamy-yellow text (#fae48b / #ecd980).
 * Handles: 'Ball', 'Caught Out', 'Over', '4', '6', '1', '2', '0', 'Wide', 'No Ball'
 */
export function RunningBallBadge({ runningBall, size = 'md', className = '' }) {
  if (!runningBall) return null

  let rawOutcome = typeof runningBall === 'object'
    ? (runningBall.outcomeText || runningBall.status || runningBall.runs || '')
    : String(runningBall)
  if (/opt to|chose to|elected to|won toss|toss|yet to begin/i.test(String(rawOutcome))) {
    const balls = runningBall?.currentOverBalls || []
    rawOutcome = balls.length > 0 ? balls[balls.length - 1] : 'Ball'
  }
  const outcomeStr = String(rawOutcome).trim()
  if (!outcomeStr || outcomeStr === '—') return null

  const isRunning = typeof runningBall === 'object' && (runningBall.isRunning || /^ball/i.test(outcomeStr))
  const isSm = size === 'sm'
  const isLg = size === 'lg'

  const displayText = formatCrexOutcome(outcomeStr, isRunning)

  // Exact signature CREX theme:
  // Dark navy background (#0b1424) with bold creamy-yellow text (#fae48b / #ecd980)
  return (
    <div
      className={`inline-flex items-center justify-center font-sans font-black select-none leading-none bg-[#0b1424] text-[#fae48b] border border-[#23354d] shadow-md shadow-black/50 ${
        isSm
          ? 'px-2 py-0.5 text-[11px] rounded-md tracking-normal'
          : isLg
          ? 'px-5 py-2 text-base sm:text-xl rounded-xl tracking-wide'
          : 'px-3.5 py-1 text-xs sm:text-sm md:text-base rounded-lg tracking-wide'
      } ${isRunning ? 'animate-pulse' : ''} ${className}`}
      title={`Live Delivery: ${displayText}`}
    >
      {isRunning && (
        <span className="w-2 h-2 rounded-full bg-[#fae48b] animate-ping mr-1.5 inline-block" />
      )}
      <span>{displayText}</span>
    </div>
  )
}

/**
 * Top Scorecard Hero Banner for MatchDetail
 */
export function CrexScorecardBanner({ crexData, t1, t2 }) {
  if (!crexData) return null

  const sc = crexData.scorecard || {}
  const co = crexData.odds || {}
  const runningBall = crexData.runningBall || sc.runningBall || null

  const isCompleted = sc.status === 'completed' || crexData.status === 'completed' || /won by|won the|match drawn|tied|no result/i.test(sc.statusEquation || sc.matchResult || '')
  const isLive = !isCompleted && (sc.status === 'live' || crexData.status === 'live')
  const matchResultText = sc.matchResult || sc.statusEquation || crexData.statusText || 'Match Completed'

  const hasOdds = (co?.rate !== null && co?.rate !== undefined && co?.rate !== '') ||
                  (co?.rate2 !== null && co?.rate2 !== undefined && co?.rate2 !== '') ||
                  (co?.back !== null && co?.back !== undefined && co?.back !== '')

  // Active over balls: prioritize currentOverBalls, fallback to latest over from lastovers
  const displayBalls = (runningBall?.currentOverBalls && runningBall.currentOverBalls.length > 0)
    ? runningBall.currentOverBalls
    : (sc?.lastovers && sc.lastovers.length > 0 ? (sc.lastovers[sc.lastovers.length - 1]?.balls || []) : [])

  // Resolve outcome text, strictly ensuring toss comments don't displace delivery outcomes
  let outcomeCandidate = runningBall?.outcomeText || runningBall?.runs || runningBall?.status || ''
  if (/opt to|chose to|elected to|won toss|toss|yet to begin/i.test(String(outcomeCandidate))) {
    outcomeCandidate = displayBalls.length > 0 ? displayBalls[displayBalls.length - 1] : (isLive ? 'Ball' : 'Wicket')
  }
  const outcomeVal = outcomeCandidate || (displayBalls.length > 0 ? displayBalls[displayBalls.length - 1] : (isLive ? 'Ball' : 'Wicket'))
  const isRunning = runningBall?.isRunning || /^ball/i.test(String(outcomeVal))
  const outcomeFormatted = formatCrexOutcome(outcomeVal, isRunning)
  const isFour = !isRunning && (outcomeVal === '4' || /^four$/i.test(String(outcomeVal)))
  const isSix = !isRunning && (outcomeVal === '6' || /^six$/i.test(String(outcomeVal)))
  const isWicket = !isRunning && (outcomeVal === 'W' || outcomeVal === 'w' || /wicket|caught|bowled|lbw|run out|stumped/i.test(String(outcomeVal)))

  return (
    <div className="rounded-xl border border-[#2c2c2e] bg-[#111111] px-3 py-2 shadow-lg text-white mb-2">
      {/* Row 1: Status + Series + Target/CRR/RRR */}
      <div className="flex items-center justify-between gap-2 border-b border-[#2c2c2e] pb-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex-shrink-0 ${
            isLive ? 'bg-red-500/15 border border-red-500/40 text-red-400'
              : isCompleted ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
          }`}>
            <span className={`w-1 h-1 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isLive ? 'LIVE' : isCompleted ? 'COMPLETED' : 'UPCOMING'}
          </span>
          <span className="font-semibold text-[#8e8e93] truncate text-[10px]">{crexData.seriesName || 'Live Match'}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono flex-shrink-0">
          {sc?.target && <span className="text-amber-400 font-bold">Target: {sc.target}</span>}
          {sc?.crr && <span className="text-[#8e8e93]">CRR: <strong className="text-emerald-400">{sc.crr}</strong></span>}
          {sc?.rrr && <span className="text-[#8e8e93]">RRR: <strong className="text-amber-400">{sc.rrr}</strong></span>}
        </div>
      </div>

      {/* Row 2: Teams & Scores */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {sc?.team1?.flag
            ? <img src={sc.team1.flag} alt="" className="w-5 h-5 rounded-full bg-white/5 object-contain flex-shrink-0" />
            : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] border border-[#2c2c2e] text-emerald-400 font-bold flex items-center justify-center text-[8px] flex-shrink-0">{(sc?.team1?.shortName || t1 || 'T1').slice(0, 2)}</div>
          }
          <span className="font-bold text-sm truncate text-white">{sc?.team1?.name || t1}</span>
          <span className="font-mono font-black text-sm text-emerald-400 whitespace-nowrap ml-1 flex-shrink-0">{sc?.team1?.score || 'Yet to bat'}</span>
        </div>
        <span className="text-[9px] font-black text-[#3a3a3c] px-1">vs</span>
        <div className="flex items-center gap-1.5 min-w-0 justify-end">
          <span className="font-bold text-sm truncate text-white">{sc?.team2?.name || t2}</span>
          <span className="font-mono font-black text-sm text-sky-400 whitespace-nowrap mr-1 flex-shrink-0">{sc?.team2?.score || 'Yet to bat'}</span>
          {sc?.team2?.flag
            ? <img src={sc.team2.flag} alt="" className="w-5 h-5 rounded-full bg-white/5 object-contain flex-shrink-0" />
            : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] border border-[#2c2c2e] text-sky-400 font-bold flex items-center justify-center text-[8px] flex-shrink-0">{(sc?.team2?.shortName || t2 || 'T2').slice(0, 2)}</div>
          }
        </div>
      </div>

      {/* Row 3: Over balls + Outcome */}
      {(isLive || isCompleted || runningBall) && (
        <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1.5 py-1.5 px-2.5 rounded-lg border transition-all duration-500 ${
          isRunning
            ? 'bg-[#1a1a1a] border-[#2c2c2e]'
            : isFour
            ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_18px_rgba(59,130,246,0.25)]'
            : isSix
            ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_18px_rgba(34,197,94,0.25)]'
            : isWicket
            ? 'bg-red-600/10 border-red-600/50 shadow-[0_0_18px_rgba(220,38,38,0.25)]'
            : 'bg-[#1a1a1a] border-[#2c2c2e]'
        }`}>
          {/* Left: over balls */}
          <div className="flex items-center gap-1">
            {displayBalls.length > 0 ? displayBalls.map((b, bIdx) => {
              const isW = b === 'W' || b === 'w'
              const is4 = b === '4'
              const is6 = b === '6'
              const isExtra = /wd|nb|lb/i.test(b)
              return (
                <span key={bIdx} className={`min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-mono font-black text-[9px] ${
                  bIdx === displayBalls.length - 1 ? 'ring-1 ring-amber-400' : ''
                } ${
                  isW ? 'bg-red-600 text-white' : is6 ? 'bg-emerald-500 text-black' : is4 ? 'bg-blue-500 text-white' : isExtra ? 'bg-amber-600 text-white' : b === '0' ? 'bg-[#2c2c2e] text-[#8e8e93]' : 'bg-[#3a3a3c] text-white'
                }`}>{b}</span>
              )
            }) : <span className="text-[10px] text-[#8e8e93] italic">Between overs</span>}
          </div>
          {/* Centre: outcome or match result */}
          <div className="flex items-center justify-center gap-1.5">
            {isRunning && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" /></span>}
            {isCompleted ? (
              <span className="hidden md:block text-sm font-black text-amber-400 tracking-wide text-center px-3 py-0.5 rounded-lg bg-amber-400/10 border border-amber-400/30">
                🏆 {matchResultText}
              </span>
            ) : (
              <span className={`text-xs md:text-xl font-black tracking-wide whitespace-nowrap px-3 py-0.5 rounded-lg border ${
                isRunning
                  ? 'text-amber-400 bg-amber-400/10 border-amber-400/30'
                  : isFour
                  ? 'text-blue-400 bg-blue-500/15 border-blue-500/40'
                  : isSix
                  ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40'
                  : isWicket
                  ? 'text-red-400 bg-red-600/15 border-red-600/40'
                  : 'text-amber-400 bg-amber-400/10 border-amber-400/30'
              }`}>{outcomeFormatted}</span>
            )}
          </div>
          {/* Right: spacer */}
          <div />
        </div>
      )}

      {/* Row 4: Odds + Status Equation */}
      {(hasOdds || sc?.statusEquation || sc?.matchResult) && (
        <div className="mt-1.5 py-1 px-2 rounded-lg bg-[#1a1a1a] border border-[#2c2c2e] flex items-center justify-between gap-2 text-[10px]">
          {hasOdds && (
            <MarketRateDisplay team={co.rateTeam || sc?.team1?.name || t1} rate={co.rate} rate2={co.rate2} back={co.back} size="sm" />
          )}
          {isCompleted ? (
            <span className="font-bold text-amber-400 truncate ml-auto">🏆 {matchResultText}</span>
          ) : sc?.statusEquation ? (
            <span className="font-bold text-amber-400 truncate ml-auto">⚡ {stripHtml(sc.statusEquation)}</span>
          ) : null}
        </div>
      )}

      {/* Row 5: Batters + Bowler */}
      {((sc?.batters?.length > 0) || sc?.bowler) && (
        <div className="mt-1.5 pt-1.5 border-t border-[#2c2c2e] flex items-center gap-1 overflow-hidden">
          {sc.batters?.map((b, idx) => (
            <div key={idx} className="flex items-center gap-0.5 bg-[#1a1a1a] border border-[#2c2c2e] px-1.5 py-0.5 rounded text-[10px] flex-shrink-0">
              <span className="font-semibold text-[#e5e5ea] truncate max-w-[80px]">{b.name}{b.onStrike ? '*' : ''}:</span>
              <span className="font-mono font-black text-emerald-400">{b.runs}</span>
              <span className="text-[#8e8e93]">({b.balls})</span>
            </div>
          ))}
          {sc?.bowler && (
            <div className="flex items-center gap-0.5 bg-[#1a1a1a] border border-[#2c2c2e] px-1.5 py-0.5 rounded text-[10px] ml-auto flex-shrink-0">
              <span className="text-[#8e8e93]">Bowl:</span>
              <span className="font-semibold text-[#e5e5ea] truncate max-w-[80px]">{sc.bowler.name}</span>
              <span className="font-mono font-black text-amber-400">{sc.bowler.wicketsRuns}</span>
              <span className="text-[#8e8e93]">({sc.bowler.overs} ov)</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Dedicated Live & Ball-by-Ball Commentary Tab
 */
export function CrexLiveTab({ crexData, t1, t2 }) {
  if (!crexData) return null

  const sc = crexData.scorecard || {}
  const co = crexData.odds || {}
  const ballFeeds = crexData.ballFeeds || []
  const runningBall = crexData.runningBall || sc.runningBall || null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left Column (2 cols): Ball-by-Ball Commentary Timeline */}
      <div className="lg:col-span-2 rounded-2xl border border-[#1e293b] bg-[#0c1018] p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <h3 className="font-bold text-sm md:text-base text-white flex items-center gap-1.5 truncate">
              <span>🏏</span> Ball-by-Ball Live Commentary
            </h3>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {runningBall && (runningBall.runs || runningBall.status) && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-semibold hidden sm:inline">Ball:</span>
                <RunningBallBadge runningBall={runningBall} size="md" />
              </div>
            )}
            <span className="text-xs font-mono text-slate-400">
              {ballFeeds.length} deliveries
            </span>
          </div>
        </div>

        {/* Current Active Over Progression Strip */}
        {runningBall && (runningBall.outcomeText || runningBall.status || runningBall.runs) && (
          <div className="p-3 rounded-xl bg-[#0b1424] border border-[#23354d] shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">
                This Over{runningBall.over ? ` (${runningBall.over})` : ''}:
              </span>
              {runningBall.currentOverBalls && runningBall.currentOverBalls.length > 0 ? (
                <div className="flex items-center gap-1">
                  {runningBall.currentOverBalls.map((b, bIdx) => (
                    <span
                      key={bIdx}
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-black text-[10px] ${
                        bIdx === runningBall.currentOverBalls.length - 1 ? 'ring-2 ring-[#fae48b]' : ''
                      } ${
                        b === 'W' || b === 'w'
                          ? 'bg-red-500 text-white'
                          : b === '6'
                          ? 'bg-purple-600 text-white'
                          : b === '4'
                          ? 'bg-emerald-500 text-slate-950'
                          : b === '0'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400 italic">Between overs</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {runningBall.isRunning && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fae48b] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#fae48b]"></span>
                </span>
              )}
              <span className="text-sm sm:text-base font-black text-[#fae48b] tracking-wider select-none">
                {formatCrexOutcome(runningBall.outcomeText || runningBall.status || runningBall.runs, runningBall.isRunning)}
              </span>
            </div>
          </div>
        )}

        {ballFeeds.length > 0 ? (
          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1 divide-y divide-white/5">
            {ballFeeds.map((feed, idx) => {
              const isW = feed.isWicket
              const is4 = feed.isFour
              const is6 = feed.isSix
              return (
                <div key={feed.id || idx} className="pt-2.5 flex items-start gap-3 group">
                  {/* Over & Ball Badge */}
                  <div className="flex flex-col items-center flex-shrink-0 w-12 text-center">
                    {feed.over && (
                      <span className="text-[11px] font-mono font-bold text-slate-400">
                        {feed.over}
                      </span>
                    )}
                    {feed.runs !== '' && (
                      <span
                        className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-xs ${
                          isW
                            ? 'bg-red-500 text-white ring-2 ring-red-400/50'
                            : is6
                            ? 'bg-purple-600 text-white ring-2 ring-purple-400/50'
                            : is4
                            ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/50'
                            : feed.runs === '0'
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-700 text-white'
                        }`}
                      >
                        {feed.runs}
                      </span>
                    )}
                  </div>

                  {/* Delivery Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                        {feed.bowlerBatter || (isW ? 'WICKET!' : (is4 ? 'FOUR!' : (is6 ? 'SIX!' : 'Delivery')))}
                      </span>
                      {feed.score && (
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {feed.score}
                        </span>
                      )}
                    </div>
                    {feed.commentary && (
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {stripHtml(feed.commentary)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            Live commentary is warming up for this fixture...
          </div>
        )}
      </div>

      {/* Right Column (1 col): Live Rates & Sessions Desk */}
      <div className="space-y-4">
        {/* Live Market Rate Card */}
        <div className="rounded-2xl border border-[#1e293b] bg-[#0c1018] p-4 shadow-xl">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span>📈</span> Live Market Rates
          </h4>
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner flex flex-col gap-2.5">
            <MarketRateDisplay
              team={co?.rateTeam || sc?.team1?.name || t1 || 'Favorite'}
              rate={co?.rate}
              rate2={co?.rate2}
              size="lg"
            />
            {co?.session_min && co?.session_max && (
              <div className="mt-1 pt-2 border-t border-white/5 text-xs flex items-center justify-between text-slate-300">
                <span>Session ({co.session_overs || 6} Ov):</span>
                <span className="font-mono font-bold text-emerald-400">{co.session_min} - {co.session_max}</span>
              </div>
            )}
            {co?.lambi && (
              <div className="text-xs flex items-center justify-between text-slate-300">
                <span>Lambi:</span>
                <span className="font-mono font-bold text-purple-400">{co.lambi} {co.lambi2 ? `- ${co.lambi2}` : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Session Lines Table */}
        {co?.sessionTable && co.sessionTable.length > 0 ? (
          <div className="rounded-2xl border border-[#1e293b] bg-[#0c1018] p-4 shadow-xl">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span>⏱️</span> Session Lines Desk
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-bold">
                    <th className="pb-2">Overs</th>
                    <th className="pb-2 text-center">Settled</th>
                    <th className="pb-2 text-right">Min - Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {co.sessionTable.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 text-white font-bold">{row.over} Ov</td>
                      <td className="py-2 text-center text-emerald-400 font-bold">{row.settled}</td>
                      <td className="py-2 text-right text-slate-300 font-semibold">{row.min} - {row.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#1e293b] bg-[#0c1018] p-4 text-center text-xs text-slate-400">
            Session lines will appear as soon as the session opens.
          </div>
        )}
      </div>
    </div>
  )
}
