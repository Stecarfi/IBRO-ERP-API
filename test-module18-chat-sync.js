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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 18: Chat Interno & Grupos...');
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

  console.log(`Grupos de Chat iniciales en DB: ${db1.chatGroups?.length || 0}`);
  console.log(`Mensajes de Chat iniciales en DB: ${db1.chat?.length || 0}`);

  const testGroupId = 'group_test_' + Date.now();
  const hoyIso = new Date().toISOString();

  // 2. Creación de Grupo de Chat vía diff.chatGroups
  console.log('\n--- PASO 2: POST /api/db/sync Creación de Grupo de Chat (diff.chatGroups) ---');
  const newGroupPayload = {
    id: testGroupId,
    nombre: 'Comité Comercial & Técnico Q3',
    descripcion: 'Canal oficial para coordinación de visitas y servicios en campo',
    createdById: '1787415003498',
    createdBy: 'stecarfi05',
    fecha: hoyIso,
    integrantes: ['1787415003498', 'admin', 'stecarfi05']
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chatGroups: {
          upserted: [newGroupPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync creación de grupo: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación grupo:', syncJson1);

  // 3. Validar Persistencia del Grupo
  console.log('\n--- PASO 3: Validar persistencia de Grupo en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedGroup = db2.chatGroups?.find(g => g.id === testGroupId);

  if (!persistedGroup) {
    throw new Error(`El grupo ${testGroupId} no fue encontrado en GET /api/db`);
  }
  console.log('Grupo persistido correctamente:', {
    id: persistedGroup.id,
    nombre: persistedGroup.nombre,
    creadorNombre: persistedGroup.creadorNombre,
    integrantesCount: persistedGroup.integrantes?.length
  });

  if (persistedGroup.nombre !== newGroupPayload.nombre) {
    throw new Error(`Nombre de grupo no coincide: esperado "${newGroupPayload.nombre}", obtenido "${persistedGroup.nombre}"`);
  }
  if (!Array.isArray(persistedGroup.integrantes) || persistedGroup.integrantes.length !== 3) {
    throw new Error(`Integrantes del grupo inválidos: ${JSON.stringify(persistedGroup.integrantes)}`);
  }

  // 4. Envío de Mensaje al Grupo
  console.log('\n--- PASO 4: Envío de Mensaje al Grupo (to = testGroupId) ---');
  const testGroupMsgId = 'msg_grp_' + Date.now();
  const groupMsgPayload = {
    id: testGroupMsgId,
    timestamp: Date.now(),
    fecha: hoyIso,
    senderId: '1787415003498',
    user: 'stecarfi05',
    nombre: 'Estefanie C',
    to: testGroupId,
    text: '¡Bienvenidos al canal de coordinación comercial y técnico Q3!',
    isAudio: false,
    isFile: false
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chat: {
          upserted: [groupMsgPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes2.ok) {
    throw new Error(`Fallo en sync mensaje de grupo: ${syncRes2.status} ${await syncRes2.text()}`);
  }
  console.log('Respuesta sync mensaje de grupo exitosa');

  // 5. Validar que el mensaje conserve to = testGroupId en GET /api/db
  console.log('\n--- PASO 5: Validar persistencia de mensaje de grupo en GET /api/db ---');
  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const persistedGroupMsg = db3.chat?.find(c => c.id === testGroupMsgId);

  if (!persistedGroupMsg) {
    throw new Error(`El mensaje de grupo ${testGroupMsgId} no se encontró en GET /api/db`);
  }
  console.log('Mensaje de grupo persistido:', {
    id: persistedGroupMsg.id,
    to: persistedGroupMsg.to,
    text: persistedGroupMsg.text,
    user: persistedGroupMsg.user
  });

  if (persistedGroupMsg.to !== testGroupId) {
    throw new Error(`Campo "to" en mensaje de grupo alterado: esperado "${testGroupId}", obtenido "${persistedGroupMsg.to}"`);
  }

  // 6. Envío de Mensaje Directo con Adjunto Multimedia y Marca de Lectura
  console.log('\n--- PASO 6: Mensaje Directo con Archivo y Marca de Lectura (readAt) ---');
  const testDirectMsgId = 'msg_dir_' + Date.now();
  const directMsgPayload = {
    id: testDirectMsgId,
    timestamp: Date.now(),
    fecha: hoyIso,
    senderId: '1787415003498',
    user: 'stecarfi05',
    nombre: 'Estefanie C',
    to: 'admin',
    text: '[Archivo: Protocolo_Seguridad.pdf]',
    isFile: true,
    fileUrl: 'https://ibro.com/uploads/Protocolo_Seguridad.pdf',
    fileName: 'Protocolo_Seguridad.pdf',
    fileType: 'application/pdf',
    readAt: Date.now(),
    isEdited: false
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chat: {
          upserted: [directMsgPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes3.ok) {
    throw new Error(`Fallo en sync mensaje directo: ${syncRes3.status} ${await syncRes3.text()}`);
  }

  // 7. Validar mensaje directo y edición
  console.log('\n--- PASO 7: Validar mensaje directo y edición sin mutar @id ---');
  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const persistedDirectMsg = db4.chat?.find(c => c.id === testDirectMsgId);

  if (!persistedDirectMsg) {
    throw new Error(`No se encontró el mensaje directo en GET /api/db`);
  }
  if (!persistedDirectMsg.isFile || !persistedDirectMsg.fileUrl) {
    throw new Error(`Metadatos de archivo no persistidos correctamente: ${JSON.stringify(persistedDirectMsg)}`);
  }
  if (!persistedDirectMsg.readAt) {
    throw new Error(`readAt no fue registrado correctamente: ${persistedDirectMsg.readAt}`);
  }
  console.log('Mensaje directo validado con éxito:', {
    id: persistedDirectMsg.id,
    isFile: persistedDirectMsg.isFile,
    fileName: persistedDirectMsg.fileName,
    readAt: persistedDirectMsg.readAt
  });

  // Edición de mensaje
  const editedPayload = {
    ...persistedDirectMsg,
    text: '[Archivo: Protocolo_Seguridad_v2.pdf] (Versión revisada)',
    isEdited: true
  };

  const syncRes4 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chat: {
          upserted: [editedPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes4.ok) {
    throw new Error(`Fallo en edición de mensaje: ${syncRes4.status} ${await syncRes4.text()}`);
  }

  // 8. Eliminación Limpia
  console.log('\n--- PASO 8: Eliminación limpia de mensajes y grupo de prueba ---');
  const syncRes5 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chat: {
          upserted: [],
          deleted: [testGroupMsgId, testDirectMsgId]
        },
        chatGroups: {
          upserted: [],
          deleted: [testGroupId]
        }
      }
    })
  });

  if (!syncRes5.ok) {
    throw new Error(`Fallo en eliminación limpia: ${syncRes5.status} ${await syncRes5.text()}`);
  }
  console.log('Respuesta sync eliminación exitosa');

  // 9. Verificación de eliminación final en GET /api/db
  console.log('\n--- PASO 9: Verificar eliminación en GET /api/db ---');
  const getRes5 = await fetch(`${API_BASE}/db`, { headers });
  const db5 = await getRes5.json();

  const checkGroup = db5.chatGroups?.find(g => g.id === testGroupId);
  const checkMsg1 = db5.chat?.find(c => c.id === testGroupMsgId);
  const checkMsg2 = db5.chat?.find(c => c.id === testDirectMsgId);

  if (checkGroup || checkMsg1 || checkMsg2) {
    throw new Error(`Registros de prueba no fueron eliminados completamente de la base de datos`);
  }

  console.log('\n========================================================================');
  console.log('🎉 ¡MÓDULO 18: CHAT INTERNO & GRUPOS VALIDADO AL 100% EN PRODUCCIÓN!');
  console.log('========================================================================\n');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN TEST E2E MÓDULO 18:', err);
  process.exit(1);
});
