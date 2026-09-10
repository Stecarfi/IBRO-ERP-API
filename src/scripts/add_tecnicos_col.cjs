const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const res = await prisma.$executeRawUnsafe(`ALTER TABLE "CuentasCobro" ADD COLUMN IF NOT EXISTS "tecnicos" JSONB;`);
    console.log('Successfully executed ALTER TABLE, result:', res);
    const cols = await prisma.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'CuentasCobro'`);
    console.log('Current CuentasCobro columns:', cols);
  } catch (err) {
    console.error('Error altering table:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
