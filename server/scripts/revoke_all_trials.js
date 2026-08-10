const prisma = require('../db/prisma');
const { revokeAllActiveTrials } = require('../lib/subscriptionAccess');

async function main() {
  const apply = process.argv.includes('--apply');
  const active = await prisma.user.findMany({
    where: { subPlanSlug: 'trial', subStatus: 'active' },
    select: { id: true, email: true, subExpiresAt: true },
    orderBy: { email: 'asc' },
  });

  if (!apply) {
    console.log(JSON.stringify({
      dryRun: true,
      matched: active.length,
      users: active.map(u => ({ email: u.email, subExpiresAt: u.subExpiresAt })),
    }, null, 2));
    console.log('Dry run only. Re-run with --apply to revoke all active trials.');
    return;
  }

  if (!active.length) {
    console.log(JSON.stringify({ dryRun: false, revoked: 0, message: 'No active trials found' }, null, 2));
    return;
  }

  const result = await revokeAllActiveTrials(prisma, { reason: 'Trial revoked (bulk)' });
  console.log(JSON.stringify({
    dryRun: false,
    revoked: result.revoked,
    users: result.users.map(u => u.email),
  }, null, 2));
}

main()
  .catch(err => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
