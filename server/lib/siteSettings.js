const SITE_NAME_KEY = 'siteName';
const DEFAULT_SITE_NAME = 'CricEdge';
const SIGNUP_MODE_KEY = 'signupMode';
const LEGACY_SIGNUP_KEY = 'allowSignups';
const SIGNUP_SETTING_KEY = LEGACY_SIGNUP_KEY; // backward compat export
const SIGNUP_MODES = ['admin_only', 'public', 'both'];
const DEFAULT_SIGNUP_MODE = 'admin_only';

const SITE_MODE_KEY = 'siteMode';
const SITE_MODES = ['paid', 'free'];
const DEFAULT_SITE_MODE = 'paid';

function resolveSiteMode(row) {
  const raw = row?.value;
  if (typeof raw === 'string' && SITE_MODES.includes(raw)) return raw;
  return DEFAULT_SITE_MODE;
}

function isFreeMode(mode) {
  return mode === 'free';
}

function validateSiteModeValue(value) {
  if (typeof value !== 'string' || !SITE_MODES.includes(value)) {
    return { ok: false, message: 'siteMode must be paid or free' };
  }
  return { ok: true, value };
}

function resolveSignupMode({ signupModeRow, allowSignupsRow } = {}) {
  if (signupModeRow) {
    const raw = signupModeRow.value;
    if (typeof raw === 'string' && SIGNUP_MODES.includes(raw)) return raw;
    return DEFAULT_SIGNUP_MODE;
  }
  if (allowSignupsRow && allowSignupsRow.value != null) {
    return Boolean(allowSignupsRow.value) ? 'both' : 'admin_only';
  }
  return DEFAULT_SIGNUP_MODE;
}

function isPublicSignupAllowed(mode) {
  return mode === 'public' || mode === 'both';
}

function validateSignupModeValue(value) {
  if (typeof value !== 'string' || !SIGNUP_MODES.includes(value)) {
    return { ok: false, message: 'signupMode must be admin_only, public, or both' };
  }
  return { ok: true, value };
}

let _cachedSignupMode = null;
let _cachedSignupModeTs = 0;
let _cachedSiteName = null;
let _cachedSiteNameTs = 0;
let _cachedSiteMode = null;
let _cachedSiteModeTs = 0;
const SETTINGS_CACHE_TTL = 30000; // 30s cache

function invalidateSiteSettingsCache() {
  _cachedSignupMode = null;
  _cachedSignupModeTs = 0;
  _cachedSiteName = null;
  _cachedSiteNameTs = 0;
  _cachedSiteMode = null;
  _cachedSiteModeTs = 0;
}

function getSiteModeSync() {
  return _cachedSiteMode || DEFAULT_SITE_MODE;
}

async function getSiteMode(prisma, { bypassCache = false } = {}) {
  const isRealPrisma = Boolean(prisma && typeof prisma.$connect === 'function');
  const now = Date.now();
  if (isRealPrisma && !bypassCache && _cachedSiteMode !== null && (now - _cachedSiteModeTs) < SETTINGS_CACHE_TTL) {
    return _cachedSiteMode;
  }
  const row = await prisma.siteSettings.findUnique({ where: { key: SITE_MODE_KEY } });
  const res = resolveSiteMode(row);
  if (isRealPrisma) {
    _cachedSiteMode = res;
    _cachedSiteModeTs = now;
  }
  return res;
}

async function getSignupMode(prisma, { bypassCache = false } = {}) {
  const isRealPrisma = Boolean(prisma && typeof prisma.$connect === 'function');
  const now = Date.now();
  if (isRealPrisma && !bypassCache && _cachedSignupMode !== null && (now - _cachedSignupModeTs) < SETTINGS_CACHE_TTL) {
    return _cachedSignupMode;
  }
  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: [SIGNUP_MODE_KEY, LEGACY_SIGNUP_KEY] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  const res = resolveSignupMode({
    signupModeRow: map[SIGNUP_MODE_KEY] || null,
    allowSignupsRow: map[LEGACY_SIGNUP_KEY] || null,
  });
  if (isRealPrisma) {
    _cachedSignupMode = res;
    _cachedSignupModeTs = now;
  }
  return res;
}

async function areSignupsAllowed(prisma, opts) {
  return isPublicSignupAllowed(await getSignupMode(prisma, opts));
}

function resolveSiteName(row) {
  const raw = row?.value;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return DEFAULT_SITE_NAME;
}

async function getSiteName(prisma, { bypassCache = false } = {}) {
  const isRealPrisma = Boolean(prisma && typeof prisma.$connect === 'function');
  const now = Date.now();
  if (isRealPrisma && !bypassCache && _cachedSiteName !== null && (now - _cachedSiteNameTs) < SETTINGS_CACHE_TTL) {
    return _cachedSiteName;
  }
  const row = await prisma.siteSettings.findUnique({ where: { key: SITE_NAME_KEY } });
  const res = resolveSiteName(row);
  if (isRealPrisma) {
    _cachedSiteName = res;
    _cachedSiteNameTs = now;
  }
  return res;
}

module.exports = {
  SIGNUP_MODE_KEY,
  LEGACY_SIGNUP_KEY,
  SIGNUP_SETTING_KEY,
  SIGNUP_MODES,
  DEFAULT_SIGNUP_MODE,
  SITE_NAME_KEY,
  DEFAULT_SITE_NAME,
  SITE_MODE_KEY,
  SITE_MODES,
  DEFAULT_SITE_MODE,
  resolveSiteMode,
  isFreeMode,
  validateSiteModeValue,
  getSiteMode,
  getSiteModeSync,
  resolveSignupMode,
  isPublicSignupAllowed,
  validateSignupModeValue,
  getSignupMode,
  areSignupsAllowed,
  resolveSiteName,
  getSiteName,
  invalidateSiteSettingsCache,
};
