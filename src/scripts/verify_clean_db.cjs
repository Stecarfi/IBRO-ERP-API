const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('=== VERIFICANDO ESTADO DE LA BASE DE DATOS TRAS LA LIMPIEZA ===\n');

  const models = [
    'cliente', 'inventario', 'venta', 'ventaItem', 'cotizacion', 'cotizacionItem',
    'pQR', 'servicio', 'solicitud', 'procesoDisciplinario', 'evaluacion',
    'anuncio', 'chat', 'chatGroup', 'auditoria', 'notificacion',
    'comisionista', 'cuentasCobro', 'capacitacion', 'pendingReset'
  ];

  let allEmpty = true;
  for (const m of models) {
    const count = await prisma[m].count();
    console.log(`- ${m}: ${count}`);
    if (count !== 0) {
      allEmpty = false;
      console.error(`  ALERTA: ${m} no está vacío (${count} registros)`);
    }
  }

  console.log('\n--- USUARIOS AUTORIZADOS ---');
  const users = await prisma.user.findMany({
    select: { id: true, user: true, nombre: true, apellido: true, correo: true, cargo: true, roleId: true }
  });
  console.log(users);

  console.log('\n--- ROLES OFICIALES ---');
  const roles = await prisma.role.findMany({
    select: { id: true, name: true }
  });
  console.log(roles);

  console.log('\n--- CONFIGURACIÓN INFORMES ---');
  const config = await prisma.informesConfig.findMany();
  console.log(config);

  if (allEmpty && users.length === 3 && roles.length === 6) {
    console.log('\n>>> RESULTADO: BASE DE DATOS 100% LIMPIA Y LISTA PARA EL CLIENTE <<<');
  } else {
    console.log('\n>>> REVISIÓN REQUERIDA <<<');
  }

  await prisma.$disconnect();
}

verify().catch(console.error);
