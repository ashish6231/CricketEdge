const { PrismaClient } = require('@prisma/client');

// Use standard Prisma client — DATABASE_URL is set via env
// pgBouncer pooler URL must have ?pgbouncer=true&connection_limit=1 appended
// This is handled via DIRECT_URL / DATABASE_URL split in schema (see below)
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
