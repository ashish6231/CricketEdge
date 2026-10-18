import { isWorldLegendsTossLeague } from '../../../server/utils/worldLegendsTossAlgorithm'
import { finiteNumber } from '../utils/bookiePl'

export default function LegendsTossMarketEvidence({ snap, prediction }) {
  if (!isWorldLegendsTossLeague(snap?.competitionName || snap?.seriesName || '')) return null
  const values = ['team1', 'team2'].map(key => {
    const value = finiteNumber(snap.preMatchTotalBets?.[key])
    return value != null && value >= 0 ? value : null
  })
  const teams = [0, 1].map(index => snap.teamNames?.[index] || `Team ${index + 1}`)
  return (
    <section className="toss-market-evidence" aria-label="Legends toss market evidence">
      <header><h3>Market evidence</h3>
        <span>{prediction ? `1/1 signal favors ${prediction.winnerName}` : 'No pick: activity missing or equal'}</span>
      </header>
      <table aria-label="Toss market evidence by team">
        <thead><tr><th scope="col">Signal</th>{teams.map((team,index) => <th key={index} scope="col">{team}</th>)}</tr></thead>
        <tbody><tr><th scope="row">Pre-match reported activity<small>Higher toss activity selects the winner</small></th>
          {values.map((value,index) => <td key={index}>{value == null ? '—' : value.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>)}
        </tr></tbody>
      </table>
      <footer className="toss-evidence-footer"><p>Uses this toss market’s frozen pre-match activity. Missing or equal activity produces no prediction.</p></footer>
    </section>
  )
}
