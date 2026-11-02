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
    connectionLimit: Math.max(1,Math.min(50,parseInt(process.env.DB_POOL_SIZE,10)||4)),
    connectTimeout: 15000,
    acquireTimeout: 15000,
    // MariaDB expresses idleTimeout in seconds, unlike connect/acquireTimeout.
    idleTimeout: 300,
    minDelayValidation: 10000,
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

let prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if(process.env.OTEL_EXPORTER_OTLP_ENDPOINT && process.env.OTEL_SDK_DISABLED!=='true') {
  const {trace,SpanStatusCode}=require('@opentelemetry/api');
  const tracer=trace.getTracer('cricedge-database');
  prisma=prisma.$extends({query:{$allOperations:async({model,operation,args,query})=>
    tracer.startActiveSpan(`db.${model||'raw'}.${operation}`,async span=>{
      span.setAttributes({'db.system':'mariadb','db.operation.name':operation,...(model?{'db.collection.name':model}:{})});
      try{return await query(args)}
      catch(error){span.setStatus({code:SpanStatusCode.ERROR});throw error}
      finally{span.end()}
    })}});
}

module.exports = prisma;
