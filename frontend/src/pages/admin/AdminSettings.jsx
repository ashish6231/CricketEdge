import { useEffect, useState } from 'react'
import { LoaderCircle, Edit2, Check, X } from 'lucide-react'
import { adminGetSettings, adminUpdateSetting } from '../../api'
import { useToast } from '../../components/ToastProvider'
import {
  filterTrialSettings,
  hydrateTrialForm,
  hydrateAllowSignups,
  trialSavePatches,
  formatTrialSaveMessage,
  formatAllowSignupsMessage,
  TRIAL_UNITS,
  SIGNUP_SETTING_KEY,
} from '../../utils/trialSettingsAdmin'

export default function AdminSettings({ isSuperAdmin }) {
  const toast = useToast()
  const [settings, setSettings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(null)
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [trialEnabled, setTrialEnabled] = useState(true)
  const [trialValue, setTrialValue] = useState(30)
  const [trialUnit, setTrialUnit] = useState('minutes')
  const [trialSaving, setTrialSaving] = useState(false)
  const [allowSignups, setAllowSignups] = useState(true)
  const [signupsSaving, setSignupsSaving] = useState(false)

  const applySettings = (rows) => {
    const list = Array.isArray(rows) ? rows : []
    setSettings(list)
    const trial = hydrateTrialForm(list)
    setTrialEnabled(trial.enabled)
    setTrialValue(trial.value)
    setTrialUnit(trial.unit)
    setAllowSignups(hydrateAllowSignups(list))
  }

  const load = ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    adminGetSettings()
      .then(res => applySettings(res.data))
      .catch(e => toast.error(e.detail || 'Failed to load'))
      .finally(() => { if (!quiet) setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const save = async (key) => {
    setSaving(true)
    try {
      await adminUpdateSetting(key, editVal)
      toast.success(`"${key}" updated`)
      setEditing(null)
      load({ quiet: true })
    } catch (e) {
      toast.error(e.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const saveTrial = async () => {
    setTrialSaving(true)
    try {
      for (const patch of trialSavePatches({ enabled: trialEnabled, value: trialValue, unit: trialUnit })) {
        await adminUpdateSetting(patch.key, patch.value, 'Update free trial settings')
      }
      toast.success(formatTrialSaveMessage({ enabled: trialEnabled, value: trialValue, unit: trialUnit }))
      load({ quiet: true })
    } catch (e) {
      toast.error(e.detail || 'Save failed — all three trial settings must succeed')
    } finally {
      setTrialSaving(false)
    }
  }

  const saveAllowSignups = async () => {
    setSignupsSaving(true)
    try {
      await adminUpdateSetting(SIGNUP_SETTING_KEY, allowSignups, 'Update allow signups')
      toast.success(formatAllowSignupsMessage(allowSignups))
      load({ quiet: true })
    } catch (e) {
      toast.error(e.detail || 'Failed to update signups setting')
    } finally {
      setSignupsSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" /></div>

  const settingsForList = filterTrialSettings(settings)
  const grouped = settingsForList.reduce((acc, s) => {
    const cat = s.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {!isSuperAdmin && (
        <div className="text-xs text-text-muted px-3 py-2 rounded-xl bg-yellow-50 border border-yellow-200">
          ⚠️ Only superadmins can edit settings.
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-red-50/40">
          <span className="font-bold text-text-primary">Allow Signups</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowSignups}
              onChange={e => setAllowSignups(e.target.checked)}
              disabled={!isSuperAdmin || signupsSaving}
              className="accent-green-500"
            />
            <span className="text-sm font-medium text-text-primary">Allow new user registrations</span>
          </label>
          <p className="text-xs text-text-muted">
            {allowSignups
              ? 'Email/password signup and first-time Google signup are allowed.'
              : 'New accounts cannot be created. Existing users can still log in.'}
          </p>
          {isSuperAdmin && (
            <button
              onClick={saveAllowSignups}
              disabled={signupsSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
            >
              {signupsSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
              Save
            </button>
          )}
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-red-50/40">
          <span className="font-bold text-text-primary">Free Trial</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={trialEnabled}
              onChange={e => setTrialEnabled(e.target.checked)}
              disabled={!isSuperAdmin || trialSaving}
              className="accent-green-500"
            />
            <span className="text-sm font-medium text-text-primary">Enable free trial for new grants</span>
          </label>
          {trialEnabled && (
            <div>
              <label className="text-xs text-text-muted block mb-1">Duration</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={trialValue}
                  onChange={e => setTrialValue(e.target.value)}
                  disabled={!isSuperAdmin || trialSaving}
                  className="w-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white disabled:opacity-50"
                  style={{ color: '#111111', WebkitTextFillColor: '#111111' }}
                />
                <select
                  value={trialUnit}
                  onChange={e => setTrialUnit(e.target.value)}
                  disabled={!isSuperAdmin || trialSaving}
                  className="rounded-xl border border-border px-3 py-2 text-sm outline-none bg-white disabled:opacity-50"
                  style={{ color: '#111111' }}
                >
                  {TRIAL_UNITS.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <p className="text-xs text-text-muted">
            {trialEnabled
              ? 'Applies only to newly granted trials. Active trials keep their current end time.'
              : 'Free trial is off. Signup, login auto-grant, and admin Grant trial are all blocked. Active trials keep running until they expire.'}
          </p>
          {isSuperAdmin && (
            <button
              onClick={saveTrial}
              disabled={trialSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}
            >
              {trialSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
              Save
            </button>
          )}
        </div>
      </div>

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
                        className="flex-1 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-primary bg-white"
                        style={{ color: '#111111', WebkitTextFillColor: '#111111' }} />
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
                  <button onClick={() => { setEditing(s.key); setEditVal(String(s.value)) }}
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
