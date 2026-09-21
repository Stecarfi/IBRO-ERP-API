const prisma = require('./src/prisma');
const operacionExternaService = require('./src/services/campo/operacionExterna.service');
const campoController = require('./src/controllers/campo.controller');
const syncService = require('./src/services/sync.service');

async function runTests() {
  console.log('--- INICIANDO SUITE DE PRUEBAS DE VENTAS EXTERNAS (FRONTEND vs BACKEND) ---');

  const user = await prisma.user.findFirst();
  if (!user) throw new Error('No hay usuarios en la base de datos para pruebas');

  let clienteExt = null;
  let cotExt = null;
  let venExt = null;

  try {
    // 1. Ingesta y creación de cliente externo vía REST
    console.log('1. Test Creación de Cliente Externo...');
    clienteExt = await operacionExternaService.crearClienteExterno(user.id, {
      nombre: 'Comercializadora del Caribe S.A.S.',
      nitDoc: '901555444-3',
      contacto: 'Ing. Roberto Gómez',
      telefono: '3157778899',
      correo: 'roberto@comercaribe.com',
      ciudad: 'Barranquilla',
      direccion: 'Vía 40 # 85-20',
      sectorEconomico: 'Industria',
      origen: 'En Frio / Puerta a Puerta',
      tipoRegistro: 'Prospecto',
      etapaEmbudo: 'Prospecto',
      notas: 'Interés en renovación de condensadores industriales'
    });

    if (clienteExt && clienteExt.codigo.startsWith('CLEX-')) {
      console.log(`   ✔ Cliente externo creado: ${clienteExt.codigo} (${clienteExt.nombre}) - APROBADO`);
    } else {
      throw new Error('Fallo creando cliente externo');
    }

    // 2. Transición en las 8 etapas del Embudo Comercial
    console.log('2. Test Embudo Comercial de 8 Etapas...');
    const etapas = ['Cliente Potencial', 'Visita', 'Seguimiento', 'Cotizacion', 'Negociacion'];
    for (const etapa of etapas) {
      await operacionExternaService.cambiarEtapaEmbudo(clienteExt.id, user.id, etapa, `Avanza a etapa ${etapa}`);
    }
    const clienteActualizado = await prisma.clienteExternoCampo.findUnique({ where: { id: clienteExt.id } });
    if (clienteActualizado.etapaEmbudo === 'Negociacion') {
      console.log(`   ✔ Embudo Comercial verificado en etapa '${clienteActualizado.etapaEmbudo}' - APROBADO`);
    } else {
      throw new Error(`Etapa incorrecta: ${clienteActualizado.etapaEmbudo}`);
    }

    // 3. Creación de Cotización Comercial Externa
    console.log('3. Test Emisión de Cotización Externa...');
    cotExt = await operacionExternaService.crearCotizacionExterna(user.id, {
      clienteExternoId: clienteExt.id,
      validezDias: 15,
      estado: 'Enviada',
      observaciones: 'Cotización con condiciones comerciales preferenciales de campo',
      items: [
        { descripcion: 'Chiller Industrial 30TR Scroll', cantidad: 1, precioUnit: 35000000, subtotal: 35000000 },
        { descripcion: 'Kit de Válvulas y Tubería Cobre', cantidad: 2, precioUnit: 2500000, subtotal: 5000000 }
      ]
    });

    if (cotExt && cotExt.codigo.startsWith('COTX-') && cotExt.total === 40000000) {
      console.log(`   ✔ Cotización externa ${cotExt.codigo} emitida por $${cotExt.total.toLocaleString()} - APROBADO`);
    } else {
      throw new Error('Fallo emitiendo cotización externa');
    }

    // 4. Registro de Seguimiento Comercial (Verificando compatibilidad de payload Frontend y FK)
    console.log('4. Test Seguimiento Comercial desde UI con Cliente Externo...');
    let controllerResponse = null;
    const reqMock = {
      user,
      body: {
        clienteId: clienteExt.id, // Enviado como clienteId desde ComercialCampo.jsx
        tipo: 'Llamada de Negociación',
        descripcion: 'Cliente solicita descuento del 3% para firma inmediata de orden',
        fechaProgramada: new Date().toISOString(),
        esComercialExterno: true,
        estado: 'En Negociación'
      }
    };
    const resMock = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { controllerResponse = d; }
    };

    await campoController.crearSeguimiento(reqMock, resMock);

    if (controllerResponse?.success && controllerResponse?.seguimiento?.clienteExternoId === clienteExt.id) {
      console.log(`   ✔ Seguimiento registrado y llave foránea resuelta (${controllerResponse.seguimiento.clienteExternoId}) - APROBADO`);
    } else {
      throw new Error(`Fallo en crearSeguimiento: ${JSON.stringify(controllerResponse)}`);
    }

    // 5. Registro de Venta Externa de Campo
    console.log('5. Test Cierre de Venta Externa...');
    venExt = await operacionExternaService.registrarVentaExterna(user.id, {
      clienteExternoId: clienteExt.id,
      cotizacionId: cotExt.id,
      valorVendido: 40000000,
      metodoPago: 'Transferencia',
      observaciones: 'Negociación cerrada con éxito en visita presencial',
      items: cotExt.items
    });

    if (venExt && venExt.codigo.startsWith('VTEX-') && venExt.valorVendido === 40000000) {
      console.log(`   ✔ Venta externa cerrada ${venExt.codigo} por $${venExt.valorVendido.toLocaleString()} - APROBADO`);
    } else {
      throw new Error('Fallo registrando venta externa');
    }

    // 6. Métricas del Embudo Operativo
    console.log('6. Test Métricas Consolidadas del Embudo...');
    const metricas = await operacionExternaService.getMetricasEmbudo();
    if (typeof metricas === 'object' && metricas.total >= 1) {
      console.log(`   ✔ Métricas del embudo calculadas (Total clientes: ${metricas.total}, Ventas: ${metricas.venta}) - APROBADO`);
    } else {
      throw new Error('Fallo calculando métricas del embudo');
    }

    // 7. Sincronización Autoritativa Bidireccional (syncService getDb y sync)
    console.log('7. Test Sincronización Global de Ventas Externas (syncService)...');
    const syncCotId = 'sync-cot-' + Date.now();
    const syncPedId = 'sync-ped-' + Date.now();

    const diff = {
      cotizaciones_externas: {
        upserted: [
          {
            id: syncCotId,
            numCotizacion: 'EXT-COT-7777',
            cliente: clienteExt.nombre,
            docCli: clienteExt.nitDoc,
            total: 18000000,
            vigencia: 15,
            estadoAprobacion: 'aprobado',
            observacion: 'Cotización creada desde Cotizaciones.jsx (isVentasExternas=true)',
            items: [{ producto: 'Split 24000 BTU', cant: 2, precioUnitario: 9000000 }]
          }
        ]
      },
      pedidos_externos: {
        upserted: [
          {
            id: syncPedId,
            numPedido: 'EXT-PED-7777',
            cliente: clienteExt.nombre,
            docCli: clienteExt.nitDoc,
            total: 18000000,
            metodoPago: 'Contado',
            observaciones: 'Pedido creado desde Pedidos.jsx (isVentasExternas=true)',
            items: [{ producto: 'Split 24000 BTU', cant: 2, precioUnitario: 9000000 }]
          }
        ]
      }
    };

    await syncService.sync(diff, user.user);
    const authoritativeDb = await syncService.getDb();

    const cotEncontrada = (authoritativeDb.cotizaciones_externas || []).find(c => c.id === syncCotId);
    const pedEncontrado = (authoritativeDb.pedidos_externos || []).find(p => p.id === syncPedId);

    if (cotEncontrada && pedEncontrado) {
      console.log(`   ✔ Sincronización validada: ${cotEncontrada.numCotizacion} y ${pedEncontrado.numPedido} recuperados en getDb() - APROBADO`);
    } else {
      throw new Error('Fallo: cotizaciones_externas o pedidos_externos no encontrados en getDb()');
    }

    // Limpieza de datos temporales
    console.log('8. Limpieza de Registros de Prueba...');
    await prisma.ventaExternaCampo.deleteMany({ where: { id: { in: [venExt.id, syncPedId] } } });
    await prisma.cotizacionExternaCampo.deleteMany({ where: { id: { in: [cotExt.id, syncCotId] } } });
    await prisma.seguimientoCampo.deleteMany({ where: { clienteExternoId: clienteExt.id } });
    await prisma.clienteExternoCampo.delete({ where: { id: clienteExt.id } });
    console.log('   ✔ Registros de prueba eliminados correctamente');

    console.log('\n--- TODAS LAS PRUEBAS DE VENTAS EXTERNAS PASARON CON ÉXITO (8/8) ---');
  } catch (err) {
    console.error('\n❌ ERROR EN PRUEBAS:', err);
    if (venExt?.id) await prisma.ventaExternaCampo.deleteMany({ where: { id: venExt.id } }).catch(() => {});
    if (cotExt?.id) await prisma.cotizacionExternaCampo.deleteMany({ where: { id: cotExt.id } }).catch(() => {});
    if (clienteExt?.id) {
      await prisma.seguimientoCampo.deleteMany({ where: { clienteExternoId: clienteExt.id } }).catch(() => {});
      await prisma.clienteExternoCampo.deleteMany({ where: { id: clienteExt.id } }).catch(() => {});
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
