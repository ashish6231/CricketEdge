const formatTotalBet = value => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function TotalBetLoadBars({ markets = [] }) {
  const availableMarkets = markets.filter(Boolean)
  if (!availableMarkets.length) return null

  return (
    <div className="total-bet-load-list">
      {availableMarkets.map(market => {
        const firstRaw = market.team1?.amount
        const secondRaw = market.team2?.amount
        const first = Number(firstRaw)
        const second = Number(secondRaw)
        const available = firstRaw != null && secondRaw != null
          && Number.isFinite(first) && first >= 0
          && Number.isFinite(second) && second >= 0 && first + second > 0
        const firstPct = available ? first / (first + second) * 100 : 0
        const secondPct = available ? 100 - firstPct : 0
        const firstIsLower = first <= second
        const secondIsLower = second <= first

        return (
          <section className="total-bet-load" key={market.label} aria-label={`${market.label} by total bets`}>
            <h3>{market.label}</h3>
            {available ? (
              <>
                <div className="total-bet-load-track" role="img" aria-label={`${market.team1.name}: ${firstPct.toFixed(1)}%, ${market.team2.name}: ${secondPct.toFixed(1)}%`}>
                  <span className={firstIsLower ? 'is-lower-load' : 'is-higher-load'} style={{ width: `${firstPct}%` }} />
                  <span className={secondIsLower ? 'is-lower-load' : 'is-higher-load'} style={{ width: `${secondPct}%` }} />
                </div>
                <div className="total-bet-load-labels">
                  <span title={formatTotalBet(first)}>{market.team1.name}: {firstPct.toFixed(1)}%</span>
                  <span title={formatTotalBet(second)}>{market.team2.name}: {secondPct.toFixed(1)}%</span>
                </div>
              </>
            ) : <p className="total-bet-load-empty">Total bet values unavailable</p>}
          </section>
        )
      })}
    </div>
  )
}
