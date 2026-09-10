const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = 'ibro_super_secret_jwt_key_2026_!@#';
const API_URL = 'http://localhost:3000';

async function runTest() {
  console.log('=== TEST MÓDULO 19: AUDITORÍA Y NOTIFICACIONES ===\n');

  try {
    // 1. Obtener usuario de prueba
    const testUser = await prisma.user.findFirst({
      where: { user: 'stecarfi05' }
    });
    if (!testUser) {
      throw new Error('Usuario stecarfi05 no encontrado en la base de datos');
    }
    console.log(`[1] Usuario encontrado: ${testUser.user} (ID: ${testUser.id})`);

    const token = jwt.sign(
      { id: testUser.id, user: testUser.user, roleId: String(testUser.roleId || '1') },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 2. Verificar GET /api/db inicial
    console.log('[2] Consultando GET /api/db...');
    const resInitial = await fetch(`${API_URL}/api/db`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resInitial.ok) {
      throw new Error(`GET /api/db falló con status ${resInitial.status}`);
    }
    const dbInitial = await resInitial.json();
    console.log(` -> auditoria count: ${dbInitial.auditoria?.length || 0}`);
    console.log(` -> notificaciones count: ${dbInitial.notificaciones?.length || 0}`);

    if (dbInitial.auditoria?.length > 0) {
      const sample = dbInitial.auditoria[0];
      console.log(` -> Muestra auditoria: id=${sample.id}, user=${sample.user}, fecha=${sample.fecha}`);
      if (!sample.user && !sample.userId) {
        throw new Error('Auditoría no contiene identificador de usuario');
      }
    }
    if (dbInitial.notificaciones?.length > 0) {
      const sample = dbInitial.notificaciones[0];
      console.log(` -> Muestra notificaciones: id=${sample.id}, para=${sample.para}, fecha=${sample.fecha}, leida=${sample.leida}`);
    }

    // 3. Crear registro de Auditoría y Notificación via POST /api/db/sync
    console.log('\n[3] Creando registro de Auditoría y Notificación via POST /api/db/sync...');
    const testAudId = 'test_aud_' + Date.now();
    const testNotifId = 'test_notif_' + Date.now();
    const nowIso = new Date().toISOString();

    const syncPayload = {
      auditoria: {
        upserted: [
          {
            id: testAudId,
            userId: testUser.id,
            user: testUser.user,
            fecha: nowIso,
            action: 'TEST_AUDIT_ACTION_SYNC',
            modulo: 'auditoria',
            recordDetails: 'Registro de auditoria para prueba automatizada E2E',
            shadowingData: { prueba: 'exitosa', valor: 999 },
            hash: 'TEST_HASH_E2E_M19'
          }
        ],
        deleted: []
      },
      notificaciones: {
        upserted: [
          {
            id: testNotifId,
            paraId: testUser.id,
            para: testUser.user,
            fecha: nowIso,
            mensaje: 'Mensaje de notificación de prueba automatizada E2E',
            leida: false,
            targetModule: 'auditoria'
          }
        ],
        deleted: []
      }
    };

    const resSync = await fetch(`${API_URL}/api/db/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ diff: syncPayload })
    });

    if (!resSync.ok) {
      const errText = await resSync.text();
      throw new Error(`POST /api/db/sync falló: ${resSync.status} - ${errText}`);
    }
    console.log(' -> Sync completado exitosamente con status 200.');

    // 4. Verificar directamente en Supabase PostgreSQL via Prisma
    console.log('\n[4] Verificando en Supabase PostgreSQL via Prisma...');
    const audInDb = await prisma.auditoria.findUnique({
      where: { id: testAudId },
      include: { user: true }
    });
    if (!audInDb) {
      throw new Error(`Auditoría ${testAudId} no fue encontrada en la base de datos`);
    }
    console.log(` ✅ Auditoría en BD: id=${audInDb.id}, action=${audInDb.action}, userId=${audInDb.userId}, user=${audInDb.user?.user}`);

    const notifInDb = await prisma.notificacion.findUnique({
      where: { id: testNotifId },
      include: { para: true }
    });
    if (!notifInDb) {
      throw new Error(`Notificación ${testNotifId} no fue encontrada en la base de datos`);
    }
    console.log(` ✅ Notificación en BD: id=${notifInDb.id}, mensaje=${notifInDb.mensaje}, paraId=${notifInDb.paraId}, para=${notifInDb.para?.user}, leida=${notifInDb.leida}`);

    // 5. Actualizar estado de notificación (marcar como leída)
    console.log('\n[5] Actualizando notificación a leída: true via POST /api/db/sync...');
    const updatePayload = {
      notificaciones: {
        upserted: [
          {
            id: testNotifId,
            para: testUser.user,
            mensaje: 'Mensaje de notificación de prueba automatizada E2E',
            leida: true,
            targetModule: 'auditoria'
          }
        ],
        deleted: []
      }
    };

    const resUpdate = await fetch(`${API_URL}/api/db/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ diff: updatePayload })
    });
    if (!resUpdate.ok) {
      throw new Error(`POST /api/db/sync update falló: ${resUpdate.status}`);
    }

    const notifUpdated = await prisma.notificacion.findUnique({
      where: { id: testNotifId }
    });
    if (!notifUpdated || !notifUpdated.leida) {
      throw new Error('Notificación no fue marcada como leída en la base de datos');
    }
    console.log(` ✅ Notificación actualizada en BD: leida=${notifUpdated.leida}`);

    // 6. Verificar visibilidad y formato via GET /api/db
    console.log('\n[6] Verificando paridad en GET /api/db...');
    const resVerify = await fetch(`${API_URL}/api/db`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const dbVerify = await resVerify.json();

    const audFound = (dbVerify.auditoria || []).find(a => a.id === testAudId);
    if (!audFound) {
      throw new Error(`Auditoría ${testAudId} no fue retornada en GET /api/db`);
    }
    console.log(` ✅ Auditoría en GET /api/db: user=${audFound.user}, action=${audFound.action}, fecha=${audFound.fecha}`);

    const notifFound = (dbVerify.notificaciones || []).find(n => n.id === testNotifId);
    if (!notifFound) {
      throw new Error(`Notificación ${testNotifId} no fue retornada en GET /api/db`);
    }
    console.log(` ✅ Notificación en GET /api/db: para=${notifFound.para}, leida=${notifFound.leida}, fecha=${notifFound.fecha}`);

    // 7. Limpieza y verificación de 0 registros huérfanos
    console.log('\n[7] Eliminando registros de prueba via POST /api/db/sync...');
    const cleanupPayload = {
      auditoria: {
        upserted: [],
        deleted: [testAudId]
      },
      notificaciones: {
        upserted: [],
        deleted: [testNotifId]
      }
    };

    const resClean = await fetch(`${API_URL}/api/db/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ diff: cleanupPayload })
    });
    if (!resClean.ok) {
      throw new Error(`POST /api/db/sync cleanup falló: ${resClean.status}`);
    }

    const audAfterClean = await prisma.auditoria.findUnique({ where: { id: testAudId } });
    const notifAfterClean = await prisma.notificacion.findUnique({ where: { id: testNotifId } });

    if (audAfterClean || notifAfterClean) {
      throw new Error('Fallo al limpiar registros de prueba en la base de datos');
    }
    console.log(' ✅ Registros de prueba eliminados correctamente. 0 registros huérfanos en Supabase.');

    console.log('\n======================================================');
    console.log('🎉 MÓDULO 19: AUDITORÍA Y NOTIFICACIONES VERIFICADO AL 100%');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ ERROR EN PRUEBA DE MÓDULO 19:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
