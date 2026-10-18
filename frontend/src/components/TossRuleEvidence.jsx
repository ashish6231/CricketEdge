const amount = value => value == null ? '—' : `€${value.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})}`
const signed = value => value == null ? '—' : `${value >= 0 ? '+' : '−'}${amount(Math.abs(value))}`

export default function TossRuleEvidence({ snap, prediction, inputs }) {
  const totals = inputs.providerTotals || [null, null]
  const pl = inputs.pl
  const primary = inputs.mode === 'risk'
  const higher = !primary && inputs.rule.selection === 'higher'
  const count = inputs.rule.signalCount
  const zeros = inputs.risk.zeroTeams.map(index => snap.teamNames?.[index] || `Team ${index+1}`).join(' and ')
  const riskRows = primary ? [
    {label:'Back risk',values:inputs.risk.back},
    {label:'Lay risk',values:inputs.risk.lay},
    {label:'Combined back + lay risk',values:inputs.risk.total},
  ] : [{label:'Combined risk (context)',values:inputs.risk.total}]
  return (
    <section className="toss-market-evidence" aria-label="Toss prediction rule evidence">
      <header><h3>Prediction evidence</h3>
        <span>{prediction ? `${count}/${count} ${count === 1 ? 'condition favors' : 'conditions favor'} ${prediction.winnerName}`
          : primary ? 'No pick: combined risk missing or equal' : higher ? 'No pick: provider totals missing or equal' : 'No pick: both fallback conditions must agree'}</span>
      </header>
      <table aria-label="Current toss risk and fallback evidence">
        <thead><tr><th scope="col">Condition</th>{[0,1].map(index => <th key={index} scope="col">{snap.teamNames?.[index] || `Team ${index+1}`}</th>)}</tr></thead>
        <tbody>
          {riskRows.map(row => <tr key={row.label}><th scope="row">{row.label}{row.label === 'Combined back + lay risk' && <small>Lower combined risk wins</small>}</th>{row.values.map((value,index) => <td key={index}>{amount(value)}</td>)}</tr>)}
          {!primary && <>
            <tr><th scope="row">Current provider total<small>{higher ? 'Higher total required' : 'Lower total required'}</small></th>{totals.map((value,index) => <td key={index}>{amount(value)}</td>)}</tr>
            {!higher && <tr><th scope="row">Current P/L<small>Must be greater than zero</small></th>{pl.map((value,index) => <td key={index} className={value == null || value === 0 ? 'text-text-muted' : value > 0 ? 'text-profit' : 'text-loss'}>{signed(value)}</td>)}</tr>}
          </>}
        </tbody>
      </table>
      <footer className="toss-evidence-footer"><p>{primary
        ? 'Primary rule: lower Back risk + Lay risk selects the winner. Missing or equal combined risk produces no pick. A team with both risks zero activates the fallback.'
        : `Fallback active: back risk and lay risk are both zero for ${zeros}. ` + (higher
          ? 'South Africa T20 selects the higher current provider total.'
          : 'The same team must have positive current P/L and a strictly lower current provider total.')}</p></footer>
    </section>
  )
}
