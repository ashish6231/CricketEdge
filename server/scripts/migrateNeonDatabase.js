#!/usr/bin/env node
/**
 * Copy all public tables from SOURCE_DATABASE_URL → TARGET_DATABASE_URL.
 * Run after: DATABASE_URL=$TARGET npx prisma migrate deploy
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Pool } = require('pg');
const { execSync } = require('child_process');

const SOURCE = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const TARGET =
  process.env.TARGET_DATABASE_URL ||
  process.argv[2] ||
  process.env.NEW_DATABASE_URL;

const TABLES = [
  'User',
  'SubscriptionPlan',
  'UserSubscription',
  'Match',
  'AdminAuditLog',
  'PromoCode',
  'SiteSettings',
];

function pool(url) {
  return new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
}

async function ping(label, p) {
  const r = await p.query('SELECT current_database() AS db, version() AS version');
  console.log(`✅ ${label}: ${r.rows[0].db} (PostgreSQL ${r.rows[0].version.split(' ')[1]})`);
}

async function copyTable(source, target, table) {
  const { rows } = await source.query(`SELECT * FROM "${table}" ORDER BY id`);
  if (!rows.length) {
    console.log(`   ${table}: 0 rows (skip)`);
    return 0;
  }

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  let inserted = 0;

  for (const row of rows) {
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const values = cols.map((c) => row[c]);
    await target.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`, values);
    inserted++;
  }

  const seq = await target.query(`SELECT pg_get_serial_sequence('"${table}"', 'id') AS seq`);
  if (seq.rows[0]?.seq) {
    await target.query(
      `SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`,
      [seq.rows[0].seq]
    );
  }

  console.log(`   ${table}: ${inserted} rows copied`);
  return inserted;
}

async function main() {
  if (!SOURCE || !TARGET) {
    console.error('Usage: SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/migrateNeonDatabase.js');
    console.error('Or: node scripts/migrateNeonDatabase.js "<target-url>" (uses DATABASE_URL as source)');
    process.exit(1);
  }

  if (SOURCE === TARGET) {
    console.error('❌ Source and target DATABASE_URL are the same');
    process.exit(1);
  }

  console.log('📦 Step 1: Apply schema on target (prisma migrate deploy)...');
  execSync('npx prisma migrate deploy', {
    cwd: require('path').join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TARGET },
    stdio: 'inherit',
  });

  const source = pool(SOURCE);
  const target = pool(TARGET);

  try {
    console.log('\n🔌 Step 2: Test connections...');
    await ping('Source (old)', source);
    await ping('Target (new)', target);

    console.log('\n📋 Step 3: Copy data...');
    await target.query(
      `TRUNCATE "SiteSettings", "PromoCode", "AdminAuditLog", "Match", "UserSubscription", "SubscriptionPlan", "User" RESTART IDENTITY CASCADE`
    );

    let total = 0;
    for (const table of TABLES) {
      total += await copyTable(source, target, table);
    }

    console.log(`\n✅ Migration complete — ${total} total rows copied.`);
    console.log('Next: set DATABASE_URL to the new connection string in server/.env and Railway.');
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
