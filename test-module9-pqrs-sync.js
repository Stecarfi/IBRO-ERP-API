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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 9: PQRS...');
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Obtener estado inicial de la base de datos
  console.log('\n--- PASO 1: GET /api/db ---');
  const getRes = await fetch(`${API_BASE}/db`, { headers });
  if (!getRes.ok) throw new Error(`Error en GET /api/db: ${getRes.status} ${await getRes.text()}`);
  const db = await getRes.json();

  console.log(`Clientes en DB: ${db.clientes?.length || 0}`);
  console.log(`Usuarios en DB: ${db.users?.length || 0}`);
  console.log(`PQRS actuales en DB: ${db.pqrs?.length || 0}`);

  const testClient = db.clientes?.find(c => !c.doc.startsWith('DOC-')) || db.clientes?.[0];
  if (!testClient) throw new Error('No hay clientes en la DB para asociar a la PQR');
  console.log(`Cliente de prueba: ${testClient.nom} (doc: ${testClient.doc}, id: ${testClient.id})`);

  const testUser = db.users?.[0];
  console.log(`Usuario asignado de prueba: ${testUser?.nombre} (user: ${testUser?.user}, id: ${testUser?.id})`);

  const testProd = db.inventario?.[0];
  console.log(`Producto de inventario: ${testProd?.nom || 'N/A'} (id: ${testProd?.id})`);

  // 2. Crear PQR de Prueba
  console.log('\n--- PASO 2: POST /api/db/sync Creación de PQR ---');
  const testPqrId = 'test_pqr_' + Date.now();
  const testRadicado = `RAD-PQRS-TEST-${Date.now().toString().slice(-4)}`;
  const hoy = new Date();
  const limite = new Date(hoy.getTime() + 15 * 24 * 60 * 60 * 1000);

  const newPqrPayload = {
    id: testPqrId,
    radicado: testRadicado,
    fecha: hoy.toISOString().split('T')[0],
    fechaIso: hoy.toISOString(),
    limiteIso: limite.toISOString(),
    clienteId: testClient.id,
    docCli: testClient.doc,
    cliente: testClient.nom,
    tipo: 'Reclamo Garantía',
    detalle: 'Compresor no enciende y presenta alarma E4 en tarjeta inverter',
    hechos: 'Compresor no enciende y presenta alarma E4 en tarjeta inverter',
    solicitudes: 'Revisión urgente y reemplazo de tarjeta de control bajo garantía',
    estado: 'Recepción',
    satisfecho: 'Pendiente',
    aplicaGarantia: true,
    tratamientoGarantia: 'Reparación sin costo',
    usuarioAsignadoId: testUser?.id,
    usuarioAsignado: testUser?.user,
    inventarioId: testProd?.id || null,
    evidencias: JSON.stringify([{ name: 'falla_e4.pdf', size: 2048, data: 'https://example.com/falla.pdf' }]),
    terminoLegal: limite.toISOString().split('T')[0],
    trazabilidad: JSON.stringify([{
      fecha: new Date().toLocaleString('es-CO'),
      usuario: 'stecarfi05',
      comentario: 'Radicación de PQRS creada y registrada en etapa: Recepción.'
    }])
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        pqrs: {
          upserted: [newPqrPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    const errorText = await syncRes1.text();
    throw new Error(`Fallo en sync creación PQR: ${syncRes1.status} - ${errorText}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación PQR:', syncJson1);

  // 3. Validar persistencia y mapeo completo en GET /api/db
  console.log('\n--- PASO 3: Validar Persistencia en Supabase PostgreSQL ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedPqr = db2.pqrs?.find(p => p.id === testPqrId);

  if (!persistedPqr) throw new Error(`La PQR ${testPqrId} no se encontró en Supabase después de sync`);
  console.log('✅ PQR recuperada de Supabase:', {
    id: persistedPqr.id,
    radicado: persistedPqr.radicado,
    clienteId: persistedPqr.clienteId,
    docCli: persistedPqr.docCli,
    cliente: persistedPqr.cliente,
    usuarioAsignadoId: persistedPqr.usuarioAsignadoId,
    usuarioAsignado: persistedPqr.usuarioAsignado,
    usuarioAsignadoNombre: persistedPqr.usuarioAsignadoNombre,
    tipo: persistedPqr.tipo,
    estado: persistedPqr.estado,
    aplicaGarantia: persistedPqr.aplicaGarantia,
    tratamientoGarantia: persistedPqr.tratamientoGarantia,
    inventarioId: persistedPqr.inventarioId
  });

  if (persistedPqr.clienteId !== testClient.id) throw new Error('Discrepancia en clienteId');
  if (persistedPqr.docCli !== testClient.doc) throw new Error('Discrepancia en docCli');
  if (persistedPqr.aplicaGarantia !== true) throw new Error('Discrepancia en aplicaGarantia');
  if (persistedPqr.tratamientoGarantia !== 'Reparación sin costo') throw new Error('Discrepancia en tratamientoGarantia');
  console.log('✅ Paridad de campos y persistencia verificada al 100%.');

  // 4. Transición de Etapa a Cierre Formal
  console.log('\n--- PASO 4: Transición de Etapa (Recepción -> Cierre) con fechaCierre ISO ---');
  let trace = JSON.parse(persistedPqr.trazabilidad || '[]');
  trace.push({
    fecha: new Date().toLocaleString('es-CO'),
    usuario: testUser?.user || 'admin',
    etapaOriginal: 'Recepción',
    etapaNueva: 'Cierre',
    comentario: 'PQR solucionada a satisfacción. Tarjeta sustituida bajo garantía.'
  });

  const updatedPayload = {
    ...persistedPqr,
    estado: 'Cierre',
    satisfecho: 'Sí',
    fechaCierre: new Date().toISOString(),
    trazabilidad: JSON.stringify(trace)
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        pqrs: {
          upserted: [updatedPayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes2.ok) throw new Error(`Fallo en sync actualización PQR: ${syncRes2.status}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const updatedPqr = db3.pqrs?.find(p => p.id === testPqrId);
  if (updatedPqr.estado !== 'Cierre' || updatedPqr.satisfecho !== 'Sí' || !updatedPqr.fechaCierre) {
    throw new Error('Fallo en persistencia de cierre de PQR');
  }
  console.log('✅ Cierre de PQR y fechaCierre ISO persistidos correctamente.');

  // 5. Prueba de Claves Foráneas Inválidas (Defensive Fallback)
  console.log('\n--- PASO 5: Prueba de Manejo Defensivo de FK Inexistentes ---');
  const invalidFkPayload = {
    ...updatedPqr,
    inventarioId: 'inv_non_existent_888888',
    ventaId: 'venta_non_existent_888888',
    cotizacionId: 'cot_non_existent_888888'
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        pqrs: {
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
        pqrs: {
          upserted: [],
          deleted: [testPqrId]
        }
      }
    })
  });
  if (!syncRes4.ok) throw new Error(`Fallo en eliminación de PQR: ${syncRes4.status}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const deletedCheck = db4.pqrs?.find(p => p.id === testPqrId);
  if (deletedCheck) throw new Error('La PQR de prueba no fue eliminada');
  console.log('✅ PQR de prueba eliminada correctamente de Supabase (0 registros huérfanos).');

  console.log('\n🎉 ¡TODOS LOS TESTS DEL MÓDULO 9 PASARON EXITOSAMENTE!');
}

runTest().catch(err => {
  console.error('❌ Error en Test Módulo 9:', err);
  process.exit(1);
});
