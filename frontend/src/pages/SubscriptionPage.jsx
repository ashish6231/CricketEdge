import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { LoaderCircle, CheckCircle, Crown, Calendar, AlertTriangle } from 'lucide-react'
import { getPlans, getMySubscription, createOrder, verifyPayment, paymentFailed } from '../api'

const fmt = (n) => Number(n).toLocaleString('en-IN')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { isLoggedIn, user } = useOutletContext()
  const [plan, setPlan] = useState(null)
  const [mySub, setMySub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [cycle, setCycle] = useState('monthly')

  useEffect(() => {
    if (!isLoggedIn) { navigate('/'); return }
    Promise.all([getPlans(), getMySubscription()])
      .then(([plansRes, subRes]) => {
        setPlan(plansRes.data?.[0])
        setMySub(subRes)
      })
      .catch(() => setError('Failed to load subscription data'))
      .finally(() => setLoading(false))
  }, [isLoggedIn])

  const handleBuy = async () => {
    setError(''); setMsg(''); setPaying(true)
    try {
      const order = await createOrder(cycle)
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'CricketEdge Pro',
        description: `Pro Plan - ${cycle}`,
        order_id: order.orderId,
        handler: async (response) => {
          try {
            const res = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            setMsg(res.message || '✅ Pro activated!')
            const subRes = await getMySubscription()
            setMySub(subRes)
          } catch (e) {
            setError(e.detail || 'Payment verification failed')
          } finally {
            setPaying(false)
          }
        },
        modal: {
          ondismiss: async () => {
            await paymentFailed(order.orderId).catch(() => {})
            setPaying(false)
          }
        },
        prefill: { email: user?.email || '' },
        theme: { color: '#dc2626' }
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (e) {
      setError(e.detail || 'Could not create order')
      setPaying(false)
    }
  }

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  const isPro = mySub?.subscription?.planSlug === 'pro' && mySub?.subscription?.status === 'active'
  const expiresAt = mySub?.subscription?.expiresAt
  const hasQueued = mySub?.queuedSubscription?.status === 'pending'
  const price = cycle === 'yearly' ? plan?.yearlyPrice : plan?.price

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 fade-in">
      <h1 className="text-2xl font-black text-text-primary">Subscription</h1>

      {/* Current Status */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Crown size={18} className={isPro ? 'text-yellow-500' : 'text-text-muted'} />
          <span className="font-bold text-text-primary">Current Plan</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-xl font-black ${isPro ? 'text-yellow-500' : 'text-text-muted'}`}>
              {isPro ? '⭐ Pro' : 'Free'}
            </div>
            {isPro && expiresAt && (
              <div className="text-xs text-text-muted mt-1 flex items-center gap-1">
                <Calendar size={12} /> Expires: {fmtDate(expiresAt)}
              </div>
            )}
            {hasQueued && (
              <div className="text-xs text-profit mt-1">✅ Next renewal queued</div>
            )}
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${isPro ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
            {mySub?.subscription?.status || 'active'}
          </div>
        </div>
      </div>

      {/* Subscription History */}
      {mySub?.history?.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <div className="font-bold text-text-primary mb-3">Payment History</div>
          <div className="space-y-2">
            {mySub.history.map((h, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-border/40 last:border-0">
                <div>
                  <div className="font-medium capitalize">{h.planSlug} — {h.billingCycle}</div>
                  <div className="text-xs text-text-muted">{fmtDate(h.startedAt)} → {fmtDate(h.expiresAt)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">₹{fmt(h.amount)}</div>
                  <div className={`text-xs ${h.payment?.status === 'completed' ? 'text-profit' : 'text-loss'}`}>{h.payment?.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pro Plan Card */}
      {plan && !isPro && (
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#fff5f5,#fff8f0)', border: '2px solid #fecaca' }}>
          <div className="flex items-center gap-2 mb-1">
            <Crown size={20} className="text-yellow-500" />
            <span className="text-lg font-black text-text-primary">{plan.name}</span>
          </div>
          <p className="text-xs text-text-muted mb-4">{plan.description}</p>

          {/* Billing toggle */}
          <div className="flex gap-2 mb-4">
            {['monthly', 'yearly'].map(c => (
              <button key={c} onClick={() => setCycle(c)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${cycle === c ? 'text-white' : 'text-text-secondary'}`}
                style={cycle === c ? { background: 'linear-gradient(135deg,#dc2626,#f97316)' } : { background: '#fff0f0', border: '1px solid #fecaca' }}
              >
                {c === 'monthly' ? `Monthly ₹${fmt(plan.price)}` : `Yearly ₹${fmt(plan.yearlyPrice)}`}
                {c === 'yearly' && <span className="ml-1 text-xs opacity-80">(Save 2mo)</span>}
              </button>
            ))}
          </div>

          {/* Features */}
          <div className="space-y-1.5 mb-4">
            {plan.features?.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle size={14} className="text-profit flex-shrink-0" />
                <span className="text-text-secondary">{f}</span>
              </div>
            ))}
          </div>

          {msg && <div className="rounded-lg px-3 py-2 mb-3 text-xs text-center text-profit" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>{msg}</div>}
          {error && <div className="rounded-lg px-3 py-2 mb-3 text-xs text-primary flex items-center gap-2" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid #fecaca' }}><AlertTriangle size={14} />{error}</div>}

          <button onClick={handleBuy} disabled={paying}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}
          >
            {paying ? <LoaderCircle size={16} className="animate-spin" /> : <Crown size={16} />}
            {paying ? 'Processing...' : `Buy Pro — ₹${fmt(price)}`}
          </button>
        </div>
      )}

      {isPro && (
        <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)' }}>
          <Crown size={32} className="text-yellow-500 mx-auto mb-2" />
          <div className="text-lg font-black text-profit">You're on Pro! 🎉</div>
          <div className="text-xs text-text-muted mt-1">Full access to all features</div>
          {!hasQueued && plan && (
            <button onClick={handleBuy} disabled={paying}
              className="mt-4 px-6 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}
            >
              Renew Early
            </button>
          )}
        </div>
      )}
    </div>
  )
}
