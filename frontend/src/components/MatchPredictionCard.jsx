import { Trophy } from 'lucide-react'

export default function MatchPredictionCard({ prediction }) {
  if (!prediction?.winnerName) return null
  return (
    <section className="match-v2-prediction" aria-label="Match winner prediction">
      <div className="match-v2-prediction-summary">
        <div className="match-v2-pick"><Trophy size={18} /><div>
          <small>Predicted winner</small>
          <h2>{prediction.winnerName}</h2>
        </div></div>
      </div>
    </section>
  )
}
