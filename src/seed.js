require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// La contrasena del administrador raiz se toma SIEMPRE de SEED_ADMIN_PASSWORD (sin valor por defecto)
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!SEED_ADMIN_PASSWORD || SEED_ADMIN_PASSWORD.length < 10) {
  console.error('[SEED] Defina SEED_ADMIN_PASSWORD (minimo 10 caracteres) antes de ejecutar el seed. Abortando.');
  process.exit(1);
}
const bcrypt = require('bcryptjs');

const sysModules = [
  'dashboard', 'chat', 'whatsapp_comercial', 'clientes', 'cotizaciones', 'ventas',
  'inventario', 'servicios', 'pqrs', 'registro_ventas', 'comisionistas', 'solicitudes',
  'evaluacion_desempeno', 'disciplinario', 'informe_ventas', 'comunicados', 'admin',
  'auditoria', 'perfil', 'ubicacion', 'gemini_assistant'
];

async function main() {
  console.log('Seeding initial roles and users with encrypted passwords...');

  // 1. Crear el Rol Administrador Master
  const masterRole = await prisma.role.upsert({
    where: { id: '1' },
    update: {
      name: 'Administrador Master',
      modules: sysModules,
      canAssignSales: true,
      clientLevel: 1,
      canManageEvals: true,
      viewTechPrice: true,
      viewWholesalePrice: true,
      viewCostPrice: true,
    },
    create: {
      id: '1',
      name: 'Administrador Master',
      modules: sysModules,
      canAssignSales: true,
      clientLevel: 1,
      canManageEvals: true,
      viewTechPrice: true,
      viewWholesalePrice: true,
      viewCostPrice: true,
    },
  });

  console.log('Role seeded:', masterRole);

  // 1.1 Limpieza de roles sintéticos residuales si existieran (67, 68, 69)
  try {
    const existingSyntheticUsers = await prisma.user.findMany({
      where: { roleId: { in: ['67', '68', '69'] } }
    });
    for (const u of existingSyntheticUsers) {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          roleId: '1787588187308', // Rol base ASESOR COMERCIAL
          esComercialCampo: true
        }
      });
    }
    await prisma.role.deleteMany({
      where: { id: { in: ['67', '68', '69'] } }
    });
  } catch (err) {
    console.warn('Limpieza de roles sintéticos omitida o no requerida:', err.message);
  }

  // Encriptar la contraseña por defecto del administrador
  const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);

  // 2. Crear el Usuario Administrador Raíz
  const rootUser = await prisma.user.upsert({
    where: { user: 'admin' },
    update: {
      id: '1',
      nombre: 'Administrador',
      apellido: 'Principal',
      cedula: '111',
      correo: 'admin@ibro.com',
      cargo: 'Dirección Comercial',
      observaciones: 'Usuario raíz',
      roleId: '1',
    },
    create: {
      id: '1',
      nombre: 'Administrador',
      apellido: 'Principal',
      cedula: '111',
      correo: 'admin@ibro.com',
      cargo: 'Dirección Comercial',
      observaciones: 'Usuario raíz',
      user: 'admin',
      pass: hashedPassword,
      roleId: '1',
    },
  });

  console.log('User seeded:', { id: rootUser.id, user: rootUser.user, roleId: rootUser.roleId });
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
