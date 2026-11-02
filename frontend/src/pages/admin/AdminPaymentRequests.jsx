import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CheckCircle, ChevronLeft, ChevronRight, Clock, Copy, ImagePlus, LoaderCircle, QrCode, RefreshCw, Search, ShieldCheck, X, XCircle } from 'lucide-react'
import { adminGetPaymentRequests, adminGetPaymentSettings, adminReviewPaymentRequest, adminSavePaymentSettings } from '../../api'
import { useToast } from '../../components/ToastProvider'
import useDebouncedValue from '../../lib/useDebouncedValue'
import { getSocket } from '../../socket'

const initialSettings = { enabled: false, qrImage: '', payeeName: '', upiId: '' }
const statusMeta = {
  pending: { label: 'Awaiting review', Icon: Clock },
  approved: { label: 'Approved', Icon: CheckCircle },
  rejected: { label: 'Rejected', Icon: XCircle },
}
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`
const dateTime = value => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function AdminPaymentRequests() {
  const toast = useToast()
  const [settings, setSettings] = useState(initialSettings)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [requests, setRequests] = useState([])
  const [counts, setCounts] = useState({})
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(null)
  const [reviewAction, setReviewAction] = useState('approve')
  const [reviewReason, setReviewReason] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const loadVersion = useRef(0)
  const reviewingRef = useRef(false)

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try { setSettings((await adminGetPaymentSettings()).data || initialSettings) }
    catch (error) { toast.error(error.detail || 'Unable to load UPI settings') }
    finally { setSettingsLoading(false) }
  }, [toast])

  const loadRequests = useCallback(async () => {
    const version = ++loadVersion.current
    setLoading(true)
    try {
      const result = await adminGetPaymentRequests({ page, limit: 20, status, search: debouncedSearch })
      if (version !== loadVersion.current) return
      setRequests(result.data || [])
      setCounts(result.counts || {})
      setPagination(result.pagination || { page: 1, pages: 1, total: 0 })
    } catch (error) {
      if (version === loadVersion.current) toast.error(error.detail || 'Unable to load payment requests')
    } finally { if (version === loadVersion.current) setLoading(false) }
  }, [page, status, debouncedSearch, toast])

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadRequests() }, [loadRequests])
  useEffect(() => {
    const socket = getSocket()
    const created = () => loadRequests()
    socket.on('paymentRequestCreated', created)
    return () => socket.off('paymentRequestCreated', created)
  }, [loadRequests])

  const pickQr = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
      toast.error('Use a PNG, JPEG or WebP QR image up to 512 KB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setSettings(value => ({ ...value, qrImage: String(reader.result || '') }))
    reader.onerror = () => toast.error('Unable to read that QR image')
    reader.readAsDataURL(file)
  }

  const saveSettings = async event => {
    event.preventDefault()
    setSettingsSaving(true)
    try {
      const result = await adminSavePaymentSettings(settings)
      setSettings(result.data)
      toast.success('UPI checkout settings saved')
    } catch (error) { toast.error(error.detail || 'Unable to save payment settings') }
    finally { setSettingsSaving(false) }
  }

  const startReview = (request, action) => {
    setReviewing(request)
    setReviewAction(action)
    setReviewReason('')
  }

  const submitReview = async event => {
    event.preventDefault()
    if (reviewingRef.current || !reviewing) return
    if (reviewAction === 'reject' && reviewReason.trim().length < 3) {
      toast.error('Please add a short rejection reason')
      return
    }
    reviewingRef.current = true
    setReviewSaving(true)
    try {
      await adminReviewPaymentRequest(reviewing.id, reviewAction, reviewReason.trim())
      toast.success(reviewAction === 'approve' ? `${reviewing.planName} activated for ${reviewing.email}` : 'Payment request rejected')
      setReviewing(null)
      loadRequests()
    } catch (error) { toast.error(error.detail || 'Unable to review payment request') }
    finally { reviewingRef.current = false; setReviewSaving(false) }
  }

  const copy = async value => {
    try { await navigator.clipboard.writeText(value); toast.success('UTR copied') }
    catch { toast.error('Could not copy UTR') }
  }

  return <div className="admin-payments">
    <details className="admin-payment-settings" open={!settings.enabled}>
      <summary><span><QrCode size={18} /> UPI checkout settings</span><span className={`payment-status ${settings.enabled ? 'is-approved' : 'is-rejected'}`}>{settings.enabled ? 'Live' : 'Disabled'}</span></summary>
      {settingsLoading ? <div className="admin-payment-loading"><LoaderCircle className="animate-spin" size={20} /> Loading settings…</div> : <form onSubmit={saveSettings}>
        <div className="admin-payment-qr">
          {settings.qrImage ? <img src={settings.qrImage} alt="Configured subscription payment QR" /> : <span><QrCode size={40} /><small>No QR uploaded</small></span>}
          <label className="ui-button"><ImagePlus size={15} /> Upload QR<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickQr} hidden /></label>
          {settings.qrImage && <button type="button" onClick={() => setSettings(value => ({ ...value, enabled: false, qrImage: '' }))}>Remove image</button>}
        </div>
        <div className="admin-payment-settings-fields">
          <label>Payee name<input value={settings.payeeName} onChange={event => setSettings(value => ({ ...value, payeeName: event.target.value }))} maxLength={100} placeholder="Name shown in UPI app" /></label>
          <label>UPI ID<input value={settings.upiId} onChange={event => setSettings(value => ({ ...value, upiId: event.target.value }))} maxLength={100} placeholder="payments@upi" /></label>
          <label className="admin-payment-toggle"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings(value => ({ ...value, enabled: event.target.checked }))} /><span><strong>Enable UPI checkout</strong><small>Users can submit payment requests only while enabled.</small></span></label>
          <p><ShieldCheck size={14} /> QR payments are never auto-approved. Verify the UTR and exact amount in your bank/UPI app first.</p>
          <button className="ui-button ui-button-primary" type="submit" disabled={settingsSaving}>{settingsSaving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save payment settings</button>
        </div>
      </form>}
    </details>

    <section className="admin-payment-requests">
      <header><div><h2>Payment requests</h2><p>Verify payment before approving access.</p></div><button type="button" onClick={loadRequests} disabled={loading} aria-label="Refresh payment requests"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></header>
      <div className="admin-payment-filters">
        <div className="admin-payment-status-tabs" role="tablist" aria-label="Payment request status">
          {['pending', 'approved', 'rejected', 'all'].map(value => <button type="button" role="tab" aria-selected={status === value} key={value} onClick={() => { setStatus(value); setPage(1) }}>{value === 'all' ? 'All' : statusMeta[value].label}<span>{value === 'all' ? Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0) : counts[value] || 0}</span></button>)}
        </div>
        <label className="admin-payment-search"><Search size={15} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Search email or UTR…" /></label>
      </div>
      {loading ? <div className="admin-payment-loading"><LoaderCircle className="animate-spin" /> Loading requests…</div> : requests.length === 0 ? <div className="admin-payment-empty"><ReceiptIcon /><strong>No {status === 'all' ? '' : status} payment requests</strong><span>New submissions will appear here automatically.</span></div> : <div className="admin-payment-list">
        {requests.map(request => {
          const meta = statusMeta[request.status] || statusMeta.pending
          const StatusIcon = meta.Icon
          return <article key={request.id} className="admin-payment-request">
            <div className="admin-payment-request-main"><span className="admin-payment-request-id">#{request.id}</span><div><strong>{request.planName}</strong><small>{request.billingCycle} · {money(request.amount)}</small></div><span className={`payment-status is-${request.status}`}><StatusIcon size={13} />{meta.label}</span></div>
            <dl><div><dt>Account</dt><dd>{request.user?.name || 'User'}<small>{request.email}</small></dd></div><div><dt>UPI transaction ID / UTR</dt><dd className="payment-utr">{request.utr}<button type="button" onClick={() => copy(request.utr)} aria-label={`Copy UTR ${request.utr}`}><Copy size={13} /></button></dd></div><div><dt>Submitted</dt><dd>{dateTime(request.createdAt)}</dd></div><div><dt>Current plan</dt><dd>{request.user?.subPlanSlug || 'free'}<small>{request.user?.subExpiresAt ? `Until ${dateTime(request.user.subExpiresAt)}` : 'No active expiry'}</small></dd></div></dl>
            {request.status === 'pending' ? <div className="admin-payment-actions"><button type="button" className="is-reject" onClick={() => startReview(request, 'reject')}><X size={15} /> Reject</button><button type="button" className="is-approve" onClick={() => startReview(request, 'approve')}><Check size={15} /> Verify & approve</button></div> : <div className="admin-payment-reviewed"><span>Reviewed {dateTime(request.reviewedAt)}{request.reviewedBy?.name ? ` by ${request.reviewedBy.name}` : ''}</span>{request.reviewReason && <p>{request.reviewReason}</p>}</div>}
          </article>
        })}
      </div>}
      {pagination.pages > 1 && <footer className="admin-payment-pagination"><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15} /></button><span>Page {pagination.page} of {pagination.pages} · {pagination.total} requests</span><button disabled={page >= pagination.pages || loading} onClick={() => setPage(value => value + 1)}><ChevronRight size={15} /></button></footer>}
    </section>

    {reviewing && <div className="admin-review-backdrop"><form className="admin-review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-payment-title" onSubmit={submitReview}>
      <header><div><span>{reviewAction === 'approve' ? 'VERIFY PAYMENT' : 'REJECT REQUEST'}</span><h2 id="review-payment-title">{reviewAction === 'approve' ? 'Confirm bank verification' : 'Why is this payment rejected?'}</h2></div><button type="button" disabled={reviewSaving} onClick={() => setReviewing(null)} aria-label="Close review"><X size={19} /></button></header>
      <div className="admin-review-summary"><div><span>Account</span><strong>{reviewing.email}</strong></div><div><span>Plan</span><strong>{reviewing.planName} · {reviewing.billingCycle}</strong></div><div><span>Amount</span><strong>{money(reviewing.amount)}</strong></div><div><span>UTR</span><strong>{reviewing.utr}</strong></div></div>
      {reviewAction === 'approve' && <p className="admin-review-warning"><ShieldCheck size={17} /> I have checked this exact UTR and amount in the official bank/UPI account. Approval will activate the plan immediately.</p>}
      <label>{reviewAction === 'reject' ? 'Reason (required)' : 'Internal note (optional)'}<textarea rows="3" value={reviewReason} onChange={event => setReviewReason(event.target.value)} maxLength={500} required={reviewAction === 'reject'} placeholder={reviewAction === 'reject' ? 'Example: UTR not found in bank statement' : 'Optional verification note'} /></label>
      <footer><button type="button" onClick={() => setReviewing(null)} disabled={reviewSaving}>Cancel</button><button type="submit" className={reviewAction === 'approve' ? 'is-approve' : 'is-reject'} disabled={reviewSaving}>{reviewSaving ? <LoaderCircle size={15} className="animate-spin" /> : reviewAction === 'approve' ? <Check size={15} /> : <X size={15} />}{reviewAction === 'approve' ? 'Approve & activate' : 'Reject request'}</button></footer>
    </form></div>}
  </div>
}

function ReceiptIcon() {
  return <span className="admin-payment-empty-icon"><QrCode size={25} /></span>
}
