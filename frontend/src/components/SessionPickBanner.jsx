/** Yes/No session pick banner — shared by SessionPanel & SessionDetail */

export default function SessionPickBanner({ pick, overLabel }) {
  if (!pick?.pick) return null

  const isYes = pick.pick === 'YES'
  const color = isYes ? '#3b82f6' : '#ef4444'
  const bg = isYes ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)'
  const border = isYes ? 'rgba(59,130,246,0.4)' : 'rgba(239,68,68,0.4)'
  const strengthLabel = pick.strength === 'high' ? 'Strong' : pick.strength === 'low' ? 'Weak (tight gap)' : 'Moderate'

  return (
    <div className="rounded-xl p-3 border mb-3" style={{ background: bg, borderColor: border }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-[#8e8e93] mb-1">{overLabel} — Session Pick</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-black" style={{ color }}>{pick.pick}</span>
            <span className="text-lg font-bold text-white">@ {pick.betLine}</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>
              {strengthLabel}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-[#8e8e93]">Expected runs</div>
          <div className="text-xl font-black text-[#f59e0b]">~{pick.predictedRuns}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg px-2.5 py-2 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
          <div className="text-[9px] text-[#3b82f6] font-bold">YES line</div>
          <div className="text-sm font-black text-white">{pick.yesLine ?? '—'}</div>
          <div className="text-[9px] text-[#636366]">{pick.yesLine != null ? `${pick.yesLine}+ runs pe jeetega` : '—'}</div>
        </div>
        <div className="rounded-lg px-2.5 py-2 border border-[#2c2c2e]" style={{ background: '#0a0a0a' }}>
          <div className="text-[9px] text-[#ef4444] font-bold">NO line</div>
          <div className="text-sm font-black text-white">{pick.noLine ?? '—'}</div>
          <div className="text-[9px] text-[#636366]">{pick.noLine != null ? `${pick.noLine} se neeche pe jeetega` : '—'}</div>
        </div>
      </div>

      <div className="text-[10px] text-[#8e8e93] mt-2">{pick.reason}</div>
      {pick.oppositeLine != null && (
        <div className="text-[9px] text-[#636366] mt-1">
          Avoid opposite: {isYes ? `No @ ${pick.oppositeLine}` : `Yes @ ${pick.oppositeLine}`}
          {pick.gap != null && ` · Gap ${pick.gap.toFixed(0)} runs`}
        </div>
      )}
      {pick.volNote && <div className="text-[9px] text-[#eab308] mt-1">📊 {pick.volNote}</div>}
    </div>
  )
}
