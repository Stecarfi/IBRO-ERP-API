const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');

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
  });

  // Configurar automatización de cumpleaños (Todos los días a las 8:00 AM)
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Verificando cumpleaños de los colaboradores...');
    try {
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const suffix = `-${month}-${day}`;

      const users = await prisma.user.findMany({
        where: {
          cumpleanos: {
            endsWith: suffix
          }
        }
      });

      for (const user of users) {
        const tituloAnuncio = `¡Feliz Cumpleaños ${user.nombre} ${user.apellido}! 🎉`;
        const fechaHoy = today.toLocaleDateString('es-ES');
        
        // Verificar si ya se creó el anuncio hoy para evitar duplicados si el server se reinicia
        const exists = await prisma.anuncio.findFirst({
          where: {
            titulo: tituloAnuncio,
            fecha: fechaHoy
          }
        });

        if (!exists) {
          const mensajeHTML = `
            <div style="text-align: center; padding: 20px; font-family: sans-serif;">
                <h1 style="color: #002060;">¡Feliz Cumpleaños, ${user.nombre}! 🎂</h1>
                <p style="font-size: 16px; color: #333;">De parte de todo el equipo, te deseamos un día maravilloso lleno de alegrías, éxitos y bendiciones. ¡Que este nuevo año de vida venga cargado de cosas buenas para ti y los tuyos!</p>
                <img src="https://media.giphy.com/media/g5R9dok94mrIvplmZd/giphy.gif" alt="Cumpleaños" style="max-width: 250px; border-radius: 10px; margin-top: 15px;" />
            </div>
          `;
          
          await prisma.anuncio.create({
            data: {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
              fecha: fechaHoy,
              titulo: tituloAnuncio,
              mensaje: "Hoy estamos de celebración. ¡Felicidades!",
              contenido: mensajeHTML,
              expiresAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Expira en 1 día
              expired: false
            }
          });
          console.log(`[CRON] Anuncio de cumpleaños creado para: ${user.nombre}`);
        }
      }
    } catch (error) {
      console.error('[CRON] Error verificando cumpleaños:', error);
    }
  });

  console.log('✅ Cron jobs configurados (Backup automático diario 2:00 AM, Cumpleaños 8:00 AM)');
}

module.exports = { setupCronJobs };
