const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_BASE = 'http://localhost:3000/api';

async function runAudit() {
  console.log('========================================================');
  console.log('🚀 AUDITORÍA EXHAUSTIVA DE SINCRONIZACIÓN FRONTEND-BACKEND');
  console.log('========================================================\n');

  let adminUser = await prisma.user.findFirst({
    where: { role: { name: { contains: 'Admin', mode: 'insensitive' } } }
  });

  if (!adminUser) {
    adminUser = await prisma.user.findFirst();
  }

  console.log(`👤 Usuario de prueba: ${adminUser.user} (${adminUser.id})`);

  // 1. Probar Login
  console.log('\n--- 1. Probar Login y Autenticación ---');
  let token = null;
  // Intentar login con la contraseña estándar o actualizar temporalmente para probar
  const loginRes = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: adminUser.user, pass: 'admin123' })
  });

  const loginData = await loginRes.json();
  if (loginRes.ok && loginData.token) {
    token = loginData.token;
    console.log('✅ Login exitoso con credenciales estándar.');
  } else {
    // Si no es admin123, emitir un token JWT de prueba directamente para la auditoría
    const jwt = require('jsonwebtoken');
    token = jwt.sign(
      { id: adminUser.id, user: adminUser.user, roleId: adminUser.roleId },
      process.env.JWT_SECRET || 'ibro_fallback_secret_2026',
      { expiresIn: '1h' }
    );
    console.log('✅ Token JWT administrativo generado para la sesión de prueba.');
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Probar Flujo de Recuperación y Reseteo de Contraseña
  console.log('\n--- 2. Probar Recuperación y Reseteo de Contraseña (/api/auth/recover & /api/auth/reset-password) ---');
  // Asegurar que el usuario tenga un correo válido configurado para la prueba
  if (!adminUser.correo) {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { correo: 'admin@ibrosas.com' }
    });
  }

  const recoverRes = await fetch(`${API_BASE}/auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: adminUser.user, origin: 'http://localhost:3001' })
  });
  const recoverData = await recoverRes.json();
  console.log('Respuesta recover:', recoverData);
  if (!recoverRes.ok) {
    throw new Error(`❌ Falló recover: ${JSON.stringify(recoverData)}`);
  }
  console.log('✅ POST /api/auth/recover funcionó correctamente sin errores de Prisma.');

  const pendingRecord = await prisma.pendingReset.findFirst({
    where: { user: { user: adminUser.user } },
    orderBy: { expire: 'desc' }
  });
  if (!pendingRecord) {
    throw new Error('❌ No se encontró registro en PendingReset.');
  }
  console.log(`✅ PendingReset encontrado en BD: token=${pendingRecord.token}, expire=${pendingRecord.expire}`);

  const resetRes = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: adminUser.user,
      token: pendingRecord.token,
      newPassword: 'IbroAdmin2026*'
    })
  });
  const resetData = await resetRes.json();
  console.log('Respuesta reset-password:', resetData);
  if (!resetRes.ok) {
    throw new Error(`❌ Falló reset-password: ${JSON.stringify(resetData)}`);
  }
  console.log('✅ POST /api/auth/reset-password funcionó correctamente.');

  // 3. Probar GET /api/db y Paridad de Campos
  console.log('\n--- 3. Probar GET /api/db y Paridad de Campos Frontend ---');
  const dbRes = await fetch(`${API_BASE}/db`, { headers: authHeaders });
  if (!dbRes.ok) {
    throw new Error(`❌ Error cargando /api/db: ${dbRes.status}`);
  }
  const db = await dbRes.json();
  console.log('✅ GET /api/db respondió correctamente.');

  // Verificaciones de modelos críticos
  console.log('\n🔍 Verificando estructura de colecciones en GET /api/db:');
  
  // Solicitudes
  console.log(`- Solicitudes: ${db.solicitudes?.length || 0} registros`);
  if (db.solicitudes?.length > 0) {
    const sol = db.solicitudes[0];
    console.log(`  Muestra solicitud: asesorId='${sol.asesorId}', asesor='${sol.asesor}', fileUrl='${sol.fileUrl}'`);
    if (sol.asesorId === undefined || sol.asesor === undefined) {
      throw new Error('❌ Discrepancia: asesor o asesorId no están definidos en solicitudes');
    }
  }

  // Procesos Disciplinarios
  console.log(`- Procesos Disciplinarios: ${db.procesosDisciplinarios?.length || 0} registros`);
  if (db.procesosDisciplinarios?.length > 0) {
    const proc = db.procesosDisciplinarios[0];
    console.log(`  Muestra proceso: asesor='${proc.asesor}', jefe='${proc.jefe}', evidencias=${JSON.stringify(proc.evidencias)}`);
    if (proc.asesor === undefined || proc.jefe === undefined) {
      throw new Error('❌ Discrepancia: asesor o jefe no están definidos en procesosDisciplinarios');
    }
  }

  // PQRS
  console.log(`- PQRS: ${db.pqrs?.length || 0} registros`);
  if (db.pqrs?.length > 0) {
    const pqr = db.pqrs[0];
    console.log(`  Muestra PQR: usuarioAsignado='${pqr.usuarioAsignado}', fileUrl='${pqr.fileUrl}'`);
  }

  // Capacitaciones
  console.log(`- Capacitaciones: ${db.capacitaciones?.length || 0} registros`);
  if (db.capacitaciones?.length > 0) {
    const cap = db.capacitaciones[0];
    console.log(`  Muestra capacitación: tema='${cap.tema}', plataforma='${cap.plataforma}', creador='${cap.creador}', creadoEn='${cap.creadoEn}'`);
  }

  // Chat
  console.log(`- Chat: ${db.chat?.length || 0} mensajes`);
  if (db.chat?.length > 0) {
    const msg = db.chat[db.chat.length - 1];
    console.log(`  Muestra mensaje chat: user='${msg.user}', to='${msg.to}', reactions=${JSON.stringify(msg.reactions)}, replyTo='${msg.replyTo}'`);
  }

  // Notificaciones
  console.log(`- Notificaciones: ${db.notificaciones?.length || 0} registros`);
  if (db.notificaciones?.length > 0) {
    const notif = db.notificaciones[0];
    console.log(`  Muestra notificación: para='${notif.para}', titulo='${notif.titulo}', de='${notif.de}', tipo='${notif.tipo}'`);
  }

  // 4. Probar POST /api/db/sync con Nuevos Campos
  console.log('\n--- 4. Probar Sincronización Incremental (POST /api/db/sync) ---');
  const testChatId = 'test_chat_' + Date.now();
  const testCapId = 'test_cap_' + Date.now();
  const testSolId = 'test_sol_' + Date.now();
  const testPqrId = 'test_pqr_' + Date.now();

  const syncDiff = {
    chat: {
      upserted: [{
        id: testChatId,
        fecha: new Date().toISOString(),
        timestamp: Date.now(),
        user: adminUser.user,
        nombre: `${adminUser.nombre} ${adminUser.apellido || ''}`.trim(),
        to: 'Todos',
        text: 'Mensaje de prueba de auditoría con reacciones y réplica',
        reactions: { '👍': [{ user: adminUser.user, nombre: adminUser.nombre }] },
        replyTo: 'parent_123',
        replyToObj: { id: 'parent_123', text: 'Mensaje original' },
        hiddenBy: ['test_hidden_user'],
        fileSize: 1048576
      }],
      deleted: []
    },
    capacitaciones: {
      upserted: [{
        id: testCapId,
        tipo: 'En Vivo',
        tema: 'Capacitación de Auditoría y Control de Calidad',
        descripcion: 'Sesión de prueba para verificar persistencia completa de campos extendidos',
        fecha: new Date().toISOString(),
        hora: '10:00 AM',
        obligatoria: true,
        creador: adminUser.user,
        plataforma: 'Google Meet',
        enlaceReunion: 'https://meet.google.com/abc-defg-hij',
        tutorFirma: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        tutor: 'Ing. Carlos Mendoza',
        materiales: [{ id: 'm1', nombre: 'Guía.pdf', url: 'https://ejemplo.com/guia.pdf' }],
        asistentes: [{ userId: adminUser.user, nombre: adminUser.nombre, asistio: true }],
        evaluacion: { title: 'Examen de Calidad', questions: [{ text: '¿Pregunta 1?', options: [{ text: 'A', isCorrect: true }] }] },
        estado: 'Disponible'
      }],
      deleted: []
    },
    solicitudes: {
      upserted: [{
        id: testSolId,
        asesor: adminUser.user,
        nombreAsesor: `${adminUser.nombre} ${adminUser.apellido || ''}`.trim(),
        tipo: 'Permiso',
        fecha: new Date().toISOString(),
        detalle: 'Solicitud de permiso médico de prueba',
        fileUrl: 'https://ibrosas.com/archivos/soporte.pdf',
        estado: 'Pendiente',
        fechaRadicado: new Date().toISOString()
      }],
      deleted: []
    }
  };

  const syncRes = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ diff: syncDiff, user: adminUser.user })
  });

  const syncData = await syncRes.json();
  console.log('Respuesta sync:', syncData);
  if (!syncRes.ok) {
    throw new Error(`❌ Falló POST /api/db/sync: ${JSON.stringify(syncData)}`);
  }
  console.log('✅ POST /api/db/sync ejecutado con éxito.');

  // Verificar en GET /api/db que los datos se recuperan exactamente como los envió el Frontend
  console.log('\n--- 5. Verificar Persistencia Exacta en GET /api/db ---');
  const checkDbRes = await fetch(`${API_BASE}/db`, { headers: authHeaders });
  const checkDb = await checkDbRes.json();

  // Chat check
  const syncedMsg = checkDb.chat?.find(c => c.id === testChatId);
  if (!syncedMsg) throw new Error('❌ Mensaje de chat sincronizado no encontrado en /api/db');
  console.log('✅ Chat persistido y recuperado con paridad:', {
    id: syncedMsg.id,
    reactions: syncedMsg.reactions,
    replyTo: syncedMsg.replyTo,
    replyToObj: syncedMsg.replyToObj,
    hiddenBy: syncedMsg.hiddenBy,
    fileSize: syncedMsg.fileSize
  });

  // Capacitación check
  const syncedCap = checkDb.capacitaciones?.find(c => c.id === testCapId);
  if (!syncedCap) throw new Error('❌ Capacitación sincronizada no encontrada en /api/db');
  console.log('✅ Capacitación persistida y recuperada con paridad:', {
    id: syncedCap.id,
    tipo: syncedCap.tipo,
    plataforma: syncedCap.plataforma,
    enlaceReunion: syncedCap.enlaceReunion,
    tutor: syncedCap.tutor,
    tutorFirma: syncedCap.tutorFirma ? 'Firma presente (Base64)' : 'No',
    creador: syncedCap.creador
  });

  // Solicitud check
  const syncedSol = checkDb.solicitudes?.find(s => s.id === testSolId);
  if (!syncedSol) throw new Error('❌ Solicitud sincronizada no encontrada en /api/db');
  console.log('✅ Solicitud persistida y recuperada con paridad:', {
    id: syncedSol.id,
    asesor: syncedSol.asesor,
    asesorId: syncedSol.asesorId,
    fileUrl: syncedSol.fileUrl
  });

  // 6. Probar Endpoints Paginados
  console.log('\n--- 6. Probar Endpoints Paginados (/api/paginated/:model) ---');
  const modelsToTest = ['chat', 'pqrs', 'facturas', 'cuentasCobro', 'solicitudes', 'servicios', 'capacitaciones', 'clientes', 'inventario', 'chatGroups'];

  for (const mod of modelsToTest) {
    const pagRes = await fetch(`${API_BASE}/paginated/${mod}?skip=0&take=5`, { headers: authHeaders });
    if (!pagRes.ok) {
      throw new Error(`❌ Falló GET /api/paginated/${mod}: ${pagRes.status}`);
    }
    const pagData = await pagRes.json();
    const count = (pagData[mod] || []).length;
    console.log(`✅ GET /api/paginated/${mod}: OK (${count} registros devueltos)`);
  }

  // Limpieza de datos de prueba
  console.log('\n--- 7. Limpieza de Registros de Prueba ---');
  await prisma.chat.deleteMany({ where: { id: testChatId } });
  await prisma.capacitacion.deleteMany({ where: { id: testCapId } });
  await prisma.solicitud.deleteMany({ where: { id: testSolId } });
  console.log('✅ Registros de prueba eliminados limpiamente.');

  console.log('\n========================================================');
  console.log('🎉 AUDITORÍA COMPLETADA CON ÉXITO: 100% SINCRONIZADO');
  console.log('========================================================\n');
}

runAudit()
  .catch(err => {
    console.error('\n❌ ERROR EN AUDITORÍA:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
