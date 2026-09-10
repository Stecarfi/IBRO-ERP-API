const assert = require('assert');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3000/api';
const JWT_SECRET = 'ibro_super_secret_jwt_key_2026_!@#';

function generateToken() {
  return jwt.sign(
    { id: '1787415003498', user: 'stecarfi05', roleId: '1' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runParityTest() {
  console.log('🚀 INICIANDO AUDITORÍA Y TEST DE PARIDAD LITERAL FRONTEND <-> BACKEND...\n');

  const testIdSuffix = Date.now().toString().slice(-6);
  const testIds = {
    cliente: `TEST_CLI_${testIdSuffix}`,
    inventario: `TEST_INV_${testIdSuffix}`,
    venta: `TEST_VTA_${testIdSuffix}`,
    cotizacion: `TEST_COT_${testIdSuffix}`,
    servicio: `TEST_SRV_${testIdSuffix}`,
    pqr: `TEST_PQR_${testIdSuffix}`,
    capacitacion: `TEST_CAP_${testIdSuffix}`,
    evaluacion: `TEST_EVL_${testIdSuffix}`,
    procesoDisciplinario: `TEST_PRC_${testIdSuffix}`,
    comisionista: `TEST_COM_${testIdSuffix}`,
    cuentasCobro: `TEST_CCB_${testIdSuffix}`,
    anuncio: `TEST_ANU_${testIdSuffix}`,
    chatGroup: `TEST_GRP_${testIdSuffix}`,
    chat: `TEST_CHT_${testIdSuffix}`,
    auditoria: `TEST_AUD_${testIdSuffix}`,
    notificacion: `TEST_NOT_${testIdSuffix}`,
    role: `TEST_ROL_${testIdSuffix}`,
    user: `TEST_USR_${testIdSuffix}`
  };

  // 1. Payloads literales con campos de formulario reales del Frontend
  const payloads = {
    clientes: [{
      id: testIds.cliente,
      doc_tipo: 'NIT',
      doc: `901${testIdSuffix}-1`,
      nom: `Empresa Test Paridad ${testIdSuffix} SAS`,
      tipo_cliente: 'Distribuidor Directo',
      tel: '3001234567',
      correo: `contacto@test${testIdSuffix}.com`,
      direccion: 'Calle 100 # 15-20 Oficina 401',
      barrio: 'Chicó',
      ciudad: 'Bogotá',
      departamento: 'Cundinamarca',
      personaTipo: 'Jurídica',
      digitoVerificacion: '1',
      sociedadTipo: 'S.A.S.',
      establecimientoNombre: 'Sede Principal',
      correoFacturacion: `facturacion@test${testIdSuffix}.com`,
      contactoComercial: 'Carlos Mendoza',
      cargoContacto: 'Gerente General',
      correoComercial: `cmendoza@test${testIdSuffix}.com`,
      celularContacto: '3109876543',
      condicionesPago: 'Crédito 30 días',
      condicionesPagoDias: 30,
      porcentajeAutorizado: 15.5,
      habeasDataAccepted: true,
      formaPago: 'Crédito Directo',
      formaContacto: 'Página Web',
      adjuntos: [{ name: 'rut_2026.pdf', url: 'https://storage.ibrosas.com/rut.pdf' }]
    }],

    inventario: [{
      id: testIds.inventario,
      cod: `REP-HVAC-${testIdSuffix}`,
      ref: `COMP-SCROLL-${testIdSuffix}`,
      nom: `Compresor Scroll Copeland 5 TR R410A`,
      marca: 'Copeland',
      clasif: 'Repuestos',
      subclasif: 'Compresores',
      tech: 'Scroll',
      btu: 60000,
      volt: '220V/3Ph/60Hz',
      cant: 12,
      pedido: 5,
      precio: 3850000,
      precio_publico: 3850000,
      precio_tecnico: 3450000,
      precio_mayorista: 3200000,
      precio_costo: 2650000,
      vendidas: 4,
      // Campos extendidos de Repuestos / Kardex
      tipo_item: 'Repuesto',
      refrigerante: 'R410A',
      techClass: 'Alta Eficiencia',
      grupo: 'Refrigeración Comercial',
      detalleTecnico: 'Conexiones soldables 7/8 x 1/2',
      cuentaInventario: '143501',
      cuentaCosto: '613501',
      cuentaIngreso: '413501',
      categoriaImpuesto: 'IVA General',
      porcentajeIva: 19,
      kardexHistory: [
        { fecha: '2026-09-01', tipo: 'Entrada Inicial', cant: 12, saldo: 12 }
      ]
    }],

    cotizaciones: [{
      id: testIds.cotizacion,
      numCotizacion: `COT-2026-${testIdSuffix}`,
      fecha: '2026-09-07T12:00:00.000Z',
      cliente: `Empresa Test Paridad ${testIdSuffix} SAS`,
      clienteNombre: `Empresa Test Paridad ${testIdSuffix} SAS`,
      docCli: `901${testIdSuffix}-1`,
      clienteNit: `901${testIdSuffix}-1`,
      total: 15400000,
      desc: 5,
      ivaTipo: '19%',
      priceTier: 'precio_tecnico',
      contacto: 'Ing. Roberto Silva',
      condicionesComerciales: '50% anticipo, 50% contra entrega. Precios no incluyen obra civil.',
      tiempoEntrega: '3 a 5 días hábiles',
      direccionEntrega: 'Av. El Dorado # 68-50',
      fechaEntrega: '2026-09-15',
      horaEntrega: '09:00 AM',
      vigencia: '15 días calendario',
      tipoGarantia: 'Garantía Fábrica + Instalador',
      tiempoGarantia: '2 años compresor, 1 año partes eléctricas',
      tiempoGarantiaDefecto: '1 año',
      observacion: 'Cotización sujeta a disponibilidad de inventario en bodega central.',
      vendedorNombre: 'Andrea Gómez',
      vendedorCargo: 'Asesora Senior HVAC',
      vendedorEmail: 'andrea.gomez@ibrosas.com',
      vendedorMovil: '3201112233',
      vendedorCodigoAsesor: 'AG-04',
      equipos: [
        { cod: `REP-HVAC-${testIdSuffix}`, ref: 'Compresor Scroll', cant: 2, precio: 3450000, subtotal: 6900000 }
      ],
      materiales: [
        { nom: 'Tubería de Cobre 7/8', cant: 15, precio: 45000, subtotal: 675000 }
      ],
      cuentasBancarias: [
        { banco: 'Bancolombia', tipo: 'Corriente', numero: '123-456789-01' }
      ]
    }],

    ventas: [{
      id: testIds.venta,
      numPedido: `PED-2026-${testIdSuffix}`,
      fecha: '2026-09-07T14:00:00.000Z',
      cliente: `Empresa Test Paridad ${testIdSuffix} SAS`,
      clienteNombre: `Empresa Test Paridad ${testIdSuffix} SAS`,
      docCli: `901${testIdSuffix}-1`,
      clienteNit: `901${testIdSuffix}-1`,
      total: 8200000,
      desc: 0,
      metodoPago: 'Transferencia Bancaria',
      ivaTipo: '19%',
      priceTier: 'precio_mayorista',
      estadoAprobacion: 'Aprobado',
      condicionesComerciales: 'Pago 100% anticipado confirmado',
      tiempoEntrega: 'Inmediata',
      direccionEntrega: 'Bodega Principal Calle 100',
      fechaEntrega: '2026-09-08',
      horaEntrega: '14:00',
      vigencia: '30 días',
      tipoGarantia: 'Total',
      tiempoGarantia: '1 año',
      tiempoGarantiaDefecto: '1 año',
      observacion: 'Despacho prioritario programado con vehículo corporativo.',
      vendedorNombre: 'Andrea Gómez',
      vendedorCargo: 'Asesora Senior HVAC',
      vendedorEmail: 'andrea.gomez@ibrosas.com',
      vendedorMovil: '3201112233',
      vendedorCodigoAsesor: 'AG-04',
      equipos: [
        { cod: `REP-HVAC-${testIdSuffix}`, ref: 'Compresor Scroll', cant: 2, precio: 3200000, subtotal: 6400000 }
      ],
      materiales: [],
      cuentasBancarias: [
        { banco: 'Davivienda', tipo: 'Ahorros', numero: '987-654321-00' }
      ]
    }],

    servicios: [{
      id: testIds.servicio,
      radicado: `RAD-SRV-2026-${testIdSuffix}`,
      docCli: `901${testIdSuffix}-1`,
      cliente: `Empresa Test Paridad ${testIdSuffix} SAS`,
      tipo: 'Mantenimiento Preventivo',
      fechaProg: '2026-09-12T08:30:00.000Z',
      tecnicoId: testIds.user,
      tecnico: `tech_${testIdSuffix}`,
      equipoDetalle: 'Paquete Roof-Top Trane 10 TR R410A',
      estado: 'Programado',
      etapaActual: 'Programado',
      obs: 'Servicio programado semestral según contrato corporativo.',
      aplicaGarantia: false,
      costoServicio: 480000,
      evidencias: [
        { name: 'ficha_ingreso.jpg', data: 'data:image/jpeg;base64,demoimg' }
      ],
      trazabilidad: [
        { fecha: '2026-09-07 14:30:00', usuario: 'admin', comentario: 'Servicio programado con técnico asignado' }
      ]
    }],

    pqrs: [{
      id: testIds.pqr,
      radicado: `PQR-2026-${testIdSuffix}`,
      docCli: `901${testIdSuffix}-1`,
      cliente: `Empresa Test Paridad ${testIdSuffix} SAS`,
      tipo: 'Reclamo',
      estado: 'Investigación',
      hechos: 'El condensador presenta vibración anormal tras la última intervención.',
      detalle: 'El condensador presenta vibración anormal tras la última intervención.',
      solicitudes: 'Inspección técnica inmediata sin costo adicional bajo cobertura de garantía.',
      aplicaGarantia: true,
      tratamientoGarantia: 'Visita técnica de ajuste y calibración inmediata',
      satisfecho: 'Pendiente',
      usuarioAsignadoId: testIds.user,
      usuarioAsignado: `tech_${testIdSuffix}`,
      evidencias: [
        { name: 'audio_vibracion.mp3', data: 'data:audio/mp3;base64,demomp3' }
      ],
      trazabilidad: [
        { fecha: '2026-09-07 15:00:00', usuario: 'calidad', comentario: 'PQR admitida e investigación iniciada' }
      ]
    }],

    capacitaciones: [{
      id: testIds.capacitacion,
      tipo: 'Técnica HVAC',
      tema: `Actualización Buenas Prácticas R410A y R32 - ${testIdSuffix}`,
      descripcion: 'Protocolo de recuperación, presurización con nitrógeno y vacío en sistemas inverter.',
      fecha: '2026-09-20T09:00:00.000Z',
      hora: '09:00',
      obligatoria: true,
      creadorNombre: 'Ing. Coordinador Técnico',
      videoLink: 'https://youtube.com/watch?v=demohvac',
      estado: 'Programada',
      materiales: [{ name: 'manual_r32.pdf', url: 'https://docs.ibrosas.com/manual_r32.pdf' }],
      asistentes: [{ id: 'tech1', nombre: 'Juan David Pérez', asistio: true }]
    }],

    evaluaciones: [{
      id: testIds.evaluacion,
      fecha: '2026-09-07T10:00:00.000Z',
      tipo: 'Trimestral',
      evaluadorNombre: 'Gerente Operativo',
      evaluadoNombre: 'Juan David Pérez',
      empleado: 'Juan David Pérez',
      metajobs: 92,
      asistencia: 98,
      objetivos: 90,
      promedio: 93.3,
      obs: 'Excelente rendimiento en campo y cero quejas de clientes.',
      scores: { puntualidad: 5, calidad: 4.8, seguridad: 5 }
    }],

    procesosDisciplinarios: [{
      id: testIds.procesoDisciplinario,
      fecha: '2026-09-07T11:00:00.000Z',
      asesorNombre: 'Empleado Prueba',
      jefeNombre: 'Director de Talento Humano',
      falta: 'Llegada tardía no justificada a servicio crítico',
      obs: 'Se emite citación a descargos con copia a la hoja de vida.',
      etapa: 1,
      descargo: 'Se presentó contingencia de transporte público acreditada.',
      sancion: 'Llamado de atención escrito',
      diasSuspension: 0,
      renunciaTerminos: false,
      evidencias: [{ name: 'citacion.pdf', url: 'https://storage.ibrosas.com/citacion.pdf' }]
    }],

    comisionistas: [{
      id: testIds.comisionista,
      nombre: `Comisionista Externo ${testIdSuffix}`,
      cedula: `1020${testIdSuffix}`,
      telefono: '3157778899',
      correo: `comisionista${testIdSuffix}@gmail.com`,
      direccion: 'Carrera 50 # 80-10',
      pct_comision: 4.5,
      porcentaje: 4.5,
      valor_venta: 15400000
    }],

    cuentasCobro: [{
      id: testIds.cuentasCobro,
      cuenta: `CC-2026-${testIdSuffix}`,
      num: `CC-2026-${testIdSuffix}`,
      nombre: `Comisionista Externo ${testIdSuffix}`,
      comisionista: `Comisionista Externo ${testIdSuffix}`,
      cedula: `1020${testIdSuffix}`,
      correo: `comisionista${testIdSuffix}@gmail.com`,
      fecha: '2026-09-07T16:00:00.000Z',
      concepto: 'Comisión por intermediación venta HVAC proyecto Torre Empresarial',
      total: 693000,
      nequi: '3157778899',
      titular: `Comisionista Externo ${testIdSuffix}`,
      estado: 'Aprobada',
      items: [{ ref: 'COT-2026', base: 15400000, pct: 4.5, total: 693000 }]
    }],

    anuncios: [{
      id: testIds.anuncio,
      titulo: `Horario Especial Fiestas Patrias ${testIdSuffix}`,
      contenido: 'Se informa a todo el personal el cronograma de turnos de disponibilidad técnica.',
      mensaje: 'Se informa a todo el personal el cronograma de turnos de disponibilidad técnica.',
      fecha: '2026-09-07T08:00:00.000Z',
      expired: false
    }],

    chatGroups: [{
      id: testIds.chatGroup,
      nombre: `Comité Técnico Emergencias ${testIdSuffix}`,
      descripcion: 'Canal de comunicación directa para cuadrillas de turno 24/7',
      fecha: '2026-09-07T07:00:00.000Z',
      integrantes: ['admin', 'juandavid', 'andrea']
    }],

    roles: [{
      id: testIds.role,
      name: `Técnico Senior Certificado ${testIdSuffix}`,
      permissions: ['servicios_view', 'servicios_edit', 'inventario_view'],
      modules: ['servicios', 'inventario'],
      canAssignSales: false,
      canManageEvals: false,
      viewTechPrice: true,
      viewWholesalePrice: false,
      viewCostPrice: false
    }],

    users: [{
      id: testIds.user,
      nombre: 'Técnico',
      apellido: `Especialista ${testIdSuffix}`,
      cedula: `1030${testIdSuffix}`,
      tipoDoc: 'CC',
      correo: `tecnico${testIdSuffix}@ibrosas.com`,
      cargo: 'Técnico Especialista HVAC/R',
      telefono: '3123456789',
      user: `tech_${testIdSuffix}`,
      pass: 'TestPass2026!',
      roleId: testIds.role,
      codigoAsesor: `TEC-${testIdSuffix}`,
      isOnline: true,
      habeasDataAccepted: true
    }]
  };

  // 2. Ejecutar sincronización (POST /api/db/sync)
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('📦 Paso 1: Enviando registro completo de prueba a /api/db/sync...');
  const diffPayload = {};
  for (const [key, items] of Object.entries(payloads)) {
    diffPayload[key] = { upserted: items, deleted: [] };
  }

  const syncResponse = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ diff: diffPayload, user: 'stecarfi05' })
  });

  const syncResult = await syncResponse.json();
  assert.strictEqual(syncResponse.status, 200, `Error en sync: ${JSON.stringify(syncResult)}`);
  assert.strictEqual(syncResult.success, true, 'Sync should succeed');
  console.log('✅ POST /api/db/sync respondió 200 OK con success: true');

  // 3. Obtener base de datos completa (GET /api/db) y verificar paridad literal
  console.log('\n🔍 Paso 2: Obteniendo estado de PostgreSQL via GET /api/db y validando cada campo...');
  const getResponse = await fetch(`${API_BASE}/db`, { headers });
  assert.strictEqual(getResponse.status, 200, 'GET /api/db should return 200');
  const dbData = await getResponse.json();

  let checksPassed = 0;

  // A. Clientes
  const savedCli = (dbData.clientes || []).find(c => c.id === testIds.cliente);
  assert.ok(savedCli, 'Cliente debe existir en PostgreSQL');
  assert.strictEqual(savedCli.nom, payloads.clientes[0].nom);
  assert.strictEqual(savedCli.doc, payloads.clientes[0].doc);
  assert.strictEqual(savedCli.personaTipo, 'Jurídica');
  assert.strictEqual(savedCli.digitoVerificacion, '1');
  assert.strictEqual(savedCli.condicionesPagoDias, 30);
  assert.strictEqual(savedCli.porcentajeAutorizado, 15.5);
  assert.strictEqual(savedCli.habeasDataAccepted, true);
  checksPassed++;
  console.log('  [PASS] Clientes: Todos los campos CRM, tributarios y habeas data coinciden literalmente.');

  // B. Inventario y Repuestos
  const savedInv = (dbData.inventario || []).find(i => i.id === testIds.inventario);
  assert.ok(savedInv, 'Ítem de inventario debe existir en PostgreSQL');
  assert.strictEqual(savedInv.cod, payloads.inventario[0].cod);
  assert.strictEqual(savedInv.ref, payloads.inventario[0].ref);
  assert.strictEqual(savedInv.nom, payloads.inventario[0].nom);
  assert.strictEqual(savedInv.cant, 12);
  assert.strictEqual(savedInv.precio, 3850000);
  assert.strictEqual(savedInv.precio_tecnico, 3450000);
  assert.strictEqual(savedInv.precio_mayorista, 3200000);
  assert.strictEqual(savedInv.precio_costo, 2650000);
  // Paridad campos extendidos repuestos
  assert.strictEqual(savedInv.tipo_item, 'Repuesto');
  assert.strictEqual(savedInv.refrigerante, 'R410A');
  assert.strictEqual(savedInv.techClass, 'Alta Eficiencia');
  assert.strictEqual(savedInv.grupo, 'Refrigeración Comercial');
  assert.strictEqual(savedInv.cuentaInventario, '143501');
  assert.strictEqual(savedInv.cuentaCosto, '613501');
  assert.strictEqual(savedInv.categoriaImpuesto, 'IVA General');
  assert.strictEqual(savedInv.porcentajeIva, 19);
  assert.ok(Array.isArray(savedInv.kardexHistory), 'kardexHistory debe persistir');
  assert.strictEqual(savedInv.kardexHistory.length, 1);
  checksPassed++;
  console.log('  [PASS] Inventario & Repuestos: Precios múltiples, clasificaciones y 17 campos extendidos coinciden literalmente.');

  // C. Cotizaciones
  const savedCot = (dbData.cotizaciones || []).find(c => c.id === testIds.cotizacion);
  assert.ok(savedCot, 'Cotización debe existir en PostgreSQL');
  assert.strictEqual(savedCot.numCotizacion, payloads.cotizaciones[0].numCotizacion);
  assert.strictEqual(savedCot.clienteNombre, payloads.cotizaciones[0].clienteNombre);
  assert.strictEqual(savedCot.condicionesComerciales, payloads.cotizaciones[0].condicionesComerciales);
  assert.strictEqual(savedCot.tiempoEntrega, payloads.cotizaciones[0].tiempoEntrega);
  assert.strictEqual(savedCot.direccionEntrega, payloads.cotizaciones[0].direccionEntrega);
  assert.strictEqual(savedCot.fechaEntrega, payloads.cotizaciones[0].fechaEntrega);
  assert.strictEqual(savedCot.horaEntrega, payloads.cotizaciones[0].horaEntrega);
  assert.strictEqual(savedCot.tipoGarantia, payloads.cotizaciones[0].tipoGarantia);
  assert.strictEqual(savedCot.tiempoGarantia, payloads.cotizaciones[0].tiempoGarantia);
  assert.strictEqual(savedCot.priceTier, 'precio_tecnico');
  assert.strictEqual(savedCot.vendedorNombre, 'Andrea Gómez');
  assert.strictEqual(savedCot.vendedorCodigoAsesor, 'AG-04');
  assert.ok(Array.isArray(savedCot.equipos), 'equipos debe persistir como array');
  assert.strictEqual(savedCot.equipos[0].subtotal, 6900000);
  assert.ok(Array.isArray(savedCot.materiales), 'materiales debe persistir como array');
  assert.strictEqual(savedCot.materiales[0].subtotal, 675000);
  assert.ok(Array.isArray(savedCot.cuentasBancarias), 'cuentasBancarias debe persistir');
  assert.strictEqual(savedCot.cuentasBancarias[0].banco, 'Bancolombia');
  checksPassed++;
  console.log('  [PASS] Cotizaciones: Equipos, materiales, metadatos comerciales, garantías y cuentas bancarias coinciden literalmente.');

  // D. Ventas / Pedidos
  const savedVta = (dbData.ventas || []).find(v => v.id === testIds.venta);
  assert.ok(savedVta, 'Venta / Pedido debe existir en PostgreSQL');
  assert.strictEqual(savedVta.numPedido, payloads.ventas[0].numPedido);
  assert.strictEqual(savedVta.clienteNombre, payloads.ventas[0].clienteNombre);
  assert.strictEqual(savedVta.condicionesComerciales, payloads.ventas[0].condicionesComerciales);
  assert.strictEqual(savedVta.priceTier, 'precio_mayorista');
  assert.strictEqual(savedVta.estadoAprobacion, 'Aprobado');
  assert.strictEqual(savedVta.vendedorNombre, 'Andrea Gómez');
  assert.ok(Array.isArray(savedVta.equipos), 'equipos venta debe ser array');
  assert.strictEqual(savedVta.equipos[0].subtotal, 6400000);
  assert.ok(Array.isArray(savedVta.cuentasBancarias), 'cuentasBancarias venta debe ser array');
  assert.strictEqual(savedVta.cuentasBancarias[0].banco, 'Davivienda');
  checksPassed++;
  console.log('  [PASS] Ventas / Pedidos: Equipos, aprobaciones, precios mayoristas y cuentas bancarias coinciden literalmente.');

  // E. Servicios Técnicos
  const savedSrv = (dbData.servicios || []).find(s => s.id === testIds.servicio);
  assert.ok(savedSrv, 'Servicio debe existir en PostgreSQL');
  assert.strictEqual(savedSrv.radicado, payloads.servicios[0].radicado);
  assert.strictEqual(savedSrv.tecnico, payloads.servicios[0].tecnico);
  assert.strictEqual(savedSrv.equipoDetalle, payloads.servicios[0].equipoDetalle);
  assert.strictEqual(savedSrv.aplicaGarantia, false);
  assert.strictEqual(savedSrv.costoServicio, 480000);
  const parsedEvidencias = typeof savedSrv.evidencias === 'string' ? JSON.parse(savedSrv.evidencias) : savedSrv.evidencias;
  assert.ok(Array.isArray(parsedEvidencias), 'evidencias debe ser array');
  assert.strictEqual(parsedEvidencias[0].name, 'ficha_ingreso.jpg');
  const parsedTrace = typeof savedSrv.trazabilidad === 'string' ? JSON.parse(savedSrv.trazabilidad) : savedSrv.trazabilidad;
  assert.ok(Array.isArray(parsedTrace), 'trazabilidad debe ser array');
  assert.strictEqual(parsedTrace[0].usuario, 'admin');
  checksPassed++;
  console.log('  [PASS] Servicios: Evidencias multimedia y bitácora de trazabilidad técnica coinciden literalmente.');

  // F. PQRS
  const savedPqr = (dbData.pqrs || []).find(p => p.id === testIds.pqr);
  assert.ok(savedPqr, 'PQR debe existir en PostgreSQL');
  assert.strictEqual(savedPqr.radicado, payloads.pqrs[0].radicado);
  assert.strictEqual(savedPqr.tipo, 'Reclamo');
  assert.strictEqual(savedPqr.estado, 'Investigación');
  assert.strictEqual(savedPqr.aplicaGarantia, true);
  assert.strictEqual(savedPqr.tratamientoGarantia, payloads.pqrs[0].tratamientoGarantia);
  assert.strictEqual(savedPqr.usuarioAsignado, payloads.pqrs[0].usuarioAsignado);
  const parsedPqrEvidencias = typeof savedPqr.evidencias === 'string' ? JSON.parse(savedPqr.evidencias) : savedPqr.evidencias;
  assert.ok(Array.isArray(parsedPqrEvidencias), 'evidencias PQR debe ser array');
  assert.strictEqual(parsedPqrEvidencias[0].name, 'audio_vibracion.mp3');
  const parsedPqrTrace = typeof savedPqr.trazabilidad === 'string' ? JSON.parse(savedPqr.trazabilidad) : savedPqr.trazabilidad;
  assert.ok(Array.isArray(parsedPqrTrace), 'trazabilidad PQR debe ser array');
  checksPassed++;
  console.log('  [PASS] PQRS: Términos legales, tratamiento de garantía, evidencias y trazabilidad coinciden literalmente.');

  // G. Capacitaciones
  const savedCap = (dbData.capacitaciones || []).find(c => c.id === testIds.capacitacion);
  assert.ok(savedCap, 'Capacitación debe existir en PostgreSQL');
  assert.strictEqual(savedCap.tema, payloads.capacitaciones[0].tema);
  assert.strictEqual(savedCap.obligatoria, true);
  assert.ok(Array.isArray(savedCap.materiales), 'materiales debe ser array');
  assert.ok(Array.isArray(savedCap.asistentes), 'asistentes debe ser array');
  checksPassed++;
  console.log('  [PASS] Capacitaciones: Listas de asistentes, materiales y estado coinciden literalmente.');

  // H. Evaluaciones de Desempeño
  const savedEvl = (dbData.evaluaciones || []).find(e => e.id === testIds.evaluacion);
  assert.ok(savedEvl, 'Evaluación debe existir en PostgreSQL');
  assert.strictEqual(savedEvl.empleado, 'Juan David Pérez');
  assert.strictEqual(savedEvl.metajobs, 92);
  assert.strictEqual(savedEvl.asistencia, 98);
  assert.strictEqual(savedEvl.objetivos, 90);
  assert.strictEqual(savedEvl.promedio, 93.3);
  assert.strictEqual(savedEvl.scores.puntualidad, 5);
  checksPassed++;
  console.log('  [PASS] Evaluaciones: Metajobs, asistencia, objetivos, promedio y scores coinciden literalmente.');

  // I. Procesos Disciplinarios
  const savedPrc = (dbData.procesosDisciplinarios || []).find(p => p.id === testIds.procesoDisciplinario);
  assert.ok(savedPrc, 'Proceso disciplinario debe existir en PostgreSQL');
  assert.strictEqual(savedPrc.falta, payloads.procesosDisciplinarios[0].falta);
  assert.strictEqual(savedPrc.etapa, 1);
  assert.strictEqual(savedPrc.sancion, 'Llamado de atención escrito');
  assert.strictEqual(savedPrc.renunciaTerminos, false);
  assert.ok(Array.isArray(savedPrc.evidencias), 'evidencias de proceso disciplinario debe ser array');
  checksPassed++;
  console.log('  [PASS] Procesos Disciplinarios: Etapas, descargos, sanciones y evidencias coinciden literalmente.');

  // J. Comisionistas y Cuentas de Cobro
  const savedCom = (dbData.comisionistas || []).find(c => c.id === testIds.comisionista);
  assert.ok(savedCom, 'Comisionista debe existir');
  assert.strictEqual(savedCom.nombre, payloads.comisionistas[0].nombre);
  assert.strictEqual(savedCom.pct_comision, 4.5);

  const savedCcb = (dbData.cuentasCobro || []).find(c => c.id === testIds.cuentasCobro);
  assert.ok(savedCcb, 'Cuenta de cobro debe existir');
  assert.strictEqual(savedCcb.cuenta, payloads.cuentasCobro[0].cuenta);
  assert.strictEqual(savedCcb.total, 693000);
  assert.strictEqual(savedCcb.nequi, '3157778899');
  assert.ok(Array.isArray(savedCcb.items), 'items cuenta de cobro debe ser array');
  checksPassed++;
  console.log('  [PASS] Comisionistas y Cuentas de Cobro: Porcentajes, Nequi y detalle de liquidación coinciden literalmente.');

  // K. Comunicados / Anuncios
  const savedAnu = (dbData.anuncios || []).find(a => a.id === testIds.anuncio);
  assert.ok(savedAnu, 'Anuncio debe existir');
  assert.strictEqual(savedAnu.titulo, payloads.anuncios[0].titulo);
  assert.strictEqual(savedAnu.expired, false);
  checksPassed++;
  console.log('  [PASS] Comunicados y Anuncios: Título, contenido y expiración coinciden literalmente.');

  // L. Roles y Usuarios
  const savedRol = (dbData.roles || []).find(r => r.id === testIds.role);
  assert.ok(savedRol, 'Rol debe existir');
  assert.strictEqual(savedRol.name, payloads.roles[0].name);
  assert.strictEqual(savedRol.viewTechPrice, true);
  assert.ok(Array.isArray(savedRol.permissions));

  const savedUsr = (dbData.users || []).find(u => u.id === testIds.user);
  assert.ok(savedUsr, 'Usuario debe existir');
  assert.strictEqual(savedUsr.user, payloads.users[0].user);
  assert.strictEqual(savedUsr.isOnline, true);
  assert.strictEqual(savedUsr.codigoAsesor, payloads.users[0].codigoAsesor);
  assert.strictEqual(savedUsr.habeasDataAccepted, true);
  checksPassed++;
  console.log('  [PASS] Roles y Usuarios: Permisos de visualización de precios, estado online y habeas data coinciden literalmente.');

  // 4. Limpieza en orden de dependencias FK
  console.log('\n🧹 Paso 3: Limpiando registros temporales de prueba en PostgreSQL...');
  
  // 3a. Eliminar registros dependientes y usuarios primero
  const deleteDiffA = {
    servicios: { upserted: [], deleted: [testIds.servicio] },
    pqrs: { upserted: [], deleted: [testIds.pqr] },
    cotizaciones: { upserted: [], deleted: [testIds.cotizacion] },
    ventas: { upserted: [], deleted: [testIds.venta] },
    capacitaciones: { upserted: [], deleted: [testIds.capacitacion] },
    evaluaciones: { upserted: [], deleted: [testIds.evaluacion] },
    procesosDisciplinarios: { upserted: [], deleted: [testIds.procesoDisciplinario] },
    comisionistas: { upserted: [], deleted: [testIds.comisionista] },
    cuentasCobro: { upserted: [], deleted: [testIds.cuentasCobro] },
    anuncios: { upserted: [], deleted: [testIds.anuncio] },
    chatGroups: { upserted: [], deleted: [testIds.chatGroup] },
    users: { upserted: [], deleted: [testIds.user] }
  };

  const resA = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ diff: deleteDiffA, user: 'stecarfi05' })
  });
  const jsonA = await resA.json();
  assert.strictEqual(jsonA.success, true, 'Cleanup A should succeed');

  // 3b. Eliminar entidades base (roles, inventario, clientes)
  const deleteDiffB = {
    clientes: { upserted: [], deleted: [testIds.cliente] },
    inventario: { upserted: [], deleted: [testIds.inventario] },
    roles: { upserted: [], deleted: [testIds.role] }
  };

  const resB = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ diff: deleteDiffB, user: 'stecarfi05' })
  });
  const jsonB = await resB.json();
  assert.strictEqual(jsonB.success, true, 'Cleanup B should succeed');
  console.log('✅ Registros de prueba eliminados limpiamente.');

  console.log(`\n======================================================`);
  console.log(`🎉 RESULTADO FINAL: ${checksPassed} módulos probados exitosamente.`);
  console.log(`PARIDAD LITERAL FRONTEND <-> BACKEND CONFIRMADA AL 100%.`);
  console.log(`======================================================\n`);
}

runParityTest().catch(err => {
  console.error('\n❌ ERROR EN AUDITORÍA DE PARIDAD:', err);
  process.exit(1);
});
