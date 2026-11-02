const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSubscriptionPayments } = require('../scripts/migrate_subscription_payments');

test('subscription payment migration uses additive idempotent DDL', async () => {
  const statements = [];
  await migrateSubscriptionPayments({ $executeRawUnsafe: async sql => statements.push(sql) });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS `SubscriptionPaymentRequest`/);
  assert.match(statements[0], /UNIQUE KEY `SubscriptionPaymentRequest_utr_key`/);
  assert.doesNotMatch(statements[0], /DROP TABLE|DELETE FROM|TRUNCATE/i);
});
