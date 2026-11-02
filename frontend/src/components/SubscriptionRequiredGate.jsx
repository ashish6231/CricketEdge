import { Crown, ArrowUpRight, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminTelegramLink } from './TelegramLink'

export default function SubscriptionRequiredGate({ onBack, featureLabel = 'this market' }) {
  return (
    <div className="subscription-gate-wrap">
      <section className="subscription-gate" aria-labelledby="subscription-gate-title">
        <span className="subscription-gate-icon"><Crown size={24} /></span>
        <p className="subscription-gate-eyebrow">PREMIUM ACCESS</p>
        <h2 id="subscription-gate-title">Subscription required</h2>
        <p>Live and upcoming {featureLabel} details need a plan that includes {featureLabel}. Choose a plan and submit your UPI payment for verification.</p>
        <Link to="/subscription" className="paid-announcement-join"><Crown size={18} /><span>Choose a plan</span><ArrowUpRight size={18} /></Link>
        <AdminTelegramLink className="subscription-gate-help"><MessageCircle size={14} /> Need help? Contact admin</AdminTelegramLink>
        <button type="button" onClick={onBack}>← Back to matches</button>
      </section>
    </div>
  )
}
