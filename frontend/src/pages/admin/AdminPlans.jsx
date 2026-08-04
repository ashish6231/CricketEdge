import { useEffect, useState } from 'react'
import { LoaderCircle, CheckCircle, Edit2, X, Check } from 'lucide-react'
import { adminGetPlans, adminUpdatePlan } from '../../api'

const fmt = (n) => Number(n).toLocaleString('en-IN')

export default function AdminPlans({ isSuperAdmin }) {
  const [plans, setPlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // plan id being edited
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  const load = () => {
    setLoading(true)
    adminGetPlans()
      .then(res => setPlans(res.data))
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const startEdit = (plan) => {
    setEditing(plan.id)
    setForm({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      yearlyPrice: plan.yearlyPrice,
      features: plan.features?.join('\n') || '',
      isActive: plan.isActive,
    })
    setError(''); setSuccess('')
  }

  const save = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      await adminUpdatePlan(editing, {
        ...form,
        price: Number(form.price),
        yearlyPrice: Number(form.yearlyPrice),
        features: form.features.split('\n').map(f => f.trim()).filter(Boolean),
      })
      setSuccess('Plan updated')
      setEditing(null)
      load()
    } catch (e) {
      setError(e.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-4">
      {error   && <div className="text-xs text-red-400 px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.2)' }}>{error}</div>}
      {success && <div className="text-xs text-green-400 px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>{success}</div>}

      {plans.map(plan => (
        <div key={plan.id} className="glass-card rounded-2xl p-5">
          {editing === plan.id ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white capitalize">{plan.slug} Plan — Edit</span>
                <button onClick={() => setEditing(null)}><X size={16} className="text-text-muted" /></button>
              </div>
              {[
                { label: 'Name', key: 'name' },
                { label: 'Description', key: 'description' },
                { label: 'Monthly Price (₹)', key: 'price', type: 'number' },
                { label: 'Yearly Price (₹)', key: 'yearlyPrice', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-[#8e8e93] block mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={form[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none text-white"
                    style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }} />
                </div>
              ))}
              <div>
                <label className="text-xs text-[#8e8e93] block mb-1">Features (one per line)</label>
                <textarea rows={5} value={form.features}
                  onChange={e => setForm(p => ({ ...p, features: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none text-white resize-none"
                  style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={form.isActive}
                  onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                  className="accent-green-500" />
                <label htmlFor="isActive" className="text-sm text-white">Active</label>
              </div>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#dc2626,#10b981)' }}>
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                Save Changes
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-black text-lg text-text-primary">{plan.name}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${plan.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {isSuperAdmin && (
                  <button onClick={() => startEdit(plan)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
                    <Edit2 size={12} /> Edit
                  </button>
                )}
              </div>
              <p className="text-sm text-text-muted mb-3">{plan.description}</p>
              <div className="flex gap-4 mb-4 text-sm">
                <div><span className="text-text-muted">Monthly</span> <span className="font-bold">₹{fmt(plan.price)}</span></div>
                <div><span className="text-text-muted">Yearly</span> <span className="font-bold">₹{fmt(plan.yearlyPrice)}</span></div>
              </div>
              <div className="space-y-1">
                {plan.features?.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle size={13} className="text-profit flex-shrink-0" />
                    <span className="text-text-secondary">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
