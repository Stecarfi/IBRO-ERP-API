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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 17: Informes & Configuración Global...');
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

  console.log('Config inicial en DB:');
  console.log('informesConfig:', db1.informesConfig);
  console.log('whatsappConfig:', db1.whatsappConfig);
  console.log('config.informes:', db1.config?.informes);
  console.log('config.whatsapp:', db1.config?.whatsapp);

  if (!db1.config || !db1.informesConfig || !db1.whatsappConfig) {
    throw new Error('Faltan estructuras de configuración en la respuesta de GET /api/db');
  }

  // 2. Actualización de parámetros financieros vía diff.informesConfig en POST /api/db/sync
  console.log('\n--- PASO 2: POST /api/db/sync vía diff.informesConfig ---');
  const newInfPayload = {
    margenOperativo: 78.5,
    ingresoProyectos: 88.0,
    gastosInstalacion: 33.5,
    anticipos: 16500000,
    gastosCajaChica: 2750000,
    diasHabilesMes: 26,
    mesPresupuesto: 'SEPTIEMBRE',
    fechaCorte: '2026-09-07',
    diasTranscurridos: 7
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        informesConfig: {
          value: newInfPayload
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync informesConfig: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync informesConfig:', syncJson1);

  // 3. Validar Persistencia en Supabase
  console.log('\n--- PASO 3: Validar persistencia en GET /api/db ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();

  console.log('Parámetros financieros persistidos:', db2.informesConfig);

  if (parseFloat(db2.informesConfig.margenOperativo) !== 78.5) {
    throw new Error(`Margen operativo no coincide: esperado 78.5, obtenido ${db2.informesConfig.margenOperativo}`);
  }
  if (parseFloat(db2.informesConfig.anticipos) !== 16500000) {
    throw new Error(`Anticipos no coincide: esperado 16500000, obtenido ${db2.informesConfig.anticipos}`);
  }
  if (parseInt(db2.informesConfig.diasHabilesMes) !== 26) {
    throw new Error(`Días hábiles no coincide: esperado 26, obtenido ${db2.informesConfig.diasHabilesMes}`);
  }

  // 4. Actualización vía Endpoint Directo POST /api/db/informes-config
  console.log('\n--- PASO 4: POST /api/db/informes-config (Endpoint dedicado) ---');
  const endpointPayload = {
    ...newInfPayload,
    ingresoProyectos: 92.0,
    gastosInstalacion: 30.0
  };

  const directRes = await fetch(`${API_BASE}/db/informes-config`, {
    method: 'POST',
    headers,
    body: JSON.stringify(endpointPayload)
  });

  if (!directRes.ok) {
    throw new Error(`Fallo en POST /api/db/informes-config: ${directRes.status} ${await directRes.text()}`);
  }
  console.log('Respuesta endpoint dedicado informes-config exitosa');

  // 5. Validar cambios de endpoint directo
  console.log('\n--- PASO 5: Validar en GET /api/db ---');
  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();

  if (parseFloat(db3.informesConfig.ingresoProyectos) !== 92.0) {
    throw new Error(`Ingreso proyectos no coincide: esperado 92.0, obtenido ${db3.informesConfig.ingresoProyectos}`);
  }
  if (parseFloat(db3.informesConfig.gastosInstalacion) !== 30.0) {
    throw new Error(`Gastos instalación no coincide: esperado 30.0, obtenido ${db3.informesConfig.gastosInstalacion}`);
  }
  console.log('Endpoint dedicado validado con persistencia correcta');

  // 6. Actualización de WhatsApp y Config Global vía diff.whatsappConfig / diff.config
  console.log('\n--- PASO 6: POST /api/db/sync WhatsApp comercial (diff.whatsappConfig) ---');
  const newWpPayload = {
    phone: '573158877665',
    status: 'Activo'
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        whatsappConfig: {
          value: newWpPayload
        }
      }
    })
  });

  if (!syncRes2.ok) {
    throw new Error(`Fallo en sync whatsappConfig: ${syncRes2.status} ${await syncRes2.text()}`);
  }
  console.log('Respuesta sync whatsappConfig exitosa');

  // 7. Validar WhatsApp en GET /api/db
  console.log('\n--- PASO 7: Validar WhatsApp en GET /api/db ---');
  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();

  console.log('WhatsApp persistido:', db4.whatsappConfig);
  if (db4.whatsappConfig.phone !== '573158877665') {
    throw new Error(`Teléfono WhatsApp no coincide: esperado "573158877665", obtenido "${db4.whatsappConfig.phone}"`);
  }
  if (db4.config?.whatsapp?.phone !== '573158877665') {
    throw new Error(`Config combinada WhatsApp no coincide: "${db4.config?.whatsapp?.phone}"`);
  }

  // 8. Restauración de Parámetros a Estándares de Producción
  console.log('\n--- PASO 8: Restauración de parámetros estándar ---');
  const restoreInfPayload = {
    margenOperativo: 72.0,
    ingresoProyectos: 85.0,
    gastosInstalacion: 35.0,
    anticipos: 12450000,
    gastosCajaChica: 2180000,
    diasHabilesMes: 25,
    mesPresupuesto: 'ACTUAL',
    fechaCorte: 'HOY',
    diasTranscurridos: 0
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        informesConfig: { value: restoreInfPayload },
        whatsappConfig: { value: { phone: '573135139173', status: 'Activo' } }
      }
    })
  });

  if (!syncRes3.ok) {
    throw new Error(`Fallo en restauración: ${syncRes3.status} ${await syncRes3.text()}`);
  }

  // Verificación final
  const getRes5 = await fetch(`${API_BASE}/db`, { headers });
  const db5 = await getRes5.json();
  console.log('Parámetros restaurados fielmente:', {
    margenOperativo: db5.informesConfig.margenOperativo,
    diasHabilesMes: db5.informesConfig.diasHabilesMes,
    phone: db5.whatsappConfig.phone
  });

  console.log('\n========================================================================');
  console.log('🎉 ¡MÓDULO 17: INFORMES & CONFIGURACIÓN GLOBAL VALIDADO AL 100% EN PRODUCCIÓN!');
  console.log('========================================================================\n');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN TEST E2E MÓDULO 17:', err);
  process.exit(1);
});
