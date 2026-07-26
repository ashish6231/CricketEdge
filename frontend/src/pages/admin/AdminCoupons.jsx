import { useEffect, useState } from 'react'
import { LoaderCircle, Plus, X } from 'lucide-react'
import { adminGetCoupons, adminCreateCoupon, adminUpdateCoupon } from '../../api'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const EMPTY = {
  code: '', description: '', discountType: 'percentage', discountValue: '',
  maxDiscount: '', usageLimit: '', perUserLimit: 1,
  validFrom: '', validUntil: '', isActive: true,
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const load = () => {
    setLoading(true)
    adminGetCoupons()
      .then(res => setCoupons(res.data))
      .catch(e => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const create = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      await adminCreateCoupon({
        ...form,
        code: form.code.toUpperCase(),
        discountValue: Number(form.discountValue),
        maxDiscount: Number(form.maxDiscount) || 0,
        usageLimit: Number(form.usageLimit) || 0,
        perUserLimit: Number(form.perUserLimit) || 1,
      })
      setSuccess('Coupon created')
      setShowForm(false)
      setForm(EMPTY)
      load()
    } catch (e) {
      setError(e.detail || 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (c) => {
    try {
      await adminUpdateCoupon(c._id, { isActive: !c.isActive })
      load()
    } catch (e) {
      setError(e.detail || 'Update failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{coupons.length} coupon{coupons.length !== 1 ? 's' : ''}</span>
        <button onClick={() => { setShowForm(!showForm); setError('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Cancel' : 'New Coupon'}
        </button>
      </div>

      {error   && <div className="text-xs text-primary px-3 py-2 rounded-xl" style={{ background: 'rgba(220,38,38,0.08)' }}>{error}</div>}
      {success && <div className="text-xs text-green-700 px-3 py-2 rounded-xl bg-green-50">{success}</div>}

      {/* Create Form */}
      {showForm && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div className="font-bold text-text-primary">New Coupon</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Code', key: 'code', placeholder: 'SAVE20' },
              { label: 'Description', key: 'description', placeholder: 'Optional' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-text-muted block mb-1">{f.label}</label>
                <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Discount Type</label>
              <select value={form.discountType} onChange={e => set('discountType', e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none bg-white">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (₹)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Discount Value</label>
              <input type="number" value={form.discountValue} onChange={e => set('discountValue', e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Discount (₹, 0=unlimited)</label>
              <input type="number" value={form.maxDiscount} onChange={e => set('maxDiscount', e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Usage Limit (0=unlimited)</label>
              <input type="number" value={form.usageLimit} onChange={e => set('usageLimit', e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Valid From</label>
              <input type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Valid Until</label>
              <input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-white" />
            </div>
          </div>
          <button onClick={create} disabled={saving || !form.code || !form.discountValue || !form.validFrom || !form.validUntil}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Coupon
          </button>
        </div>
      )}

      {/* List */}
      {loading
        ? <div className="flex justify-center py-10"><LoaderCircle className="animate-spin text-primary" /></div>
        : coupons.length === 0
          ? <div className="text-center text-text-muted py-10 text-sm">No coupons yet</div>
          : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-muted text-xs border-b border-border bg-red-50/40">
                      <th className="px-4 py-3 font-semibold">Code</th>
                      <th className="px-4 py-3 font-semibold">Discount</th>
                      <th className="px-4 py-3 font-semibold">Usage</th>
                      <th className="px-4 py-3 font-semibold">Valid</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map(c => (
                      <tr key={c._id} className="border-b border-border/40 last:border-0 hover:bg-red-50/20">
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold text-text-primary">{c.code}</div>
                          <div className="text-xs text-text-muted">{c.description}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`}
                          {c.maxDiscount > 0 && <span className="text-xs text-text-muted ml-1">(max ₹{c.maxDiscount})</span>}
                        </td>
                        <td className="px-4 py-3 text-text-muted">
                          {c.usageCount}/{c.usageLimit || '∞'}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {fmtDate(c.validFrom)} – {fmtDate(c.validUntil)}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggle(c)}
                            className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
      }
    </div>
  )
}
