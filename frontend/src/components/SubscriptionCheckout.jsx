import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CheckCircle, Copy, LoaderCircle, QrCode, ShieldCheck, X } from 'lucide-react'
import { submitUpiPaymentRequest } from '../api'
import { AdminTelegramLink } from './TelegramLink'

export default function SubscriptionCheckout({ plan, cycle, settings, loadingSettings, user, onClose, onSubmitted }) {
  const [email, setEmail] = useState(user.email || '')
  const [utr, setUtr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const submitting = useRef(false)
  const price = cycle === 'yearly' ? plan.yearlyPrice : plan.price

  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.querySelector('button')?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape' && !submitting.current) closeRef.current()
      if (event.key !== 'Tab') return
      const nodes = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)')]
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus() }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = overflow; dialog.removeEventListener('keydown', onKeyDown); if (previous?.isConnected) previous.focus() }
  }, [])

  const submit = async event => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setSaving(true); setError('')
    try {
      const result = await submitUpiPaymentRequest({ email, utr, planSlug: plan.slug, billingCycle: cycle, amount: price })
      setSuccess(result.data)
      onSubmitted(result.data)
    } catch (failure) { setError(failure.detail || 'Unable to submit. Please try again.') }
    finally { submitting.current = false; setSaving(false) }
  }

  return createPortal(<div className="payment-checkout-backdrop">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="payment-checkout">
      <header><div><span className="payment-eyebrow">CRICEDGE MEMBERSHIP</span><h2 id="checkout-title">{success ? 'Payment submitted' : 'Pay with UPI'}</h2></div><button type="button" disabled={saving} onClick={onClose} aria-label="Close payment checkout"><X size={20} /></button></header>
      {success ? <div className="payment-success"><span><CheckCircle size={32} /></span><h3>Your request is with our team</h3><p>We’ll verify your payment and activate <strong>{plan.name}</strong> for <strong>{success.email}</strong> after approval.</p><div>Request #{success.id} · Awaiting review</div><button className="ui-button ui-button-primary" onClick={onClose}>View my requests <ArrowRight size={16} /></button></div>
        : <><div className="payment-order-summary"><div><strong>{plan.name}</strong><span>{cycle === 'yearly' ? '12 months' : '1 month'} access · Starts after approval</span></div><strong>₹{Number(price).toLocaleString('en-IN')}</strong></div>
          {loadingSettings ? <div className="payment-unconfigured"><LoaderCircle size={32} className="animate-spin" /><h3>Loading payment details…</h3></div> : settings?.enabled && settings.qrImage ? <div className="payment-checkout-grid">
            <div className="payment-qr-panel"><h3><QrCode size={17} /> 1. Scan & pay</h3><img src={settings.qrImage} alt="Official CricEdge UPI payment QR code" width="224" height="224" />
              <div className="payment-qr-details">
                {settings.payeeName && <strong>{settings.payeeName}</strong>}
                {settings.upiId && <button type="button" className="payment-copy" onClick={async () => { try { await navigator.clipboard.writeText(settings.upiId); setCopied(true) } catch { setCopied(false) } }}><span>{settings.upiId}</span><Copy size={13} />{copied && <small>Copied</small>}</button>}
                <p>Pay exactly ₹{Number(price).toLocaleString('en-IN')} using your UPI app. Check the recipient before paying.</p>
              </div>
            </div>
            <form onSubmit={submit} className="payment-reference-form"><h3><ShieldCheck size={17} /> 2. Submit your payment</h3>
              <label>Your CricEdge email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={191} disabled={saving} /></label>
              <small>Use your signed-in account: {user.email}</small>
              <label>UPI transaction ID / UTR<input value={utr} onChange={event => setUtr(event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter 12-digit UTR" autoComplete="off" inputMode="numeric" required minLength={12} maxLength={12} pattern="[0-9]{12}" title="Enter exactly 12 numeric digits" disabled={saving} /></label>
              <small>Enter exactly 12 digits from your payment app’s transaction details.</small>
              <p className="payment-review-note">Your plan will activate once the superadmin verifies and approves your payment.</p>
              {error && <p role="alert" className="payment-form-error">{error}</p>}
              <button type="submit" className="ui-button ui-button-primary" disabled={saving}>{saving ? <><LoaderCircle size={16} className="animate-spin" /> Submitting…</> : <>Submit payment request <ArrowRight size={16} /></>}</button>
            </form>
          </div> : <div className="payment-unconfigured"><QrCode size={32} /><h3>UPI checkout is being set up</h3><p>Please contact our admin for payment details.</p><AdminTelegramLink className="ui-button ui-button-primary">Contact admin on Telegram</AdminTelegramLink></div>}
        </>}
    </section>
  </div>, document.body)
}
