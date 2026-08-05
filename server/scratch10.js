const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const proUsers = await prisma.user.findMany({
    where: { subPlanSlug: 'pro' },
    select: { email: true, subExpiresAt: true }
  });
  console.log("Pro users:", proUsers);
  process.exit(0);
})();
