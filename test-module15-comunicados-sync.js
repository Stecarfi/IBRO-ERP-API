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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 15: Comunicados Oficiales...');
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
  console.log(`Comunicados iniciales en DB: ${db1.anuncios?.length || 0}`);

  const testAnnId = 'test_ann_' + Date.now();
  const hoyIso = new Date().toISOString();
  const expIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 2. Publicación de Comunicado Oficial vía diff.anuncios
  console.log('\n--- PASO 2: POST /api/db/sync Publicación de Comunicado (diff.anuncios) ---');
  const newAnnPayload = {
    id: testAnnId,
    titulo: 'Directiva Oficial: Uso Obligatorio de EPP en Campo',
    contenido: 'Se informa a todo el personal técnico que a partir de la fecha es estricto el uso de casco dieléctrico, botas y guantes de protección en todas las visitas técnicas.',
    mensaje: 'Se informa a todo el personal técnico que a partir de la fecha es estricto el uso de casco dieléctrico, botas y guantes de protección en todas las visitas técnicas.',
    fecha: hoyIso,
    expiresAt: expIso,
    expired: false,
    lockedBy: null
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        anuncios: {
          upserted: [newAnnPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync creación de comunicado: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Validar Persistencia y Mapeo en Supabase
  console.log('\n--- PASO 3: Validar persistencia y mapeo en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedAnn = db2.anuncios?.find(a => a.id === testAnnId);

  if (!persistedAnn) {
    throw new Error(`El comunicado ${testAnnId} no fue encontrado en GET /api/db`);
  }
  console.log('Comunicado persistido y mapeado correctamente:', {
    id: persistedAnn.id,
    titulo: persistedAnn.titulo,
    fecha: persistedAnn.fecha,
    expiresAt: persistedAnn.expiresAt,
    expired: persistedAnn.expired
  });

  if (persistedAnn.titulo !== newAnnPayload.titulo) {
    throw new Error(`Título no coincide: esperado "${newAnnPayload.titulo}", obtenido "${persistedAnn.titulo}"`);
  }
  if (!persistedAnn.contenido || !persistedAnn.contenido.includes('dieléctrico')) {
    throw new Error('El contenido del comunicado no coincide con lo enviado');
  }

  // 4. Actualización del Comunicado (Edición)
  console.log('\n--- PASO 4: Actualización del Comunicado sin mutar @id ---');
  const updatedPayload = {
    ...persistedAnn,
    titulo: 'Directiva Oficial: Protocolos de Seguridad y EPP Actualizados',
    contenido: persistedAnn.contenido + '\n\n[ADENDA]: Aplica también para visitas a contratistas y talleres autorizados.'
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        anuncios: {
          upserted: [updatedPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes2.ok) throw new Error(`Error en actualización de comunicado: ${syncRes2.status} ${await syncRes2.text()}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const modifiedAnn = db3.anuncios?.find(a => a.id === testAnnId);
  if (!modifiedAnn || !modifiedAnn.titulo.includes('Actualizados')) {
    throw new Error('El comunicado no reflejó la actualización en la base de datos');
  }
  console.log('Comunicado actualizado exitosamente en DB:', {
    id: modifiedAnn.id,
    titulo: modifiedAnn.titulo
  });

  // 5. Creación usando el alias diff.comunicados
  console.log('\n--- PASO 5: Publicación usando el alias diff.comunicados ---');
  const testAnnId2 = 'test_ann_alias_' + Date.now();
  const aliasPayload = {
    id: testAnnId2,
    titulo: 'Aviso de Mantenimiento Preventivo Servidores ERP',
    contenido: 'La plataforma entrará en ventana de mantenimiento el domingo a las 23:00 hrs.',
    mensaje: 'La plataforma entrará en ventana de mantenimiento el domingo a las 23:00 hrs.',
    fecha: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    expired: false
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        comunicados: {
          upserted: [aliasPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes3.ok) throw new Error(`Error en sync vía alias comunicados: ${syncRes3.status} ${await syncRes3.text()}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const aliasAnn = db4.anuncios?.find(a => a.id === testAnnId2);
  if (!aliasAnn) {
    throw new Error('El comunicado enviado por diff.comunicados no fue persistido');
  }
  console.log('Alias diff.comunicados funcionó exitosamente:', {
    id: aliasAnn.id,
    titulo: aliasAnn.titulo
  });

  // 6. Eliminación limpia de comunicados de prueba
  console.log('\n--- PASO 6: Eliminación limpia de comunicados de prueba ---');
  const syncResDelete = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        anuncios: {
          upserted: [],
          deleted: [testAnnId, testAnnId2]
        }
      }
    })
  });

  if (!syncResDelete.ok) throw new Error(`Error en eliminación de comunicados: ${syncResDelete.status}`);

  const getResFinal = await fetch(`${API_BASE}/db`, { headers });
  const dbFinal = await getResFinal.json();
  const surviving = dbFinal.anuncios?.filter(a => a.id === testAnnId || a.id === testAnnId2);
  if (surviving && surviving.length > 0) {
    throw new Error('Quedaron comunicados de prueba sin eliminar');
  }
  console.log('✅ Eliminación confirmada: 0 registros de prueba huérfanos.');
  console.log('\n🎯 TEST E2E MÓDULO 15 (COMUNICADOS OFICIALES / ANUNCIOS) COMPLETADO EXITOSAMENTE AL 100%');
}

runTest().catch(err => {
  console.error('❌ Error durante la ejecución del test:', err);
  process.exit(1);
});
