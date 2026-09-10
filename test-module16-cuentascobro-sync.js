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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 16: Cuentas de Cobro...');
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

  console.log(`Cuentas de Cobro iniciales en DB: ${db1.cuentasCobro?.length || 0}`);

  const testCcId = 'cc_test_' + Date.now();
  const hoyIso = new Date().toISOString();

  // 2. Creación de Cuenta de Cobro vía diff.cuentasCobro
  console.log('\n--- PASO 2: POST /api/db/sync Creación de Cuenta de Cobro (diff.cuentasCobro) ---');
  const initialItems = [
    { desc: '1 Mantenimiento preventivo sistema VRF Piso 4', valorSinIva: 1200000, valorPart: 850000 },
    { desc: '2 Cambio de filtros y recarga refrigerante R410A', valorSinIva: 600000, valorPart: 450000 }
  ];

  const newCcPayload = {
    id: testCcId,
    ciudad: 'Cartagena de Indias',
    fecha: hoyIso,
    cuenta: 'CC-2026-TEST',
    num: 'CC-2026-TEST',
    nombre: 'Ingeniería & Climatización del Caribe',
    comisionista: 'Ingeniería & Climatización del Caribe',
    cedula: '901234567-8',
    correo: 'cuentas@climacaribe.com',
    concepto: 'HONORARIOS POR MANTENIMIENTO PREVENTIVO DE CLIMATIZACIÓN',
    items: initialItems,
    nequi: '3159988776',
    titular: 'Ingeniería & Climatización del Caribe',
    estado: 'Pendiente de Pago',
    total: 1300000
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        cuentasCobro: {
          upserted: [newCcPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo en sync creación de cuenta de cobro: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Validar Persistencia y Mapeo Bidireccional
  console.log('\n--- PASO 3: Validar persistencia y mapeo dual (cuenta/num, nombre/comisionista, items JSON) ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const persistedCc = db2.cuentasCobro?.find(c => c.id === testCcId);

  if (!persistedCc) {
    throw new Error(`La cuenta de cobro ${testCcId} no fue encontrada en GET /api/db`);
  }
  console.log('Cuenta de cobro persistida correctamente:', {
    id: persistedCc.id,
    cuenta: persistedCc.cuenta,
    num: persistedCc.num,
    nombre: persistedCc.nombre,
    comisionista: persistedCc.comisionista,
    cedula: persistedCc.cedula,
    estado: persistedCc.estado,
    total: persistedCc.total,
    itemsCount: persistedCc.items?.length
  });

  if (persistedCc.cuenta !== 'CC-2026-TEST' || persistedCc.num !== 'CC-2026-TEST') {
    throw new Error(`Mapeo dual cuenta/num falló: cuenta="${persistedCc.cuenta}", num="${persistedCc.num}"`);
  }
  if (persistedCc.nombre !== 'Ingeniería & Climatización del Caribe' || persistedCc.comisionista !== 'Ingeniería & Climatización del Caribe') {
    throw new Error(`Mapeo dual nombre/comisionista falló: nombre="${persistedCc.nombre}", comisionista="${persistedCc.comisionista}"`);
  }
  if (!Array.isArray(persistedCc.items) || persistedCc.items.length !== 2) {
    throw new Error(`El campo items JSON no se deserializó como Array de 2 elementos: ${JSON.stringify(persistedCc.items)}`);
  }
  if (parseFloat(persistedCc.total) !== 1300000) {
    throw new Error(`Total esperado 1300000, obtenido ${persistedCc.total}`);
  }

  // 4. Actualización de la Cuenta de Cobro (Edición / Pago)
  console.log('\n--- PASO 4: Actualización a estado "Pagada" y adición de ítems ---');
  const updatedItems = [
    ...initialItems,
    { desc: '3 Diagnóstico y calibración de termostatos inteligentes', valorSinIva: 300000, valorPart: 200000 }
  ];

  const updatedPayload = {
    ...persistedCc,
    estado: 'Pagada',
    items: updatedItems,
    total: 1500000
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        cuentasCobro: {
          upserted: [updatedPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes2.ok) {
    throw new Error(`Fallo en sync actualización de cuenta de cobro: ${syncRes2.status} ${await syncRes2.text()}`);
  }
  console.log('Respuesta sync actualización exitosa');

  // 5. Validar actualización
  console.log('\n--- PASO 5: Validar estado "Pagada" e items en GET /api/db ---');
  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const verifiedCc = db3.cuentasCobro?.find(c => c.id === testCcId);

  if (!verifiedCc) {
    throw new Error(`No se encontró la cuenta de cobro tras la actualización`);
  }
  if (verifiedCc.estado !== 'Pagada') {
    throw new Error(`Estado no actualizado: esperado "Pagada", obtenido "${verifiedCc.estado}"`);
  }
  if (!Array.isArray(verifiedCc.items) || verifiedCc.items.length !== 3) {
    throw new Error(`Items actualizados fallaron: esperado 3, obtenido ${verifiedCc.items?.length}`);
  }
  if (parseFloat(verifiedCc.total) !== 1500000) {
    throw new Error(`Total actualizado no coincide: esperado 1500000, obtenido ${verifiedCc.total}`);
  }
  console.log('Actualización validada:', {
    estado: verifiedCc.estado,
    itemsCount: verifiedCc.items.length,
    total: verifiedCc.total
  });

  // 6. Eliminación Limpia
  console.log('\n--- PASO 6: Eliminación limpia (diff.cuentasCobro.deleted) ---');
  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        cuentasCobro: {
          upserted: [],
          deleted: [testCcId]
        }
      }
    })
  });

  if (!syncRes3.ok) {
    throw new Error(`Fallo en eliminación limpia: ${syncRes3.status} ${await syncRes3.text()}`);
  }
  console.log('Respuesta sync eliminación exitosa');

  // 7. Verificación final de eliminación
  console.log('\n--- PASO 7: Verificar eliminación en GET /api/db ---');
  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const deletedCc = db4.cuentasCobro?.find(c => c.id === testCcId);

  if (deletedCc) {
    throw new Error(`La cuenta de cobro ${testCcId} aún existe en la base de datos`);
  }

  console.log('\n===============================================================');
  console.log('🎉 ¡MÓDULO 16: CUENTAS DE COBRO VALIDADO AL 100% EN PRODUCCIÓN!');
  console.log('===============================================================\n');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN TEST E2E MÓDULO 16:', err);
  process.exit(1);
});
