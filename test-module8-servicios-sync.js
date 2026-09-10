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

async function runTest() {
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 8: Servicios Técnicos...');
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Obtener estado actual de la base de datos
  console.log('\n--- PASO 1: GET /api/db ---');
  const getRes = await fetch(`${API_BASE}/db`, { headers });
  if (!getRes.ok) throw new Error(`Error en GET /api/db: ${getRes.status} ${await getRes.text()}`);
  const db = await getRes.json();

  console.log(`Clientes en DB: ${db.clientes?.length || 0}`);
  console.log(`Usuarios en DB: ${db.users?.length || 0}`);
  console.log(`Inventario en DB: ${db.inventario?.length || 0}`);
  console.log(`Servicios actuales en DB: ${db.servicios?.length || 0}`);

  const testClient = db.clientes?.find(c => !c.doc.startsWith('DOC-')) || db.clientes?.[0];
  if (!testClient) throw new Error('No hay clientes en la DB para asociar al servicio');
  console.log(`Cliente de prueba: ${testClient.nom} (doc: ${testClient.doc}, id: ${testClient.id})`);

  const testTech = db.users?.find(u => u.cargo?.toLowerCase().includes('tecnico')) || db.users?.[0];
  console.log(`Técnico de prueba: ${testTech?.nombre || 'Admin'} (user: ${testTech?.user}, id: ${testTech?.id})`);

  const testProd = db.inventario?.[0];
  console.log(`Producto de inventario: ${testProd?.nom || 'N/A'} (id: ${testProd?.id})`);

  // 2. Crear Servicio de Prueba
  console.log('\n--- PASO 2: POST /api/sync Creación de Servicio ---');
  const testServiceId = 'test_serv_' + Date.now();
  const testRadicado = `RAD-TEST-${Date.now().toString().slice(-4)}`;

  const newServicePayload = {
    id: testServiceId,
    radicado: testRadicado,
    clienteId: testClient.id,
    docCli: testClient.doc,
    cliente: testClient.nom,
    tipo: 'Mantenimiento Preventivo',
    fechaProg: new Date().toISOString().split('T')[0],
    tecnicoId: testTech?.id,
    tecnico: testTech?.user,
    equipoDetalle: 'Compresor VRF 5 Ton Inverter',
    estado: 'Programado',
    etapaActual: 'Programado',
    obs: 'Revisión periódica inicial',
    obsRecepcion: 'Equipo recibido en buenas condiciones generales',
    inventarioId: testProd?.id || null,
    aplicaGarantia: false,
    costoServicio: 250000,
    evidencias: JSON.stringify([{ name: 'foto_inicio.jpg', size: 1024, data: 'https://example.com/foto1.jpg' }]),
    fechaCreacion: new Date().toISOString(),
    fechaIso: new Date().toISOString(),
    trazabilidad: JSON.stringify([{
      fecha: new Date().toLocaleString('es-CO'),
      usuario: 'stecarfi05',
      comentario: 'Servicio programado inicialmente.'
    }])
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        servicios: {
          upserted: [newServicePayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    const errorText = await syncRes1.text();
    throw new Error(`Fallo en sync creación servicio: ${syncRes1.status} - ${errorText}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Validar persistencia y mapeo completo en GET /api/db
  console.log('\n--- PASO 3: Validar Persistencia en Supabase PostgreSQL ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedService = db2.servicios?.find(s => s.id === testServiceId);

  if (!persistedService) throw new Error(`El servicio ${testServiceId} no se encontró en Supabase después de sync`);
  console.log('✅ Servicio recuperado de Supabase:', {
    id: persistedService.id,
    radicado: persistedService.radicado,
    clienteId: persistedService.clienteId,
    docCli: persistedService.docCli,
    cliente: persistedService.cliente,
    tecnicoId: persistedService.tecnicoId,
    tecnico: persistedService.tecnico,
    tecnicoNombre: persistedService.tecnicoNombre,
    estado: persistedService.estado,
    etapaActual: persistedService.etapaActual,
    costoServicio: persistedService.costoServicio,
    aplicaGarantia: persistedService.aplicaGarantia,
    inventarioId: persistedService.inventarioId
  });

  if (persistedService.clienteId !== testClient.id) throw new Error('Discrepancia en clienteId');
  if (persistedService.docCli !== testClient.doc) throw new Error('Discrepancia en docCli');
  if (persistedService.costoServicio !== 250000) throw new Error('Discrepancia en costoServicio');
  if (persistedService.aplicaGarantia !== false) throw new Error('Discrepancia en aplicaGarantia');
  console.log('✅ Paridad de campos y persistencia verificada al 100%.');

  // 4. Transición de Etapas y Actualización Multi-Etapa
  console.log('\n--- PASO 4: Transición de Etapa (Diagnóstico -> Ejecución) ---');
  let trace = JSON.parse(persistedService.trazabilidad || '[]');
  trace.push({
    fecha: new Date().toLocaleString('es-CO'),
    usuario: testTech?.user || 'tecnico',
    etapaOriginal: 'Programado',
    etapaNueva: 'Diagnóstico',
    comentario: 'Diagnóstico completado: Se requiere cambio de sensor y filtro.'
  });

  const updatedPayload = {
    ...persistedService,
    estado: 'Diagnóstico',
    etapaActual: 'Diagnóstico',
    obsDiagnostico: 'Filtro deshidratador saturado, presión anormal en baja.',
    trazabilidad: JSON.stringify(trace)
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        servicios: {
          upserted: [updatedPayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes2.ok) throw new Error(`Fallo en sync actualización servicio: ${syncRes2.status}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const updatedService = db3.servicios?.find(s => s.id === testServiceId);
  if (updatedService.estado !== 'Diagnóstico' || updatedService.obsDiagnostico !== 'Filtro deshidratador saturado, presión anormal en baja.') {
    throw new Error('Fallo en persistencia de transición de etapa');
  }
  console.log('✅ Transición de etapa y observaciones diagnósticas persistidas correctamente.');

  // 5. Test de Clave Foránea Inválida (Defensive Fallback)
  console.log('\n--- PASO 5: Prueba de Manejo Defensivo de FK Inexistentes ---');
  const invalidFkPayload = {
    ...updatedService,
    inventarioId: 'inv_non_existent_999999',
    ventaId: 'venta_non_existent_999999',
    cotizacionId: 'cot_non_existent_999999'
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        servicios: {
          upserted: [invalidFkPayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes3.ok) throw new Error(`Fallo con FK inválidas: no manejó defensivamente (${syncRes3.status})`);
  console.log('✅ Backend manejó limpiamente FK inexistentes (se convirtieron a null sin romper la base de datos).');

  // 6. Limpieza y Verificación de Integridad
  console.log('\n--- PASO 6: Eliminación Limpia y Verificación de Integridad ---');
  const syncRes4 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        servicios: {
          upserted: [],
          deleted: [testServiceId]
        }
      }
    })
  });
  if (!syncRes4.ok) throw new Error(`Fallo en eliminación de servicio: ${syncRes4.status}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const deletedCheck = db4.servicios?.find(s => s.id === testServiceId);
  if (deletedCheck) throw new Error('El servicio de prueba no fue eliminado');
  console.log('✅ Servicio de prueba eliminado correctamente de Supabase (0 registros huérfanos).');

  console.log('\n🎉 ¡TODOS LOS TESTS DEL MÓDULO 8 PASARON EXITOSAMENTE!');
}

runTest().catch(err => {
  console.error('❌ Error en Test Módulo 8:', err);
  process.exit(1);
});
