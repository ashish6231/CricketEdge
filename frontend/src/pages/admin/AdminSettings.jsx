import { useEffect, useState } from 'react'
import { LoaderCircle, Edit2, Check, X } from 'lucide-react'
import { adminGetSettings, adminUpdateSetting } from '../../api'

export default function AdminSettings({ isSuperAdmin }) {
  const [settings, setSettings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(null)
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const load = () => {
    setLoading(true)
    adminGetSettings()
      .then(res => setSettings(res.data))
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async (key) => {
    setSaving(true); setError(''); setSuccess('')
    try {
      await adminUpdateSetting(key, editVal)
      setSuccess(`"${key}" updated`)
      setEditing(null)
      load()
    } catch (e) {
      setError(e.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" /></div>

  // Group by category
  const grouped = settings.reduce((acc, s) => {
    const cat = s.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {error   && <div className="text-xs text-primary px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.08)' }}>{error}</div>}
      {success && <div className="text-xs text-green-700 px-3 py-2 rounded-xl bg-green-50">{success}</div>}

      {!isSuperAdmin && (
        <div className="text-xs text-text-muted px-3 py-2 rounded-xl bg-yellow-50 border border-yellow-200">
          ⚠️ Only superadmins can edit settings.
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-red-50/40">
            <span className="font-bold text-text-primary capitalize">{cat}</span>
          </div>
          <div className="divide-y divide-border/40">
            {items.map(s => (
              <div key={s.key} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm font-semibold text-text-primary">{s.key}</div>
                  {s.description && <div className="text-xs text-text-muted mt-0.5">{s.description}</div>}
                  {editing === s.key ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input value={editVal} onChange={e => setEditVal(e.target.value)}
                        className="flex-1 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-primary bg-white" />
                      <button onClick={() => save(s.key)} disabled={saving}
                        className="p-1.5 rounded-lg bg-green-100 text-green-700 disabled:opacity-50">
                        {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm font-medium text-text-secondary break-all">
                      {typeof s.value === 'boolean' ? (s.value ? '✓ true' : '✗ false') : String(s.value)}
                    </div>
                  )}
                </div>
                {isSuperAdmin && editing !== s.key && (
                  <button onClick={() => { setEditing(s.key); setEditVal(String(s.value)); setError(''); setSuccess('') }}
                    className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-primary transition-colors"
                    style={{ background: 'rgba(220,38,38,0.06)' }}>
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {settings.length === 0 && (
        <div className="text-center text-text-muted py-10 text-sm">No settings found</div>
      )}
    </div>
  )
}
