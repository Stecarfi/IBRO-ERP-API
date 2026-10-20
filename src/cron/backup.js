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
    const backupFile = path.join(backupDir, `gerp_backup_${timestamp}.sql`);
    
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

  // Configurar automatización de cumpleaños (Todos los días a las 8:00 AM)
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Verificando cumpleaños de los colaboradores...');
    try {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      const candidateUsers = await prisma.user.findMany({
        where: {
          cumpleanos: { not: null },
          isLocked: false
        }
      });

      const users = candidateUsers.filter(u => {
        if (!u.cumpleanos) return false;
        const b = new Date(u.cumpleanos);
        return (b.getUTCMonth() + 1 === currentMonth && b.getUTCDate() === currentDay) ||
               (b.getMonth() + 1 === currentMonth && b.getDate() === currentDay);
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
                <h1 style="color: #002060;">¡Feliz Cumpleaños, ${`${user.nombre} ${user.apellido || ''}`.trim()}! 🎂</h1>
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

  // Configurar reporte de inactividad de sesión de Medio Día (12:00 PM COT) Lunes a Sábado
  cron.schedule('0 12 * * 1-6', async () => {
    await generateActivityReport("Corte de Medio Día (12:00 PM)");
  }, { scheduled: true, timezone: "America/Bogota" });

  // Configurar reporte de inactividad de sesión de Fin de Jornada (17:00 PM COT) Lunes a Sábado
  cron.schedule('0 17 * * 1-6', async () => {
    await generateActivityReport("Corte de Fin de Jornada (05:00 PM)");
  }, { scheduled: true, timezone: "America/Bogota" });

  console.log('✅ Cron jobs configurados (Backup 2:00 AM, Cumpleaños 8:00 AM, Reportes de Sesión 12:00 PM y 5:00 PM en timezone America/Bogota)');
}

// Función oficial para generar y enviar el reporte de actividad con trazabilidad real
async function generateActivityReport(reportName = "Corte de Control") {
    console.log(`[CRON] Generando reporte oficial de auditoría de sesiones basado en evidencia: ${reportName}...`);
    try {
      const { sendDailyLoginReportEmail } = require('../emailService');
      const auditoriaService = require('../services/auditoria.service');
      const timeZone = process.env.TIMEZONE || 'America/Bogota';
      const now = new Date();

      const formatterPretty = new Intl.DateTimeFormat('es-CO', {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const dateStr = formatterPretty.format(now);
      const fechaHoyStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const startOfDay = new Date(`${fechaHoyStr}T05:00:00.000Z`);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000 - 1);

      // OBTENER SESIONES BASADO EXCLUSIVAMENTE EN EVIDENCIA REAL (PROHIBIDO SIMULAR O ESTIMAR)
      const dataPresencia = await auditoriaService.obtenerSesionesActivas(now);
      const onlineUsers = dataPresencia.onlineUsers;
      const activeTodayUsers = dataPresencia.activeTodayUsers;
      const inactivosPendientes = dataPresencia.inactivosPendientes;
      const inactivosProlongados = dataPresencia.inactivosProlongados;
      const inactiveUsers = [...inactivosPendientes, ...inactivosProlongados];

      // Obtener Administrador Master, Directores, Gerencia y Delegados
      const adminsAndDirectors = await prisma.user.findMany({
        where: {
          isLocked: false,
          OR: [
            { cargo: { contains: 'Administrad', mode: 'insensitive' } },
            { cargo: { contains: 'Director', mode: 'insensitive' } },
            { cargo: { contains: 'Gerente', mode: 'insensitive' } },
            { cargo: { contains: 'Gerencia', mode: 'insensitive' } },
            { role: { name: { contains: 'Administrador', mode: 'insensitive' } } },
            { role: { name: { contains: 'Dirección', mode: 'insensitive' } } },
            { role: { name: { contains: 'Gerencia', mode: 'insensitive' } } },
            { esDelegadoGerencia: true }
          ]
        },
        select: { correo: true }
      });
      
      const adminEmails = adminsAndDirectors.map(a => a.correo).filter(Boolean);
      const uniqueAdminEmails = [...new Set(adminEmails)];

      console.log(`[CRON] Resumen ${reportName}: En Línea: ${onlineUsers.length}, Activos Jornada: ${activeTodayUsers.length}, Inactivos: ${inactiveUsers.length}. Destinatarios: ${uniqueAdminEmails.join(', ')}`);

      // Enviar reporte consolidado oficial
      if (uniqueAdminEmails.length > 0) {
        await sendDailyLoginReportEmail({
          adminEmails: uniqueAdminEmails,
          onlineUsers,
          activeTodayUsers,
          inactiveUsers,
          dateStr,
          reportName,
          timeZone,
          metaInfo: {
            fechaHoyStr,
            startOfDayUtc: startOfDay.toISOString(),
            endOfDayUtc: endOfDay.toISOString()
          }
        });
      }

      return {
        success: true,
        fecha: fechaHoyStr,
        reportName,
        onlineUsersCount: onlineUsers.length,
        activeTodayUsersCount: activeTodayUsers.length,
        inactiveUsersCount: inactiveUsers.length,
        recipients: uniqueAdminEmails
      };
    } catch (error) {
      console.error(`[CRON] Error generando reporte oficial de actividad (${reportName}):`, error);
      return { success: false, error: error.message };
    }
}

module.exports = { setupCronJobs, generateActivityReport };
