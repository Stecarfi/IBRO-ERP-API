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
  console.log('🚀 Iniciando Test Automatizado E2E para Módulo 10: Comisionistas...');
  const token = generateToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Obtener estado inicial
  console.log('\n--- PASO 1: GET /api/db ---');
  const getRes = await fetch(`${API_BASE}/db`, { headers });
  if (!getRes.ok) throw new Error(`Error en GET /api/db: ${getRes.status} ${await getRes.text()}`);
  const db = await getRes.json();

  console.log(`Comisionistas en DB: ${db.comisionistas?.length || 0}`);
  console.log(`Usuarios en DB: ${db.users?.length || 0}`);
  console.log(`Clientes en DB: ${db.clientes?.length || 0}`);

  const testUser = db.users?.[0];
  const testClient = db.clientes?.[0];
  const testComId = 'test_com_' + Date.now();
  const testDoc = `901${Date.now().toString().slice(-6)}`;

  // 2. Crear Comisionista de Prueba
  console.log('\n--- PASO 2: POST /api/db/sync Creación de Comisionista ---');
  const newComPayload = {
    id: testComId,
    nombre: 'Refrigeración Industrial & Aliados SAS',
    doc: testDoc,
    cedula: testDoc,
    tel: '3109998877',
    telefono: '3109998877',
    email: 'aliados@termotest.com',
    tipo: 'Aliado',
    porcentaje: 4.5,
    pct_comision: 4.5,
    banco: 'Bancolombia',
    tipoCuenta: 'Ahorros',
    numCuenta: '98765432101',
    titular: 'Refrigeración Industrial SAS',
    notas: 'Especialista en proyectos VRF y sistemas Inverter',
    ownerId: testUser?.id || null,
    estado: 'Activo'
  };

  const syncRes1 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        comisionistas: {
          upserted: [newComPayload],
          deleted: []
        }
      }
    })
  });

  if (!syncRes1.ok) {
    throw new Error(`Fallo sync creación comisionista: ${syncRes1.status} ${await syncRes1.text()}`);
  }
  const syncJson1 = await syncRes1.json();
  console.log('Respuesta sync creación:', syncJson1);

  // 3. Verificar en GET /api/db
  console.log('\n--- PASO 3: Verificar persistencia en PostgreSQL Supabase ---');
  const getRes2 = await fetch(`${API_BASE}/db`, { headers });
  const db2 = await getRes2.json();
  const foundCom = db2.comisionistas?.find(c => c.id === testComId || c.doc === testDoc);
  if (!foundCom) {
    throw new Error(`El comisionista ${testComId} no fue encontrado en GET /api/db después de sync`);
  }
  console.log('Comisionista persistido correctamente:', {
    id: foundCom.id,
    nombre: foundCom.nombre,
    doc: foundCom.doc,
    cedula: foundCom.cedula,
    porcentaje: foundCom.porcentaje,
    pct_comision: foundCom.pct_comision,
    tel: foundCom.tel,
    telefono: foundCom.telefono,
    ownerId: foundCom.ownerId
  });

  if (foundCom.doc !== testDoc || foundCom.cedula !== testDoc) {
    throw new Error(`Discrepancia en doc/cedula: ${foundCom.doc} vs ${foundCom.cedula}`);
  }
  if (foundCom.porcentaje !== 4.5 || foundCom.pct_comision !== 4.5) {
    throw new Error(`Discrepancia en porcentaje: ${foundCom.porcentaje} vs ${foundCom.pct_comision}`);
  }

  // 4. Actualizar Comisionista
  console.log('\n--- PASO 4: Actualización de Comisionista (Cambio de comisión y teléfono) ---');
  const updatePayload = {
    ...foundCom,
    porcentaje: 6.0,
    pct_comision: 6.0,
    tel: '3205554433',
    telefono: '3205554433',
    notas: 'Especialista en proyectos VRF - Actualizado a comisión preferencial'
  };

  const syncRes2 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        comisionistas: {
          upserted: [updatePayload],
          deleted: []
        }
      }
    })
  });
  if (!syncRes2.ok) throw new Error(`Fallo sync actualización comisionista: ${syncRes2.status} ${await syncRes2.text()}`);

  const getRes3 = await fetch(`${API_BASE}/db`, { headers });
  const db3 = await getRes3.json();
  const updatedCom = db3.comisionistas?.find(c => c.id === testComId);
  if (!updatedCom || updatedCom.porcentaje !== 6.0 || updatedCom.tel !== '3205554433') {
    throw new Error(`Actualización falló: ${JSON.stringify(updatedCom)}`);
  }
  console.log('Comisionista actualizado con éxito:', {
    id: updatedCom.id,
    porcentaje: updatedCom.porcentaje,
    tel: updatedCom.tel,
    notas: updatedCom.notas
  });

  // 5. Vincular a una Venta de prueba y verificar cascada segura
  console.log('\n--- PASO 5: Vincular comisionista a una Venta de prueba ---');
  const testVentaId = 'test_venta_com_' + Date.now();
  const subtotal = 10000000;
  const iva = 1900000;
  const total = subtotal + iva;
  const comisionValor = (total * updatedCom.porcentaje) / 100;

  const testVenta = {
    id: testVentaId,
    num: `PED-COM-${Date.now().toString().slice(-4)}`,
    cliente: testClient ? testClient.nom : 'Cliente Prueba Comisionistas',
    docCliente: testClient ? testClient.doc : '900111222',
    clienteId: testClient ? testClient.id : null,
    asesor: testUser ? testUser.user : 'stecarfi05',
    asesorId: testUser ? testUser.id : null,
    fecha: new Date().toISOString().split('T')[0],
    subtotal: subtotal,
    iva: iva,
    total: total,
    estado: 'Aprobado',
    comisionistaId: updatedCom.id,
    comisionistaNombre: updatedCom.nombre,
    comisionistaPorcentaje: updatedCom.porcentaje,
    comisionistaValor: comisionValor,
    comisionistaPagada: false,
    items: JSON.stringify([
      { desc: 'Unidad Condensadora VRF 10HP', cant: 1, pUnit: subtotal, total: subtotal }
    ])
  };

  const syncRes3 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        ventas: {
          upserted: [testVenta],
          deleted: []
        }
      }
    })
  });
  if (!syncRes3.ok) throw new Error(`Fallo sync venta vinculada: ${syncRes3.status} ${await syncRes3.text()}`);

  const getRes4 = await fetch(`${API_BASE}/db`, { headers });
  const db4 = await getRes4.json();
  const foundVenta = db4.ventas?.find(v => v.id === testVentaId);
  if (!foundVenta || foundVenta.comisionistaId !== updatedCom.id) {
    throw new Error(`La venta no guardó la relación comisionistaId: ${JSON.stringify(foundVenta)}`);
  }
  console.log('Venta guardada con comisionista vinculado:', {
    id: foundVenta.id,
    num: foundVenta.num,
    comisionistaId: foundVenta.comisionistaId,
    comisionistaNombre: foundVenta.comisionistaNombre,
    comisionistaValor: foundVenta.comisionistaValor
  });

  // 6. Eliminar Comisionista y verificar desvinculación en cascada segura (Foreign Key Protection)
  console.log('\n--- PASO 6: Eliminación segura de comisionista con FK activa en Venta ---');
  // Enviar sync con deleted para simular eliminación
  const syncRes4 = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        comisionistas: {
          upserted: [],
          deleted: [testComId]
        }
      }
    })
  });
  if (!syncRes4.ok) {
    throw new Error(`Fallo en eliminación de comisionista: ${syncRes4.status} ${await syncRes4.text()}`);
  }

  // Verificar que el comisionista ya no está en DB
  const getRes5 = await fetch(`${API_BASE}/db`, { headers });
  const db5 = await getRes5.json();
  const deletedCom = db5.comisionistas?.find(c => c.id === testComId);
  if (deletedCom) {
    throw new Error(`El comisionista sigue existiendo después de la eliminación`);
  }
  console.log('Comisionista eliminado satisfactoriamente de PostgreSQL');

  // Verificar que la venta NO se rompió y comisionistaId ahora es null (protección de integridad)
  const ventaAfterComDelete = db5.ventas?.find(v => v.id === testVentaId);
  if (!ventaAfterComDelete) {
    throw new Error('La venta fue eliminada indebidamente al borrar el comisionista');
  }
  console.log('Venta verificada post-eliminación de comisionista:', {
    id: ventaAfterComDelete.id,
    num: ventaAfterComDelete.num,
    comisionistaId: ventaAfterComDelete.comisionistaId
  });
  if (ventaAfterComDelete.comisionistaId !== null && ventaAfterComDelete.comisionistaId !== undefined) {
    throw new Error(`comisionistaId en Venta no fue desvinculado (sigue: ${ventaAfterComDelete.comisionistaId})`);
  }
  console.log('✅ Desvinculación de clave foránea en cascada funcionó a la perfección');

  // Limpieza de venta de prueba
  console.log('\n--- PASO 7: Limpieza final de Venta de prueba ---');
  await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      diff: {
        ventas: {
          upserted: [],
          deleted: [testVentaId]
        }
      }
    })
  });

  console.log('\n🎉 ¡Módulo 10 Comisionistas validado al 100% en PostgreSQL Supabase!');
}

runTest().catch(err => {
  console.error('\n❌ ERROR EN EL TEST DE COMISIONISTAS:', err);
  process.exit(1);
});
