const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

// Simular DB leyendo el db.json (para retrocompatibilidad local)
const dbPath = path.join(__dirname, '..', '..', 'IBRIO-ERP-APP', 'public', 'db.json');

const initCronJobs = () => {
    // Tarea programada que corre cada minuto para publicar comunicados programados y expirar vencidos
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();

            // 1. Persistencia fiel en PostgreSQL (Prisma)
            try {
                // Expirar comunicados cuya fecha de vencimiento ya pasó
                await prisma.anuncio.updateMany({
                    where: {
                        expired: false,
                        expiresAt: {
                            lte: now
                        }
                    },
                    data: {
                        expired: true
                    }
                });
            } catch (dbErr) {
                // Silencioso o log si la tabla aún no tiene registros
            }

            // 2. Retrocompatibilidad con db.json si existe en entorno local
            if (fs.existsSync(dbPath)) {
                const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const comunicados = data.comunicados || [];
                let updated = false;

                comunicados.forEach(c => {
                    if (c.estado === 'Programado' && c.fechaProgramada) {
                        const scheduledDate = new Date(c.fechaProgramada);
                        if (now >= scheduledDate) {
                            c.estado = 'Activo';
                            updated = true;
                            console.log(`[Cron] Comunicado ${c.id} publicado automáticamente.`);
                        }
                    }
                });

                if (updated) {
                    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
                }
            }
        } catch (error) {
            console.error('[Cron] Error en la tarea de comunicados:', error);
        }
    });

    // Tarea programada nocturna (23:59) para cierre automático de jornadas de campo huérfanas
    cron.schedule('59 23 * * *', async () => {
        try {
            const jornadaService = require('./services/campo/jornada.service');
            const result = await jornadaService.cerrarJornadasHuerfanas();
            if (result.totalCerradas > 0) {
                console.log(`[Cron Campo] Se cerraron automáticamente ${result.totalCerradas} jornadas huérfanas.`);
            }
        } catch (error) {
            console.error('[Cron Campo] Error cerrando jornadas huérfanas:', error.message);
        }
    });
    
    console.log('[Cron] Servicio de tareas en segundo plano iniciado.');
};

module.exports = { initCronJobs };

