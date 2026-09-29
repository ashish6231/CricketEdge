import { useEffect, useState } from 'react'
import {
  LoaderCircle,
  Check,
  Clock,
  Key,
  RefreshCw,
  AlertTriangle,
  UserPlus,
  Gift,
  Server,
  Globe,
  Database,
  ShieldCheck,
  Zap
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
  hydrateTrialForm,
  hydrateSignupMode,
  hydrateSiteMode,
  trialSavePatches,
  formatTrialSaveMessage,
  formatSignupModeMessage,
  formatSiteModeMessage,
  TRIAL_UNITS,
  SIGNUP_MODE_KEY,
  SIGNUP_MODES,
  SIGNUP_MODE_OPTIONS,
  SITE_MODE_KEY,
  SITE_MODES,
  SITE_MODE_OPTIONS,
} from '../../utils/trialSettingsAdmin'

export default function AdminSettings({ isSuperAdmin }) {
  const toast = useToast()
  const [settings, setSettings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [trialEnabled, setTrialEnabled] = useState(true)
  const [trialValue, setTrialValue] = useState(30)
  const [trialUnit, setTrialUnit] = useState('minutes')
  const [trialSaving, setTrialSaving] = useState(false)
  const [signupMode, setSignupMode] = useState('admin_only')
  const [signupModeSaving, setSignupModeSaving] = useState(false)
  const [siteMode, setSiteMode] = useState('paid')
  const [siteModeSaving, setSiteModeSaving] = useState(false)

  // Upstream Scraper Session & Expiry Countdown State
  const [scraperStatus, setScraperStatus] = useState(null)
  const [scraperLoading, setScraperLoading] = useState(false)
  const [newCookieInput, setNewCookieInput] = useState('')
  const [cookieSaving, setCookieSaving] = useState(false)
  const [showCookieInput, setShowCookieInput] = useState(false)
  const [emergencyLoading, setEmergencyLoading] = useState(false)
  const [showConfirmLoginModal, setShowConfirmLoginModal] = useState(false)

  const applySettings = (rows) => {
    const list = Array.isArray(rows) ? rows : []
    setSettings(list)
    const trial = hydrateTrialForm(list)
    setTrialEnabled(trial.enabled)
    setTrialValue(trial.value)
    setTrialUnit(trial.unit)
    setSignupMode(hydrateSignupMode(list))
    setSiteMode(hydrateSiteMode(list))
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

  const handleEmergencyLogin = () => {
    setShowConfirmLoginModal(true)
  }

  const executeAutoLogin = async () => {
    setEmergencyLoading(true)
    try {
      const res = await adminTriggerEmergencyLogin()
      toast.success('Fresh session created and saved to PostgreSQL Database!')
      setShowConfirmLoginModal(false)
      if (res?.data) setScraperStatus(res.data)
      load({ quiet: true })
    } catch (e) {
      toast.error(e.detail || e.message || 'Auto-login failed')
    } finally {
      setEmergencyLoading(false)
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

  const saveSiteMode = async () => {
    setSiteModeSaving(true)
    try {
      await adminUpdateSetting(SITE_MODE_KEY, siteMode, 'Update website access mode')
      toast.success(formatSiteModeMessage(siteMode))
      load({ quiet: true })
    } catch (e) {
      toast.error(e.detail || 'Failed to update website access mode')
    } finally {
      setSiteModeSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="animate-spin text-primary" size={32} />
      </div>
    )
  }

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
      {/* 1. WEBSITE ACCESS MODE (FREE vs PAID) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden transition-all"
        style={{ background: '#111111', border: '1px solid #1e1e1e' }}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between border-b"
          style={{
            background: siteMode === 'free'
              ? 'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.02) 100%)'
              : 'linear-gradient(90deg, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.02) 100%)',
            borderColor: '#1e1e1e'
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{
                background: siteMode === 'free'
                  ? 'linear-gradient(135deg, #059669, #10b981)'
                  : 'linear-gradient(135deg, #dc2626, #f59e0b)'
              }}
            >
              <Globe size={14} />
            </div>
            <div>
              <h2 className="font-bold text-white text-sm">Website Access Mode</h2>
              <p className="text-[11px] text-[#666]">Control whether users need a paid subscription or free access to live matches</p>
            </div>
          </div>
          <span
            className={`text-xs font-bold px-3 py-1 rounded-full ${
              siteMode === 'free'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            }`}
          >
            {siteMode === 'free' ? '🎉 FREE MODE' : '⭐ PAID MODE'}
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {SITE_MODE_OPTIONS.map(option => {
              const selected = siteMode === option.value
              const isFree = option.value === 'free'
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col rounded-xl p-4 transition-all ${
                    !isSuperAdmin || siteModeSaving ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                  style={{
                    background: selected
                      ? (isFree ? 'rgba(16,185,129,0.08)' : 'rgba(220,38,38,0.08)')
                      : '#161616',
                    border: selected
                      ? (isFree ? '1px solid #10b981' : '1px solid #dc2626')
                      : '1px solid #222222',
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="siteMode"
                      value={option.value}
                      checked={selected}
                      onChange={e => setSiteMode(e.target.value)}
                      disabled={!isSuperAdmin || siteModeSaving}
                      className={isFree ? 'accent-emerald-500' : 'accent-red-500'}
                    />
                    <span className="text-sm font-bold text-white">{option.label}</span>
                  </span>
                  <span className="mt-2 pl-6 text-xs text-[#888] leading-relaxed">
                    {option.description}
                  </span>
                </label>
              )
            })}
          </div>

          <div
            className="p-3 rounded-xl text-xs flex items-center gap-2.5"
            style={{
              background: siteMode === 'free' ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)',
              border: siteMode === 'free' ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(245,158,11,0.2)',
              color: siteMode === 'free' ? '#34d399' : '#fbbf24',
            }}
          >
            <span>{siteMode === 'free' ? '🔓' : '🔒'}</span>
            <span>{formatSiteModeMessage(siteMode)}</span>
          </div>

          {isSuperAdmin && (
            <div className="pt-1">
              <button
                type="button"
                onClick={saveSiteMode}
                disabled={siteModeSaving || !SITE_MODES.includes(siteMode)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg, #dc2626, #10b981)' }}
              >
                {siteModeSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                Save Website Mode
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. UPSTREAM SCRAPER SESSION & EXPIRY COUNTDOWN CARD */}
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

            {/* Metric 2: Storage Source */}
            <div
              className="rounded-xl p-4 flex flex-col justify-between"
              style={{ background: '#161616', border: '1px solid #222222' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#888] flex items-center gap-1.5">
                  <Database size={13} className="text-[#666]" /> Cookie Storage
                </span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  PostgreSQL DB
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-white tracking-tight">
                  Single Source
                </div>
                <div className="text-[11px] text-[#777] mt-1">
                  Persisted across all deploys & restarts (Zero .env dependency)
                </div>
              </div>
            </div>

            {/* Metric 3: Self-Healing 401 Recovery */}
            <div
              className="rounded-xl p-4 flex flex-col justify-between"
              style={{ background: '#161616', border: '1px solid #222222' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#888] flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#666]" /> 401 Auto-Recovery
                </span>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(16,185,129,0.15)',
                    color: '#10b981',
                    border: '1px solid rgba(16,185,129,0.3)',
                  }}
                >
                  Enabled
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-emerald-400 tracking-tight">
                  Instant Healing
                </div>
                <div className="text-[11px] text-[#777] mt-1">
                  Automatic login & retry when 401 occurs
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
                {showCookieInput ? 'Close Input Drawer' : 'Paste New Cookie (Manual)'}
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

              <button
                type="button"
                onClick={handleEmergencyLogin}
                disabled={emergencyLoading}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16,185,129,0.3)',
                }}
              >
                {emergencyLoading ? <LoaderCircle size={13} className="animate-spin" /> : <Zap size={13} />}
                Auto-Login & Refresh Session Now
              </button>
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
      {/* CONFIRMATION MODAL: Auto-Login & Session Refresh */}
      {/* ──────────────────────────────────────────────────────────── */}
      {showConfirmLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5 border border-[#2a2a2a] shadow-2xl relative"
            style={{ background: '#141414' }}
          >
            {/* Modal Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex-shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Confirm Auto-Login & Refresh
                </h3>
                <p className="text-xs text-[#888] leading-relaxed">
                  Are you sure you want to trigger a new session login?
                </p>
              </div>
            </div>

            {/* Warning / Context Box */}
            <div className="p-3.5 rounded-xl bg-[#1c1c1c] border border-[#282828] text-xs space-y-2">
              <div className="flex items-center justify-between text-[#aaa]">
                <span>Upstream Account:</span>
                <span className="font-mono text-white text-[11px]">cricketloaduser56@gmail.com</span>
              </div>
              <div className="flex items-center justify-between text-[#aaa]">
                <span>Target Service:</span>
                <span className="text-[#10b981] font-semibold">tennisliveload.com</span>
              </div>
              <div className="pt-2 border-t border-[#262626] text-[11px] text-amber-400/90 leading-normal flex items-start gap-1.5">
                <span>⚠️</span>
                <span>
                  <strong>Daily Limit Warning:</strong> Upstream allows max 2 logins per 24 hours. A fresh session will revoke the previous cookie.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmLoginModal(false)}
                disabled={emergencyLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#aaa] hover:text-white bg-[#1e1e1e] hover:bg-[#282828] transition-colors border border-[#2e2e2e]"
              >
                Cancel (Keep Current)
              </button>
              <button
                type="button"
                onClick={executeAutoLogin}
                disabled={emergencyLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 shadow-lg shadow-emerald-950/40"
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                }}
              >
                {emergencyLoading ? (
                  <>
                    <LoaderCircle size={14} className="animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    Yes, Login & Refresh Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
