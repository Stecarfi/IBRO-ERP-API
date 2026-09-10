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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 12: Evaluación de Desempeño...');
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Obtener estado inicial y usuarios
  console.log('\n--- PASO 1: GET /api/db ---');
  const getRes1 = await fetch(`${API_BASE}/db`, { headers });
  if (!getRes1.ok) throw new Error(`Error en GET /api/db: ${getRes1.status} ${await getRes1.text()}`);
  const db1 = await getRes1.json();

  console.log(`Usuarios en DB: ${db1.users?.length || 0}`);
  console.log(`Evaluaciones iniciales en DB: ${db1.evaluaciones?.length || 0}`);

  const testEvaluador = db1.users?.[0];
  const testEvaluado = db1.users?.[1] || db1.users?.[0];
  if (!testEvaluador || !testEvaluado) throw new Error('Se requieren usuarios en DB para ejecutar la prueba');

  console.log(`Evaluador: ${testEvaluador.nombre} (${testEvaluador.user}, id: ${testEvaluador.id})`);
  console.log(`Evaluado: ${testEvaluado.nombre} (${testEvaluado.user}, id: ${testEvaluado.id})`);

  const testEvalId = 'test_eval_' + Date.now();
  const hoyIso = new Date().toISOString();

  // 2. Crear Evaluación de Desempeño
  console.log('\n--- PASO 2: POST /api/db/sync Registro de Evaluación ---');
  const scoresObj = { metas: 5, ppto: 4, atencion: 5, quejas: 4, resp: 5, ventas: 4 };
  const obsPayload = JSON.stringify({
    fortalezas: 'Excelente orientación al cliente y liderazgo técnico.',
    oportunidades: 'Mejorar tiempos de respuesta en cotizaciones complejas.',
    plan: 'Capacitación en software de cálculo térmico.',
    comentarios: 'Desempeño general sobresaliente en el trimestre.'
  });

  const newEvalPayload = {
    id: testEvalId,
    fecha: hoyIso,
    evaluadorId: testEvaluador.id,
    evaluador: testEvaluador.user,
    evaluadoId: testEvaluado.id,
    evaluado: testEvaluado.user,
    evaluadoNombre: `${testEvaluado.nombre} ${testEvaluado.apellido || ''}`.trim(),
    empleado: testEvaluado.user,
    tipo: 'Evaluación',
    obs: obsPayload,
    metajobs: 5,
    asistencia: 4,
    objetivos: 5,
    promedio: 4.5,
    scores: scoresObj
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        evaluaciones: {
          upserted: [newEvalPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync creación evaluación: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Validar Persistencia y Mapeo en Supabase
  console.log('\n--- PASO 3: Validar persistencia y mapeo en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedEval = db2.evaluaciones?.find(ev => ev.id === testEvalId);

  if (!persistedEval) {
    throw new Error(`La evaluación ${testEvalId} no fue encontrada en GET /api/db`);
  }
  console.log('Evaluación persistida correctamente:', {
    id: persistedEval.id,
    evaluadorId: persistedEval.evaluadorId,
    evaluador: persistedEval.evaluador,
    evaluadoId: persistedEval.evaluadoId,
    evaluado: persistedEval.evaluado,
    evaluadoNombre: persistedEval.evaluadoNombre,
    empleado: persistedEval.empleado,
    tipo: persistedEval.tipo,
    promedio: persistedEval.promedio,
    scores: persistedEval.scores
  });

  if (persistedEval.evaluadorId !== testEvaluador.id) {
    throw new Error(`evaluadorId no coincide: esperado ${testEvaluador.id}, obtenido ${persistedEval.evaluadorId}`);
  }
  if (persistedEval.evaluadoId !== testEvaluado.id) {
    throw new Error(`evaluadoId no coincide: esperado ${testEvaluado.id}, obtenido ${persistedEval.evaluadoId}`);
  }
  if (persistedEval.promedio !== 4.5) {
    throw new Error(`promedio no coincide: esperado 4.5, obtenido ${persistedEval.promedio}`);
  }

  // 4. Actualizar Evaluación
  console.log('\n--- PASO 4: Actualización de Evaluación (Ajuste de promedio y notas) ---');
  const updatePayload = {
    ...persistedEval,
    promedio: 4.8,
    scores: { ...scoresObj, metas: 5, ppto: 5 },
    obs: JSON.stringify({
      fortalezas: 'Excelente orientación al cliente y liderazgo técnico - Nivel Avanzado.',
      oportunidades: 'En seguimiento.',
      plan: 'Certificación completada.',
      comentarios: 'Meta superada satisfactoriamente.'
    })
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        evaluaciones: {
          upserted: [updatePayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes2.ok) throw new Error(`Fallo sync actualización evaluación: ${syncRes2.status} ${await syncRes2.text()}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const updatedEval = db3.evaluaciones?.find(ev => ev.id === testEvalId);

  if (!updatedEval || updatedEval.promedio !== 4.8) {
    throw new Error(`Fallo en persistencia de actualización: ${JSON.stringify(updatedEval)}`);
  }
  console.log('Evaluación actualizada con éxito:', {
    id: updatedEval.id,
    promedio: updatedEval.promedio,
    scores: updatedEval.scores
  });

  // 5. Prueba de Autoevaluación y Resolución Implícita de Claves Foráneas
  console.log('\n--- PASO 5: Prueba de Autoevaluación con resolución automática por username ---');
  const testAutoId = 'test_eval_auto_' + Date.now();
  const autoPayload = {
    id: testAutoId,
    fecha: hoyIso,
    empleado: testEvaluado.user,
    tipo: 'Autoevaluación',
    promedio: 5.0,
    scores: { metas: 5, ppto: 5, atencion: 5, quejas: 5, resp: 5, ventas: 5 }
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        evaluaciones: {
          upserted: [autoPayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes3.ok) throw new Error(`Fallo sync autoevaluación: ${syncRes3.status} ${await syncRes3.text()}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const autoEval = db4.evaluaciones?.find(ev => ev.id === testAutoId);

  if (!autoEval || autoEval.evaluadoId !== testEvaluado.id) {
    throw new Error(`Resolución implícita de evaluadoId falló: ${JSON.stringify(autoEval)}`);
  }
  console.log('✅ Autoevaluación persistida con resolución implícita exitosa:', {
    id: autoEval.id,
    evaluadoId: autoEval.evaluadoId,
    evaluado: autoEval.evaluado,
    tipo: autoEval.tipo
  });

  // 6. Eliminación de Registros de Prueba
  console.log('\n--- PASO 6: Eliminación limpia y verificación de 0 huérfanos ---');
  const syncRes4 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        evaluaciones: {
          upserted: [],
          deleted: [testEvalId, testAutoId]
        }
      }
    })
  });
  if (!syncRes4.ok) throw new Error(`Fallo eliminación evaluaciones: ${syncRes4.status} ${await syncRes4.text()}`);

  const getRes5 = await fetch(`${API_BASE}/db`, { headers });
  const db5 = await getRes5.json();
  const remaining1 = db5.evaluaciones?.find(ev => ev.id === testEvalId);
  const remaining2 = db5.evaluaciones?.find(ev => ev.id === testAutoId);

  if (remaining1 || remaining2) {
    throw new Error('Las evaluaciones no fueron eliminadas correctamente de la base de datos');
  }
  console.log('✅ Evaluaciones eliminadas limpiamente sin dejar registros huérfanos.');

  console.log('\n🎉 ¡Módulo 12 Evaluación de Desempeño validado al 100% en PostgreSQL Supabase!');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN EL TEST DE EVALUACIONES:', err);
  process.exit(1);
});
