import { finiteNumber, getBookiePlWindows } from '../utils/bookiePl.js'

const money = value => value == null ? '—' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const profit = value => value == null ? '—' : `${value >= 0 ? '+' : '−'}€${money(Math.abs(value))}`

export default function BookiePeriodMetrics({ snapshot, team1, team2, drawName = null, startTime, market = 'Match' }) {
  const names = [team1, team2, ...(drawName ? [drawName] : [])]
  const windows = getBookiePlWindows(snapshot, team1, team2, drawName, { startTime })
  return <section className="bookie-period-section" aria-label={`${market} bookie P/L by period`}>
    <div className="bookie-period-heading"><h3>{market} bookie P/L by period</h3><p>Calculated from matched prices when available. Provider snapshots are clearly labelled. Before commission.</p></div>
    <div className="bookie-period-grid">
      {[['preMatch', 'Pre-match', 'preMatchVolume'], ['live', 'In-play', 'inPlayVolume'], ['threeMin', '3-minute live snapshot', 'threeMinVolume']].map(([key, title, volumeField]) => {
        const window = windows[key]
        return <article key={key} className="bookie-period-card" data-period={key}>
          <header><h4>{title}</h4><span>{window.verified ? 'Calculated' : window.source === 'provider' ? 'Provider reported' : 'Unavailable'}</span></header>
          <div className="bookie-period-scroll"><table><thead><tr><th>Metric</th>{names.map((name, index) => <th key={name} className={`team-tone-${index}`}>{name}</th>)}</tr></thead><tbody>
            <tr><th scope="row">Bookie P/L</th>{names.map((name, index) => <td key={name} className={`team-tone-${index} ${window.byName[name] == null ? '' : window.byName[name] >= 0 ? 'text-profit' : 'text-loss'}`}>{profit(window.byName[name])}</td>)}</tr>
            {['back', 'lay'].map(side => <tr key={side}><th scope="row">{side === 'back' ? 'Back stake' : 'Lay stake'}</th>{names.map((name, index) => {
              const teamIndex = snapshot?.teamNames?.indexOf(name) ?? -1
              const stats = window.stats?.[name]
              const value = stats ? stats[side === 'back' ? 'tBack' : 'tLay'] : teamIndex >= 0 ? finiteNumber(snapshot?.[volumeField]?.[`team${teamIndex + 1}`]?.[side]) : null
              return <td key={name} className={`team-tone-${index}`}>{value == null ? '—' : `€${money(value)}`}</td>
            })}</tr>)}
          </tbody></table></div>
          {!window.verified && <p className="bookie-period-note">{window.source === 'provider' ? 'Provider-reported snapshot. Exact period prices/liabilities are unavailable, so this is not marked as calculated.' : 'Complete, time-matched trades with prices are unavailable for this period.'}</p>}
        </article>
      })}
    </div>
    <details className="bookie-formula"><summary>How P/L is calculated</summary><p>If a team wins: − its back liabilities + its lay liabilities + other outcomes’ back stakes − other outcomes’ lay stakes. Liability = stake × (decimal odds − 1). Draw is included when available. Frozen pre-match, in-play and 3-minute snapshots keep their original market period.</p></details>
  </section>
}
