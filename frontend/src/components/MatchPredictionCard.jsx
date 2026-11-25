import { Trophy } from 'lucide-react'

export default function MatchPredictionCard({ prediction, label = 'Predicted winner', ariaLabel = 'Match winner prediction' }) {
  if (!prediction?.winnerName) return null
  return (
    <section className="match-v2-prediction" aria-label={ariaLabel}>
      <div className="match-v2-prediction-summary">
        <div className="match-v2-pick"><Trophy size={18} /><div>
          <small>{label}</small>
          <h2>{prediction.winnerName}</h2>
        </div></div>
      </div>
    </section>
  )
}
