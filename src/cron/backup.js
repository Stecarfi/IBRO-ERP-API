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
    console.log(`[CRON] Generando reporte oficial de actividad de sesiones: ${reportName}...`);
    try {
      const { sendDailyLoginReportEmail } = require('../emailService');
      const timeZone = process.env.TIMEZONE || 'America/Bogota';
      const now = new Date();

      // Calcular fecha comercial de Colombia (UTC-5)
      const formatterDate = new Intl.DateTimeFormat('en-CA', { 
        timeZone, 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      });
      const fechaHoyStr = formatterDate.format(now); // 'YYYY-MM-DD'

      const formatterPretty = new Intl.DateTimeFormat('es-CO', {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const dateStr = formatterPretty.format(now);

      // Límites exactos del día comercial en UTC (00:00:00 COT = 05:00:00Z | 23:59:59 COT = 04:59:59Z día siguiente)
      const startOfDay = new Date(`${fechaHoyStr}T05:00:00.000Z`);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000 - 1);

      // Obtener todos los colaboradores habilitados en el sistema
      const allUsers = await prisma.user.findMany({
        where: { isLocked: false },
        include: { role: { select: { id: true, name: true } } },
        orderBy: { nombre: 'asc' }
      });

      const onlineUsers = [];
      const activeTodayUsers = [];
      const inactiveUsers = [];

      for (const u of allUsers) {
        // 1. Auditorías del día (inicios de sesión o acciones registradas)
        const auditsToday = await prisma.auditoria.findMany({
          where: {
            userId: u.id,
            fecha: { gte: startOfDay, lte: endOfDay }
          },
          orderBy: { fecha: 'asc' }
        });

        const loginAuditToday = auditsToday.filter(a => a.action === 'LOGIN');

        // 2. Jornada laboral iniciada, en ruta o completada hoy
        const jornadaToday = await prisma.jornadaLaboral.findFirst({
          where: {
            usuarioId: u.id,
            OR: [
              { horaInicio: { gte: startOfDay, lte: endOfDay } },
              { fecha: { gte: startOfDay, lte: endOfDay } },
              { estado: { in: ['Iniciada', 'En Pausa', 'En Ruta'] } }
            ]
          },
          orderBy: { horaInicio: 'desc' }
        });

        // 3. Telemetría y visitas en campo registradas hoy
        const visitasHoy = await prisma.visitaCampo.count({
          where: {
            usuarioId: u.id,
            checkInHora: { gte: startOfDay, lte: endOfDay }
          }
        });

        // 4. Verificación de última sesión
        const lastLoginDate = u.lastLogin ? new Date(u.lastLogin) : null;
        const lastLoginToday = Boolean(lastLoginDate && lastLoginDate.getTime() >= startOfDay.getTime() && lastLoginDate.getTime() <= endOfDay.getTime());
        const isOnlineNow = Boolean(u.isOnline);

        // Determinación de ingreso real en la jornada
        const ingresoHoy = isOnlineNow || lastLoginToday || auditsToday.length > 0 || Boolean(jornadaToday) || visitasHoy > 0;

        // Determinar hora de primer ingreso hoy
        let primerIngreso = null;
        if (loginAuditToday.length > 0) {
          primerIngreso = loginAuditToday[0].fecha;
        } else if (jornadaToday?.horaInicio) {
          primerIngreso = jornadaToday.horaInicio;
        } else if (auditsToday.length > 0) {
          primerIngreso = auditsToday[0].fecha;
        } else if (lastLoginToday) {
          primerIngreso = lastLoginDate;
        }

        // Determinar hora de última actividad hoy
        let ultimoAccesoHoy = null;
        if (isOnlineNow) {
          ultimoAccesoHoy = now;
        } else if (auditsToday.length > 0) {
          ultimoAccesoHoy = auditsToday[auditsToday.length - 1].fecha;
        } else if (jornadaToday?.horaFin) {
          ultimoAccesoHoy = jornadaToday.horaFin;
        } else if (lastLoginToday) {
          ultimoAccesoHoy = lastLoginDate;
        }

        // Determinar último acceso histórico si no entró hoy
        let ultimoAccesoHistorico = lastLoginDate;
        if (!ultimoAccesoHistorico) {
          const lastAudit = await prisma.auditoria.findFirst({
            where: { userId: u.id },
            orderBy: { fecha: 'desc' }
          });
          if (lastAudit) ultimoAccesoHistorico = lastAudit.fecha;
        }

        const userData = {
          id: u.id,
          user: u.user,
          nombre: `${u.nombre} ${u.apellido || ''}`.trim(),
          cargo: u.cargo || u.role?.name || 'Colaborador',
          correo: u.correo,
          isOnline: isOnlineNow,
          primerIngreso,
          ultimoAccesoHoy,
          ultimoAccesoHistorico,
          tieneJornada: Boolean(jornadaToday),
          estadoJornada: jornadaToday?.estado || null,
          visitasHoy,
          totalAuditsToday: auditsToday.length
        };

        if (isOnlineNow) {
          onlineUsers.push(userData);
        } else if (ingresoHoy) {
          activeTodayUsers.push(userData);
        } else {
          inactiveUsers.push(userData);
        }
      }

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
