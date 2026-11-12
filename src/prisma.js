const { PrismaClient } = require('@prisma/client');

let databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  // Ensure Render / cloud databases have stable SSL and connection pool configurations
  if (!databaseUrl.includes('sslmode=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}sslmode=no-verify`;
  }
  if (!databaseUrl.includes('connect_timeout=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}connect_timeout=30`;
  }
  if (!databaseUrl.includes('connection_limit=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}connection_limit=15`;
  }
  if (!databaseUrl.includes('pool_timeout=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}pool_timeout=45`;
  }
}

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  datasources: databaseUrl ? {
    db: {
      url: databaseUrl
    }
  } : undefined
});

module.exports = prisma;
