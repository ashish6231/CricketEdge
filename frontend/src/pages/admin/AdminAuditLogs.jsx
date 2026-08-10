import { useEffect, useState, useCallback } from 'react'
import { LoaderCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminGetAuditLogs } from '../../api'
import {
  AUDIT_ACTIONS,
  getAuditActionColor,
  getAuditChanges,
} from '../../utils/adminAuditLogs'

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function AdminAuditLogs() {
  const [logs, setLogs]         = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading]   = useState(true)
  const [action, setAction]     = useState('')
  const [page, setPage]         = useState(1)
  const [expanded, setExpanded] = useState(null)
  const [error, setError]       = useState('')

  const load = useCallback(() => {
    setLoading(true)
    adminGetAuditLogs({ page, limit: 50, action })
      .then(res => { setLogs(res.data); setPagination(res.pagination) })
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [page, action])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <select value={action} onChange={e => { setAction(e.target.value); setPage(1) }}
          className="glass-card rounded-xl px-3 py-2 text-sm outline-none text-text-secondary bg-white">
          <option value="">All Actions</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-text-muted">{pagination.total ?? 0} entries</span>
      </div>

      {error && <div className="text-xs text-primary px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.08)' }}>{error}</div>}

      {loading
        ? <div className="flex justify-center py-10"><LoaderCircle className="animate-spin text-primary" /></div>
        : logs.length === 0
          ? <div className="text-center text-text-muted py-10 text-sm">No audit logs found</div>
          : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="divide-y divide-border/40">
                {logs.map(log => {
                  const changes = getAuditChanges(log)
                  return (
                  <div key={log.id}>
                    <div
                      className="px-4 py-3 flex items-start gap-3 hover:bg-red-50/20 cursor-pointer transition-colors"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold mt-0.5 ${getAuditActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary">
                          <span className="font-semibold">{log.adminEmail}</span>
                          {' → '}
                          <span className="text-text-muted">{log.targetIdentifier || log.targetId}</span>
                        </div>
                        {log.reason && <div className="text-xs text-text-muted mt-0.5 truncate">{log.reason}</div>}
                      </div>
                      <div className="flex-shrink-0 text-xs text-text-muted">{fmtDateTime(log.createdAt)}</div>
                    </div>
                    {expanded === log.id && changes && (
                      <div className="grid gap-2 px-4 pb-3 ml-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase text-text-muted">Before</div>
                          <pre className="text-xs bg-gray-50 rounded-xl p-3 overflow-x-auto text-text-secondary border border-border/40">
                            {JSON.stringify(changes.before, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase text-text-muted">After</div>
                          <pre className="text-xs bg-gray-50 rounded-xl p-3 overflow-x-auto text-text-secondary border border-border/40">
                            {JSON.stringify(changes.after, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          )
      }

      {/* Pagination */}
      {pagination.total > 50 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted text-xs">Page {page}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg glass-card disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <button disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg glass-card disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
