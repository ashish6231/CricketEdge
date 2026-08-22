#!/usr/bin/env node
/**
 * Import Pro users with correct subscription start/expiry dates.
 *
 * Usage:
 *   node scripts/importProUsers.js
 *   node scripts/importProUsers.js path/to/custom.json
 *
 * Edit server/data/pro_users_import.json — one entry per user:
 * {
 *   "email": "user@example.com",
 *   "name": "Optional Name",
 *   "proStartDate": "2026-01-15",
 *   "expiresAt": "2026-02-15"
 * }
 *
 * Or use durationMonths instead of expiresAt (default 1):
 * { "email": "...", "proStartDate": "2026-01-15", "durationMonths": 1 }
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('../db/prisma');

const DEFAULT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD || '123456';
const DATA_FILE = process.argv[2] || path.join(__dirname, '../data/pro_users_import.json');

function parseDate(raw, label) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysLeft(expiresAt) {
  const diff = expiresAt - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function upsertProUser(entry) {
  const email = String(entry.email || '').trim().toLowerCase();
  if (!email) throw new Error('email is required');

  const proStartDate = parseDate(entry.proStartDate, 'proStartDate');
  let expiresAt = entry.expiresAt
    ? parseDate(entry.expiresAt, 'expiresAt')
    : addMonths(proStartDate, parseInt(entry.durationMonths, 10) || 1);

  if (expiresAt <= proStartDate) {
    throw new Error(`${email}: expiresAt must be after proStartDate`);
  }

  const now = new Date();
  const isActive = expiresAt > now;
  const name = (entry.name || email.split('@')[0] || 'User').trim();

  const proPlan = await prisma.subscriptionPlan.findUnique({ where: { slug: 'pro' } });
  if (!proPlan) throw new Error('Pro plan not found — run seed first');

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const hashed = await bcrypt.hash(entry.password || DEFAULT_PASSWORD, 12);
    user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        authProvider: 'local',
        isVerified: true,
        role: 'user',
        status: 'active',
        subAutoRenew: false,
      },
    });
  } else if (entry.name && user.name !== name) {
    user = await prisma.user.update({ where: { id: user.id }, data: { name } });
  }

  const subData = {
    planId: proPlan.id,
    planSlug: 'pro',
    amount: 0,
    startedAt: proStartDate,
    expiresAt,
    billingCycle: entry.billingCycle || 'monthly',
    paymentStatus: 'completed',
    paymentMethod: entry.paymentMethod || 'manual_import',
    paidAt: proStartDate,
    status: isActive ? 'active' : 'expired',
    cancelReason: '',
  };

  const existingSub = await prisma.userSubscription.findFirst({
    where: { userId: user.id, planSlug: 'pro', paymentStatus: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  if (existingSub) {
    await prisma.userSubscription.update({ where: { id: existingSub.id }, data: subData });
  } else {
    await prisma.userSubscription.create({ data: { userId: user.id, ...subData } });
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      subPlanId: isActive ? proPlan.id : null,
      subPlanSlug: isActive ? 'pro' : 'free',
      subStatus: isActive ? 'active' : 'expired',
      subStartedAt: proStartDate,
      subExpiresAt: expiresAt,
    },
  });

  return {
    email,
    name: user.name,
    proStartDate: proStartDate.toISOString().slice(0, 10),
    expiresAt: expiresAt.toISOString().slice(0, 10),
    daysLeft: isActive ? daysLeft(expiresAt) : 0,
    status: isActive ? 'active Pro' : 'expired',
    created: !existingSub,
  };
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ File not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(rows) || !rows.length) {
    console.error('❌ JSON must be a non-empty array of users');
    process.exit(1);
  }

  console.log(`📥 Importing ${rows.length} user(s) from ${DATA_FILE}\n`);
  const results = [];

  for (const entry of rows) {
    try {
      const r = await upsertProUser(entry);
      results.push(r);
      console.log(
        `✅ ${r.email} | Pro from ${r.proStartDate} → ${r.expiresAt} | ${r.daysLeft} days left | ${r.status}`
      );
    } catch (err) {
      console.error(`❌ ${entry.email || '?'}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${results.length}/${rows.length} imported`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
