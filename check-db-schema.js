const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const tables = ['User', 'Role', 'Cliente', 'Inventario', 'Venta', 'VentaItem', 'Cotizacion', 'CotizacionItem', 'Servicio', 'PQR', 'Solicitud', 'ProcesoDisciplinario', 'Evaluacion', 'Anuncio', 'Capacitacion', 'Comisionista', 'CuentasCobro', 'Chat', 'ChatGroup', 'Auditoria', 'Notificacion', 'WhatsappConfig', 'InformesConfig'];
    
    console.log('=== VERIFICANDO COLUMNAS EN POSTGRESQL ===\n');
    for (const table of tables) {
      const cols = await prisma.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`);
      console.log(`Tabla: ${table} (${cols.length} columnas)`);
      console.log(cols.map(c => `${c.column_name}: ${c.data_type} (${c.is_nullable})`).join(', '));
      console.log('---');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
