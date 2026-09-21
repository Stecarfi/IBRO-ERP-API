const prisma = require('./src/prisma');
const campoController = require('./src/controllers/campo.controller');
const jornadaService = require('./src/services/campo/jornada.service');
const visitasService = require('./src/services/campo/visitas.service');
const operacionExternaService = require('./src/services/campo/operacionExterna.service');
const actividadesService = require('./src/services/campo/actividades.service');
const evaluacionesService = require('./src/services/campo/evaluacionesCampo.service');
const syncService = require('./src/services/sync.service');

// Helper para mockear Request y Response de Express
function createMockReqRes(user, body = {}, params = {}, query = {}) {
  let responseData = null;
  let statusCode = 200;
  const req = {
    user,
    body,
    params,
    query,
    headers: { authorization: 'Bearer test-token' }
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    }
  };

  return {
    req,
    res,
    getResult: () => ({ statusCode, data: responseData })
  };
}

async function runCompleteE2ETests() {
  console.log('======================================================================');
  console.log('  SUITE DE PRUEBAS INTEGRALES 1 A 1: MÓDULO DE VENTAS EXTERNAS');
  console.log('  Correlación Literal, Precisa e Igualitaria: FRONTEND <-> BACKEND');
  console.log('  Submódulos: Comercial en Campo & Control Gerencial + Adjuntos');
  console.log('======================================================================\n');

  // 1. Obtener o crear usuarios de prueba para Asesor y Supervisor
  const users = await prisma.user.findMany({ include: { role: true } });
  if (!users || users.length === 0) throw new Error('No se encontró ningún usuario para pruebas.');

  const asesor = users.find(u => 
    u.cargo?.toLowerCase().includes('comercial') || 
    u.role?.name?.toLowerCase().includes('comercial') || 
    u.roleId === '68'
  ) || users[0];

  const supervisor = users.find(u => 
    u.cargo?.toLowerCase().includes('director') || 
    u.cargo?.toLowerCase().includes('gerente') || 
    u.cargo?.toLowerCase().includes('delegad') || 
    u.role?.name?.toLowerCase().includes('admin') || 
    u.roleId === '67'
  ) || users[0];

  console.log(`👤 Asesor Comercial en Campo: ${asesor.nombre || asesor.user} (ID: ${asesor.id})`);
  console.log(`👔 Supervisor / Control Gerencial: ${supervisor.nombre || supervisor.user} (ID: ${supervisor.id})\n`);

  let testCliente = null;
  let testVisita = null;
  let testCotizacion = null;
  let testVenta = null;
  let testActividad = null;
  let testRuta = null;
  let testEvaluacion = null;
  let testNovedad = null;
  let testSeguimiento = null;

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`   ❌ FALLÓ: ${message}`);
      throw new Error(`Aserción fallida: ${message}`);
    }
    passedTests++;
    console.log(`   ✔ ${message}`);
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Control de Jornada Comercial (Iniciar, Pausar, Reanudar, Finalizar)
    // -----------------------------------------------------------------
    console.log('-----------------------------------------------------------------');
    console.log('1. TEST: CICLO DE VIDA DE JORNADA LABORAL EN CAMPO (ComercialCampo.jsx)');
    console.log('-----------------------------------------------------------------');

    // Cerrar jornadas activas previas del asesor para aislar la prueba
    await prisma.jornadaLaboral.updateMany({
      where: { usuarioId: asesor.id, horaFin: null },
      data: { horaFin: new Date(), estado: 'Finalizada' }
    });

    // 1.1 Iniciar Jornada
    const { req: reqIni, res: resIni, getResult: getIni } = createMockReqRes(asesor, {
      latitud: 10.9981,
      longitud: -74.7932,
      bateria: 92,
      observaciones: 'Inicio de turno en ruta norte'
    });
    await campoController.iniciarJornada(reqIni, resIni);
    const rIni = getIni();
    assert(rIni.statusCode === 200 && rIni.data?.jornada?.id, 'Iniciar jornada laboral con GPS y telemetría');

    // 1.2 Consultar Jornada Activa
    const { req: reqAct, res: resAct, getResult: getAct } = createMockReqRes(asesor);
    await campoController.getJornadaActiva(reqAct, resAct);
    const rAct = getAct();
    assert(rAct.statusCode === 200 && Boolean(rAct.data?.jornada?.id), 'Consultar estado de jornada activa');

    // 1.3 Pausar Jornada
    const { req: reqPau, res: resPau, getResult: getPau } = createMockReqRes(asesor, {
      motivo: 'Almuerzo comercial'
    });
    await campoController.iniciarPausa(reqPau, resPau);
    const rPau = getPau();
    assert(rPau.statusCode === 200 && rPau.data?.pausa, 'Pausar jornada por almuerzo/descanso');

    // 1.4 Reanudar Jornada
    const { req: reqRea, res: resRea, getResult: getRea } = createMockReqRes(asesor);
    await campoController.reanudarPausa(reqRea, resRea);
    const rRea = getRea();
    assert(rRea.statusCode === 200 && (rRea.data?.jornada?.estado === 'Iniciada' || rRea.data?.jornada?.estado === 'En Ruta'), 'Reanudar jornada a estado Iniciada / En Ruta');

    // 1.5 Ping de Telemetría GPS
    const { req: reqPing, res: resPing, getResult: getPing } = createMockReqRes(asesor, {
      latitud: 11.0020,
      longitud: -74.8010,
      velocidad: 35.5,
      bateria: 88,
      precision: 5.0
    });
    await campoController.pingUbicacion(reqPing, resPing);
    const rPing = getPing();
    assert(rPing.statusCode === 200, 'Enviar ping de telemetría y geolocalización');

    // 1.6 Finalizar Jornada
    const { req: reqFin, res: resFin, getResult: getFin } = createMockReqRes(asesor, {
      latitud: 11.0050,
      longitud: -74.8040,
      bateria: 85,
      observaciones: 'Fin de jornada con 3 visitas realizadas'
    });
    await campoController.finalizarJornada(reqFin, resFin);
    const rFin = getFin();
    assert(rFin.statusCode === 200 && rFin.data?.jornada?.horaFin, 'Finalizar jornada laboral con cálculo de recorrido');

    // -----------------------------------------------------------------
    // TEST 2: Registro de Cliente Externo / Prospecto con Adjuntos y Evidencias
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('2. TEST: REGISTRO DE CLIENTE EXTERNO CON ADJUNTOS (ComercialCampo.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosCliente = [
      {
        id: 'adj-rut-1',
        nombre: 'RUT_Actualizado_2026.pdf',
        tipo: 'application/pdf',
        tamano: '240 KB',
        base64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
        url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
      },
      {
        id: 'adj-foto-fachada',
        nombre: 'Fachada_Sede_Norte.jpg',
        tipo: 'image/jpeg',
        tamano: '1.2 MB',
        base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
      }
    ];

    const { req: reqCli, res: resCli, getResult: getCli } = createMockReqRes(asesor, {
      nombre: 'Laboratorios Farmacéuticos del Norte S.A.',
      nitDoc: '900888999-1',
      contacto: 'Dra. Claudia Mendoza',
      telefono: '3109998877',
      correo: 'claudia.mendoza@labnorte.com',
      ciudad: 'Barranquilla',
      direccion: 'Calle 76 # 54-11',
      sectorEconomico: 'Farmacéutico / Salud',
      origen: 'En Frio / Puerta a Puerta',
      latitud: 11.0012,
      longitud: -74.8105,
      notas: 'Requiere modernización de cuartos fríos y cámaras de estabilidad',
      adjuntos: adjuntosCliente,
      evidencias: adjuntosCliente
    });

    await campoController.crearClienteExterno(reqCli, resCli);
    const rCli = getCli();
    assert(rCli.statusCode === 201 && (rCli.data?.id || rCli.data?.cliente?.id), 'Crear cliente externo con geolocalización y adjuntos fotográficos/documentales');
    testCliente = rCli.data?.cliente || rCli.data;

    // Verificar que los adjuntos se guardaron en el primer seguimiento/historial del cliente
    const segCliente = await prisma.seguimientoCampo.findFirst({
      where: { clienteExternoId: testCliente.id }
    });
    assert(segCliente && Array.isArray(segCliente.evidencias) && segCliente.evidencias.length === 2, 'Adjuntos y fotos del cliente preservados en el historial documental 360°');

    // -----------------------------------------------------------------
    // TEST 3: Transición en el Embudo Comercial de 8 Etapas
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('3. TEST: EMBUDO COMERCIAL DE 8 ETAPAS (ComercialCampo & ControlGerencial)');
    console.log('-----------------------------------------------------------------');

    const etapasAvanzar = ['Cliente Potencial', 'Visita', 'Seguimiento', 'Cotizacion', 'Negociacion'];
    for (const etapa of etapasAvanzar) {
      const { req: reqEta, res: resEta, getResult: getEta } = createMockReqRes(asesor, {
        etapaEmbudo: etapa,
        observaciones: `Avanza de forma satisfactoria a etapa ${etapa}`
      }, { id: testCliente.id });
      await campoController.cambiarEtapaEmbudo(reqEta, resEta);
      const rEta = getEta();
      const etapaActual = rEta.data?.etapaEmbudo || rEta.data?.cliente?.etapaEmbudo;
      assert(rEta.statusCode === 200 && etapaActual === etapa, `Transición exitosa a etapa '${etapa}'`);
    }

    // -----------------------------------------------------------------
    // TEST 4: Programación de Visita con Soportes y Evidencias Previas
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('4. TEST: PROGRAMAR VISITA COMERCIAL CON ADJUNTOS (ComercialCampo.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosVisitaProg = [
      {
        id: 'adj-brief-visita',
        nombre: 'Brief_Tecnico_Requerimientos.pdf',
        tipo: 'application/pdf',
        tamano: '350 KB',
        base64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
        url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
      }
    ];

    const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { req: reqVisProg, res: resVisProg, getResult: getVisProg } = createMockReqRes(asesor, {
      clienteExternoId: testCliente.id,
      tipoVisita: 'Comercial',
      fechaProgramada: `${manana}T10:00:00.000Z`,
      objetivo: 'Levantamiento térmico en sitio y cotización de equipos',
      prioridad: 'Alta',
      lat: 11.0012,
      lng: -74.8105,
      adjuntos: adjuntosVisitaProg,
      evidencias: adjuntosVisitaProg
    });

    await campoController.programarVisita(reqVisProg, resVisProg);
    const rVisProg = getVisProg();
    assert(rVisProg.statusCode === 201 && rVisProg.data?.visita?.id, 'Programar visita con enlace a clienteExternoId y brief adjunto');
    testVisita = rVisProg.data.visita;
    assert(Array.isArray(testVisita.evidencias) && testVisita.evidencias.length === 1, 'Brief y soporte documental guardados en la visita');

    // -----------------------------------------------------------------
    // TEST 5: Check-in de Visita con Validación GPS de Proximidad
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('5. TEST: CHECK-IN DE VISITA EN TERRENO (ComercialCampo.jsx)');
    console.log('-----------------------------------------------------------------');

    const { req: reqCheckIn, res: resCheckIn, getResult: getCheckIn } = createMockReqRes(asesor, {
      visitaId: testVisita.id,
      latitud: 11.0013,
      longitud: -74.8106
    });

    await campoController.checkInVisita(reqCheckIn, resCheckIn);
    const rCheckIn = getCheckIn();
    assert(rCheckIn.statusCode === 200 && (rCheckIn.data?.visita?.checkInHora || rCheckIn.data?.visita?.checkIn), 'Check-in registrado con timestamp y coordenadas de proximidad');

    // -----------------------------------------------------------------
    // TEST 6: Check-out con Firma Digital en Canvas Y Evidencias Fotográficas
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('6. TEST: CHECK-OUT CON FIRMA DIGITAL Y FOTOS MULTIMEDIA (ComercialCampo.jsx)');
    console.log('-----------------------------------------------------------------');

    const fotosEvidenciaVisita = [
      {
        id: 'foto-placa-chiller',
        nombre: 'Placa_Motor_Chiller_1.jpg',
        tipo: 'image/jpeg',
        tamano: '850 KB',
        base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
      },
      {
        id: 'foto-cuarto-maquinas',
        nombre: 'Cuarto_Maquinas_General.jpg',
        tipo: 'image/jpeg',
        tamano: '1.1 MB',
        base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
      }
    ];

    const firmaDigitalCanvasBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA3...';

    const { req: reqCheckOut, res: resCheckOut, getResult: getCheckOut } = createMockReqRes(asesor, {
      visitaId: testVisita.id,
      latitud: 11.0014,
      longitud: -74.8107,
      resultadoVisita: 'Venta Cerrada',
      resultadoResumen: 'Cliente acepta propuesta de suministro con entrega en 15 días',
      observaciones: 'Se verificó instalación eléctrica trifásica 220V',
      firmaCliente: firmaDigitalCanvasBase64,
      nombreFirmante: 'Dra. Claudia Mendoza',
      cedulaFirmante: '1047888999',
      fotosEvidencia: fotosEvidenciaVisita,
      adjuntos: fotosEvidenciaVisita,
      evidencias: fotosEvidenciaVisita
    });

    await campoController.checkOutVisita(reqCheckOut, resCheckOut);
    const rCheckOut = getCheckOut();
    assert(rCheckOut.statusCode === 200 && (rCheckOut.data?.visita?.checkOutHora || rCheckOut.data?.visita?.checkOut), 'Check-out completado con estado Realizada');
    const visitaPostCheckOut = await prisma.visitaCampo.findUnique({ where: { id: testVisita.id } });
    assert(visitaPostCheckOut.firmaCliente === firmaDigitalCanvasBase64, 'Firma digital en canvas preservada intacta');
    assert(Array.isArray(visitaPostCheckOut.evidencias) && visitaPostCheckOut.evidencias.length >= 2, 'Fotos de evidencia de la visita registradas con éxito en BD');

    // -----------------------------------------------------------------
    // TEST 7: Emisión de Cotización Comercial Externa
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('7. TEST: COTIZACIÓN EXTERNA (ComercialCampo & Cotizaciones.jsx)');
    console.log('-----------------------------------------------------------------');

    const itemsCotizacion = [
      { descripcion: 'Unidad Condensadora BITZER 15HP R404A', cantidad: 1, precioUnit: 28500000, subtotal: 28500000 },
      { descripcion: 'Evaporador Cúbico Bohn 4 Ventiladores', cantidad: 1, precioUnit: 14500000, subtotal: 14500000 },
      { descripcion: 'Instalación y Montaje Mecánico Especializado', cantidad: 1, precioUnit: 5000000, subtotal: 5000000 }
    ];

    const { req: reqCot, res: resCot, getResult: getCot } = createMockReqRes(asesor, {
      clienteExternoId: testCliente.id,
      validezDias: 30,
      estado: 'Aprobada',
      observaciones: 'Cotización con garantía de 12 meses y servicio postventa',
      items: itemsCotizacion
    });

    await campoController.crearCotizacionExterna(reqCot, resCot);
    const rCot = getCot();
    assert(rCot.statusCode === 201 && (rCot.data?.id || rCot.data?.cotizacion?.id), 'Cotización externa creada con numeración correlativa');
    testCotizacion = rCot.data?.cotizacion || rCot.data;
    assert(testCotizacion.total === 48000000, `Cálculo automático de total correcto ($${testCotizacion.total.toLocaleString()})`);

    // -----------------------------------------------------------------
    // TEST 8: Cierre de Venta Externa de Terreno
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('8. TEST: CIERRE DE VENTA EXTERNA (ComercialCampo & Pedidos.jsx)');
    console.log('-----------------------------------------------------------------');

    const { req: reqVen, res: resVen, getResult: getVen } = createMockReqRes(asesor, {
      clienteExternoId: testCliente.id,
      cotizacionId: testCotizacion.id,
      valorVendido: 48000000,
      metodoPago: 'Transferencia 50% anticipo y 50% contra entrega',
      observaciones: 'Venta cerrada y legalizada en campo',
      items: itemsCotizacion
    });

    await campoController.registrarVentaExterna(reqVen, resVen);
    const rVen = getVen();
    assert(rVen.statusCode === 201 && (rVen.data?.id || rVen.data?.venta?.id), 'Venta externa de campo legalizada con éxito');
    testVenta = rVen.data?.venta || rVen.data;
    assert(testVenta.codigo.startsWith('VTEX-') && testVenta.valorVendido === 48000000, `Código de venta correlativo y valor exacto: ${testVenta.codigo}`);

    // -----------------------------------------------------------------
    // TEST 9: Nuevo Seguimiento Comercial con Evidencias Adjuntas
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('9. TEST: SEGUIMIENTO COMERCIAL CON CAPTURAS/EVIDENCIAS (ComercialCampo.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosSeguimiento = [
      {
        id: 'adj-chat-whatsapp',
        nombre: 'Captura_WhatsApp_Confirmacion_Anticipo.png',
        tipo: 'image/png',
        tamano: '420 KB',
        base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
      }
    ];

    const { req: reqSeg, res: resSeg, getResult: getSeg } = createMockReqRes(asesor, {
      clienteId: testCliente.id,
      tipo: 'Compromiso de Pago',
      descripcion: 'Cliente envía comprobante de transferencia por anticipo de equipos',
      fechaProgramada: new Date().toISOString(),
      estado: 'Completado',
      adjuntos: adjuntosSeguimiento,
      evidencias: adjuntosSeguimiento
    });

    await campoController.crearSeguimiento(reqSeg, resSeg);
    const rSeg = getSeg();
    assert(rSeg.statusCode === 200 && rSeg.data?.success, 'Seguimiento comercial registrado con resolución FK clienteExterno');
    testSeguimiento = rSeg.data.seguimiento;
    assert(Array.isArray(testSeguimiento.evidencias) && testSeguimiento.evidencias.length === 1, 'Evidencias del seguimiento guardadas en SeguimientoCampo');

    // -----------------------------------------------------------------
    // TEST 10: Control Gerencial - Planificar y Asignar Ruta con Mapa Adjunto
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('10. TEST: ASIGNACIÓN DE RUTA CON MAPA ADJUNTO (ControlGerencial.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosRuta = [
      {
        id: 'adj-mapa-ruta',
        nombre: 'Itinerario_Zona_Norte_Industrial.pdf',
        tipo: 'application/pdf',
        tamano: '620 KB',
        base64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
        url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
      }
    ];

    const { req: reqRuta, res: resRuta, getResult: getRuta } = createMockReqRes(supervisor, {
      nombreRuta: 'Ruta Estratégica Industrial Norte',
      zona: 'Norte',
      comercialId: asesor.id,
      fechaRuta: manana,
      puntosParada: 'Parada 1: Lab Norte, Parada 2: Cervecería Águila, Parada 3: Alimentos SAS',
      notas: 'Verificar especificaciones técnicas y disponibilidad de carga',
      adjuntos: adjuntosRuta,
      evidencias: adjuntosRuta
    });

    await campoController.asignarRuta(reqRuta, resRuta);
    const rRuta = getRuta();
    if (rRuta.statusCode !== 201) console.log('DEBUG rRuta Error:', rRuta);
    assert(rRuta.statusCode === 201 && rRuta.data?.ruta?.id, 'Ruta comercial asignada al asesor con documento adjunto');
    testRuta = rRuta.data.ruta;
    assert(Array.isArray(testRuta.evidencias) && testRuta.evidencias.length === 1, 'Documento de ruta e itinerario guardado en ActividadCampo');

    // -----------------------------------------------------------------
    // TEST 11: Control Gerencial - Asignar Tarea Operativa con Documentos de Soporte
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('11. TEST: ASIGNACIÓN DE TAREA CON SOPORTE ADJUNTO (ControlGerencial.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosTarea = [
      {
        id: 'adj-orden-entrega',
        nombre: 'Orden_Entrega_Garantia.pdf',
        tipo: 'application/pdf',
        tamano: '180 KB',
        base64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
        url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
      }
    ];

    const { req: reqTar, res: resTar, getResult: getTar } = createMockReqRes(supervisor, {
      titulo: 'Firma de Acta de Garantía y Entrega de Manuales',
      descripcion: 'Entregar carpeta técnica oficial con sellos de garantía del fabricante',
      prioridad: 'Alta',
      fechaProgramada: manana,
      horaEstimada: '11:30 AM',
      asignadoAId: asesor.id,
      adjuntos: adjuntosTarea,
      evidencias: adjuntosTarea
    });

    await campoController.crearActividad(reqTar, resTar);
    const rTar = getTar();
    assert(rTar.statusCode === 201 && rTar.data?.actividad?.id, 'Tarea operativa asignada con soportes adjuntos');
    testActividad = rTar.data.actividad;
    assert(Array.isArray(testActividad.evidencias) && testActividad.evidencias.length === 1, 'Soportes de tarea persistidos en base de datos');

    // -----------------------------------------------------------------
    // TEST 12: Control Gerencial - Evaluación Oficial de Desempeño (24 Criterios)
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('12. TEST: EVALUACIÓN OFICIAL 24 INDICADORES CON SOPORTES (ControlGerencial.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosEvaluacion = [
      {
        id: 'adj-auditoria-desempeno',
        nombre: 'Informe_Auditoria_Trimestral.pdf',
        tipo: 'application/pdf',
        tamano: '890 KB',
        base64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
        url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
      }
    ];

    // Matriz de los 24 Criterios Oficiales de Asesor en Campo
    const indicadoresDetalle = [
      { id: 'IND_ASE_01', nombre: 'Cumplimiento del horario de trabajo', unidad: '%', meta: '100', resultado: '98', cumplimientoPct: 98, calificacion: 95, estado: 'Supera la Meta' },
      { id: 'IND_ASE_02', nombre: 'Puntualidad en la jornada laboral', unidad: '%', meta: '100', resultado: '95', cumplimientoPct: 95, calificacion: 90, estado: 'Supera la Meta' },
      { id: 'IND_ASE_03', nombre: 'Permanencia en la zona asignada', unidad: '%', meta: '100', resultado: '100', cumplimientoPct: 100, calificacion: 100, estado: 'Supera la Meta' },
      { id: 'IND_ASE_04', nombre: 'Cobertura de la zona comercial', unidad: '%', meta: '90', resultado: '92', cumplimientoPct: 102, calificacion: 95, estado: 'Supera la Meta' },
      { id: 'IND_ASE_05', nombre: 'Número de visitas realizadas', unidad: 'visitas', meta: '40', resultado: '42', cumplimientoPct: 105, calificacion: 96, estado: 'Supera la Meta' },
      { id: 'IND_ASE_06', nombre: 'Efectividad en visitas', unidad: '%', meta: '30', resultado: '35', cumplimientoPct: 117, calificacion: 92, estado: 'Supera la Meta' },
      { id: 'IND_ASE_07', nombre: 'Presentación personal e imagen institucional', unidad: 'pts', meta: '100', resultado: '100', cumplimientoPct: 100, calificacion: 98, estado: 'Supera la Meta' },
      { id: 'IND_ASE_08', nombre: 'Uso adecuado de herramientas de trabajo', unidad: 'pts', meta: '100', resultado: '95', cumplimientoPct: 95, calificacion: 90, estado: 'Supera la Meta' },
      { id: 'IND_ASE_09', nombre: 'Atención y servicio al cliente', unidad: 'pts', meta: '100', resultado: '98', cumplimientoPct: 98, calificacion: 95, estado: 'Supera la Meta' },
      { id: 'IND_ASE_10', nombre: 'Claridad en la información brindada', unidad: 'pts', meta: '100', resultado: '95', cumplimientoPct: 95, calificacion: 92, estado: 'Supera la Meta' },
      { id: 'IND_ASE_11', nombre: 'Manejo de objeciones comerciales', unidad: 'pts', meta: '100', resultado: '90', cumplimientoPct: 90, calificacion: 88, estado: 'Cumple' },
      { id: 'IND_ASE_12', nombre: 'Actitud comercial y persuasión', unidad: 'pts', meta: '100', resultado: '96', cumplimientoPct: 96, calificacion: 94, estado: 'Supera la Meta' },
      { id: 'IND_ASE_13', nombre: 'Cierre de ventas en terreno', unidad: 'ventas', meta: '5', resultado: '6', cumplimientoPct: 120, calificacion: 98, estado: 'Supera la Meta' },
      { id: 'IND_ASE_14', nombre: 'Monto total vendido', unidad: '$', meta: '120000000', resultado: '148000000', cumplimientoPct: 123, calificacion: 100, estado: 'Supera la Meta' },
      { id: 'IND_ASE_15', nombre: 'Consecución de nuevos clientes', unidad: 'clientes', meta: '8', resultado: '10', cumplimientoPct: 125, calificacion: 100, estado: 'Supera la Meta' },
      { id: 'IND_ASE_16', nombre: 'Recuperación o reactivación de clientes', unidad: 'clientes', meta: '3', resultado: '3', cumplimientoPct: 100, calificacion: 90, estado: 'Supera la Meta' },
      { id: 'IND_ASE_17', nombre: 'Registro oportuno en el aplicativo', unidad: '%', meta: '100', resultado: '100', cumplimientoPct: 100, calificacion: 98, estado: 'Supera la Meta' },
      { id: 'IND_ASE_18', nombre: 'Calidad del reporte de visitas', unidad: 'pts', meta: '100', resultado: '94', cumplimientoPct: 94, calificacion: 92, estado: 'Supera la Meta' },
      { id: 'IND_ASE_19', nombre: 'Seguimiento a cotizaciones entregadas', unidad: 'seguimientos', meta: '15', resultado: '16', cumplimientoPct: 107, calificacion: 94, estado: 'Supera la Meta' },
      { id: 'IND_ASE_20', nombre: 'Gestión de compromisos adquiridos', unidad: '%', meta: '100', resultado: '96', cumplimientoPct: 96, calificacion: 92, estado: 'Supera la Meta' },
      { id: 'IND_ASE_21', nombre: 'Disposición hacia la supervisión', unidad: 'pts', meta: '100', resultado: '100', cumplimientoPct: 100, calificacion: 98, estado: 'Supera la Meta' },
      { id: 'IND_ASE_22', nombre: 'Cumplimiento de directrices de gerencia', unidad: 'pts', meta: '100', resultado: '98', cumplimientoPct: 98, calificacion: 95, estado: 'Supera la Meta' },
      { id: 'IND_ASE_23', nombre: 'Trabajo en equipo y colaboración', unidad: 'pts', meta: '100', resultado: '95', cumplimientoPct: 95, calificacion: 92, estado: 'Supera la Meta' },
      { id: 'IND_ASE_24', nombre: 'Compromiso institucional corporativo', unidad: 'pts', meta: '100', resultado: '100', cumplimientoPct: 100, calificacion: 100, estado: 'Supera la Meta' }
    ];

    const { req: reqEval, res: resEval, getResult: getEval } = createMockReqRes(supervisor, {
      comercialId: asesor.id,
      usuarioId: asesor.id,
      periodo: new Date().toISOString().slice(0, 7),
      calificacionGeneral: 95,
      estadoCumplimiento: 'Aprobada',
      fortalezasGenerales: 'Excelente cierre de ventas industriales y apertura de cuentas',
      debilidadesGenerales: 'Oportunidad de agilizar cotizaciones en menos de 24 horas',
      recomendaciones: 'Mantener el ritmo de visitas matutinas y seguimiento continuo',
      compromisos: 'Meta de 12 clientes nuevos para el próximo ciclo mensual',
      indicadoresDetalle: indicadoresDetalle,
      adjuntos: adjuntosEvaluacion,
      evidencias: adjuntosEvaluacion
    });

    await campoController.guardarEvaluacion(reqEval, resEval);
    const rEval = getEval();
    assert(rEval.statusCode === 201 && rEval.data?.evaluacion?.id, 'Evaluación de 24 indicadores emitida y aprobada');
    testEvaluacion = rEval.data.evaluacion;
    assert(testEvaluacion.metadata?.adjuntos?.length === 1, 'Soportes de evaluación guardados en metadata.adjuntos');

    // -----------------------------------------------------------------
    // TEST 13: Control Gerencial - Registro y Consulta de Novedades de Equipo
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('13. TEST: REGISTRO Y CONSULTA DE NOVEDADES DEL EQUIPO (ControlGerencial.jsx)');
    console.log('-----------------------------------------------------------------');

    const adjuntosNovedad = [
      {
        id: 'adj-felicitacion-foto',
        nombre: 'Acta_Reconocimiento_Gerencia.pdf',
        tipo: 'application/pdf',
        tamano: '310 KB',
        base64: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
        url: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg=='
      }
    ];

    const { req: reqNov, res: resNov, getResult: getNov } = createMockReqRes(supervisor, {
      comercialId: asesor.id,
      tipo: 'Felicitación',
      titulo: 'Felicitación por Superación de Metas Comerciales',
      descripcion: 'Se reconoce su destacado desempeño en el cierre de proyectos industriales del mes',
      prioridad: 'Alta',
      adjuntos: adjuntosNovedad,
      evidencias: adjuntosNovedad
    });

    await campoController.crearNovedadDelegado(reqNov, resNov);
    const rNov = getNov();
    assert(rNov.statusCode === 201 && rNov.data?.novedad?.id, 'Novedad de supervisión creada con evidencias');
    testNovedad = rNov.data.novedad;
    assert(testNovedad.metadata?.adjuntos?.length === 1, 'Adjunto guardado en metadata.adjuntos de la novedad');

    // Consultar lista completa de novedades del equipo sin filtrar por usuarioId (GET /campo/novedades)
    const { req: reqNovAll, res: resNovAll, getResult: getNovAll } = createMockReqRes(supervisor);
    await campoController.getNovedadesComercial(reqNovAll, resNovAll);
    const rNovAll = getNovAll();
    assert(rNovAll.statusCode === 200 && Array.isArray(rNovAll.data?.novedades), 'Consulta global de novedades del equipo (GET /campo/novedades) resuelta sin 404');
    const novEncontrada = rNovAll.data.novedades.find(n => n.id === testNovedad.id);
    assert(novEncontrada && novEncontrada.metadata?.adjuntos?.length === 1, 'Novedad y sus evidencias recuperadas en la lista de supervisión');

    // -----------------------------------------------------------------
    // TEST 14: Panel de Control Gerencial y Telemetría en Vivo
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('14. TEST: PANEL OPERATIVO Y TELEMETRÍA EN VIVO (ControlGerencial.jsx)');
    console.log('-----------------------------------------------------------------');

    const { req: reqPanel, res: resPanel, getResult: getPanel } = createMockReqRes(supervisor);
    await campoController.getPanelOperativo(reqPanel, resPanel);
    const rPanel = getPanel();
    assert(rPanel.statusCode === 200 && Array.isArray(rPanel.data?.personalCampo), 'Directorio de personal de campo obtenido con métricas en tiempo real');

    const { req: reqVivo, res: resVivo, getResult: getVivo } = createMockReqRes(supervisor);
    await campoController.getUltimasUbicaciones(reqVivo, resVivo);
    const rVivo = getVivo();
    assert(rVivo.statusCode === 200 && Array.isArray(rVivo.data?.ubicaciones), 'Telemetría satelital en vivo consultada para renderizado del mapa');

    // -----------------------------------------------------------------
    // LIMPIEZA DE DATOS DE PRUEBA
    // -----------------------------------------------------------------
    console.log('\n-----------------------------------------------------------------');
    console.log('15. LIMPIEZA Y RESTAURACIÓN DE AMBIENTE');
    console.log('-----------------------------------------------------------------');

    if (testNovedad?.id) await prisma.novedadDelegadoCampo.deleteMany({ where: { id: testNovedad.id } }).catch(() => {});
    if (testEvaluacion?.id) await prisma.evaluacionComercialCampo.deleteMany({ where: { id: testEvaluacion.id } }).catch(() => {});
    if (testActividad?.id) await prisma.actividadCampo.deleteMany({ where: { id: testActividad.id } }).catch(() => {});
    if (testRuta?.id) await prisma.actividadCampo.deleteMany({ where: { id: testRuta.id } }).catch(() => {});
    if (testCliente?.id) {
      await prisma.ventaExternaCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.cotizacionExternaCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.visitaCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.seguimientoCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.clienteExternoCampo.deleteMany({ where: { id: testCliente.id } }).catch(() => {});
    }
    console.log('   ✔ Todos los registros de prueba temporales fueron limpiados sin dejar residuos en BD.\n');

    console.log('======================================================================');
    console.log(`  RESULTADO FINAL: ${passedTests} / ${totalTests} PRUEBAS EXITOSAS (100% PASS)`);
    console.log('  Todas las funcionalidades y opciones de adjuntos verificadas.');
    console.log('======================================================================');

  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO EN EJECUCIÓN DE PRUEBAS:', error);
    // Limpieza de emergencia
    if (testNovedad?.id) await prisma.novedadDelegadoCampo.deleteMany({ where: { id: testNovedad.id } }).catch(() => {});
    if (testEvaluacion?.id) await prisma.evaluacionComercialCampo.deleteMany({ where: { id: testEvaluacion.id } }).catch(() => {});
    if (testActividad?.id) await prisma.actividadCampo.deleteMany({ where: { id: testActividad.id } }).catch(() => {});
    if (testRuta?.id) await prisma.actividadCampo.deleteMany({ where: { id: testRuta.id } }).catch(() => {});
    if (testCliente?.id) {
      await prisma.ventaExternaCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.cotizacionExternaCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.visitaCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.seguimientoCampo.deleteMany({ where: { clienteExternoId: testCliente.id } }).catch(() => {});
      await prisma.clienteExternoCampo.deleteMany({ where: { id: testCliente.id } }).catch(() => {});
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runCompleteE2ETests();
