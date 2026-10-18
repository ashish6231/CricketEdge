import { AlertTriangle, ChevronDown, LockKeyhole, Trophy } from 'lucide-react'
import { RiskBadge } from './PredictionMeta'

export function MatchReversalNotice({ advice }) {
  if (!advice) return null
  return (
    <div className={`match-exit-advice is-${advice.level}`} role="alert">
      <details>
        <summary><AlertTriangle size={14} /><strong>{advice.title}</strong><span>Details<ChevronDown size={13} /></span></summary>
        <p>{advice.message}</p>
      </details>
    </div>
  )
}

export default function MatchPredictionCard({ prediction, evidence, providerEvidence, activityEvidence, teamNames, formatAmount, formatPercentage }) {
  if (!prediction?.winnerName) return null
  const highRisk = prediction.risk?.avoidEntry || prediction.risk?.tier === 'high'
  return (
    <section className="match-v2-prediction" aria-label="Match winner prediction">
      <details>
        <summary className="match-v2-prediction-summary">
          <div className="match-v2-pick"><Trophy size={18} /><div>
            <small>{highRisk ? 'Market lean · no bet' : 'Predicted winner'}<span><LockKeyhole size={10} />Locked</span></small>
            <h2>{prediction.winnerName}</h2>
          </div></div>
          <div className="match-v2-prediction-badges"><span className="match-rule-tag">Rule based</span><RiskBadge risk={prediction.risk} compact /></div>
          <span className="match-v2-prediction-toggle"><span>Details</span>{evidence && <small>{evidence.agreeingSignals}/{evidence.signalCount}</small>}<ChevronDown size={14} /></span>
        </summary>
        <div className="match-v2-prediction-body">
          <div className="match-v2-prediction-copy">
            {prediction.confidence?.calibrated && <strong>{prediction.confidence.pct}% calibrated confidence</strong>}
            {highRisk && <span className="match-risk-notice" role="alert"><AlertTriangle size={13} />High risk: entry avoid karein</span>}
            <p>{prediction.reason}</p>
            <div><span><LockKeyhole size={10} />Start pick locked</span>{!prediction.confidence?.calibrated && <span>Accuracy unvalidated</span>}</div>
          </div>
          {evidence && <div className="match-v2-evidence">
            <table className="match-data-table" aria-label="Prediction market evidence"><thead><tr><th scope="col">Market evidence</th>{teamNames.map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>
              {evidence.support && <tr><th scope="row">Corrected support</th><td>{formatPercentage(evidence.support.pct1)}</td><td>{formatPercentage(evidence.support.pct2)}</td></tr>}
              {providerEvidence ? <tr><th scope="row">Pre-match provider total</th><td>€{formatAmount(providerEvidence.team1)}</td><td>€{formatAmount(providerEvidence.team2)}</td></tr>
                : <tr><th scope="row">Pre-match activity</th><td>{activityEvidence ? formatAmount(activityEvidence.team1) : formatPercentage(evidence.activity?.pct1)}</td><td>{activityEvidence ? formatAmount(activityEvidence.team2) : formatPercentage(evidence.activity?.pct2)}</td></tr>}
              {evidence.bookmakerPressureIdx != null && <tr><th scope="row">Bookie liability</th><td>{evidence.bookmakerPressureIdx === 0 ? 'Pressure' : '—'}</td><td>{evidence.bookmakerPressureIdx === 1 ? 'Pressure' : '—'}</td></tr>}
            </tbody></table>
          </div>}
        </div>
      </details>
    </section>
  )
}
