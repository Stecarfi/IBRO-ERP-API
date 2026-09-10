const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const sysModules = [
  'dashboard', 'chat', 'whatsapp_comercial', 'clientes', 'cotizaciones', 'ventas',
  'inventario', 'servicios', 'pqrs', 'registro_ventas', 'comisionistas', 'solicitudes',
  'evaluacion_desempeno', 'disciplinario', 'informe_ventas', 'comunicados', 'admin',
  'auditoria', 'perfil', 'ubicacion', 'gemini_assistant', 'configuracion', 'cuentas_cobro',
  'capacitaciones'
];

async function cleanTestData() {
  console.log('=== INICIANDO PURGA DE DATOS DE PRUEBA DEL ERP IBRO ===\n');

  // 1. Eliminar ítems dependientes
  console.log('1. Eliminando VentaItem y CotizacionItem...');
  const delVentaItem = await prisma.ventaItem.deleteMany({});
  const delCotItem = await prisma.cotizacionItem.deleteMany({});
  console.log(`   - VentaItem eliminados: ${delVentaItem.count}`);
  console.log(`   - CotizacionItem eliminados: ${delCotItem.count}`);

  // 2. Eliminar PQRS y Servicios Técnicos
  console.log('2. Eliminando PQR y Servicio...');
  const delPqr = await prisma.pQR.deleteMany({});
  const delServicio = await prisma.servicio.deleteMany({});
  console.log(`   - PQR eliminados: ${delPqr.count}`);
  console.log(`   - Servicio eliminados: ${delServicio.count}`);

  // 3. Eliminar Ventas y Cotizaciones
  console.log('3. Eliminando Venta y Cotizacion...');
  const delVentas = await prisma.venta.deleteMany({});
  const delCotizaciones = await prisma.cotizacion.deleteMany({});
  console.log(`   - Venta eliminadas: ${delVentas.count}`);
  console.log(`   - Cotizacion eliminadas: ${delCotizaciones.count}`);

  // 4. Eliminar Solicitudes, Procesos Disciplinarios y Evaluaciones
  console.log('4. Eliminando Solicitudes, Procesos Disciplinarios y Evaluaciones...');
  const delSolicitudes = await prisma.solicitud.deleteMany({});
  const delProcesos = await prisma.procesoDisciplinario.deleteMany({});
  const delEvaluaciones = await prisma.evaluacion.deleteMany({});
  console.log(`   - Solicitud eliminadas: ${delSolicitudes.count}`);
  console.log(`   - ProcesoDisciplinario eliminados: ${delProcesos.count}`);
  console.log(`   - Evaluacion eliminadas: ${delEvaluaciones.count}`);

  // 5. Eliminar Chats y Grupos de Chat
  console.log('5. Eliminando Chat y ChatGroup...');
  const delChat = await prisma.chat.deleteMany({});
  const delChatGroup = await prisma.chatGroup.deleteMany({});
  console.log(`   - Chat eliminados: ${delChat.count}`);
  console.log(`   - ChatGroup eliminados: ${delChatGroup.count}`);

  // 6. Eliminar Auditoría y Notificaciones acumuladas
  console.log('6. Eliminando Auditoria y Notificacion...');
  const delAuditoria = await prisma.auditoria.deleteMany({});
  const delNotificacion = await prisma.notificacion.deleteMany({});
  console.log(`   - Auditoria eliminadas: ${delAuditoria.count}`);
  console.log(`   - Notificacion eliminadas: ${delNotificacion.count}`);

  // 7. Eliminar Comisionistas, Cuentas de Cobro, Capacitaciones, Anuncios y Resets
  console.log('7. Eliminando Comisionistas, Cuentas de Cobro, Capacitaciones, Anuncios y Resets...');
  const delComisionista = await prisma.comisionista.deleteMany({});
  const delCuentasCobro = await prisma.cuentasCobro.deleteMany({});
  const delCapacitacion = await prisma.capacitacion.deleteMany({});
  const delAnuncio = await prisma.anuncio.deleteMany({});
  const delPendingReset = await prisma.pendingReset.deleteMany({});
  console.log(`   - Comisionista eliminados: ${delComisionista.count}`);
  console.log(`   - CuentasCobro eliminadas: ${delCuentasCobro.count}`);
  console.log(`   - Capacitacion eliminadas: ${delCapacitacion.count}`);
  console.log(`   - Anuncio eliminados: ${delAnuncio.count}`);
  console.log(`   - PendingReset eliminados: ${delPendingReset.count}`);

  // 8. Eliminar Inventario de prueba
  console.log('8. Eliminando Inventario...');
  const delInventario = await prisma.inventario.deleteMany({});
  console.log(`   - Inventario eliminados: ${delInventario.count}`);

  // 9. Eliminar Clientes de prueba
  console.log('9. Eliminando Clientes...');
  const delClientes = await prisma.cliente.deleteMany({});
  console.log(`   - Cliente eliminados: ${delClientes.count}`);

  // 10. Eliminar Usuarios de prueba
  console.log('10. Eliminando Usuarios de prueba (TEST_*, tech_*)...');
  const delUsers = await prisma.user.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'TEST_' } },
        { user: { startsWith: 'tech_' } },
        { user: { startsWith: 'test_' } },
        { correo: { contains: 'tecnico' } }
      ]
    }
  });
  console.log(`   - Usuarios de prueba eliminados: ${delUsers.count}`);

  // 11. Eliminar Roles de prueba
  console.log('11. Eliminando Roles de prueba (TEST_ROL_*, ROL_TEST_*)...');
  const delRoles = await prisma.role.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'TEST_ROL_' } },
        { id: { startsWith: 'ROL_TEST_' } }
      ]
    }
  });
  console.log(`   - Roles de prueba eliminados: ${delRoles.count}`);

  // 12. Garantizar los 6 Roles Oficiales del Sistema
  console.log('12. Verificando y asegurando los Roles Oficiales...');
  const officialRoles = [
    {
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
      permissions: { isSuperAdmin: true, fullAccess: true }
    },
    {
      id: '1787580106216',
      name: 'Director Comercial',
      modules: [
        'dashboard', 'chat', 'whatsapp_comercial', 'clientes', 'cotizaciones',
        'ventas', 'inventario', 'servicios', 'pqrs', 'registro_ventas',
        'comisionistas', 'solicitudes', 'evaluacion_desempeno', 'disciplinario',
        'informe_ventas', 'comunicados', 'perfil', 'ubicacion', 'cuentas_cobro',
        'capacitaciones'
      ],
      canAssignSales: true,
      clientLevel: 2,
      canManageEvals: true,
      canCreateMeetings: true,
      viewTechPrice: true,
      viewWholesalePrice: true,
      viewCostPrice: true
    },
    {
      id: '1787588187308',
      name: 'ASESOR COMERCIAL',
      modules: [
        'dashboard', 'chat', 'whatsapp_comercial', 'clientes', 'cotizaciones',
        'ventas', 'inventario', 'servicios', 'pqrs', 'registro_ventas',
        'comisionistas', 'solicitudes', 'evaluacion_desempeno', 'disciplinario',
        'capacitaciones', 'informe_ventas', 'comunicados', 'perfil', 'ubicacion'
      ],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      canCreateMeetings: false,
      viewTechPrice: false,
      viewWholesalePrice: false,
      viewCostPrice: false
    },
    {
      id: '1787589168171',
      name: 'SERVICIO TECNICO',
      modules: [
        'dashboard', 'chat', 'servicios', 'inventario', 'solicitudes',
        'capacitaciones', 'comunicados', 'perfil'
      ],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      canCreateMeetings: false,
      viewTechPrice: true,
      viewWholesalePrice: false,
      viewCostPrice: false
    },
    {
      id: '1787596002741',
      name: 'ASISTENTE ADMINISTRATIVA',
      modules: [
        'dashboard', 'chat', 'clientes', 'inventario', 'cuentas_cobro',
        'solicitudes', 'comunicados', 'perfil'
      ],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      canCreateMeetings: false,
      viewTechPrice: false,
      viewWholesalePrice: false,
      viewCostPrice: false
    },
    {
      id: '1787597025729',
      name: 'TECNICOS',
      modules: [
        'dashboard', 'chat', 'whatsapp_comercial', 'servicios', 'solicitudes',
        'evaluacion_desempeno', 'disciplinario', 'capacitaciones', 'comunicados', 'perfil'
      ],
      canAssignSales: false,
      clientLevel: 3,
      canManageEvals: false,
      canCreateMeetings: false,
      viewTechPrice: false,
      viewWholesalePrice: false,
      viewCostPrice: false
    }
  ];

  for (const r of officialRoles) {
    await prisma.role.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        modules: r.modules,
        canAssignSales: r.canAssignSales,
        clientLevel: r.clientLevel,
        canManageEvals: r.canManageEvals,
        canCreateMeetings: r.canCreateMeetings,
        viewTechPrice: r.viewTechPrice,
        viewWholesalePrice: r.viewWholesalePrice,
        viewCostPrice: r.viewCostPrice,
        ...(r.permissions ? { permissions: r.permissions } : {})
      },
      create: {
        id: r.id,
        name: r.name,
        modules: r.modules,
        canAssignSales: r.canAssignSales,
        clientLevel: r.clientLevel,
        canManageEvals: r.canManageEvals,
        canCreateMeetings: r.canCreateMeetings,
        viewTechPrice: r.viewTechPrice,
        viewWholesalePrice: r.viewWholesalePrice,
        viewCostPrice: r.viewCostPrice,
        ...(r.permissions ? { permissions: r.permissions } : {})
      }
    });
    console.log(`   - Rol asegurado: ${r.name} (${r.id})`);
  }

  // 13. Asegurar Usuario Administrador Master Raíz ('admin')
  console.log('13. Asegurando Usuario Administrador Master raíz (admin / admin)...');
  const hashedAdminPass = bcrypt.hashSync('admin', 10);
  await prisma.user.upsert({
    where: { user: 'admin' },
    update: {
      nombre: 'Administrador',
      apellido: 'Principal',
      cedula: '111',
      correo: 'admin@ibro.com',
      cargo: 'Dirección General',
      roleId: '1'
    },
    create: {
      id: 'USR_ADMIN_ROOT',
      nombre: 'Administrador',
      apellido: 'Principal',
      cedula: '111',
      correo: 'admin@ibro.com',
      cargo: 'Dirección General',
      observaciones: 'Usuario raíz de contingencia',
      user: 'admin',
      pass: hashedAdminPass,
      roleId: '1'
    }
  });
  console.log('   - Usuario "admin" verificado y asegurado con rol 1');

  // 14. Asegurar InformesConfig por defecto
  console.log('14. Asegurando InformesConfig por defecto...');
  await prisma.informesConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      margenOperativo: 75,
      ingresoProyectos: 85,
      gastosInstalacion: 35,
      anticipos: 12450000,
      gastosCajaChica: 2180000,
      diasHabilesMes: 26,
      mesPresupuesto: 'ACTUAL',
      fechaCorte: 'HOY',
      diasTranscurridos: 0
    }
  });

  console.log('\n=== PURGA COMPLETADA CON ÉXITO ===\n');
}

cleanTestData()
  .catch((e) => {
    console.error('ERROR DURANTE LA PURGA:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
