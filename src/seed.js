const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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

  // 1.1 Perfiles Comerciales de Campo (Sin facultades de dirección/evaluación/supervisión)
  const campoRolesConfig = [
    {
      id: '67',
      name: 'Dirección Comercial',
      modules: ['dashboard', 'clientes', 'cotizaciones', 'ventas', 'operaciones_campo', 'chat'],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      permissions: {
        operaciones_campo: ['view', 'iniciarJornada', 'gestionarVisitas', 'prospectos'],
        clientes: ['view', 'create', 'edit'],
        cotizaciones: ['view', 'create', 'edit', 'send'],
        ventas: ['view', 'create']
      }
    },
    {
      id: '68',
      name: 'Coordinador Comercial Externo',
      modules: ['dashboard', 'clientes', 'cotizaciones', 'ventas', 'operaciones_campo', 'chat'],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      permissions: {
        operaciones_campo: ['view', 'iniciarJornada', 'gestionarVisitas', 'prospectos'],
        clientes: ['view', 'create', 'edit'],
        cotizaciones: ['view', 'create', 'edit', 'send'],
        ventas: ['view', 'create']
      }
    },
    {
      id: '69',
      name: 'Asesor Comercial Externo',
      modules: ['dashboard', 'clientes', 'cotizaciones', 'ventas', 'operaciones_campo', 'chat'],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      permissions: {
        operaciones_campo: ['view', 'iniciarJornada', 'gestionarVisitas', 'prospectos'],
        clientes: ['view', 'create', 'edit'],
        cotizaciones: ['view', 'create', 'edit', 'send'],
        ventas: ['view', 'create']
      }
    }
  ];

  for (const cr of campoRolesConfig) {
    await prisma.role.upsert({
      where: { id: cr.id },
      update: {
        name: cr.name,
        modules: cr.modules,
        canAssignSales: cr.canAssignSales,
        clientLevel: cr.clientLevel,
        canManageEvals: cr.canManageEvals,
        permissions: JSON.stringify(cr.permissions)
      },
      create: {
        id: cr.id,
        name: cr.name,
        modules: cr.modules,
        canAssignSales: cr.canAssignSales,
        clientLevel: cr.clientLevel,
        canManageEvals: cr.canManageEvals,
        permissions: JSON.stringify(cr.permissions)
      }
    });
    console.log(`Perfil comercial de campo asegurado: ${cr.name} (ID: ${cr.id})`);
  }

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
