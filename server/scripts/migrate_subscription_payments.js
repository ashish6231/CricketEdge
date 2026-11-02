require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { withConnectionRetry } = require('./migrate_prediction_datasets');

async function migrateSubscriptionPayments(prisma = require('../db/prisma')) {
  const sql = await fs.readFile(path.join(__dirname, '../prisma/migrations/20261102130000_subscription_payment_requests/migration.sql'), 'utf8');
  // Fixed additive DDL: existing application data is never replaced.
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
    await withConnectionRetry(() => prisma.$executeRawUnsafe(statement), {
      onRetry: attempt => console.warn(`Subscription payment connection interrupted; retrying (${attempt}/3)...`),
    });
  }
}
if (require.main === module) {
  migrateSubscriptionPayments().then(() => { console.log('Subscription payment requests ready'); process.exit(0); })
    .catch(error => { console.error('Subscription payment migration failed:', error.code || error.name); process.exit(1); });
}
module.exports = { migrateSubscriptionPayments };
