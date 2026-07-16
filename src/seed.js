const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

const sysModules = [
  'dashboard', 'chat', 'whatsapp_comercial', 'clientes', 'cotizaciones', 'ventas',
  'inventario', 'servicios', 'pqrs', 'registro_ventas', 'comisionistas', 'solicitudes',
  'evaluacion_desempeno', 'disciplinario', 'informe_ventas', 'comunicados', 'admin',
  'auditoria', 'perfil'
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

  // Encriptar la contraseña por defecto del administrador
  const hashedPassword = bcrypt.hashSync('admin', 10);

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
      pass: hashedPassword,
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

  console.log('User seeded:', rootUser);
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
