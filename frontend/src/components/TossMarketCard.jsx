import { ChevronRight, Info } from 'lucide-react'
import { getTossMarketSummary } from '../../../server/utils/tossMarketSummary.mjs'
import { formatTossAmount as marketAmount, formatTossMoney } from '../utils/tossMarketDisplay'

export default function TossMarketCard({match,onOpen,isLive=false,isEnded=false,startLabel='',countdown}) {
  const market=match.tossLoad || getTossMarketSummary(match.snapshot,match)
  const teams=[market.team1,market.team2]
  return (
    <article className="toss-exchange-card" role="link" tabIndex={0}
      aria-label={`Open ${match.matchName} toss market`} onClick={onOpen}
      onKeyDown={event=>{if(event.target===event.currentTarget && (event.key==='Enter' || event.key===' ')){event.preventDefault();onOpen?.()}}}>
      <div className="toss-exchange-meta">
        <span className={`toss-status-pill ${isLive ? 'is-live' : isEnded ? 'is-completed' : 'is-upcoming'}`}>
          {isLive && <span className="status-dot" />}{isLive ? 'LIVE' : isEnded ? 'COMPLETED' : 'UPCOMING'}
        </span>
        <time>{startLabel}</time><span className="toss-exchange-league">{match.competitionName || 'Toss market'}</span>
        {!isLive && countdown && <span className="toss-exchange-countdown">Starts in {countdown}</span>}
        <span className="toss-exchange-open">View toss <ChevronRight size={15} aria-hidden="true" /></span>
      </div>
      <header className="toss-exchange-header">
        <h3>Which Team Will Win The Toss <Info size={13} aria-hidden="true" /></h3>
        <div>Total matched <strong title={formatTossMoney(market.totalMatched)}>{market.totalMatched == null ? '—' : `€${marketAmount(market.totalMatched)}`}</strong></div>
      </header>
      <div className="toss-exchange-teams" aria-label="Live toss market values" aria-live="polite">
        {teams.map((team,index)=><div className="toss-exchange-team" key={`${index}-${team.name}`}>
          <h4>{team.name}</h4>
          <div className="toss-exchange-quote">
            <strong aria-label={`${team.name} odds`}>{team.odds == null ? '—' : Number(team.odds).toFixed(2)}</strong>
            {team.liquidity != null && <span aria-label={`${team.name} available liquidity`}>{marketAmount(team.liquidity)}</span>}
            <small>{team.liquidity != null ? 'Available' : 'Odds'}</small>
          </div>
          <strong className="toss-exchange-volume" aria-label={`${team.name} matched money`}>{formatTossMoney(team.money)}</strong>
          <span className="toss-exchange-volume-label">Matched volume</span>
        </div>)}
      </div>
      {!teams.some(team=>team.money!=null || team.odds!=null) && <p className="toss-exchange-waiting">Waiting for market data</p>}
    </article>
  )
}
