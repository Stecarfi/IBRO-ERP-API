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
  console.log('🧪 Iniciando prueba de concurrencia y paridad para Chat Interno...\n');
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const testChatId = 'msg_test_concurrency_' + Date.now();
  const testNotifId = 'notif_test_concurrency_' + Date.now();
  const nowIso = new Date().toISOString();

  // Paso 1: Enviar mensaje de chat
  console.log('--- 1. Enviar mensaje de chat directo ---');
  const chatPayload = {
    id: testChatId,
    timestamp: Date.now(),
    fecha: nowIso,
    senderId: '1787415003498',
    user: 'stecarfi05',
    nombre: 'Stephanie Carrasquilla',
    to: 'Dircomercial',
    receiverId: '1787586579965',
    senderTabId: null,
    text: 'Mensaje de prueba de persistencia y no eliminacion',
    readAt: null
  };

  const resChat = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chat: {
          upserted: [chatPayload],
          deleted: []
        }
      }
    })
  });
  if (!resChat.ok) throw new Error(`Fallo al enviar chat: ${resChat.status} ${await resChat.text()}`);
  console.log('✅ Mensaje de chat enviado con exito.');

  // Paso 2: Enviar inmediatamente una notificacion
  console.log('\n--- 2. Enviar actualizacion concurrente de notificaciones ---');
  const notifPayload = {
    id: testNotifId,
    paraId: '1787586579965',
    para: 'Dircomercial',
    de: 'stecarfi05',
    mensaje: 'Has recibido un mensaje de Stephanie',
    fecha: nowIso,
    leida: false,
    targetModule: 'chat'
  };

  const resNotif = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        notificaciones: {
          upserted: [notifPayload],
          deleted: []
        }
      }
    })
  });
  if (!resNotif.ok) throw new Error(`Fallo al enviar notificacion: ${resNotif.status} ${await resNotif.text()}`);
  console.log('✅ Notificacion enviada con exito.');

  // Paso 3: Verificar que el mensaje de chat SIGUE en GET /api/db y no fue eliminado
  console.log('\n--- 3. Verificar persistencia de mensaje de chat en GET /api/db ---');
  const resDb = await fetch(`${API_BASE}/db`, { headers });
  const dbData = await resDb.json();

  const foundMsg = dbData.chat?.find(c => c.id === testChatId);
  if (!foundMsg) {
    throw new Error(`❌ ERROR CRITICO: El mensaje ${testChatId} FUE ELIMINADO de la base de datos!`);
  }
  console.log('✅ El mensaje permanece intacto en la base de datos:', {
    id: foundMsg.id,
    user: foundMsg.user,
    to: foundMsg.to,
    text: foundMsg.text
  });

  if (foundMsg.user !== 'stecarfi05') {
    throw new Error(`Disparidad en campo user: esperado 'stecarfi05', obtenido '${foundMsg.user}'`);
  }
  if (foundMsg.to !== 'Dircomercial') {
    throw new Error(`Disparidad en campo to: esperado 'Dircomercial', obtenido '${foundMsg.to}'`);
  }

  // Paso 4: Verificar paridad con GET /api/paginated/chat
  console.log('\n--- 4. Verificar paridad exacta con GET /api/paginated/chat ---');
  const resPag = await fetch(`${API_BASE}/paginated/chat?skip=0&take=20`, { headers });
  const pagData = await resPag.json();

  const pagMsg = pagData.chat?.find(c => c.id === testChatId);
  if (!pagMsg) {
    throw new Error(`❌ El mensaje no se encontro en /api/paginated/chat`);
  }
  console.log('✅ Paridad confirmada en /api/paginated/chat:', {
    id: pagMsg.id,
    user: pagMsg.user,
    to: pagMsg.to,
    senderId: pagMsg.senderId,
    receiverId: pagMsg.receiverId
  });

  if (pagMsg.user !== foundMsg.user || pagMsg.to !== foundMsg.to) {
    throw new Error(`Disparidad entre /api/db y /api/paginated/chat: ${pagMsg.user} vs ${foundMsg.user}`);
  }

  // Paso 5: Limpieza
  console.log('\n--- 5. Limpieza de datos de prueba ---');
  await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        chat: { upserted: [], deleted: [testChatId] },
        notificaciones: { upserted: [], deleted: [testNotifId] }
      }
    })
  });
  console.log('✅ Limpieza completada.');

  console.log('\n========================================================================');
  console.log('🎉 ¡TEST DE PARIDAD Y NO-ELIMINACION DE CHAT SUPERADO CON EXITO!');
  console.log('========================================================================\n');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN TEST:', err);
  process.exit(1);
});
