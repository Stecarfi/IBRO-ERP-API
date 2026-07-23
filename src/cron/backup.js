const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function setupCronJobs() {
  // Configurar backup automático (Todos los días a las 2:00 AM)
  cron.schedule('0 2 * * *', () => {
    console.log('[CRON] Iniciando respaldo de la base de datos...');
    
    const backupDir = path.join(__dirname, '../../../backups'); // Fuera del código fuente
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `ibro_erp_backup_${timestamp}.sql`);
    
    // Comando para PostgreSQL pg_dump (asume pg_dump en el PATH del servidor)
    const dbUrl = process.env.DATABASE_URL; 
    if (!dbUrl) {
      console.error('[CRON] DATABASE_URL no definida. Backup abortado.');
      return;
    }

    const command = `pg_dump "${dbUrl}" > "${backupFile}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[CRON] Error ejecutando el respaldo: ${error.message}`);
        return;
      }
      console.log(`[CRON] Respaldo completado exitosamente: ${backupFile}`);
    });
  });

  console.log('✅ Cron jobs configurados (Backup automático diario 2:00 AM)');
}

module.exports = { setupCronJobs };
