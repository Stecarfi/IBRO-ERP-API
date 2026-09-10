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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 14: Capacitaciones (Academia IBRO)...');
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
  console.log(`Capacitaciones iniciales en DB: ${db1.capacitaciones?.length || 0}`);

  const testInstructor = db1.users?.[0];
  const testAlumno = db1.users?.[1] || db1.users?.[0];
  if (!testInstructor || !testAlumno) throw new Error('Se requieren usuarios en DB para ejecutar la prueba');

  console.log(`Instructor: ${testInstructor.nombre} (${testInstructor.user}, id: ${testInstructor.id})`);
  console.log(`Alumno: ${testAlumno.nombre} (${testAlumno.user}, id: ${testAlumno.id})`);

  const testCapId = 'test_cap_' + Date.now();
  const hoyIso = new Date().toISOString();

  // 2. Publicación de Curso de Capacitación
  console.log('\n--- PASO 2: POST /api/db/sync Publicación de Capacitación ---');
  const evaluacionObj = {
    title: 'Evaluación Técnica de Bombas Centrífugas',
    questions: [
      {
        text: '¿Qué significa el parámetro NPSH en un sistema de bombeo?',
        options: [
          { text: 'Carga Neta Positiva de Succión', isCorrect: true },
          { text: 'Número Potencial de Salida Hidráulica', isCorrect: false },
          { text: 'Nivel Primario de Sobrecarga Hídrica', isCorrect: false }
        ]
      },
      {
        text: '¿Cuál es la función principal del impulsor cerrado?',
        options: [
          { text: 'Maximizar la eficiencia hidráulica en líquidos limpios', isCorrect: true },
          { text: 'Permitir el paso libre de sólidos grandes', isCorrect: false },
          { text: 'Aumentar la viscosidad del fluido', isCorrect: false }
        ]
      }
    ]
  };

  const materialesObj = [
    {
      title: 'Manual de Hidráulica Aplicada IBRO.pdf',
      url: 'https://storage.ibrosas.com/training/manual_hidraulica.pdf',
      type: 'Diapositivas / Presentación'
    }
  ];

  const newCapPayload = {
    id: testCapId,
    tipo: 'Autodidactico',
    tema: 'Ingeniería y Selección de Bombas Centrífugas Industriales',
    descripcion: 'Curso especializado en cálculo de pérdidas por fricción, curvas características y cavitación.',
    fecha: hoyIso,
    hora: '09:00 AM',
    obligatoria: true,
    creadorId: testInstructor.id,
    creador: testInstructor.user,
    creadorNombre: `${testInstructor.nombre} ${testInstructor.apellido || ''}`.trim(),
    videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    materiales: materialesObj,
    asistentes: [],
    evaluacion: evaluacionObj,
    estado: 'Disponible',
    lockedBy: null
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        capacitaciones: {
          upserted: [newCapPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync creación de capacitación: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Validar Persistencia y Mapeo en Supabase
  console.log('\n--- PASO 3: Validar persistencia y mapeo en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedCap = db2.capacitaciones?.find(c => c.id === testCapId);

  if (!persistedCap) {
    throw new Error(`La capacitación ${testCapId} no fue encontrada en GET /api/db`);
  }
  console.log('Capacitación persistida y mapeada correctamente:', {
    id: persistedCap.id,
    tema: persistedCap.tema,
    tipo: persistedCap.tipo,
    creadorId: persistedCap.creadorId,
    creador: persistedCap.creador,
    creadorNombre: persistedCap.creadorNombre,
    fecha: persistedCap.fecha,
    materialesCount: persistedCap.materiales?.length,
    preguntasCount: persistedCap.evaluacion?.questions?.length
  });

  if (persistedCap.creadorId !== testInstructor.id) {
    throw new Error(`creadorId no coincide: esperado ${testInstructor.id}, obtenido ${persistedCap.creadorId}`);
  }
  if (persistedCap.creador !== testInstructor.user) {
    throw new Error(`creador no coincide: esperado ${testInstructor.user}, obtenido ${persistedCap.creador}`);
  }
  if (!persistedCap.evaluacion?.questions || persistedCap.evaluacion.questions.length !== 2) {
    throw new Error('El objeto JSON de evaluación no persistió adecuadamente');
  }

  // 4. Registro de Asistencia, Progreso y Evaluación del Alumno
  console.log('\n--- PASO 4: Asistencia, Progreso y Aprobación de Evaluación ---');
  const certCode = `IBRO-CERT-2026-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const asistentesActualizados = [
    {
      userId: testAlumno.user,
      nombre: `${testAlumno.nombre} ${testAlumno.apellido || ''}`.trim(),
      estado: 'Completada',
      asistenciaConfirmada: true,
      fechaAsistencia: hoyIso,
      lecturaCompletada: true,
      videoCompletado: true,
      score: 100,
      correctCount: 2,
      totalCount: 2,
      certificadoEmitido: true,
      codigoCertificado: certCode
    }
  ];

  const progresoPayload = {
    ...persistedCap,
    asistentes: asistentesActualizados
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        capacitaciones: {
          upserted: [progresoPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes2.ok) throw new Error(`Error en actualización de asistencia/evaluación: ${syncRes2.status} ${await syncRes2.text()}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const capConAsistencia = db3.capacitaciones?.find(c => c.id === testCapId);
  if (!capConAsistencia || capConAsistencia.asistentes?.length !== 1) {
    throw new Error('La lista de asistentes no se actualizó correctamente en la base de datos');
  }
  const alumnoReg = capConAsistencia.asistentes[0];
  console.log('Asistente registrado y certificado con éxito:', {
    userId: alumnoReg.userId,
    estado: alumnoReg.estado,
    score: alumnoReg.score,
    codigoCertificado: alumnoReg.codigoCertificado
  });

  if (alumnoReg.codigoCertificado !== certCode) {
    throw new Error('El código de certificado no coincide con el persistido');
  }

  // 5. Creación con resolución implícita (solo username en creador)
  console.log('\n--- PASO 5: Creación con resolución implícita de instructor ---');
  const testCapId2 = 'test_cap_implicit_' + Date.now();
  const implicitPayload = {
    id: testCapId2,
    tipo: 'En Vivo',
    tema: 'Reunión Virtual de Alineación Comercial Trimestral',
    descripcion: 'Sesión estratégica virtual.',
    fecha: new Date().toISOString(),
    hora: '14:30',
    creador: testInstructor.user, // Sin creadorId
    obligatoria: false,
    estado: 'Programada'
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        capacitaciones: {
          upserted: [implicitPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes3.ok) throw new Error(`Error en sync implícito: ${syncRes3.status} ${await syncRes3.text()}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const implicitCap = db4.capacitaciones?.find(c => c.id === testCapId2);
  if (!implicitCap || implicitCap.creadorId !== testInstructor.id) {
    throw new Error('La resolución implícita no vinculó el creadorId adecuado');
  }
  console.log('Resolución implícita exitosa:', {
    id: implicitCap.id,
    creador: implicitCap.creador,
    creadorId: implicitCap.creadorId,
    tema: implicitCap.tema
  });

  // 6. Eliminación limpia de las capacitaciones de prueba
  console.log('\n--- PASO 6: Eliminación limpia de capacitaciones de prueba ---');
  const syncResDelete = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        capacitaciones: {
          upserted: [],
          deleted: [testCapId, testCapId2]
        }
      }
    })
  });

  if (!syncResDelete.ok) throw new Error(`Error en eliminación de capacitaciones de prueba: ${syncResDelete.status}`);

  const getResFinal = await fetch(`${API_BASE}/db`, { headers });
  const dbFinal = await getResFinal.json();
  const surviving = dbFinal.capacitaciones?.filter(c => c.id === testCapId || c.id === testCapId2);
  if (surviving && surviving.length > 0) {
    throw new Error('Quedaron capacitaciones de prueba sin eliminar');
  }
  console.log('✅ Eliminación confirmada: 0 registros de prueba huérfanos.');
  console.log('\n🎯 TEST E2E MÓDULO 14 (CAPACITACIONES / ACADEMIA IBRO) COMPLETADO EXITOSAMENTE AL 100%');
}

runTest().catch(err => {
  console.error('❌ Error durante la ejecución del test:', err);
  process.exit(1);
});
