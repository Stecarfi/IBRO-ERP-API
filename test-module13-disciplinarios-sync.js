const jwt = require('jsonwebtoken');

const API_BASE = 'http://127.0.0.1:3000/api';
const JWT_SECRET = 'ibro_super_secret_jwt_key_2026_!@#';

function generateToken() {
  return jwt.sign(
    { id: '1787415003498', user: 'stecarfi05', roleId: '1' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runTest() {
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 13: Procesos Disciplinarios...');
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
  console.log(`Expedientes iniciales en DB: ${db1.procesosDisciplinarios?.length || 0}`);

  const testJefe = db1.users?.[0];
  const testAsesor = db1.users?.[1] || db1.users?.[0];
  if (!testJefe || !testAsesor) throw new Error('Se requieren usuarios en DB para ejecutar la prueba');

  console.log(`Jefe/Instructor: ${testJefe.nombre} (${testJefe.user}, id: ${testJefe.id})`);
  console.log(`Colaborador involucrado: ${testAsesor.nombre} (${testAsesor.user}, id: ${testAsesor.id})`);

  const testProcId = 'test_proc_' + Date.now();
  const hoyIso = new Date().toISOString();

  // 2. Apertura de Expediente Disciplinario (Etapa 1: Apertura)
  console.log('\n--- PASO 2: POST /api/db/sync Apertura de Expediente (Etapa 1) ---');
  const newProcPayload = {
    id: testProcId,
    fecha: hoyIso,
    asesorId: testAsesor.id,
    asesor: testAsesor.user,
    asesorNombre: `${testAsesor.nombre} ${testAsesor.apellido || ''}`.trim(),
    jefeId: testJefe.id,
    jefe: testJefe.user,
    jefeNombre: `${testJefe.nombre} ${testJefe.apellido || ''}`.trim(),
    falta: 'Grave',
    obs: 'Presunto incumplimiento reiterado de protocolos de seguridad en obra civil.',
    etapa: 1,
    descargo: null,
    sancion: null,
    diasSuspension: 0,
    renunciaTerminos: false,
    timestampEtapa: hoyIso,
    lockedBy: null
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        procesosDisciplinarios: {
          upserted: [newProcPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync apertura expediente: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync apertura:', syncJson1);

  // 3. Validar Persistencia y Mapeo en Supabase
  console.log('\n--- PASO 3: Validar persistencia y mapeo en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedProc = db2.procesosDisciplinarios?.find(p => p.id === testProcId);

  if (!persistedProc) {
    throw new Error(`El expediente ${testProcId} no fue encontrado en GET /api/db`);
  }
  console.log('Expediente persistido y mapeado correctamente:', {
    id: persistedProc.id,
    asesorId: persistedProc.asesorId,
    asesor: persistedProc.asesor,
    asesorNombre: persistedProc.asesorNombre,
    jefeId: persistedProc.jefeId,
    jefe: persistedProc.jefe,
    jefeNombre: persistedProc.jefeNombre,
    falta: persistedProc.falta,
    etapa: persistedProc.etapa,
    timestampEtapa: persistedProc.timestampEtapa
  });

  if (persistedProc.asesorId !== testAsesor.id) {
    throw new Error(`asesorId no coincide: esperado ${testAsesor.id}, obtenido ${persistedProc.asesorId}`);
  }
  if (persistedProc.asesor !== testAsesor.user) {
    throw new Error(`asesor no coincide: esperado ${testAsesor.user}, obtenido ${persistedProc.asesor}`);
  }
  if (persistedProc.falta !== 'Grave') {
    throw new Error(`falta no coincide: esperado 'Grave', obtenido ${persistedProc.falta}`);
  }
  if (persistedProc.etapa !== 1) {
    throw new Error(`etapa no coincide: esperado 1, obtenido ${persistedProc.etapa}`);
  }

  // 4. Avance a Etapa 2 y Rendición de Descargos
  console.log('\n--- PASO 4: Rendición de Descargos (Etapa 2 -> 3) ---');
  const descargoTexto = 'El colaborador presenta descargos manifestando que existió fuerza mayor debidamente soportada mediante constancia médica.';
  const etapa2Payload = {
    ...persistedProc,
    descargo: descargoTexto,
    etapa: 2,
    timestampEtapa: new Date().toISOString()
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        procesosDisciplinarios: {
          upserted: [etapa2Payload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes2.ok) throw new Error(`Error en actualización de descargos: ${syncRes2.status} ${await syncRes2.text()}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const etapa2Proc = db3.procesosDisciplinarios?.find(p => p.id === testProcId);
  if (!etapa2Proc || etapa2Proc.descargo !== descargoTexto || etapa2Proc.etapa !== 2) {
    throw new Error('Descargos no se actualizaron adecuadamente en la base de datos');
  }
  console.log('Descargos persistidos exitosamente:', { etapa: etapa2Proc.etapa, descargo: etapa2Proc.descargo });

  // 5. Emisión de Resolución Administrativa (Etapa 3 / Cierre)
  console.log('\n--- PASO 5: Emisión de Resolución y Cierre de Expediente ---');
  const resolucionPayload = {
    ...etapa2Proc,
    sancion: 'Llamado de atención por escrito',
    diasSuspension: 0,
    etapa: 3,
    obs: etapa2Proc.obs + '\n\n[RESOLUCIÓN ADMINISTRATIVA]: Se archiva causal de suspensión y se amonesta preventivamente.',
    timestampEtapa: new Date().toISOString()
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        procesosDisciplinarios: {
          upserted: [resolucionPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes3.ok) throw new Error(`Error al registrar resolución: ${syncRes3.status} ${await syncRes3.text()}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const closedProc = db4.procesosDisciplinarios?.find(p => p.id === testProcId);
  if (!closedProc || closedProc.sancion !== 'Llamado de atención por escrito' || closedProc.etapa !== 3) {
    throw new Error('La resolución no persistió correctamente');
  }
  console.log('Resolución final persistida y expediente cerrado:', {
    sancion: closedProc.sancion,
    diasSuspension: closedProc.diasSuspension,
    etapa: closedProc.etapa
  });

  // 6. Prueba de resolución implícita (enviando sólo asesor username)
  console.log('\n--- PASO 6: Radicación con resolución implícita de claves foráneas ---');
  const testProcId2 = 'test_proc_implicit_' + Date.now();
  const implicitPayload = {
    id: testProcId2,
    fecha: new Date().toISOString(),
    asesor: testAsesor.user, // Sin asesorId
    jefe: testJefe.user,     // Sin jefeId
    falta: 'Leve',
    obs: 'Expediente creado pasando únicamente nombres de usuario.',
    etapa: 1,
    timestampEtapa: new Date().toISOString()
  };

  const syncRes4 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        procesosDisciplinarios: {
          upserted: [implicitPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes4.ok) throw new Error(`Error en sync implícito: ${syncRes4.status} ${await syncRes4.text()}`);

  const getRes5 = await fetch(`${API_BASE}/db`, { headers });
  const db5 = await getRes5.json();
  const implicitProc = db5.procesosDisciplinarios?.find(p => p.id === testProcId2);
  if (!implicitProc || implicitProc.asesorId !== testAsesor.id) {
    throw new Error('La resolución implícita no vinculó el asesorId correcto');
  }
  console.log('Resolución implícita exitosa:', {
    id: implicitProc.id,
    asesor: implicitProc.asesor,
    asesorId: implicitProc.asesorId,
    jefe: implicitProc.jefe,
    jefeId: implicitProc.jefeId
  });

  // 7. Eliminación limpia de los expedientes de prueba
  console.log('\n--- PASO 7: Eliminación limpia de expedientes de prueba ---');
  const syncResDelete = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        procesosDisciplinarios: {
          upserted: [],
          deleted: [testProcId, testProcId2]
        }
      }
    })
  });

  if (!syncResDelete.ok) throw new Error(`Error en eliminación de expedientes de prueba: ${syncResDelete.status}`);

  const getResFinal = await fetch(`${API_BASE}/db`, { headers });
  const dbFinal = await getResFinal.json();
  const surviving = dbFinal.procesosDisciplinarios?.filter(p => p.id === testProcId || p.id === testProcId2);
  if (surviving && surviving.length > 0) {
    throw new Error('Quedaron expedientes de prueba huérfanos sin eliminar');
  }
  console.log('✅ Eliminación confirmada: 0 registros de prueba huérfanos.');
  console.log('\n🎯 TEST E2E MÓDULO 13 (PROCESOS DISCIPLINARIOS) COMPLETADO EXITOSAMENTE AL 100%');
}

runTest().catch(err => {
  console.error('❌ Error durante la ejecución del test:', err);
  process.exit(1);
});
