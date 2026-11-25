require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');

const RETRYABLE_CODES = new Set([
  'P1001', 'P1002', 'P1008', 'P1017',
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  'PROTOCOL_CONNECTION_LOST', 'ER_GET_CONNECTION_TIMEOUT',
]);

async function withConnectionRetry(fn, { retries = 3, delayMs = 1000, onRetry } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = error?.code || '';
      const message = String(error?.message || '');
      const retryable = RETRYABLE_CODES.has(code)
        || /connection|timed?\s*out|econnreset|etimedout|closed/i.test(message);
      if (!retryable || attempt > retries) throw error;
      onRetry?.(attempt);
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
}

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
