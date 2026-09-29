require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');

const connectionUrl = process.env.DATABASE_URL || '';

let pool;
if (connectionUrl.startsWith('mysql://')) {
  const url = new URL(connectionUrl);
  pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 10,
    connectTimeout: 15000,
    acquireTimeout: 15000,
  });
} else {
  pool = mariadb.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'u806822518_sathi_staging',
    connectionLimit: 1,
  });
}

const adapter = new PrismaMariaDb(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
