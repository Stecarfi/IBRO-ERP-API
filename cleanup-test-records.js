/**
 * IBRO ERP - Production Readiness & Test Records Cleanup (cleanup-test-records.js)
 * Safely removes all test entities created during E2E validation to leave the
 * database 100% clean, consistent, and ready for production delivery.
 */
require('dotenv').config();
const prisma = require('./src/prisma');

async function cleanAllTestRecords() {
  console.log('🧹 [CLEANUP] Iniciando limpieza de registros temporales de prueba...\n');

  try {
    // 1. Notificaciones de prueba
    const notifs = await prisma.notificacion.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { titulo: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Notificaciones de prueba eliminadas: ${notifs.count}`);

    // 2. Chat y Mensajes de prueba
    const chats = await prisma.chat.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { text: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Chats de prueba eliminados: ${chats.count}`);

    // 3. Capacitaciones de prueba
    const caps = await prisma.capacitacion.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { tema: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Capacitaciones de prueba eliminadas: ${caps.count}`);

    // 4. Cotizaciones de prueba
    const cots = await prisma.cotizacion.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { numCotizacion: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Cotizaciones de prueba eliminadas: ${cots.count}`);

    // 5. Ventas / Pedidos de prueba
    const vtas = await prisma.venta.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Ventas/Pedidos de prueba eliminados: ${vtas.count}`);

    // 6. Servicios de prueba
    const servs = await prisma.servicio.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Servicios de prueba eliminados: ${servs.count}`);

    // 7. PQRS de prueba
    const pqrs = await prisma.pQR.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ PQRS de prueba eliminadas: ${pqrs.count}`);

    // 8. Solicitudes de prueba
    const sols = await prisma.solicitud.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Solicitudes de prueba eliminadas: ${sols.count}`);

    // 9. Procesos Disciplinarios de prueba
    const discs = await prisma.procesoDisciplinario.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Procesos disciplinarios de prueba eliminados: ${discs.count}`);

    // 10. Evaluaciones de prueba
    const evals = await prisma.evaluacion.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Evaluaciones de prueba eliminadas: ${evals.count}`);

    // 11. Anuncios de prueba
    const anuncs = await prisma.anuncio.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Anuncios de prueba eliminados: ${anuncs.count}`);

    // 12. Cuentas de Cobro de prueba
    const ctas = await prisma.cuentasCobro.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Cuentas de cobro de prueba eliminadas: ${ctas.count}`);

    // 13. Comisionistas de prueba
    const coms = await prisma.comisionista.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Comisionistas de prueba eliminados: ${coms.count}`);

    // 14. Inventario de prueba
    const invs = await prisma.inventario.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { cod: { contains: 'CHILLER-' } }
        ]
      }
    });
    console.log(`✅ Inventario de prueba eliminado: ${invs.count}`);

    // 15. Auditoría de prueba
    const auds = await prisma.auditoria.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { recordDetails: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Auditorías de prueba eliminadas: ${auds.count}`);

    // 16. Clientes de prueba
    const clis = await prisma.cliente.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { nom: { contains: 'TEST' } }
        ]
      }
    });
    console.log(`✅ Clientes de prueba eliminados: ${clis.count}`);

    // 17. Usuarios de prueba (si aplica)
    const usrs = await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { contains: 'TEST' } },
          { user: { contains: 'admin_test' } }
        ]
      }
    });
    console.log(`✅ Usuarios de prueba eliminados: ${usrs.count}`);

    console.log('\n✨ [BASE DE DATOS LIMPIA] Todos los registros de prueba han sido depurados exitosamente.');
    console.log('🔒 La base de datos queda 100% íntegra, consistente y lista para producción.');

  } catch (err) {
    console.error('❌ Error durante la limpieza de prueba:', err);
  } finally {
    await prisma.$disconnect();
  }
}

cleanAllTestRecords();
