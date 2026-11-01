const amount = value => value == null ? '—' : `€${value.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}`
const signed = value => value == null ? '—' : `${value < 0 ? '−' : '+'}${amount(Math.abs(value))}`

export default function TossRuleEvidence({ snap, prediction, inputs }) {
  const direction = inputs.selection === 'higher' ? 'Higher' : 'Lower'
  const rows = [
    {label:'Back risk',values:inputs.risk.back},
    {label:'Lay risk',values:inputs.risk.lay},
    {label:'Net exposure (Back − Lay)',values:inputs.risk.net,net:true},
  ]
  return (
    <section className="toss-market-evidence" aria-label="Toss prediction rule evidence">
      <header><h3>Prediction evidence</h3>
        <span>{prediction ? `1/1 condition favors ${prediction.winnerName}` : inputs.unavailableReason || 'No pick: net exposure is equal'}</span>
      </header>
      <table aria-label="Current toss exposure evidence">
        <thead><tr><th scope="col">Condition</th>{[0,1].map(index => <th key={index} scope="col">{snap.teamNames?.[index] || `Team ${index+1}`}</th>)}</tr></thead>
        <tbody>
          {rows.map((row,rowIndex) => <tr key={row.label}><th scope="row">{row.label}{rowIndex === 2 && <small>{direction} net exposure wins</small>}</th>{row.values.map((value,index) => <td key={index} className={row.net && prediction?.winnerIdx === index ? 'is-selected' : undefined}>{row.net ? signed(value) : amount(value)}</td>)}</tr>)}
        </tbody>
      </table>
      <footer className="toss-evidence-footer"><p>{direction} net exposure (Back risk − Lay risk) selects the winner. WBBL and international matches use higher net exposure; all other leagues use lower net exposure. Both teams must have Back risk and Lay risk greater than zero. Zero or missing values mean incomplete data; equal net exposure produces no pick.</p></footer>
    </section>
  )
}
