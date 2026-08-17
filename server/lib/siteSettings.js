const SITE_NAME_KEY = 'siteName';
const DEFAULT_SITE_NAME = 'CricketEdge';
const SIGNUP_MODE_KEY = 'signupMode';
const LEGACY_SIGNUP_KEY = 'allowSignups';
const SIGNUP_SETTING_KEY = LEGACY_SIGNUP_KEY; // backward compat export
const SIGNUP_MODES = ['admin_only', 'public', 'both'];
const DEFAULT_SIGNUP_MODE = 'admin_only';

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

async function getSignupMode(prisma) {
  const rows = await prisma.siteSettings.findMany({
    where: { key: { in: [SIGNUP_MODE_KEY, LEGACY_SIGNUP_KEY] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  return resolveSignupMode({
    signupModeRow: map[SIGNUP_MODE_KEY] || null,
    allowSignupsRow: map[LEGACY_SIGNUP_KEY] || null,
  });
}

async function areSignupsAllowed(prisma) {
  return isPublicSignupAllowed(await getSignupMode(prisma));
}

function resolveSiteName(row) {
  const raw = row?.value;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return DEFAULT_SITE_NAME;
}

async function getSiteName(prisma) {
  const row = await prisma.siteSettings.findUnique({ where: { key: SITE_NAME_KEY } });
  return resolveSiteName(row);
}

module.exports = {
  SIGNUP_MODE_KEY,
  LEGACY_SIGNUP_KEY,
  SIGNUP_SETTING_KEY,
  SIGNUP_MODES,
  DEFAULT_SIGNUP_MODE,
  SITE_NAME_KEY,
  DEFAULT_SITE_NAME,
  resolveSignupMode,
  isPublicSignupAllowed,
  validateSignupModeValue,
  getSignupMode,
  areSignupsAllowed,
  resolveSiteName,
  getSiteName,
};
