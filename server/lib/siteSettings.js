const SIGNUP_SETTING_KEY = 'allowSignups';

async function areSignupsAllowed(prisma) {
  const row = await prisma.siteSettings.findUnique({ where: { key: SIGNUP_SETTING_KEY } });
  if (!row || row.value == null) return true;
  return Boolean(row.value);
}

module.exports = {
  SIGNUP_SETTING_KEY,
  areSignupsAllowed,
};
