import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function RiskBadge({ risk, compact = false }) {
  if (!risk) return null
  const isHigh = risk.tier === 'high' || risk.avoidEntry
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full ${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`}
      style={{ background: risk.bg, border: `1px solid ${risk.border}`, color: risk.hex }}
    >
      <span>{risk.emoji}</span>
      <span>{risk.shortLabel || risk.label}</span>
      {isHigh && (
        <span className="font-black uppercase tracking-wide" style={{ color: risk.hex }}>
          • Avoid entry
        </span>
      )}
      {!compact && (
        <span className="text-[#8e8e93] font-normal">• wrong {risk.wrongPct}</span>
      )}
    </span>
  )
}

export function AvoidEntryBanner({ risk }) {
  if (!risk?.avoidEntry && risk?.tier !== 'high') return null
  return (
    <div
      className="mt-2 px-2.5 py-1.5 rounded-lg text-center text-[10px] font-bold uppercase tracking-wide"
      style={{
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.35)',
        color: '#ef4444',
      }}
    >
      ⚠️ High risk — Avoid entry
      {risk.note && <span className="block normal-case font-normal text-[9px] text-[#8e8e93] mt-0.5">{risk.note}</span>}
    </div>
  )
}

export function ExitAdviceBanner({ advice }) {
  if (!advice) return null
  return (
    <div
      className="mt-2 px-2.5 py-2 rounded-lg text-center"
      style={{
        background: 'rgba(234,179,8,0.1)',
        border: '1px solid rgba(234,179,8,0.35)',
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-wide text-[#eab308]">
        ⚠️ {advice.title}
      </div>
      <div className="mt-1 text-[10px] font-normal normal-case text-[#8e8e93]">
        {advice.message}
      </div>
    </div>
  )
}

const FLIP_TONE = {
  high: {
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.35)',
    title: '#ef4444',
  },
  medium: {
    bg: 'rgba(234,179,8,0.1)',
    border: 'rgba(234,179,8,0.35)',
    title: '#eab308',
  },
  low: {
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.28)',
    title: '#22c55e',
  },
}

export function FavFlipRiskBanner({ risk }) {
  if (!risk) return null
  const tone = FLIP_TONE[risk.tier] || FLIP_TONE.medium
  const isAlert = risk.tier === 'medium' || risk.tier === 'high'
  return (
    <div
      className="mt-2 px-2.5 py-2 rounded-lg"
      style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
    >
      <div
        className="text-[10px] font-black uppercase tracking-wide text-center"
        style={{ color: tone.title }}
      >
        {risk.title}
      </div>
      <div className="mt-1 text-[10px] font-normal normal-case text-[#8e8e93] text-center">
        {risk.message}
      </div>
      {isAlert && risk.reasons?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          {risk.reasons.slice(0, 4).map((r) => (
            <span
              key={r}
              className="text-[9px] px-1.5 py-0.5 rounded-full text-[#c7c7cc]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2c2c2e' }}
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function MatchedRulesPanel({ rules, selectedReason }) {
  const [open, setOpen] = useState(false)
  if (!rules?.length) return null

  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  const conflicts = new Set(sorted.map((r) => r.winner)).size > 1

  return (
    <div className="mt-2 rounded-lg border border-[#2c2c2e] overflow-hidden" style={{ background: '#0a0a0a' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-[#141414] transition-colors"
      >
        <span className="text-[10px] text-[#8e8e93]">
          {sorted.length} rule{sorted.length !== 1 ? 's' : ''} matched
          {conflicts && <span className="text-[#eab308] ml-1">• conflict</span>}
        </span>
        {open ? <ChevronUp size={12} className="text-[#636366]" /> : <ChevronDown size={12} className="text-[#636366]" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-1 border-t border-[#2c2c2e]">
          {sorted.map((r) => {
            const isSelected = r.selected || r.reason === selectedReason
            return (
              <div
                key={`${r.reason}-${r.winner}`}
                className="flex items-center justify-between text-[9px] py-0.5"
                style={{ opacity: isSelected ? 1 : 0.65 }}
              >
                <span className={isSelected ? 'text-[#22c55e] font-bold' : 'text-[#8e8e93]'}>
                  {isSelected ? '→ ' : '  '}{r.reason}
                </span>
                <span className="text-[#636366]">
                  p{r.priority} · <span className="text-white">{r.winner}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
