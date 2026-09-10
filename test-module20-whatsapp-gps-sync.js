const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = 'ibro_super_secret_jwt_key_2026_!@#';
const API_URL = 'http://localhost:3000';

async function runTest() {
  console.log('=== TEST MÓDULO 20: WHATSAPP COMERCIAL & UBICACIÓN GPS ===\n');

  try {
    // 1. Obtener usuario de prueba
    const testUser = await prisma.user.findFirst({
      where: { user: 'stecarfi05' }
    });
    if (!testUser) {
      throw new Error('Usuario stecarfi05 no encontrado en la base de datos');
    }
    console.log(`[1] Usuario de prueba: ${testUser.user} (ID: ${testUser.id})`);

    const token = jwt.sign(
      { id: testUser.id, user: testUser.user, roleId: String(testUser.roleId || '1') },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 2. Verificar estado inicial en GET /api/db
    console.log('\n[2] Consultando GET /api/db para WhatsApp y Usuarios...');
    const resInitial = await fetch(`${API_URL}/api/db`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resInitial.ok) {
      throw new Error(`GET /api/db falló con status ${resInitial.status}`);
    }
    const dbInitial = await resInitial.json();
    console.log(` -> whatsappConfig: ${JSON.stringify(dbInitial.whatsappConfig)}`);
    console.log(` -> config.whatsapp: ${JSON.stringify(dbInitial.config?.whatsapp)}`);

    const initialUserInDb = (dbInitial.users || []).find(u => u.user === testUser.user);
    console.log(` -> Telefono actual del usuario: ${initialUserInDb?.telefono || 'N/A'}`);
    console.log(` -> GPS actual: lat=${initialUserInDb?.lat}, lng=${initialUserInDb?.lng}`);

    // Guardar valores previos para restaurar
    const prevPhone = initialUserInDb?.telefono || testUser.telefono || '';
    const prevWpConfig = dbInitial.whatsappConfig || { phone: '573000000000', status: 'Activo' };

    // 3. Probar POST /api/location/update
    console.log('\n[3] Probando reporte de telemetría GPS vía POST /api/location/update...');
    const testLat = 10.987654;
    const testLng = -74.798765;
    const resLocationUpdate = await fetch(`${API_URL}/api/location/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        user: testUser.user,
        lat: testLat,
        lng: testLng
      })
    });

    if (!resLocationUpdate.ok) {
      const errTxt = await resLocationUpdate.text();
      throw new Error(`POST /api/location/update falló (${resLocationUpdate.status}): ${errTxt}`);
    }
    const locResJson = await resLocationUpdate.json();
    console.log(` -> Respuesta reporte ubicación:`, locResJson);
    if (!locResJson.success) {
      throw new Error('La respuesta de ubicación no reportó success: true');
    }

    // 4. Probar GET /api/location/users
    console.log('\n[4] Consultando radar GPS vía GET /api/location/users...');
    const resLocationUsers = await fetch(`${API_URL}/api/location/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resLocationUsers.ok) {
      const errTxt = await resLocationUsers.text();
      throw new Error(`GET /api/location/users falló (${resLocationUsers.status}): ${errTxt}`);
    }
    const locationUsers = await resLocationUsers.json();
    console.log(` -> Dispositivos con GPS activo: ${locationUsers.length}`);
    const reportedUser = locationUsers.find(u => u.user === testUser.user || u.username === testUser.user);
    if (!reportedUser) {
      throw new Error(`El usuario ${testUser.user} no aparece en la lista de ubicaciones activas`);
    }
    console.log(` -> Usuario localizado en radar:`, {
      id: reportedUser.id,
      user: reportedUser.user || reportedUser.username,
      nombre: reportedUser.nombre,
      lat: reportedUser.lat,
      lng: reportedUser.lng,
      lastLocationUpdate: reportedUser.lastLocationUpdate
    });

    if (Math.abs(reportedUser.lat - testLat) > 0.0001 || Math.abs(reportedUser.lng - testLng) > 0.0001) {
      throw new Error(`Coordenadas no coinciden: esperado (${testLat}, ${testLng}), recibido (${reportedUser.lat}, ${reportedUser.lng})`);
    }
    if (!reportedUser.lastLocationUpdate || typeof reportedUser.lastLocationUpdate !== 'number') {
      throw new Error(`lastLocationUpdate inválido o no numérico: ${reportedUser.lastLocationUpdate}`);
    }

    // 5. Probar actualización de WhatsApp Comercial vía POST /api/db/sync
    console.log('\n[5] Actualizando línea comercial de usuario y línea oficial de empresa vía POST /api/db/sync...');
    const newTestPhone = '573009998811';
    const newCompanyPhone = '573117776655';

    const syncPayload = {
      users: {
        upserted: [
          {
            id: testUser.id,
            user: testUser.user,
            nombre: testUser.nombre,
            apellido: testUser.apellido,
            cedula: testUser.cedula,
            correo: testUser.correo,
            cargo: testUser.cargo,
            roleId: String(testUser.roleId || '1'),
            telefono: newTestPhone
          }
        ],
        deleted: []
      },
      whatsappConfig: {
        value: {
          id: 1,
          phone: newCompanyPhone,
          status: 'Activo'
        }
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
      const errTxt = await resSync.text();
      throw new Error(`POST /api/db/sync falló (${resSync.status}): ${errTxt}`);
    }
    const syncResJson = await resSync.json();
    console.log(` -> Respuesta sync:`, syncResJson);

    // 6. Verificar persistencia en GET /api/db y en PostgreSQL directo
    console.log('\n[6] Verificando persistencia post-guardado en base de datos...');
    const resDbVerify = await fetch(`${API_URL}/api/db`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resDbVerify.ok) throw new Error('GET /api/db falló en verificación');
    const dbVerify = await resDbVerify.json();

    const verifiedUser = (dbVerify.users || []).find(u => u.user === testUser.user);
    if (verifiedUser?.telefono !== newTestPhone) {
      throw new Error(`Teléfono de usuario no actualizado: esperado ${newTestPhone}, recibido ${verifiedUser?.telefono}`);
    }
    console.log(` -> Teléfono personal persistido con éxito: ${verifiedUser.telefono}`);

    if (dbVerify.whatsappConfig?.phone !== newCompanyPhone) {
      throw new Error(`Línea oficial de WhatsApp no actualizada: esperado ${newCompanyPhone}, recibido ${dbVerify.whatsappConfig?.phone}`);
    }
    console.log(` -> Línea oficial de WhatsApp persistida con éxito: ${dbVerify.whatsappConfig.phone}`);

    // 7. Restaurar valores originales
    console.log('\n[7] Restaurando valores originales...');
    await fetch(`${API_URL}/api/db/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        diff: {
          users: {
            upserted: [
              {
                id: testUser.id,
                user: testUser.user,
                nombre: testUser.nombre,
                apellido: testUser.apellido,
                cedula: testUser.cedula,
                correo: testUser.correo,
                cargo: testUser.cargo,
                roleId: String(testUser.roleId || '1'),
                telefono: prevPhone
              }
            ],
            deleted: []
          },
          whatsappConfig: {
            value: {
              id: 1,
              phone: prevWpConfig.phone || '573000000000',
              status: prevWpConfig.status || 'Activo'
            }
          }
        }
      })
    });
    console.log(' -> Valores restaurados exitosamente.');

    console.log('\n=== ¡TODAS LAS PRUEBAS DEL MÓDULO 20 PASARON CON ÉXITO! ===\n');
  } catch (error) {
    console.error('❌ ERROR EN TEST MÓDULO 20:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
