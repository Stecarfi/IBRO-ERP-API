const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function run() {
  const hashedPassword = bcrypt.hashSync('admin', 10);
  
  // Update Role 1 to have all permissions possible
  const sysModules = [
    'dashboard', 'chat', 'whatsapp_comercial', 'clientes', 'cotizaciones', 'ventas',
    'inventario', 'servicios', 'pqrs', 'registro_ventas', 'comisionistas', 'solicitudes',
    'evaluacion_desempeno', 'disciplinario', 'informe_ventas', 'comunicados', 'admin',
    'auditoria', 'perfil', 'gemini_assistant', 'configuracion', 'cuentas_cobro', 'capacitaciones'
  ];
  
  await prisma.role.upsert({
    where: { id: '1' },
    update: {
      modules: sysModules,
      canAssignSales: true,
      clientLevel: 1,
      canManageEvals: true,
      canCreateMeetings: true,
      viewTechPrice: true,
      viewWholesalePrice: true,
      viewCostPrice: true,
      permissions: JSON.stringify({ isSuperAdmin: true, fullAccess: true })
    },
    create: {
      id: '1',
      name: 'Administrador Master',
      modules: sysModules,
      canAssignSales: true,
      clientLevel: 1,
      canManageEvals: true,
      canCreateMeetings: true,
      viewTechPrice: true,
      viewWholesalePrice: true,
      viewCostPrice: true,
      permissions: JSON.stringify({ isSuperAdmin: true, fullAccess: true })
    }
  });

  const existingUser = await prisma.user.findFirst({
    where: { 
      user: { 
        in: ['Stecrafi05', 'Stecarfi05', 'stecarfi05', 'stecrafi05'],
        mode: 'insensitive'
      } 
    }
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        user: 'stecarfi05',
        pass: hashedPassword,
        correo: 'djuridica@obelixsa.com',
        roleId: '1',
        isLocked: false,
        failedLoginAttempts: 0
      }
    });
    console.log('Updated existing user Stecarfi05 successfully.');
  } else {
    await prisma.user.create({
      data: {
        id: 'user_master_1',
        nombre: 'Stephanie',
        apellido: 'Carrasquilla',
        cedula: 'MASTER',
        correo: 'djuridica@obelixsa.com',
        cargo: 'Administrador Master',
        user: 'stecarfi05',
        pass: hashedPassword,
        roleId: '1',
        isLocked: false,
        failedLoginAttempts: 0
      }
    });
    console.log('Created new user Stecarfi05 successfully.');
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
