import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Download, LoaderCircle, Search, XCircle } from 'lucide-react'
import {
  adminCaptureTossDataset,
  adminConfirmTossWinner,
  adminGetTossDataset,
  adminGetTossDatasetExport,
} from '../../api'
import {
  formatCaptureSummary,
  hasUsableSnapshot,
  isPredictionHit,
  parseTossDatasetList,
} from '../../utils/tossDatasetAdmin'
import { useToast } from '../../components/ToastProvider'

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

const HitBadge = ({ hit }) => {
  if (hit === null) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
        style={{ color: '#8e8e93', background: 'rgba(142,142,147,0.12)' }}
      >
        No pick
      </span>
    )
  }
  return hit ? (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ color: '#10b981', background: 'rgba(16,185,129,0.14)' }}
    >
      <CheckCircle2 size={12} /> Hit
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ color: '#ef4444', background: 'rgba(239,68,68,0.14)' }}
    >
      <XCircle size={12} /> Miss
    </span>
  )
}

function ResultCell({ label, value, tone }) {
  const color = tone === 'good' ? '#10b981' : tone === 'bad' ? '#ef4444' : '#e5e5ea'
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5">{label}</div>
      <div className="text-sm font-semibold truncate" style={{ color }} title={value || '—'}>
        {value || '—'}
      </div>
    </div>
  )
}

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

  const verifiedStats = useMemo(() => {
    if (status !== 'verified') return null
    let hits = 0
    let misses = 0
    let noPick = 0
    for (const row of records) {
      const hit = isPredictionHit(row.predictedWinner, row.actualWinner)
      if (hit === null) noPick += 1
      else if (hit) hits += 1
      else misses += 1
    }
    const scored = hits + misses
    return { hits, misses, noPick, scored, pct: scored ? Math.round((hits / scored) * 100) : 0 }
  }, [records, status])

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
                : { color: '#8e8e93' }}
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

      {verifiedStats && verifiedStats.scored > 0 && (
        <div
          className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
          style={{ background: '#111111', border: '1px solid #2c2c2e' }}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Accuracy</div>
            <div className="text-lg font-bold text-text-primary">
              {verifiedStats.hits}/{verifiedStats.scored}
              <span className="text-sm font-semibold text-text-muted ml-1.5">({verifiedStats.pct}%)</span>
            </div>
          </div>
          <div className="h-8 w-px bg-[#2c2c2e] hidden sm:block" />
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span style={{ color: '#10b981' }}>{verifiedStats.hits} hit</span>
            <span style={{ color: '#ef4444' }}>{verifiedStats.misses} miss</span>
            {verifiedStats.noPick > 0 && (
              <span className="text-text-muted">{verifiedStats.noPick} no pick</span>
            )}
          </div>
        </div>
      )}

      {loading
        ? <div className="flex justify-center py-10"><LoaderCircle className="animate-spin text-primary" /></div>
        : records.length === 0
          ? <div className="text-center text-text-muted py-10 text-sm">No {status} toss records</div>
          : (
            <div className="space-y-2">
              {records.map((row) => {
                const confirming = confirmingId === row.matchId
                const canConfirm = hasUsableSnapshot(row.snapshot)
                const hit = row.status === 'verified'
                  ? isPredictionHit(row.predictedWinner, row.actualWinner)
                  : null
                const borderColor = row.status === 'verified'
                  ? (hit === true ? 'rgba(16,185,129,0.35)' : hit === false ? 'rgba(239,68,68,0.35)' : '#2c2c2e')
                  : '#2c2c2e'

                return (
                  <div
                    key={row.matchId}
                    className="rounded-2xl px-4 py-3"
                    style={{ background: '#111111', border: `1px solid ${borderColor}` }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-text-primary leading-snug">
                          {row.matchName || `${row.team1} vs ${row.team2}`}
                        </div>
                        {row.competitionName && (
                          <div className="text-[11px] text-text-muted mt-0.5 truncate">{row.competitionName}</div>
                        )}
                      </div>
                      {row.status === 'verified' && <HitBadge hit={hit} />}
                    </div>

                    {row.status === 'verified' ? (
                      <div
                        className="grid grid-cols-2 gap-3 rounded-xl px-3 py-2.5 mb-2"
                        style={{ background: '#1a1a1a' }}
                      >
                        <ResultCell
                          label="Predicted"
                          value={row.predictedWinner}
                          tone={hit === true ? 'good' : hit === false ? 'bad' : null}
                        />
                        <ResultCell
                          label="Actual"
                          value={row.actualWinner}
                          tone="good"
                        />
                      </div>
                    ) : (
                      row.predictedWinner && (
                        <div className="text-xs text-text-muted mb-2">
                          Predicted{' '}
                          <span className="font-semibold text-text-primary">{row.predictedWinner}</span>
                          {row.predictionReason && (
                            <span className="text-text-muted"> · {row.predictionReason}</span>
                          )}
                        </div>
                      )
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                      {row.predictionReason && row.status === 'verified' && (
                        <span
                          className="px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(142,142,147,0.12)', color: '#a1a1a6' }}
                        >
                          {row.predictionReason}
                        </span>
                      )}
                      <span>Captured {fmtDateTime(row.capturedAt)}</span>
                      {row.status === 'verified' && row.confirmedAt && (
                        <span>Confirmed {fmtDateTime(row.confirmedAt)}</span>
                      )}
                    </div>

                    {row.lastCaptureError && (
                      <div className="text-xs text-primary mt-2">Capture error: {row.lastCaptureError}</div>
                    )}
                    {!canConfirm && row.status !== 'verified' && (
                      <div className="text-xs text-text-muted mt-2 italic">
                        Snapshot missing — wait for re-capture
                      </div>
                    )}

                    {row.status !== 'verified' && (
                      <div className="flex flex-col sm:flex-row gap-1.5 mt-3">
                        <button
                          onClick={() => confirmWinner(row.matchId, row.team1)}
                          disabled={confirming || !row.team1 || !canConfirm}
                          className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                          style={{ background: '#1a1a1a', border: '1px solid #2c2c2e', color: '#e5e5ea' }}
                        >
                          {confirming ? <LoaderCircle size={12} className="animate-spin mx-auto" /> : row.team1}
                        </button>
                        <button
                          onClick={() => confirmWinner(row.matchId, row.team2)}
                          disabled={confirming || !row.team2 || !canConfirm}
                          className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                          style={{ background: '#1a1a1a', border: '1px solid #2c2c2e', color: '#e5e5ea' }}
                        >
                          {confirming ? <LoaderCircle size={12} className="animate-spin mx-auto" /> : row.team2}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
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
