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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 11: Solicitudes Laborales...');
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Obtener estado inicial
  console.log('\n--- PASO 1: GET /api/db ---');
  const getRes1 = await fetch(`${API_BASE}/db`, { headers });
  if (!getRes1.ok) throw new Error(`Error en GET /api/db: ${getRes1.status} ${await getRes1.text()}`);
  const db1 = await getRes1.json();

  console.log(`Usuarios en DB: ${db1.users?.length || 0}`);
  console.log(`Solicitudes iniciales en DB: ${db1.solicitudes?.length || 0}`);

  const testUser = db1.users?.[0];
  if (!testUser) throw new Error('No hay usuarios en la base de datos para asociar a la solicitud');
  console.log(`Usuario asesor de prueba: ${testUser.nombre} (${testUser.user}, id: ${testUser.id})`);

  const testSolId = 'test_sol_' + Date.now();
  const hoyIso = new Date().toISOString();
  const fechaUsoIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  // 2. Radicar Solicitud Laboral
  console.log('\n--- PASO 2: POST /api/db/sync Radicación de Solicitud ---');
  const newSolPayload = {
    id: testSolId,
    asesor: testUser.user,
    asesorId: testUser.id,
    nombreAsesor: `${testUser.nombre} ${testUser.apellido || ''}`.trim(),
    tipo: 'Vacaciones Anuales',
    fecha: fechaUsoIso,
    detalle: 'Solicitud de periodo vacacional correspondiente al periodo 2025-2026.',
    comentario: '',
    evidencia: 'carta_solicitud.pdf',
    fileUrl: 'https://storage.ibrosas.com/docs/carta_solicitud.pdf',
    estado: 'Pendiente',
    fechaRadicado: hoyIso
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        solicitudes: {
          upserted: [newSolPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync creación solicitud: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Validar Persistencia en Supabase
  console.log('\n--- PASO 3: Validar persistencia y mapeo en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedSol = db2.solicitudes?.find(s => s.id === testSolId);

  if (!persistedSol) {
    throw new Error(`La solicitud ${testSolId} no fue encontrada en GET /api/db`);
  }
  console.log('Solicitud persistida y mapeada correctamente:', {
    id: persistedSol.id,
    asesorId: persistedSol.asesorId,
    asesor: persistedSol.asesor,
    nombreAsesor: persistedSol.nombreAsesor,
    tipo: persistedSol.tipo,
    estado: persistedSol.estado,
    fechaRadicado: persistedSol.fechaRadicado
  });

  if (persistedSol.asesorId !== testUser.id) {
    throw new Error(`asesorId no coincide: esperado ${testUser.id}, obtenido ${persistedSol.asesorId}`);
  }
  if (persistedSol.asesor !== testUser.user) {
    throw new Error(`asesor no coincide: esperado ${testUser.user}, obtenido ${persistedSol.asesor}`);
  }

  // 4. Actualización / Resolución Administrativa
  console.log('\n--- PASO 4: Resolución de Solicitud (Aprobación y comentario) ---');
  const updatePayload = {
    ...persistedSol,
    estado: 'Aprobado',
    comentario: 'Aprobado por Gerencia y Talento Humano. Programado para nómina.'
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        solicitudes: {
          upserted: [updatePayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes2.ok) throw new Error(`Fallo en sync actualización: ${syncRes2.status} ${await syncRes2.text()}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const updatedSol = db3.solicitudes?.find(s => s.id === testSolId);

  if (!updatedSol || updatedSol.estado !== 'Aprobado' || !updatedSol.comentario.includes('Aprobado')) {
    throw new Error(`Fallo en persistencia de resolución: ${JSON.stringify(updatedSol)}`);
  }
  console.log('Resolución persistida exitosamente:', {
    id: updatedSol.id,
    estado: updatedSol.estado,
    comentario: updatedSol.comentario
  });

  // 5. Prueba de Robustez de Clave Foránea: Envío sin asesorId explícito (solo asesor username)
  console.log('\n--- PASO 5: Prueba de resolución automática de asesorId a partir de username ---');
  const testSolId2 = 'test_sol_fallback_' + Date.now();
  const fallbackPayload = {
    id: testSolId2,
    asesor: testUser.user,
    tipo: 'Permiso de Salud',
    fecha: hoyIso,
    detalle: 'Cita médica con especialista.',
    estado: 'Pendiente'
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        solicitudes: {
          upserted: [fallbackPayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes3.ok) throw new Error(`Fallo en sync con asesorId implícito: ${syncRes3.status} ${await syncRes3.text()}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const fallbackSol = db4.solicitudes?.find(s => s.id === testSolId2);
  if (!fallbackSol || fallbackSol.asesorId !== testUser.id) {
    throw new Error(`Resolución implícita de asesorId falló: ${JSON.stringify(fallbackSol)}`);
  }
  console.log('✅ Resolución implícita de asesorId funcionó a la perfección:', {
    id: fallbackSol.id,
    asesor: fallbackSol.asesor,
    asesorId: fallbackSol.asesorId
  });

  // 6. Eliminación de Solicitudes de Prueba
  console.log('\n--- PASO 6: Eliminación limpia y verificación de 0 huérfanos ---');
  const syncRes4 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        solicitudes: {
          upserted: [],
          deleted: [testSolId, testSolId2]
        }
      }
    })
  });
  if (!syncRes4.ok) throw new Error(`Fallo en eliminación de solicitudes: ${syncRes4.status} ${await syncRes4.text()}`);

  const getRes5 = await fetch(`${API_BASE}/db`, { headers });
  const db5 = await getRes5.json();
  const remaining1 = db5.solicitudes?.find(s => s.id === testSolId);
  const remaining2 = db5.solicitudes?.find(s => s.id === testSolId2);

  if (remaining1 || remaining2) {
    throw new Error('Las solicitudes no fueron eliminadas correctamente de PostgreSQL');
  }
  console.log('✅ Solicitudes eliminadas limpiamente sin dejar registros huérfanos.');

  console.log('\n🎉 ¡Módulo 11 Solicitudes Laborales validado al 100% en PostgreSQL Supabase!');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN EL TEST DE SOLICITUDES LABORALES:', err);
  process.exit(1);
});
