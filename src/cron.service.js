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
    
    console.log('[Cron] Servicio de tareas en segundo plano iniciado.');
};

module.exports = { initCronJobs };
