import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Calendar, CheckCircle, Crown, LoaderCircle } from 'lucide-react'
import { getPlans, getMySubscription, getUpiPaymentSettings } from '../api'
import { useToast } from '../components/ToastProvider'
import { isActiveTrial, getTrialMinutesLeft, formatTrialTimeLeft, getPlanPurchaseState, hasProAccess, PLAN_NAMES } from '../lib/subscriptionAccess'
import SubscriptionCheckout from '../components/SubscriptionCheckout'
import MyPaymentRequests from '../components/MyPaymentRequests'

const fmt = value => Number(value || 0).toLocaleString('en-IN')
const fmtDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const PAID_SLUGS = new Set(['lite', 'pro'])
const CHECKOUT_KEY = 'cricedge:pending-checkout'

export default function SubscriptionPage() {
  const toast = useToast()
  const { isLoggedIn, user, isFreeMode } = useOutletContext() || {}
  const [plans, setPlans] = useState([])
  const [mySub, setMySub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState('monthly')
  const [checkout, setCheckout] = useState(null)
  const [paymentSettings, setPaymentSettings] = useState(null)
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(false)
  const [requestsRefresh, setRequestsRefresh] = useState(0)
  const restoredCheckout = useRef(false)

  const refreshSubscription = useCallback(async () => {
    if (!isLoggedIn) return
    try { setMySub(await getMySubscription()) } catch {}
  }, [isLoggedIn])

  const openCheckout = useCallback(async (plan, selectedCycle) => {
    setCheckout({ plan, cycle: selectedCycle })
    setPaymentSettingsLoading(true)
    try { setPaymentSettings((await getUpiPaymentSettings()).data) }
    catch (error) { setPaymentSettings({ enabled: false }); toast.error(error.detail || 'Payment details are unavailable') }
    finally { setPaymentSettingsLoading(false) }
  }, [toast])

  const choosePlan = (plan, selectedCycle) => {
    if (!isLoggedIn || !user?.email) {
      sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ planSlug: plan.slug, cycle: selectedCycle }))
      window.dispatchEvent(new CustomEvent('open-login-modal'))
      return
    }
    const activeSubscription = mySub?.subscription || user?.subscription
    const activeSlug = activeSubscription?.planSlug || 'free'
    const purchaseState = getPlanPurchaseState({ currentSlug: activeSlug, planSlug: plan.slug, active: PAID_SLUGS.has(activeSlug) && hasProAccess({ role: user?.role, subscription: activeSubscription }) })
    if (purchaseState.disabled) {
      toast.info(purchaseState.isCurrent ? `${plan.name} is already active.` : 'CricEdge Lite is already included in your Pro plan.', 3000)
      return
    }
    openCheckout(plan, selectedCycle)
  }

  useEffect(() => {
    Promise.all([getPlans(), isLoggedIn ? getMySubscription() : Promise.resolve(null)])
      .then(([plansRes, subRes]) => {
        setPlans((plansRes.data || []).filter(plan => PAID_SLUGS.has(plan.slug)))
        setMySub(subRes)
      })
      .catch(() => toast.error('Failed to load subscription plans'))
      .finally(() => setLoading(false))
  }, [isLoggedIn, toast])

  useEffect(() => {
    if (!isLoggedIn || !user?.email || loading || restoredCheckout.current) return
    restoredCheckout.current = true
    let pending
    try { pending = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || 'null') } catch {}
    sessionStorage.removeItem(CHECKOUT_KEY)
    const plan = plans.find(item => item.slug === pending?.planSlug)
    const activeSubscription = mySub?.subscription || user?.subscription
    const activeSlug = activeSubscription?.planSlug || 'free'
    const purchaseState = getPlanPurchaseState({ currentSlug: activeSlug, planSlug: plan?.slug, active: PAID_SLUGS.has(activeSlug) && hasProAccess({ role: user?.role, subscription: activeSubscription }) })
    if (plan && !purchaseState.disabled) openCheckout(plan, pending.cycle === 'yearly' ? 'yearly' : 'monthly')
  }, [isLoggedIn, user, mySub, loading, plans, openCheckout])

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>

  const subscription = mySub?.subscription
  const currentSlug = subscription?.planSlug || user?.subscription?.planSlug || 'free'
  const onTrial = subscription?.isTrial || isActiveTrial({ subscription, role: user?.role })
  const trialMinutesLeft = subscription?.trialMinutesLeft ?? getTrialMinutesLeft({ subscription, role: user?.role })
  const expiresAt = subscription?.expiresAt
  const currentName = onTrial ? `Trial · ${formatTrialTimeLeft(trialMinutesLeft)} left` : PLAN_NAMES[currentSlug] || 'Free'
  const activePaidPlan = PAID_SLUGS.has(currentSlug) && hasProAccess({ role: user?.role, subscription: subscription || user?.subscription })

  return (
    <div className="subscription-page ui-page mx-auto space-y-5 fade-in">
      <div className="subscription-heading">
        <div><p className="ui-eyebrow">CRICEDGE MEMBERSHIP</p><h1>Choose your plan</h1><p>Lite for Cricket, Toss & Session. Pro adds complete Tennis access.</p></div>
        <div className="subscription-cycle" role="group" aria-label="Billing period">
          {['monthly', 'yearly'].map(value => <button key={value} type="button" aria-pressed={cycle === value} onClick={() => setCycle(value)}>{value === 'monthly' ? 'Monthly' : 'Yearly'}</button>)}
        </div>
      </div>

      {isFreeMode && <div className="subscription-free-note">Plans are visible now. Paid access starts on 4 November at 8 PM IST.</div>}

      <section className="subscription-current" aria-label="Current subscription">
        <span className="subscription-current-icon"><Crown size={19} /></span>
        <div><small>CURRENT PLAN</small><strong>{currentName}</strong></div>
        {expiresAt && <span className="subscription-expiry"><Calendar size={13} /> {onTrial ? 'Trial ends' : 'Expires'} {fmtDate(expiresAt)}</span>}
      </section>

      <div className="subscription-plan-grid">
        {plans.map(plan => {
          const { isCurrent, includedInPro, disabled } = getPlanPurchaseState({ currentSlug, planSlug: plan.slug, active: activePaidPlan })
          const price = cycle === 'yearly' ? plan.yearlyPrice : plan.price
          return (
            <article key={plan.slug} className={`subscription-plan-card ${plan.slug === 'pro' ? 'is-featured' : ''} ${isCurrent ? 'is-current' : ''} ${includedInPro ? 'is-included' : ''}`}>
              <div className="subscription-plan-top">
                <span className="subscription-plan-icon"><Crown size={19} /></span>
                <div><h2>{plan.name}</h2><p>{plan.description}</p></div>
                <span className="subscription-plan-badges">{plan.slug === 'pro' && !isCurrent && <span className="subscription-best">BEST VALUE</span>}{isCurrent && <span className="subscription-current-badge">ACTIVE</span>}{includedInPro && <span className="subscription-included-badge">INCLUDED IN PRO</span>}</span>
              </div>
              <div className="subscription-price"><strong>₹{fmt(price)}</strong><span>/{cycle === 'yearly' ? 'year' : 'month'}</span></div>
              <div className="subscription-plan-features">
                {(plan.features || []).map((feature, index) => <div key={index}><CheckCircle size={15} /><span>{feature}</span></div>)}
              </div>
              <button type="button" className="subscription-buy" disabled={disabled} onClick={() => choosePlan(plan, cycle)}>
                <span>{isCurrent ? '✓ Active plan' : includedInPro ? 'Included with Pro' : `Choose ${plan.name}`}</span>
              </button>
              <small className="subscription-admin-note">{isCurrent ? `Active until ${fmtDate(expiresAt)}` : includedInPro ? 'Already available with your Pro plan' : 'Pay by UPI · Activates after verification'}</small>
            </article>
          )
        })}
      </div>
      <p className="subscription-free-note">Without an active plan, you can open completed match details for free. Live and upcoming details require a plan that includes that market.</p>

      {!plans.length && <div className="subscription-empty">Plans are being updated. Please contact @cricedgeonline on Telegram.</div>}

      {isLoggedIn && <MyPaymentRequests refreshKey={requestsRefresh} onApproved={refreshSubscription} />}

      {mySub?.history?.length > 0 && <details className="subscription-history">
        <summary>Payment history</summary>
        {mySub.history.map((entry, index) => <div key={index}>
          <span><strong>{PLAN_NAMES[entry.planSlug] || entry.planSlug}</strong><small>{fmtDate(entry.startedAt)} → {fmtDate(entry.expiresAt)}</small></span>
          <strong>₹{fmt(entry.amount)}</strong>
        </div>)}
      </details>}
      {checkout && <SubscriptionCheckout plan={checkout.plan} cycle={checkout.cycle} settings={paymentSettings} loadingSettings={paymentSettingsLoading} user={user} onClose={() => setCheckout(null)} onSubmitted={() => setRequestsRefresh(value => value + 1)} />}
    </div>
  )
}
