const prisma = require('./src/prisma');
const geofenceService = require('./src/services/campo/geofence.service');
const jornadaService = require('./src/services/campo/jornada.service');
const trackingService = require('./src/services/campo/tracking.service');
const visitasService = require('./src/services/campo/visitas.service');
const productividadService = require('./src/services/campo/productividad.service');

async function runTests() {
  console.log('--- INICIANDO SUITE DE PRUEBAS DE OPERACIONES DE CAMPO ---');

  // Test 1: Haversine Geodesic Math Test
  console.log('1. Test Geofence & Haversine Distance...');
  // Barranquilla Plaza de la Paz (10.9904, -74.7885) to Estadio Romelio Martínez (10.9985, -74.8055) ~2.07 km
  const distMetros = geofenceService.calcularDistanciaMetros(10.9904, -74.7885, 10.9985, -74.8055);
  console.log(`   Distancia calculada: ${distMetros} metros (Esperado ~2070m)`);
  if (distMetros > 1900 && distMetros < 2200) {
    console.log('   ✔ Haversine: APROBADO');
  } else {
    throw new Error(`Fallo en cálculo Haversine: ${distMetros}`);
  }

  // Test 2: Point in Polygon (Polygonal Geofence)
  console.log('2. Test Point-in-Polygon (Geocerca Poligonal)...');
  const poligono = [
    [10.9800, -74.8000],
    [10.9800, -74.7700],
    [11.0100, -74.7700],
    [11.0100, -74.8000]
  ];
  const puntoDentro = geofenceService.puntoEnPoligono(10.9950, -74.7850, poligono);
  const puntoFuera = geofenceService.puntoEnPoligono(10.9500, -74.8200, poligono);
  if (puntoDentro === true && puntoFuera === false) {
    console.log('   ✔ Point-in-Polygon: APROBADO');
  } else {
    throw new Error('Fallo en cálculo de punto en polígono');
  }

  // Test 3: User Retrieval & Shift Lifecycle
  console.log('3. Test Ciclo de Vida de Jornada Laboral...');
  const testUser = await prisma.user.findFirst();
  if (!testUser) {
    throw new Error('No hay usuarios en la base de datos para probar');
  }

  const resInicio = await jornadaService.iniciarJornada(testUser.id, {
    lat: 10.9900,
    lng: -74.7800,
    precision: 10,
    bateriaInicio: 95
  });

  if (!resInicio.success && resInicio.error !== 'Ya tienes una jornada activa en curso') {
    throw new Error(`Fallo al iniciar jornada: ${resInicio.error}`);
  }

  const jornadaId = resInicio.jornada ? resInicio.jornada.id : (await jornadaService.getJornadaActiva(testUser.id))?.id;
  console.log(`   Jornada activa ID: ${jornadaId}`);
  console.log('   ✔ Inicio de Jornada: APROBADO');

  // Test 4: Tracking Breadcrumb Ingestion
  console.log('4. Test Ingesta de Telemetría Satelital...');
  const ping = await trackingService.registrarPing(testUser.id, {
    lat: 10.9910,
    lng: -74.7810,
    precision: 8,
    velocidad: 25,
    bateria: 92,
    jornadaId
  });
  if (ping && ping.lat === 10.9910) {
    console.log('   ✔ Telemetría y Breadcrumb: APROBADO');
  } else {
    throw new Error('Fallo al registrar ping de telemetría');
  }

  // Test 5: Prospect Creation
  console.log('5. Test Registro Rápido de Prospecto en Campo...');
  const testProspecto = await visitasService.crearProspecto(testUser.id, {
    nombreComercial: 'Ferretería Industrial Test QA',
    contactoNombre: 'Carlos Mendoza',
    contactoTelefono: '3001234567',
    direccion: 'Calle 72 # 45-10',
    ciudad: 'Barranquilla',
    lat: 10.9920,
    lng: -74.7820,
    presupuestoEst: 15000000
  });

  if (testProspecto && testProspecto.codigo.startsWith('PROS-')) {
    console.log(`   ✔ Prospecto creado: ${testProspecto.codigo} - APROBADO`);
  } else {
    throw new Error('Fallo creando prospecto');
  }

  // Test 6: Visit Scheduling & Geoverified Check-In
  console.log('6. Test Visita y Check-In Geoverificado...');
  const visita = await visitasService.programarVisita(testUser.id, {
    prospectoId: testProspecto.id,
    fechaProgramada: new Date(),
    horaEstimada: '10:00'
  });

  const checkInRes = await visitasService.checkIn(testUser.id, {
    visitaId: visita.id,
    lat: 10.9921,
    lng: -74.7821,
    precision: 5
  });

  console.log(`   Distancia al destino: ${checkInRes.distanciaMetros}m`);
  if (checkInRes.success && checkInRes.visita.estado === 'En Curso') {
    console.log('   ✔ Check-In Geoverificado: APROBADO');
  } else {
    throw new Error('Fallo en Check-In geoverificado');
  }

  // Test 7: Visit Check-Out with duration computation
  console.log('7. Test Check-Out de Visita...');
  const checkOutRes = await visitasService.checkOut(testUser.id, {
    visitaId: visita.id,
    lat: 10.9921,
    lng: -74.7821,
    resultadoResumen: 'Cliente interesado en cotización de 3 aires acondicionados',
    compromisos: 'Enviar propuesta formal mañana temprano'
  });

  if (checkOutRes.success && checkOutRes.visita.estado === 'Realizada') {
    console.log(`   Duración computada: ${checkOutRes.visita.duracionMin} min`);
    console.log('   ✔ Check-Out de Visita: APROBADO');
  } else {
    throw new Error('Fallo en Check-Out');
  }

  // Test 8: Productivity Engine Analytics
  console.log('8. Test Motor de Productividad y KPIs...');
  const kpis = await productividadService.getDashboardProductividad();
  console.log(`   IEO Calculado: ${kpis.indicadoresEficiencia.ieoPorcentaje}%`);
  console.log(`   Visitas Realizadas: ${kpis.resumenComercial.visitasRealizadas}`);
  console.log('   ✔ Motor de Productividad: APROBADO');

  // Limpieza de registros de prueba
  console.log('9. Limpiando datos de prueba...');
  await prisma.visitaCampo.deleteMany({ where: { id: visita.id } });
  await prisma.prospectoCampo.deleteMany({ where: { id: testProspecto.id } });
  await prisma.rastreoUbicacion.deleteMany({ where: { id: ping.id } });
  if (resInicio.success && resInicio.jornada) {
    await prisma.jornadaLaboral.deleteMany({ where: { id: resInicio.jornada.id } });
  }

  console.log('--- TODAS LAS PRUEBAS DE OPERACIONES DE CAMPO PASARON CON ÉXITO (8/8) ---');
}

runTests()
  .catch(err => {
    console.error('❌ ERROR EN PRUEBAS:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
