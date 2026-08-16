import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, LoaderCircle, Search } from 'lucide-react'
import {
  adminCaptureTossDataset,
  adminConfirmTossWinner,
  adminGetTossDataset,
  adminGetTossDatasetExport,
} from '../../api'
import { formatCaptureSummary, hasUsableSnapshot, parseTossDatasetList } from '../../utils/tossDatasetAdmin'
import { useToast } from '../../components/ToastProvider'

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function AdminTossDataset() {
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({})
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    adminGetTossDataset({ status, page, limit: 20, search })
      .then((res) => {
        const parsed = parseTossDatasetList(res)
        setRecords(parsed.records)
        setPagination(parsed.pagination)
      })
      .catch((e) => toast.error(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [status, page, search, toast])

  useEffect(() => { load() }, [load])

  const captureNow = async () => {
    setCapturing(true)
    try {
      const res = await adminCaptureTossDataset()
      toast.success(formatCaptureSummary(res.data || {}))
      if (page === 1) load()
      else setPage(1)
    } catch (e) {
      toast.error(e.detail || 'Capture failed')
    } finally {
      setCapturing(false)
    }
  }

  const exportJson = async () => {
    setExporting(true)
    try {
      await adminGetTossDatasetExport()
      toast.success('Export complete')
    } catch (e) {
      toast.error(e.detail || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const confirmWinner = async (matchId, actualWinner) => {
    setConfirmingId(matchId)
    try {
      await adminConfirmTossWinner(matchId, actualWinner)
      toast.success('Winner confirmed')
      load()
    } catch (e) {
      toast.error(e.detail || 'Confirm failed')
    } finally {
      setConfirmingId(null)
    }
  }

  const toggle = (nextStatus) => {
    setStatus(nextStatus)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl overflow-hidden glass-card">
          {['pending', 'verified'].map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className="px-3 py-1.5 text-xs font-semibold capitalize"
              style={status === s
                ? { background: 'linear-gradient(135deg,#dc2626,#10b981)', color: '#fff' }
                : { color: '#374151' }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-48 glass-card rounded-xl px-3 py-2">
          <Search size={13} className="text-text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search match name…"
            className="bg-transparent text-sm outline-none w-full text-text-primary placeholder:text-text-muted"
          />
        </div>

        <button
          onClick={captureNow}
          disabled={capturing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
        >
          {capturing && <LoaderCircle size={13} className="animate-spin" />}
          Capture now
        </button>
        <button
          onClick={exportJson}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold glass-card disabled:opacity-50"
        >
          {exporting ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
          Export JSON
        </button>
      </div>

      {loading
        ? <div className="flex justify-center py-10"><LoaderCircle className="animate-spin text-primary" /></div>
        : records.length === 0
          ? <div className="text-center text-text-muted py-10 text-sm">No {status} toss records</div>
          : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="divide-y divide-border/40">
                {records.map((row) => {
                  const confirming = confirmingId === row.matchId
                  const canConfirm = hasUsableSnapshot(row.snapshot)
                  return (
                    <div key={row.matchId} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-text-primary truncate">{row.matchName}</div>
                        <div className="text-xs text-text-muted mt-0.5">
                          {row.team1} vs {row.team2}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">Captured {fmtDateTime(row.capturedAt)}</div>
                        {row.predictedWinner && (
                          <div className="text-xs text-text-muted mt-0.5">
                            Predicted: {row.predictedWinner}
                          </div>
                        )}
                        {row.lastCaptureError && (
                          <div className="text-xs text-primary mt-0.5">
                            Capture error: {row.lastCaptureError}
                          </div>
                        )}
                        {!canConfirm && row.status !== 'verified' && (
                          <div className="text-xs text-text-muted mt-0.5 italic">
                            Snapshot missing — wait for re-capture
                          </div>
                        )}
                        {row.status === 'verified' && (
                          <div className="text-xs mt-1">
                            <span className="font-semibold text-text-primary">{row.actualWinner}</span>
                            <span className="text-text-muted"> · confirmed {fmtDateTime(row.confirmedAt)}</span>
                          </div>
                        )}
                      </div>
                      {row.status !== 'verified' && (
                        <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => confirmWinner(row.matchId, row.team1)}
                            disabled={confirming || !row.team1 || !canConfirm}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold glass-card disabled:opacity-40"
                          >
                            {confirming ? <LoaderCircle size={12} className="animate-spin" /> : row.team1}
                          </button>
                          <button
                            onClick={() => confirmWinner(row.matchId, row.team2)}
                            disabled={confirming || !row.team2 || !canConfirm}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold glass-card disabled:opacity-40"
                          >
                            {confirming ? <LoaderCircle size={12} className="animate-spin" /> : row.team2}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
      }

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted text-xs">
            Page {pagination.page || page} of {pagination.pages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded-lg glass-card disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-lg glass-card disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
