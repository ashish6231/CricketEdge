const test = require('node:test');
const assert = require('node:assert/strict');
const {
  areSignupsAllowed,
  resolveSignupMode,
  isPublicSignupAllowed,
  validateSignupModeValue,
  resolveSiteName,
  DEFAULT_SIGNUP_MODE,
  DEFAULT_SITE_NAME,
  SIGNUP_MODE_KEY,
  LEGACY_SIGNUP_KEY,
} = require('../lib/siteSettings');

function fakePrisma(rows) {
  const rowList = rows == null ? [] : Array.isArray(rows) ? rows : [rows];
  return {
    siteSettings: {
      findMany: async ({ where }) => {
        assert.deepEqual(where.key.in, [SIGNUP_MODE_KEY, LEGACY_SIGNUP_KEY]);
        return rowList.filter((r) => where.key.in.includes(r.key));
      },
    },
  };
}

test('resolveSignupMode prefers signupMode when present', () => {
  assert.equal(
    resolveSignupMode({ signupModeRow: { value: 'admin_only' }, allowSignupsRow: { value: true } }),
    'admin_only',
  );
});

test('resolveSignupMode migrates legacy allowSignups true → both', () => {
  assert.equal(
    resolveSignupMode({ signupModeRow: null, allowSignupsRow: { value: true } }),
    'both',
  );
});

test('resolveSignupMode migrates legacy false/missing → admin_only', () => {
  assert.equal(resolveSignupMode({ signupModeRow: null, allowSignupsRow: { value: false } }), 'admin_only');
  assert.equal(resolveSignupMode({ signupModeRow: null, allowSignupsRow: null }), DEFAULT_SIGNUP_MODE);
});

test('resolveSignupMode invalid present mode does not fall through to legacy true', () => {
  assert.equal(
    resolveSignupMode({ signupModeRow: { value: 'garbage' }, allowSignupsRow: { value: true } }),
    DEFAULT_SIGNUP_MODE,
  );
  assert.equal(
    resolveSignupMode({ signupModeRow: { value: '' }, allowSignupsRow: { value: true } }),
    DEFAULT_SIGNUP_MODE,
  );
  assert.equal(
    resolveSignupMode({ signupModeRow: { value: null }, allowSignupsRow: { value: true } }),
    DEFAULT_SIGNUP_MODE,
  );
});

test('isPublicSignupAllowed', () => {
  assert.equal(isPublicSignupAllowed('admin_only'), false);
  assert.equal(isPublicSignupAllowed('public'), true);
  assert.equal(isPublicSignupAllowed('both'), true);
});

test('validateSignupModeValue rejects junk', () => {
  assert.equal(validateSignupModeValue('nope').ok, false);
  assert.equal(validateSignupModeValue('admin_only').ok, true);
});

test('areSignupsAllowed defaults false when settings missing', async () => {
  assert.equal(await areSignupsAllowed(fakePrisma([])), false);
});

test('areSignupsAllowed reads legacy boolean false', async () => {
  assert.equal(
    await areSignupsAllowed(fakePrisma({ key: 'allowSignups', value: false })),
    false,
  );
});

test('areSignupsAllowed reads legacy boolean true', async () => {
  assert.equal(
    await areSignupsAllowed(fakePrisma({ key: 'allowSignups', value: true })),
    true,
  );
});

test('areSignupsAllowed prefers signupMode over legacy allowSignups', async () => {
  assert.equal(
    await areSignupsAllowed(
      fakePrisma([
        { key: 'signupMode', value: 'public' },
        { key: 'allowSignups', value: false },
      ]),
    ),
    true,
  );
});

test('areSignupsAllowed invalid signupMode does not fall through to legacy true', async () => {
  assert.equal(
    await areSignupsAllowed(
      fakePrisma([
        { key: 'signupMode', value: 'garbage' },
        { key: 'allowSignups', value: true },
      ]),
    ),
    false,
  );
});

test('resolveSiteName uses trimmed string or default', () => {
  assert.equal(resolveSiteName({ value: 'CricEdge' }), 'CricEdge');
  assert.equal(resolveSiteName({ value: '  Odds  ' }), 'Odds');
  assert.equal(resolveSiteName({ value: '' }), DEFAULT_SITE_NAME);
  assert.equal(resolveSiteName(null), DEFAULT_SITE_NAME);
});
