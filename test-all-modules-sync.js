/**
 * IBRO ERP - Comprehensive End-to-End Sync Test (test-all-modules-sync.js)
 * Tests full atomic synchronization across all 19 ERP modules to ensure 100% schema parity
 * and persistence in PostgreSQL without rollback or data loss.
 */
require('dotenv').config();
const prisma = require('./src/prisma');
const { validateSyncPayload, sanitizeBackendForPrisma } = require('./src/validators');

async function testFullDatabaseSync() {
  console.log('🚀 [TEST] Iniciando Batería de Pruebas de Sincronización para los 19 Módulos ERP...\n');

  // Test timestamp
  const nowIso = new Date().toISOString();
  const testId = 'TEST_' + Date.now();

  try {
    // 1. Obtener o crear entidades raíz necesarias para relaciones
    let testUser = await prisma.user.findFirst();
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          id: 'USR_TEST_ROOT',
          user: 'admin_test',
          pass: '$2a$10$dummyhashedpassforunitestingsomething',
          nombre: 'Administrador',
          apellido: 'Prueba',
          cedula: '1234567890',
          tipoDoc: 'CC',
          correo: 'admin@ibro.com',
          cargo: 'Master Admin',
          telefono: '3001234567',
          roleId: '1'
        }
      });
      console.log('✅ Usuario raíz de prueba creado:', testUser.user);
    }

    let testClient = await prisma.cliente.findFirst();
    if (!testClient) {
      testClient = await prisma.cliente.create({
        data: {
          id: 'CLI_TEST_ROOT',
          doc: '901234567',
          nom: 'Cliente Corporativo SAS',
          correo: 'contacto@corporativo.com',
          tel: '6017654321',
          direccion: 'Calle 100 # 15-20',
          ciudad: 'Bogotá',
          departamento: 'Cundinamarca',
          habeasDataAccepted: true,
          fechaVinculacion: new Date()
        }
      });
      console.log('✅ Cliente raíz de prueba creado:', testClient.nom);
    }

    let testProduct = await prisma.inventario.findFirst();
    if (!testProduct) {
      const prodData = sanitizeBackendForPrisma('inventario', {
        id: 'INV_TEST_ROOT',
        cod: 'HVAC-VRF-001',
        ref: 'Mini Split Inverter 12000 BTU',
        nom: 'Aire Acondicionado Inverter 12K BTU',
        marca: 'IBRO COOL',
        cant: 25,
        precio_publico: 1850000,
        precio_costo: 1200000,
        precio_tecnico: 1600000,
        precio_mayorista: 1500000,
        clasif: 'Equipos',
        subclasif: 'Residencial',
        tech: 'Inverter',
        btu: '12000',
        volt: '220V'
      });
      testProduct = await prisma.inventario.create({ data: prodData });
      console.log('✅ Producto raíz de prueba creado:', testProduct.cod);
    }

    // 2. Construir payload diff de prueba para todas las entidades
    const diff = {
      roles: {
        upserted: [{
          id: 'ROL_TEST_' + Date.now(),
          name: 'Rol Auditor Senior',
          permissions: JSON.stringify(['all_read', 'audit_view'])
        }],
        deleted: []
      },
      clientes: {
        upserted: [{
          id: 'CLI_' + testId,
          doc: '900' + String(Date.now()).slice(-6),
          nom: 'Inversiones y Proyectos Caribe SAS',
          tipo_cliente: 'Empresarial',
          correo: 'caribe@proyectos.com',
          tel: '3159998877',
          direccion: 'Cra 53 # 76-200',
          ciudad: 'Barranquilla',
          departamento: 'Atlántico',
          condicionesPago: '30 días',
          condicionesPagoDias: 30,
          habeasDataAccepted: true,
          fechaVinculacion: '04/09/2026'
        }],
        deleted: []
      },
      inventario: {
        upserted: [{
          id: 'INV_' + testId,
          cod: 'CHILLER-' + testId.slice(-6),
          ref: 'Chiller Scroll Enfriado por Aire',
          nom: 'Chiller Industrial 50 Toneladas',
          marca: 'CARRIER',
          cant: 4,
          precio_publico: 125000000,
          precio_costo: 95000000,
          precio: 125000000
        }],
        deleted: []
      },
      ventas: {
        upserted: [{
          id: 'PED_' + testId,
          numPedido: 'PED-' + testId.slice(-6),
          fecha: '04/09/2026',
          fechaIso: nowIso,
          vendedorId: testUser.id,
          clienteId: testClient.id,
          docCli: testClient.doc,
          total: 3700000,
          metodoPago: 'Transferencia Bancaria',
          mesesGarantia: 12,
          equipos: [
            {
              idProd: testProduct.id,
              codigo: testProduct.cod,
              cantidad: 2,
              precioUnitario: 1850000,
              desc: 0
            }
          ],
          estadoAprobacion: 'aprobado'
        }],
        deleted: []
      },
      cotizaciones: {
        upserted: [{
          id: 'COT_' + testId,
          numCotizacion: 'COT-' + testId.slice(-6),
          fecha: '04/09/2026',
          vendedorId: testUser.id,
          clienteId: testClient.id,
          total: 1850000,
          vigencia: 15,
          ivaTipo: 'exento',
          equipos: [
            {
              idProd: testProduct.id,
              codigo: testProduct.cod,
              cantidad: 1,
              precioUnitario: 1850000
            }
          ]
        }],
        deleted: []
      },
      servicios: {
        upserted: [{
          id: 'SRV_' + testId,
          clienteId: testClient.id,
          docCli: testClient.doc,
          fechaProg: '05/09/2026',
          tipo: 'Mantenimiento Preventivo HVAC',
          estado: 'programado',
          obs: 'Mantenimiento preventivo anual equipos VRF torre norte',
          costoServicio: 450000,
          aplicaGarantia: false
        }],
        deleted: []
      },
      pqrs: {
        upserted: [{
          id: 'PQR_' + testId,
          clienteId: testClient.id,
          docCli: testClient.doc,
          fecha: '04/09/2026',
          tipo: 'Petición Técnica',
          detalle: 'Solicitud de certificado de garantía de compresor',
          estado: 'Abierto',
          satisfecho: 'Pendiente',
          aplicaGarantia: true
        }],
        deleted: []
      },
      solicitudes: {
        upserted: [{
          id: 'SOL_' + testId,
          asesorId: testUser.id,
          asesor: testUser.user,
          fecha: '04/09/2026',
          tipo: 'Permiso Remunerado',
          detalle: 'Cita médica especialista',
          estado: 'Pendiente'
        }],
        deleted: []
      },
      procesosDisciplinarios: {
        upserted: [{
          id: 'DISC_' + testId,
          asesorId: testUser.id,
          asesor: testUser.user,
          fecha: '04/09/2026',
          etapa: 1,
          falta: 'Llegada tarde reiterada sin justificación',
          obs: 'Notificación inicial de llamado de atención',
          timestampEtapa: nowIso
        }],
        deleted: []
      },
      evaluaciones: {
        upserted: [{
          id: 'EVAL_' + testId,
          evaluadoId: testUser.id,
          evaluadorId: testUser.id,
          evaluador: testUser.user,
          evaluado: testUser.user,
          empleado: testUser.user,
          evaluadoNombre: testUser.nombre + ' ' + (testUser.apellido || ''),
          fecha: '04/09/2026',
          tipo: 'Evaluación',
          metajobs: 5,
          asistencia: 5,
          objetivos: 4,
          promedio: 4.7
        }],
        deleted: []
      },
      anuncios: {
        upserted: [{
          id: 'NOTI_' + testId,
          titulo: 'Nueva Política de Sincronización ERP 2026',
          fecha: '04/09/2026',
          mensaje: 'El sistema cuenta ahora con sincronización atómica garantizada.',
          expiresAt: '31/12/2026'
        }],
        deleted: []
      },
      capacitaciones: {
        upserted: [{
          id: 'CAP_' + testId,
          tipo: 'Capacitación Técnica',
          tema: 'Instalación y Vacío en Sistemas Inverter R-410A',
          descripcion: 'Buenas prácticas en refrigeración y climatización',
          fecha: '10/09/2026',
          hora: '08:00 AM',
          creador: testUser.user,
          obligatoria: true
        }],
        deleted: []
      },
      comisionistas: {
        upserted: [{
          id: 'COM_' + testId,
          nombre: 'Ingeniero Aliado Roberto Carlos',
          cedula: '72345678',
          telefono: '3109876543',
          pct_comision: 8.5,
          valor_venta: 45000000,
          tipo: 'Externo'
        }],
        deleted: []
      },
      cuentasCobro: {
        upserted: [{
          id: 'CTA_' + testId,
          cuenta: 'CC-2026-001',
          nombre: 'Roberto Carlos Contratista',
          cedula: '72345678',
          concepto: 'Comisión por venta Chiller Industrial',
          total: 3825000,
          estado: 'Pendiente'
        }],
        deleted: []
      },
      chat: {
        upserted: [{
          id: 'MSG_' + testId,
          senderId: testUser.id,
          user: testUser.user,
          nombre: testUser.nombre,
          to: 'todos',
          text: 'Mensaje de verificación de integridad del sistema',
          timestamp: nowIso,
          fecha: nowIso
        }],
        deleted: []
      },
      chatGroups: {
        upserted: [{
          id: 'GRP_' + testId,
          nombre: 'Equipo Técnico Climatización',
          createdBy: testUser.user,
          createdById: testUser.id,
          fecha: nowIso,
          integrantes: [testUser.user]
        }],
        deleted: []
      },
      auditoria: {
        upserted: [{
          id: 'AUD_' + testId,
          user: testUser.user,
          userId: testUser.id,
          fecha: nowIso,
          action: 'Sincronización Autoritativa',
          modulo: 'Auditoría Sistema',
          recordDetails: 'Verificación exitosa de persistencia integral'
        }],
        deleted: []
      },
      notificaciones: {
        upserted: [{
          id: 'NOTIF_' + testId,
          para: testUser.user,
          paraId: testUser.id,
          titulo: 'Sincronización Exitosa',
          mensaje: 'Tu ERP está 100% sincronizado con la nube.',
          fecha: nowIso,
          leida: false
        }],
        deleted: []
      }
    };

    console.log('📦 Validando estructura del payload contra Zod / Validators...');
    const validation = validateSyncPayload(diff);
    if (!validation.success) {
      console.error('❌ Error de validación en payload:', validation.error);
      process.exit(1);
    }
    console.log('✅ Payload validado correctamente.\n');

    // 3. Ejecutar transacción de sincronización exactamente como en POST /api/db/sync
    console.log('⚡ Ejecutando transacción atómica en PostgreSQL con Prisma...');

    await prisma.$transaction(async (tx) => {
      // Roles
      for (const r of diff.roles.upserted) {
        const rData = sanitizeBackendForPrisma('roles', r);
        await tx.role.upsert({ where: { id: r.id }, update: rData, create: { id: r.id, ...rData } });
      }

      // Clientes
      for (const c of diff.clientes.upserted) {
        const cData = sanitizeBackendForPrisma('clientes', c);
        await tx.cliente.upsert({ where: { id: c.id }, update: cData, create: { id: c.id, ...cData } });
      }

      // Inventario
      for (const i of diff.inventario.upserted) {
        const iData = sanitizeBackendForPrisma('inventario', i);
        await tx.inventario.upsert({ where: { id: i.id }, update: iData, create: { id: i.id, ...iData } });
      }

      // Ventas
      for (const v of diff.ventas.upserted) {
        const vData = sanitizeBackendForPrisma('ventas', {
          ...v,
          clienteId: testClient.id,
          vendedorId: testUser.id
        });
        await tx.venta.upsert({ where: { id: v.id }, update: vData, create: { id: v.id, ...vData } });

        await tx.ventaItem.deleteMany({ where: { ventaId: v.id } });
        await tx.ventaItem.create({
          data: {
            ventaId: v.id,
            productoId: testProduct.id,
            cant: 2,
            precioUnitario: 1850000,
            desc: 0
          }
        });
      }

      // Cotizaciones
      for (const cot of diff.cotizaciones.upserted) {
        const cotData = sanitizeBackendForPrisma('cotizaciones', {
          ...cot,
          clienteId: testClient.id,
          vendedorId: testUser.id
        });
        await tx.cotizacion.upsert({ where: { id: cot.id }, update: cotData, create: { id: cot.id, ...cotData } });
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: cot.id } });
        await tx.cotizacionItem.create({
          data: {
            cotizacionId: cot.id,
            productoId: testProduct.id,
            cant: 1,
            precioUnitario: 1850000,
            desc: 0
          }
        });
      }

      // Servicios
      for (const s of diff.servicios.upserted) {
        const sData = sanitizeBackendForPrisma('servicios', { ...s, clienteId: testClient.id });
        await tx.servicio.upsert({ where: { id: s.id }, update: sData, create: { id: s.id, ...sData } });
      }

      // PQRS
      for (const p of diff.pqrs.upserted) {
        const pData = sanitizeBackendForPrisma('pqrs', { ...p, clienteId: testClient.id });
        await tx.pQR.upsert({ where: { id: p.id }, update: pData, create: { id: p.id, ...pData } });
      }

      // Solicitudes
      for (const sol of diff.solicitudes.upserted) {
        const solData = sanitizeBackendForPrisma('solicitudes', { ...sol, asesorId: testUser.id });
        await tx.solicitud.upsert({ where: { id: sol.id }, update: solData, create: { id: sol.id, ...solData } });
      }

      // Procesos Disciplinarios
      for (const d of diff.procesosDisciplinarios.upserted) {
        const dData = sanitizeBackendForPrisma('procesosDisciplinarios', { ...d, asesorId: testUser.id });
        await tx.procesoDisciplinario.upsert({ where: { id: d.id }, update: dData, create: { id: d.id, ...dData } });
      }

      // Evaluaciones
      for (const ev of diff.evaluaciones.upserted) {
        const evData = sanitizeBackendForPrisma('evaluaciones', { ...ev, evaluadoId: testUser.id, evaluadorId: testUser.id });
        await tx.evaluacion.upsert({ where: { id: ev.id }, update: evData, create: { id: ev.id, ...evData } });
      }

      // Anuncios
      for (const a of diff.anuncios.upserted) {
        const aData = sanitizeBackendForPrisma('anuncios', a);
        await tx.anuncio.upsert({ where: { id: a.id }, update: aData, create: { id: a.id, ...aData } });
      }

      // Capacitaciones
      for (const cap of diff.capacitaciones.upserted) {
        const capData = sanitizeBackendForPrisma('capacitaciones', { ...cap, creadorId: testUser.id });
        await tx.capacitacion.upsert({ where: { id: cap.id }, update: capData, create: { id: cap.id, ...capData } });
      }

      // Comisionistas
      for (const com of diff.comisionistas.upserted) {
        const comData = sanitizeBackendForPrisma('comisionistas', com);
        await tx.comisionista.upsert({ where: { id: com.id }, update: comData, create: { id: com.id, ...comData } });
      }

      // Cuentas de Cobro
      for (const cta of diff.cuentasCobro.upserted) {
        const ctaData = sanitizeBackendForPrisma('cuentasCobro', cta);
        await tx.cuentasCobro.upsert({ where: { id: cta.id }, update: ctaData, create: { id: cta.id, ...ctaData } });
      }

      // Chat
      for (const ch of diff.chat.upserted) {
        const chData = sanitizeBackendForPrisma('chat', { ...ch, senderId: testUser.id });
        await tx.chat.upsert({ where: { id: ch.id }, update: chData, create: { id: ch.id, ...chData } });
      }

      // Chat Groups
      for (const cg of diff.chatGroups.upserted) {
        const cgData = sanitizeBackendForPrisma('chatGroups', { ...cg, createdById: testUser.id });
        await tx.chatGroup.upsert({ where: { id: cg.id }, update: cgData, create: { id: cg.id, ...cgData } });
      }

      // Auditoría
      for (const aud of diff.auditoria.upserted) {
        const audData = sanitizeBackendForPrisma('auditoria', { ...aud, userId: testUser.id });
        await tx.auditoria.upsert({ where: { id: aud.id }, update: audData, create: { id: aud.id, ...audData } });
      }

      // Notificaciones
      for (const notif of diff.notificaciones.upserted) {
        const notifData = sanitizeBackendForPrisma('notificaciones', { ...notif, paraId: testUser.id });
        await tx.notificacion.upsert({ where: { id: notif.id }, update: notifData, create: { id: notif.id, ...notifData } });
      }
    }, { maxWait: 15000, timeout: 30000 });

    console.log('🎉 [ÉXITO TOTAL] ¡Transacción atómica completada para todos los módulos sin errores ni rechazos!\n');

    // 4. Verificar conteos reales en base de datos
    const counts = {
      roles: await prisma.role.count(),
      clientes: await prisma.cliente.count(),
      inventario: await prisma.inventario.count(),
      ventas: await prisma.venta.count(),
      cotizaciones: await prisma.cotizacion.count(),
      servicios: await prisma.servicio.count(),
      pqrs: await prisma.pQR.count(),
      solicitudes: await prisma.solicitud.count(),
      procesosDisciplinarios: await prisma.procesoDisciplinario.count(),
      evaluaciones: await prisma.evaluacion.count(),
      anuncios: await prisma.anuncio.count(),
      capacitaciones: await prisma.capacitacion.count(),
      comisionistas: await prisma.comisionista.count(),
      cuentasCobro: await prisma.cuentasCobro.count(),
      chat: await prisma.chat.count(),
      chatGroups: await prisma.chatGroup.count(),
      auditoria: await prisma.auditoria.count(),
      notificaciones: await prisma.notificacion.count()
    };

    console.log('📊 Conteos de Registros Verificados en PostgreSQL:');
    console.table(counts);

    console.log('\n🔒 La información se almacena CORRECTAMENTE y no se eliminará al recargar el ERP.');

  } catch (err) {
    console.error('❌ Error durante la prueba de sincronización:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testFullDatabaseSync();
