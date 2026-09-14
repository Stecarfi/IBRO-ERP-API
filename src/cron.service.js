const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Simular DB leyendo el db.json 
const dbPath = path.join(__dirname, '..', '..', 'IBRIO-ERP-APP', 'public', 'db.json');

const initCronJobs = () => {
    // Tarea programada que corre cada minuto para publicar comunicados programados
    cron.schedule('* * * * *', () => {
        try {
            if (!fs.existsSync(dbPath)) return;
            const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            const comunicados = data.comunicados || [];
            let updated = false;
            const now = new Date();

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
