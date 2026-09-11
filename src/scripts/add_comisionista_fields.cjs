const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('--- Iniciando migración de columnas para Comisionista y CuentasCobro ---');

  // 1. Columnas en Comisionista
  console.log('Actualizando tabla "Comisionista"...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "Comisionista" ADD COLUMN IF NOT EXISTS "estado" VARCHAR(50) DEFAULT 'Activo';`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Comisionista" ADD COLUMN IF NOT EXISTS "banco" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Comisionista" ADD COLUMN IF NOT EXISTS "tipoCuenta" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Comisionista" ADD COLUMN IF NOT EXISTS "numeroCuenta" TEXT;`);

  // Asegurar que registros existentes tengan estado 'Activo'
  await prisma.$executeRawUnsafe(`UPDATE "Comisionista" SET "estado" = 'Activo' WHERE "estado" IS NULL;`);

  // 2. Columnas en CuentasCobro
  console.log('Actualizando tabla "CuentasCobro"...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "CuentasCobro" ADD COLUMN IF NOT EXISTS "fechaRadicacion" TIMESTAMP WITHOUT TIME ZONE;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CuentasCobro" ADD COLUMN IF NOT EXISTS "fechaAprobacion" TIMESTAMP WITHOUT TIME ZONE;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CuentasCobro" ADD COLUMN IF NOT EXISTS "fechaPago" TIMESTAMP WITHOUT TIME ZONE;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CuentasCobro" ADD COLUMN IF NOT EXISTS "aprobadoPor" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CuentasCobro" ADD COLUMN IF NOT EXISTS "notasSeguimiento" TEXT;`);

  // 3. Verificar columnas de Comisionista
  const comCols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Comisionista' 
    ORDER BY ordinal_position;
  `);
  console.log('Columnas Comisionista:', comCols.map(c => c.column_name));

  // 4. Verificar columnas de CuentasCobro
  const ccCols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'CuentasCobro' 
    ORDER BY ordinal_position;
  `);
  console.log('Columnas CuentasCobro:', ccCols.map(c => c.column_name));

  console.log('--- Migración completada exitosamente ---');
  await prisma.$disconnect();
}

migrate().catch(err => {
  console.error('Error en migración:', err);
  process.exit(1);
});
