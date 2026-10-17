import { isWorldLegendsTossLeague, WORLD_LEGENDS_TOSS_PARAMETERS } from '../../../server/utils/worldLegendsTossAlgorithm'

const finite = value => Number.isFinite(value) ? value : null
const stake = value => Number.isFinite(value) && value >= 0 ? value : null
const percent = value => value == null ? '—' : `${value.toFixed(0)}%`
const money = value => value == null ? '—' : `${value < 0 ? '−' : '+'}€${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const shares = (a, b) => a != null && b != null && a + b > 0
  ? [a / (a + b) * 100, b / (a + b) * 100] : [null, null]
const leader = ([a, b]) => a == null || b == null || a === b ? null : a > b ? 0 : 1

export default function LegendsTossMarketEvidence({ snap, prediction }) {
  if (!isWorldLegendsTossLeague(snap?.competitionName || snap?.seriesName || '')) return null

  const teams = [0, 1].map(index => {
    const key = `team${index + 1}`
    return {
      name: snap.teamNames?.[index] || `Team ${index + 1}`,
      back: stake(snap.preMatchVolume?.[key]?.back),
      lay: stake(snap.preMatchVolume?.[key]?.lay),
      activity: stake(snap.preMatchTotalBets?.[key]),
      pnl: finite(snap.preMatchPnl?.[key]),
      exposure: finite(snap.bookmakerExposure?.[key]?.netExposure),
    }
  })
  const [a, b] = teams
  const support = a.back != null && b.back != null && a.lay != null && b.lay != null
    ? shares(a.back + b.lay, b.back + a.lay) : [null, null]
  const activity = shares(a.activity, b.activity)
  const signals = [leader(support), leader(activity)].filter(Number.isInteger)
  const aligned = signals.length === 2 && signals[0] === signals[1]
  const rows = [
    { label: 'Corrected support', hint: 'Own back + opposing lay', values: support.map(percent) },
    { label: 'Pre-match activity', hint: 'Reported toss activity', values: activity.map(percent) },
    { label: 'Bookie liability', hint: 'Context only · toss P/L', values: teams.map(team => team.pnl < 0 ? `Pressure (${money(team.pnl)})` : money(team.pnl)) },
    { label: 'Net exposure', values: teams.map(team => money(team.exposure)) },
    { label: 'Lay/back ratio', values: teams.map(team => team.back > 0 && team.lay != null
      ? `${(team.lay / team.back * 100).toFixed(2)}%` : team.back === 0 && team.lay > 0 ? 'No back volume' : '—') },
    { label: 'Back lead', values: teams.map((team, index) => {
      const opposingBack = teams[1 - index].back
      if (team.back == null || opposingBack == null || team.back + opposingBack === 0) return '—'
      return opposingBack > 0 ? `${(team.back / opposingBack).toFixed(2)}×` : 'No opposing back'
    }) },
  ]
  const highLayApplied = prediction?.algorithmEvidence?.highLayExceptionApplied
  const zeroLayApplied = prediction?.algorithmEvidence?.zeroLayExceptionApplied

  return (
    <section className="toss-market-evidence" aria-label="Legends toss market evidence">
      <header>
        <h3>Market evidence</h3>
        <span>{aligned ? `2/2 core signals favor ${teams[signals[0]].name}` : signals.length === 2 ? 'Core signals disagree' : `${signals.length}/2 core signals available`}</span>
      </header>
      <table aria-label="Toss market evidence by team">
        <thead>
          <tr><th scope="col">Signal</th>{teams.map((team, index) => <th key={index} scope="col">{team.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <th scope="row" title={row.hint}>{row.label}{row.hint && <small>{row.hint}</small>}</th>
              {row.values.map((value, index) => <td key={index}>{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="toss-evidence-footer">
        <p><strong>{prediction ? highLayApplied ? 'High-lay reversal applied.' : zeroLayApplied ? 'Both-zero-lay reversal applied.' : 'Support/activity selection retained.' : 'No toss pick: missing or conflicting signals.'}</strong>{' '}
          Reverse if lay/back ≥{WORLD_LEGENDS_TOSS_PARAMETERS.layBackResistance * 100}% + back lead ≥{WORLD_LEGENDS_TOSS_PARAMETERS.highLayMinBackLead}×, or both lays = 0.
        </p>
        <p>P/L and net exposure are context only.</p>
      </footer>
    </section>
  )
}
