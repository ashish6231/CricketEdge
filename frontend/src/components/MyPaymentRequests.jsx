import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, Clock, RefreshCw, XCircle } from 'lucide-react'
import { getMyPaymentRequests } from '../api'
import { getSocket } from '../socket'

const statuses = { pending: { label: 'Awaiting review', Icon: Clock }, approved: { label: 'Approved', Icon: CheckCircle }, rejected: { label: 'Rejected', Icon: XCircle } }
const date = value => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function MyPaymentRequests({ refreshKey = 0, onApproved }) {
  const [data, setData] = useState([])
  const [pagination, setPagination] = useState({})
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const version = useRef(0)
  const approvedRef = useRef(onApproved)
  approvedRef.current = onApproved
  const load = useCallback(async () => {
    const current = ++version.current
    setLoading(true)
    try { const result = await getMyPaymentRequests(page); if (current === version.current) { setData(result.data); setPagination(result.pagination); setError('') } }
    catch (failure) { if (current === version.current) setError(failure.detail || 'Unable to load requests') }
    finally { if (current === version.current) setLoading(false) }
  }, [page])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    const socket = getSocket()
    const changed = update => { load(); if (update?.status === 'approved') approvedRef.current?.() }
    socket.on('paymentRequestUpdate', changed)
    const visible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', visible)
    return () => { socket.off('paymentRequestUpdate', changed); document.removeEventListener('visibilitychange', visible) }
  }, [load])
  return <section className="my-payment-requests" aria-label="Your payment requests">
    <header><div><h2>Your payment requests</h2><p>Track verification and subscription activation.</p></div><button type="button" onClick={load} disabled={loading} aria-label="Refresh payment requests"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></header>
    {error ? <p role="alert" className="payment-form-error">{error}</p> : !data.length ? <p className="payment-requests-empty">{loading ? 'Loading requests…' : 'Your UPI payment requests will appear here.'}</p> : data.map(request => {
      const state = statuses[request.status] || statuses.pending
      const Icon = state.Icon
      return <article key={request.id}><div><strong>{request.planName} <small>· {request.billingCycle}</small></strong><span>₹{Number(request.amount).toLocaleString('en-IN')} · UTR {request.utr}</span><small>{date(request.createdAt)} · {request.email}</small>{request.reviewReason && <p>{request.reviewReason}</p>}</div><span className={`payment-status is-${request.status}`}><Icon size={13} />{state.label}</span></article>
    })}
    {pagination.pages > 1 && <footer><button onClick={() => setPage(value => value - 1)} disabled={page <= 1 || loading}>Previous</button><span>{page} / {pagination.pages}</span><button onClick={() => setPage(value => value + 1)} disabled={page >= pagination.pages || loading}>Next</button></footer>}
  </section>
}
