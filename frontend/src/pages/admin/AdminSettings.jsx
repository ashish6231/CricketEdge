import { useEffect, useState } from 'react'
import {
  LoaderCircle,
  Edit2,
  Check,
  X,
  Clock,
  Key,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Sliders,
  UserPlus,
  Gift,
  Server
} from 'lucide-react'
import {
  adminGetSettings,
  adminUpdateSetting,
  adminGetScraperStatus,
  adminUpdateScraperCookie,
  adminTriggerEmergencyLogin,
} from '../../api'
import { useToast } from '../../components/ToastProvider'
import {
  filterTrialSettings,
  hydrateTrialForm,
  hydrateSignupMode,
  trialSavePatches,
  formatTrialSaveMessage,
  formatSignupModeMessage,
  TRIAL_UNITS,
  SIGNUP_MODE_KEY,
  SIGNUP_MODES,
  SIGNUP_MODE_OPTIONS,
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
  const [signupMode, setSignupMode] = useState('admin_only')
  const [signupModeSaving, setSignupModeSaving] = useState(false)

  // Upstream Scraper Session & Expiry Countdown State
  const [scraperStatus, setScraperStatus] = useState(null)
  const [scraperLoading, setScraperLoading] = useState(false)
  const [newCookieInput, setNewCookieInput] = useState('')
  const [cookieSaving, setCookieSaving] = useState(false)
  const [showCookieInput, setShowCookieInput] = useState(false)
  const [emergencyLoading, setEmergencyLoading] = useState(false)

  const applySettings = (rows) => {
    const list = Array.isArray(rows) ? rows : []
    setSettings(list)
    const trial = hydrateTrialForm(list)
    setTrialEnabled(trial.enabled)
    setTrialValue(trial.value)
    setTrialUnit(trial.unit)
    setSignupMode(hydrateSignupMode(list))
  }

  const load = ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    adminGetSettings()
      .then(res => applySettings(res.data))
      .catch(e => toast.error(e.detail || 'Failed to load'))
      .finally(() => { if (!quiet) setLoading(false) })
  }

  const loadScraper = () => {
    setScraperLoading(true)
    adminGetScraperStatus()
      .then(res => {
        if (res?.data) setScraperStatus(res.data)
      })
      .catch(() => {})
      .finally(() => setScraperLoading(false))
  }

  useEffect(() => {
    load()
    loadScraper()
    const timer = setInterval(loadScraper, 15000)
    return () => clearInterval(timer)
  }, [])

  const handleSaveCookie = async () => {
    if (!newCookieInput.trim()) return toast.error('Please paste a cookie string')
    setCookieSaving(true)
    try {
      const res = await adminUpdateScraperCookie(newCookieInput.trim())
      toast.success('Session cookie updated and saved to DB & disk!')
      setNewCookieInput('')
      setShowCookieInput(false)
      if (res?.data) setScraperStatus(res.data)
    } catch (e) {
      toast.error(e.detail || e.message || 'Failed to update cookie')
    } finally {
      setCookieSaving(false)
    }
  }

  const handleEmergencyLogin = async () => {
    if (!window.confirm('Are you sure you want to trigger Emergency Login? This will consume your 2nd (final) daily login try on tennisliveload.com.')) {
      return
    }
    setEmergencyLoading(true)
    try {
      const res = await adminTriggerEmergencyLogin()
      toast.success('Emergency login succeeded! Fresh session active.')
      if (res?.data) setScraperStatus(res.data)
    } catch (e) {
      toast.error(e.detail || e.message || 'Emergency login failed')
    } finally {
      setEmergencyLoading(false)
    }
  }

  const handleStartEdit = (s) => {
    setEditing(s.key)
    if (typeof s.value === 'object' && s.value !== null) {
      setEditVal(JSON.stringify(s.value, null, 2))
    } else {
      setEditVal(String(s.value ?? ''))
    }
  }

  const save = async (key) => {
    setSaving(true)
    try {
      let valToSave = editVal
      const trimmed = editVal.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          valToSave = JSON.parse(trimmed)
        } catch {
          valToSave = trimmed
        }
      } else if (trimmed === 'true') {
        valToSave = true
      } else if (trimmed === 'false') {
        valToSave = false
      } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
        valToSave = Number(trimmed)
      }

      await adminUpdateSetting(key, valToSave)
      toast.success(`"${key}" updated`)
      setEditing(null)
      load({ quiet: true })
      loadScraper()
    } catch (e) {
      toast.error(e.detail || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const renderSettingValue = (s) => {
    // Custom friendly display for TENNIS_SESSION_COOKIES
    if (s.key === 'TENNIS_SESSION_COOKIES' && typeof s.value === 'object' && s.value !== null) {
      const { cookie, expiry, updatedAt } = s.value
      const msLeft = expiry ? Math.max(0, expiry - Date.now()) : 0
      const hoursLeft = (msLeft / 3600000).toFixed(1)
      const isLive = msLeft > 0

      return (
        <div className="mt-2.5 space-y-2 p-3.5 rounded-xl bg-[#141414] border border-[#222222] text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#888] font-medium">Session Status:</span>
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5"
              style={
                isLive
                  ? { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
                  : { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }
              }
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {isLive ? `Active (${hoursLeft}h left)` : 'Expired'}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1e1e1e]">
            <span className="text-[#888] font-medium">Cookie Token:</span>
            <div className="flex items-center gap-2 max-w-full">
              <code className="font-mono text-[#10b981] bg-[#1a1a1a] px-2.5 py-1 rounded-lg text-[11px] max-w-[240px] sm:max-w-[360px] truncate border border-[#262626]">
                {cookie || '—'}
              </code>
              {cookie && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(cookie)
                    toast.success('Cookie copied to clipboard!')
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#222] hover:bg-[#333] text-white text-[11px] font-semibold transition-colors border border-[#333]"
                >
                  Copy
                </button>
              )}
            </div>
          </div>

          {expiry && (
            <div className="flex items-center justify-between text-[11px] text-[#777] pt-1 border-t border-[#1e1e1e]">
              <span>Exact Expiration:</span>
              <span className="text-[#aaa] font-mono">
                {new Date(expiry).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </span>
            </div>
          )}

          {updatedAt && (
            <div className="flex items-center justify-between text-[11px] text-[#777]">
              <span>Last Saved to DB:</span>
              <span className="text-[#aaa] font-mono">
                {new Date(updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </span>
            </div>
          )}
        </div>
      )
    }

    // Custom friendly display for TENNIS_DAILY_ATTEMPTS
    if (s.key === 'TENNIS_DAILY_ATTEMPTS' && typeof s.value === 'object' && s.value !== null) {
      const { date, automatedAttempts = 0, emergencyAttempts = 0, lastAttemptAt } = s.value
      const canAuto = automatedAttempts < 1
      const canEmergency = (automatedAttempts + emergencyAttempts) < 2

      return (
        <div className="mt-2.5 space-y-2 p-3.5 rounded-xl bg-[#141414] border border-[#222222] text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#888] font-medium">Daily Cycle Date:</span>
            <span className="font-mono text-white bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#262626]">
              {date || '—'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#1e1e1e]">
            <span className="text-[#888] font-medium">Automated Tries (Max 1/day):</span>
            <span className={`font-bold ${canAuto ? 'text-[#10b981]' : 'text-amber-400'}`}>
              {automatedAttempts} / 1 {canAuto ? '(Available)' : '(1 Used Today)'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#888] font-medium">Emergency Try (#2):</span>
            <span
              className="px-2 py-0.5 rounded text-[11px] font-bold"
              style={
                canEmergency
                  ? { background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }
                  : { background: '#222', color: '#888' }
              }
            >
              {canEmergency ? 'Available (1 reserved)' : 'Used'}
            </span>
          </div>

          {lastAttemptAt && (
            <div className="flex items-center justify-between text-[11px] text-[#777] pt-1 border-t border-[#1e1e1e]">
              <span>Last Login Attempt:</span>
              <span className="text-[#aaa] font-mono">
                {new Date(lastAttemptAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </span>
            </div>
          )}
        </div>
      )
    }

    // Boolean display
    if (typeof s.value === 'boolean') {
      return (
        <div
          className="mt-1 text-xs font-mono font-semibold"
          style={{ color: s.value ? '#10b981' : '#ef4444' }}
        >
          {s.value ? '✓ true' : '✗ false'}
        </div>
      )
    }

    // Generic Object / JSON display
    if (typeof s.value === 'object' && s.value !== null) {
      return (
        <pre className="mt-2 p-3 rounded-xl bg-[#141414] border border-[#242424] text-[11px] font-mono text-[#10b981] overflow-x-auto max-h-56 leading-relaxed">
          {JSON.stringify(s.value, null, 2)}
        </pre>
      )
    }

    // Fallback string/number
    return (
      <div className="mt-1 text-xs font-mono text-[#aaa] break-all">
        {String(s.value ?? '—')}
      </div>
    )
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

  const saveSignupMode = async () => {
    setSignupModeSaving(true)
    try {
      await adminUpdateSetting(SIGNUP_MODE_KEY, signupMode, 'Update signup mode')
      toast.success(formatSignupModeMessage(signupMode))
      load({ quiet: true })
    } catch (e) {
      toast.error(e.detail || 'Failed to update signup mode')
    } finally {
      setSignupModeSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="animate-spin text-primary" size={32} />
      </div>
    )
  }

  const settingsForList = filterTrialSettings(settings)
  const grouped = settingsForList.reduce((acc, s) => {
    const cat = s.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  const isExpiringSoon = scraperStatus && parseFloat(scraperStatus.hoursLeft) < 3

  return (
    <div className="space-y-6">
      {!isSuperAdmin && (
        <div className="text-xs text-amber-300 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
          <span>Only superadmins have permission to edit system settings.</span>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. UPSTREAM SCRAPER SESSION & EXPIRY COUNTDOWN CARD */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden transition-all"
        style={{ background: '#111111', border: '1px solid #1e1e1e' }}
      >
        {/* Top Header Bar */}
        <div
          className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b"
          style={{
            background: 'linear-gradient(90deg, rgba(220,38,38,0.08) 0%, rgba(16,185,129,0.08) 100%)',
            borderColor: '#1e1e1e'
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ background: 'linear-gradient(135deg, #dc2626, #10b981)' }}
            >
              <Server size={14} />
            </div>
            <div>
              <h2 className="font-bold text-white text-sm">Upstream Scraper Session & Expiry</h2>
              <p className="text-[11px] text-[#666]">tennisliveload.com live Betfair feed connection</p>
            </div>
          </div>

          {scraperStatus && (
            <div className="flex items-center gap-2">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"
                style={
                  scraperStatus.isConnected
                    ? { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
                    : { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    scraperStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                {scraperStatus.isConnected ? 'LIVE & CONNECTED' : 'EXPIRED (HTTP 401)'}
              </span>
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-5 space-y-5">
          {/* Main 3 Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Metric 1: Time Left */}
            <div
              className="rounded-xl p-4 flex flex-col justify-between"
              style={{ background: '#161616', border: '1px solid #222222' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#888] flex items-center gap-1.5">
                  <Clock size={13} className="text-[#666]" /> Time Remaining
                </span>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: scraperStatus?.isConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: scraperStatus?.isConnected ? '#10b981' : '#ef4444',
                  }}
                >
                  {scraperStatus?.isConnected ? 'Active' : 'Expired'}
                </span>
              </div>
              <div className="mt-3">
                <div
                  className="text-3xl font-black tracking-tight"
                  style={{ color: isExpiringSoon ? '#ef4444' : '#10b981' }}
                >
                  {scraperStatus ? `${scraperStatus.hoursLeft}h` : '—'}
                </div>
                <div className="text-[11px] text-[#777] mt-1">
                  {scraperStatus?.expiryTimestamp
                    ? `Expires: ${new Date(scraperStatus.expiryTimestamp).toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                      })}, ${new Date(scraperStatus.expiryTimestamp).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                      })} IST`
                    : '24-hour cycle'}
                </div>
              </div>
            </div>

            {/* Metric 2: Daily Auto-Tries */}
            <div
              className="rounded-xl p-4 flex flex-col justify-between"
              style={{ background: '#161616', border: '1px solid #222222' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#888] flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-[#666]" /> Daily Auto-Tries
                </span>
                <span className="text-[10px] font-bold text-[#888] bg-[#222] px-2 py-0.5 rounded-full">
                  1 Allowed/Day
                </span>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-black text-white tracking-tight">
                  {scraperStatus ? `${scraperStatus.automatedAttemptsUsed} / 1` : '—'}
                </div>
                <div className="text-[11px] text-[#777] mt-1">
                  {scraperStatus?.automatedAttemptsUsed >= 1
                    ? '1 daily automated try used today'
                    : '1 automated try available'}
                </div>
              </div>
            </div>

            {/* Metric 3: Emergency Try */}
            <div
              className="rounded-xl p-4 flex flex-col justify-between"
              style={{ background: '#161616', border: '1px solid #222222' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#888] flex items-center gap-1.5">
                  <ShieldAlert size={13} className="text-[#666]" /> Emergency Try (#2)
                </span>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: scraperStatus?.emergencyTryAvailable
                      ? 'rgba(59,130,246,0.15)'
                      : 'rgba(142,142,147,0.15)',
                    color: scraperStatus?.emergencyTryAvailable ? '#3b82f6' : '#888',
                  }}
                >
                  {scraperStatus?.emergencyTryAvailable ? 'Reserved' : 'Consumed'}
                </span>
              </div>
              <div className="mt-3">
                <div
                  className="text-3xl font-black tracking-tight"
                  style={{ color: scraperStatus?.emergencyTryAvailable ? '#3b82f6' : '#888' }}
                >
                  {scraperStatus?.emergencyTryAvailable ? 'Available' : 'Used'}
                </div>
                <div className="text-[11px] text-[#777] mt-1">
                  Safely reserved for manual recovery
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          {isSuperAdmin && (
            <div
              className="pt-3 flex flex-wrap items-center gap-3"
              style={{ borderTop: '1px solid #1e1e1e' }}
            >
              <button
                type="button"
                onClick={() => setShowCookieInput(!showCookieInput)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: showCookieInput ? '#2a2a2a' : '#181818',
                  color: '#fff',
                  border: '1px solid #282828',
                }}
              >
                <Key size={13} className="text-primary" />
                {showCookieInput ? 'Close Input' : 'Paste New Cookie'}
              </button>

              <button
                type="button"
                onClick={loadScraper}
                disabled={scraperLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#aaa] hover:text-white transition-all"
                style={{ background: '#161616', border: '1px solid #222222' }}
              >
                <RefreshCw size={13} className={scraperLoading ? 'animate-spin' : ''} />
                Refresh Status
              </button>

              {scraperStatus?.emergencyTryAvailable && (
                <button
                  type="button"
                  onClick={handleEmergencyLogin}
                  disabled={emergencyLoading}
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(245,158,11,0.12)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.3)',
                  }}
                >
                  {emergencyLoading ? <LoaderCircle size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                  Trigger Emergency Try (#2)
                </button>
              )}
            </div>
          )}

          {/* Paste Cookie Input Drawer */}
          {showCookieInput && (
            <div
              className="p-4 rounded-xl space-y-3 mt-2"
              style={{ background: '#181818', border: '1px solid #2c2c2e' }}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white">
                  Paste <span className="font-mono text-[#10b981]">cricket_live_load_session</span> Cookie:
                </label>
                <span className="text-[11px] text-[#777]">Saves to PostgreSQL DB, disk & memory</span>
              </div>
              <textarea
                value={newCookieInput}
                onChange={e => setNewCookieInput(e.target.value)}
                placeholder="cricket_live_load_session=Fe26.2*1*..."
                className="w-full text-xs font-mono p-3 rounded-xl outline-none resize-none h-24"
                style={{
                  background: '#121212',
                  border: '1px solid #282828',
                  color: '#eee',
                }}
              />
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCookieInput(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#888] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCookie}
                  disabled={cookieSaving || !newCookieInput.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #10b981)' }}
                >
                  {cookieSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                  Save to DB & Production
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. SIGNUP MODE CARD */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#111111', border: '1px solid #1e1e1e' }}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between border-b"
          style={{ borderColor: '#1e1e1e' }}
        >
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-primary" />
            <h2 className="font-bold text-white text-sm">Signup & Registration Mode</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {SIGNUP_MODE_OPTIONS.map(option => {
              const selected = signupMode === option.value
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col rounded-xl p-3.5 transition-all ${
                    !isSuperAdmin || signupModeSaving ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                  style={{
                    background: selected ? '#1c1616' : '#161616',
                    border: selected ? '1px solid #dc2626' : '1px solid #222222',
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="signupMode"
                      value={option.value}
                      checked={selected}
                      onChange={e => setSignupMode(e.target.value)}
                      disabled={!isSuperAdmin || signupModeSaving}
                      className="accent-red-500"
                    />
                    <span className="text-sm font-semibold text-white">{option.label}</span>
                  </span>
                  <span className="mt-1.5 pl-6 text-xs text-[#777] leading-relaxed">
                    {option.description}
                  </span>
                </label>
              )
            })}
          </div>

          <p className="text-xs text-[#777]">
            {formatSignupModeMessage(signupMode)}
          </p>

          {isSuperAdmin && (
            <div className="pt-2">
              <button
                type="button"
                onClick={saveSignupMode}
                disabled={signupModeSaving || !SIGNUP_MODES.includes(signupMode)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg, #dc2626, #10b981)' }}
              >
                {signupModeSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                Save Signup Mode
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. FREE TRIAL SETTINGS CARD */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#111111', border: '1px solid #1e1e1e' }}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between border-b"
          style={{ borderColor: '#1e1e1e' }}
        >
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-primary" />
            <h2 className="font-bold text-white text-sm">Free Trial Configuration</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={trialEnabled}
              onChange={e => setTrialEnabled(e.target.checked)}
              disabled={!isSuperAdmin || trialSaving}
              className="accent-green-500 w-4 h-4 rounded"
            />
            <span className="text-sm font-semibold text-white">Enable automatic free trial for new users</span>
          </label>

          {trialEnabled && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-[#888] block">Trial Duration</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={trialValue}
                  onChange={e => setTrialValue(e.target.value)}
                  disabled={!isSuperAdmin || trialSaving}
                  className="w-24 rounded-xl px-3 py-2 text-sm outline-none text-white disabled:opacity-50"
                  style={{ background: '#181818', border: '1px solid #282828' }}
                />
                <select
                  value={trialUnit}
                  onChange={e => setTrialUnit(e.target.value)}
                  disabled={!isSuperAdmin || trialSaving}
                  className="rounded-xl px-3 py-2 text-sm outline-none text-white disabled:opacity-50"
                  style={{ background: '#181818', border: '1px solid #282828' }}
                >
                  {TRIAL_UNITS.map(unit => (
                    <option key={unit} value={unit} style={{ background: '#181818', color: '#fff' }}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <p className="text-xs text-[#777]">
            {trialEnabled
              ? 'Applies only to newly granted trials. Active trials keep their current end time.'
              : 'Free trial is off. Signup, login auto-grant, and admin Grant trial are all blocked. Active trials keep running until they expire.'}
          </p>

          {isSuperAdmin && (
            <div className="pt-2">
              <button
                type="button"
                onClick={saveTrial}
                disabled={trialSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg, #dc2626, #10b981)' }}
              >
                {trialSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                Save Trial Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 4. GENERAL SYSTEM SETTINGS LIST */}
      {/* ──────────────────────────────────────────────────────────── */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div
          key={cat}
          className="rounded-2xl overflow-hidden"
          style={{ background: '#111111', border: '1px solid #1e1e1e' }}
        >
          <div
            className="px-5 py-3.5 flex items-center justify-between border-b"
            style={{ borderColor: '#1e1e1e' }}
          >
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-primary" />
              <h2 className="font-bold text-white text-sm capitalize">{cat} Settings</h2>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#1a1a1a' }}>
            {items.map(s => (
              <div key={s.key} className="px-5 py-3.5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs font-semibold text-white">{s.key}</div>
                  {s.description && <div className="text-xs text-[#777] mt-0.5">{s.description}</div>}
                  {editing === s.key ? (
                    <div className="flex items-center gap-2 mt-2.5">
                      <input
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        className="flex-1 rounded-xl px-3 py-1.5 text-xs outline-none text-white"
                        style={{ background: '#181818', border: '1px solid #dc2626' }}
                      />
                      <button
                        type="button"
                        onClick={() => save(s.key)}
                        disabled={saving}
                        className="p-1.5 rounded-lg text-emerald-400 disabled:opacity-50"
                        style={{ background: 'rgba(16,185,129,0.15)' }}
                      >
                        {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="p-1.5 rounded-lg text-[#888] hover:text-white"
                        style={{ background: '#222' }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs font-mono text-[#aaa] break-all">
                      {typeof s.value === 'boolean' ? (s.value ? '✓ true' : '✗ false') : String(s.value)}
                    </div>
                  )}
                </div>
                {isSuperAdmin && editing !== s.key && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(s.key)
                      setEditVal(String(s.value))
                    }}
                    className="flex-shrink-0 p-2 rounded-xl text-[#888] hover:text-white transition-colors"
                    style={{ background: '#181818', border: '1px solid #242424' }}
                    title={`Edit ${s.key}`}
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {settings.length === 0 && (
        <div className="text-center text-[#666] py-12 text-sm">No settings found</div>
      )}
    </div>
  )
}
