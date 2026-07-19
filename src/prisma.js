const { PrismaClient } = require('@prisma/client');

let databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  // Ensure Render / cloud databases have stable SSL and connection timeout configurations
  if (!databaseUrl.includes('sslmode=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}sslmode=no-verify`;
  }
  if (!databaseUrl.includes('connect_timeout=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += `${separator}connect_timeout=30`;
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
