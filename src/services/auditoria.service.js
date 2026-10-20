const prisma = require('../prisma');
const crypto = require('crypto');

/**
 * Servicio Centralizado de Auditoría de Sesiones y Presencia Efectiva
 * Principio: EL FRONTEND ES LA FUENTE ÚNICA Y OFICIAL DE PRESENCIA.
 * El backend no simula, infiere ni fabrica estados.
 */

// Utilidad para extraer IP real
function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return list.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

// Utilidad para parsear User-Agent
function parseUserAgent(ua = '') {
  if (!ua) return { navegador: 'Desconocido', so: 'Desconocido', dispositivo: 'Desktop' };
  
  let so = 'Desconocido';
  if (/windows phone/i.test(ua)) so = 'Windows Phone';
  else if (/win64|win32|windows/i.test(ua)) {
    if (/windows nt 10\.0/i.test(ua)) so = 'Windows 10/11';
    else if (/windows nt 6\.3/i.test(ua)) so = 'Windows 8.1';
    else if (/windows nt 6\.1/i.test(ua)) so = 'Windows 7';
    else so = 'Windows';
  } else if (/android/i.test(ua)) so = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) so = 'iOS';
  else if (/macintosh|mac os x/i.test(ua)) so = 'macOS';
  else if (/linux/i.test(ua)) so = 'Linux';

  let navegador = 'Desconocido';
  if (/edg\//i.test(ua)) {
    const m = ua.match(/edg\/([\d.]+)/i);
    navegador = `Edge ${m ? m[1].split('.')[0] : ''}`.trim();
  } else if (/opr\/|opera/i.test(ua)) {
    const m = ua.match(/(?:opr|opera)\/([\d.]+)/i);
    navegador = `Opera ${m ? m[1].split('.')[0] : ''}`.trim();
  } else if (/chrome|crios/i.test(ua)) {
    const m = ua.match(/(?:chrome|crios)\/([\d.]+)/i);
    navegador = `Chrome ${m ? m[1].split('.')[0] : ''}`.trim();
  } else if (/firefox|fxios/i.test(ua)) {
    const m = ua.match(/(?:firefox|fxios)\/([\d.]+)/i);
    navegador = `Firefox ${m ? m[1].split('.')[0] : ''}`.trim();
  } else if (/safari/i.test(ua)) {
    const m = ua.match(/version\/([\d.]+)/i);
    navegador = `Safari ${m ? m[1].split('.')[0] : ''}`.trim();
  }

  let dispositivo = 'Desktop';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    dispositivo = 'Móvil';
  } else if (/ipad|tablet/i.test(ua)) {
    dispositivo = 'Tablet';
  }

  return { navegador, so, dispositivo };
}

// Utilidad para límites del día en Colombia (UTC-5)
function getColombiaDayBounds(targetDate = new Date()) {
  const timeZone = process.env.TIMEZONE || 'America/Bogota';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const fechaHoyStr = formatter.format(targetDate); // 'YYYY-MM-DD'
  // 00:00:00 COT = 05:00:00Z
  const startOfDay = new Date(`${fechaHoyStr}T05:00:00.000Z`);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000 - 1);
  return { fechaHoyStr, startOfDay, endOfDay };
}

class AuditoriaService {
  /**
   * Registra un evento real proveniente del frontend
   */
  async registrarEvento(req, {
    userId,
    userLogin,
    action,
    modulo = 'General',
    recordDetails = '',
    metadata = null,
    sessionId = null,
    tabStatus = 'ACTIVA',
    elapsedActiveSeconds = 0,
    elapsedIdleSeconds = 0
  }) {
    if (!userId && !userLogin) {
      throw new Error('Se requiere userId o userLogin para registrar auditoría');
    }

    let targetUser = null;
    if (userId) {
      targetUser = await prisma.user.findUnique({ where: { id: userId } });
    } else if (userLogin) {
      targetUser = await prisma.user.findFirst({
        where: { user: { equals: String(userLogin).trim(), mode: 'insensitive' } }
      });
    }

    if (!targetUser) {
      throw new Error(`Usuario no encontrado: ${userId || userLogin}`);
    }

    const now = new Date();
    const ip = getClientIp(req);
    const uaHeader = req?.headers?.['user-agent'] || '';
    const { navegador, so, dispositivo } = parseUserAgent(uaHeader);

    // Hash SHA-256 criptográfico para inmutabilidad del evento
    const rawData = `${targetUser.id}|${now.toISOString()}|${action}|${modulo}|${ip}|${uaHeader}|${JSON.stringify(metadata || {})}`;
    const hash = crypto.createHash('sha256').update(rawData).digest('hex');

    // 1. Guardar evento en tabla Auditoria
    const auditRecord = await prisma.auditoria.create({
      data: {
        userId: targetUser.id,
        fecha: now,
        action: String(action || 'ACCION').toUpperCase(),
        modulo: String(modulo || 'General'),
        recordDetails: typeof recordDetails === 'object' ? JSON.stringify(recordDetails) : String(recordDetails || ''),
        shadowingData: metadata || null,
        hash,
        ip,
        navegador,
        so,
        dispositivo,
        sessionId: sessionId ? String(sessionId) : null,
        tabStatus: String(tabStatus || 'ACTIVA')
      }
    });

    // 2. Determinar estado de la sesión según evento y visibilidad
    let sessionEstado = 'EN_LINEA';
    const actionUpper = String(action || '').toUpperCase();

    if (actionUpper === 'LOGOUT' || actionUpper === 'BEFORE_UNLOAD' || actionUpper === 'UNEXPECTED_CLOSE') {
      sessionEstado = 'DESCONECTADO';
    } else if (actionUpper === 'IDLE' || actionUpper === 'INACTIVO' || tabStatus === 'MINIMIZADA' || tabStatus === 'SEGUNDO_PLANO') {
      sessionEstado = 'INACTIVO';
    } else {
      sessionEstado = 'EN_LINEA';
    }

    // 3. Crear o actualizar AuditoriaSesion
    let activeSession = null;
    const { startOfDay, endOfDay } = getColombiaDayBounds(now);

    try {
      if (sessionId) {
        activeSession = await prisma.auditoriaSesion.findFirst({
          where: { tokenSession: String(sessionId) }
        });
      }

      if (!activeSession) {
        // Buscar sesión del usuario de hoy que no esté formalmente desconectada
        activeSession = await prisma.auditoriaSesion.findFirst({
          where: {
            userId: targetUser.id,
            fechaInicio: { gte: startOfDay, lte: endOfDay },
            estado: { in: ['EN_LINEA', 'INACTIVO'] }
          },
          orderBy: { fechaInicio: 'desc' }
        });
      }

      const activeSecs = Math.max(0, parseInt(elapsedActiveSeconds) || 0);
      const idleSecs = Math.max(0, parseInt(elapsedIdleSeconds) || 0);

      if (activeSession) {
        const modulosSet = new Set(Array.isArray(activeSession.modulosVisitados) ? activeSession.modulosVisitados : []);
        if (modulo) modulosSet.add(modulo);

        const isClosing = sessionEstado === 'DESCONECTADO';

        activeSession = await prisma.auditoriaSesion.update({
          where: { id: activeSession.id },
          data: {
            ultimaActividad: now,
            estado: sessionEstado,
            fechaFin: isClosing ? now : activeSession.fechaFin,
            ip,
            navegador,
            so,
            dispositivo,
            userAgent: uaHeader.substring(0, 500),
            tabStatus,
            tiempoActivoSegundos: { increment: activeSecs },
            tiempoInactivoSegundos: { increment: idleSecs },
            tiempoTotalSegundos: { increment: activeSecs + idleSecs },
            totalEventos: { increment: 1 },
            modulosVisitados: Array.from(modulosSet),
            ultimoEventoId: auditRecord.id,
            ultimoEventoTipo: actionUpper,
            ultimoEventoModulo: modulo,
            ultimoEventoDesc: typeof recordDetails === 'string' ? recordDetails.substring(0, 255) : '',
            ultimoEventoFecha: now
          }
        });
      } else {
        // Crear nueva sesión oficial
        activeSession = await prisma.auditoriaSesion.create({
          data: {
            userId: targetUser.id,
            tokenSession: sessionId ? String(sessionId) : `ses_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            fechaInicio: now,
            fechaFin: sessionEstado === 'DESCONECTADO' ? now : null,
            ultimaActividad: now,
            estado: sessionEstado,
            ip,
            navegador,
            so,
            dispositivo,
            userAgent: uaHeader.substring(0, 500),
            tabStatus,
            tiempoActivoSegundos: activeSecs,
            tiempoInactivoSegundos: idleSecs,
            tiempoTotalSegundos: activeSecs + idleSecs,
            totalEventos: 1,
            modulosVisitados: modulo ? [modulo] : [],
            ultimoEventoId: auditRecord.id,
            ultimoEventoTipo: actionUpper,
            ultimoEventoModulo: modulo,
            ultimoEventoDesc: typeof recordDetails === 'string' ? recordDetails.substring(0, 255) : '',
            ultimoEventoFecha: now
          }
        });
      }

      // 4. Sincronizar flag isOnline en User con la realidad del frontend
      await prisma.user.update({
        where: { id: targetUser.id },
        data: {
          isOnline: sessionEstado === 'EN_LINEA',
          ...(actionUpper === 'LOGIN' ? { lastLogin: now.toISOString() } : {})
        }
      });
    } catch (sessionErr) {
      console.warn('[AuditoriaService] Error actualizando AuditoriaSesion:', sessionErr.message);
    }

    return {
      success: true,
      eventId: auditRecord.id,
      hash,
      fecha: now,
      estado: sessionEstado,
      session: activeSession
    };
  }

  /**
   * Heartbeat periódico enviado desde el frontend
   */
  async procesarHeartbeat(req, { userId, userLogin, sessionId, tabStatus, elapsedActiveSeconds, elapsedIdleSeconds, currentModule }) {
    return this.registrarEvento(req, {
      userId,
      userLogin,
      action: tabStatus === 'MINIMIZADA' ? 'TAB_HIDDEN' : (elapsedIdleSeconds > 240 ? 'IDLE' : 'HEARTBEAT'),
      modulo: currentModule || 'General',
      recordDetails: `Heartbeat de presencia (${tabStatus || 'ACTIVA'})`,
      sessionId,
      tabStatus: tabStatus || 'ACTIVA',
      elapsedActiveSeconds: elapsedActiveSeconds || 0,
      elapsedIdleSeconds: elapsedIdleSeconds || 0
    });
  }

  /**
   * Cierre inesperado o cierre de pestaña capturado con sendBeacon
   */
  async procesarBeaconExit(req, { userId, userLogin, sessionId, currentModule, motivo = 'Cierre de ventana' }) {
    return this.registrarEvento(req, {
      userId,
      userLogin,
      action: 'BEFORE_UNLOAD',
      modulo: currentModule || 'General',
      recordDetails: `Desconexión registrada por frontend: ${motivo}`,
      sessionId,
      tabStatus: 'DESCONECTADO'
    });
  }

  /**
   * Consulta oficial de presencia y sesiones basada EXCLUSIVAMENTE en evidencia real.
   * PROHIBIDO ALTERAR O INVENTAR HORAS O ESTADOS.
   */
  async obtenerSesionesActivas(fechaReferencia = new Date()) {
    const now = fechaReferencia instanceof Date ? fechaReferencia : new Date(fechaReferencia);
    const { startOfDay, endOfDay } = getColombiaDayBounds(now);
    const tresDiasMs = 3 * 24 * 3600 * 1000;

    // Obtener todos los colaboradores habilitados en el sistema
    const allUsers = await prisma.user.findMany({
      where: { isLocked: false },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { nombre: 'asc' }
    });

    const onlineUsers = [];
    const activeTodayUsers = [];
    const inactivosPendientes = [];
    const inactivosProlongados = [];

    for (const u of allUsers) {
      // 1. Obtener todos los eventos reales generados por el frontend hoy
      const auditsToday = await prisma.auditoria.findMany({
        where: {
          userId: u.id,
          fecha: { gte: startOfDay, lte: endOfDay }
        },
        orderBy: { fecha: 'asc' }
      });

      // 2. Sesión registrada hoy
      const sessionToday = prisma.auditoriaSesion?.findFirst ? await prisma.auditoriaSesion.findFirst({
        where: {
          userId: u.id,
          fechaInicio: { gte: startOfDay, lte: endOfDay }
        },
        orderBy: { fechaInicio: 'desc' }
      }) : null;

      // 3. Jornada laboral iniciada hoy
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

      // 4. Visitas en campo registradas hoy
      const visitasHoy = await prisma.visitaCampo.count({
        where: {
          usuarioId: u.id,
          checkInHora: { gte: startOfDay, lte: endOfDay }
        }
      });

      // EVENTOS DE HOY
      const hasAuditsToday = auditsToday.length > 0;
      const loginAudits = auditsToday.filter(a => a.action === 'LOGIN');

      // Primer ingreso: HORA REAL DE LOGIN O PRIMER EVENTO
      let primerIngreso = null;
      if (loginAudits.length > 0) {
        primerIngreso = loginAudits[0].fecha;
      } else if (hasAuditsToday) {
        primerIngreso = auditsToday[0].fecha;
      } else if (jornadaToday?.horaInicio) {
        primerIngreso = jornadaToday.horaInicio;
      }

      // Último evento real registrado hoy
      const lastAuditToday = hasAuditsToday ? auditsToday[auditsToday.length - 1] : null;

      // Última actividad: HORA REAL DEL ÚLTIMO EVENTO FRONTEND (JAMÁS inventar `now`!)
      let ultimoAccesoHoy = null;
      if (lastAuditToday) {
        ultimoAccesoHoy = lastAuditToday.fecha;
      } else if (sessionToday?.ultimaActividad) {
        ultimoAccesoHoy = sessionToday.ultimaActividad;
      } else if (jornadaToday?.horaFin) {
        ultimoAccesoHoy = jornadaToday.horaFin;
      }

      // Último acceso histórico si no entró hoy
      let ultimoAccesoHistorico = null;
      if (!ultimoAccesoHoy) {
        const lastHistoricAudit = await prisma.auditoria.findFirst({
          where: { userId: u.id },
          orderBy: { fecha: 'desc' }
        });
        if (lastHistoricAudit) {
          ultimoAccesoHistorico = lastHistoricAudit.fecha;
        } else if (u.lastLogin) {
          ultimoAccesoHistorico = new Date(u.lastLogin);
        }
      }

      // CÁLCULO DE PRESENCIA Y ESTADO BASADO EXCLUSIVAMENTE EN EVIDENCIA REAL
      let estadoPresencia = 'DESCONECTADO';
      let isOnlineNow = false;
      let minutesSinceLast = null;

      if (ultimoAccesoHoy) {
        const diffMs = now.getTime() - new Date(ultimoAccesoHoy).getTime();
        minutesSinceLast = Math.max(0, Math.floor(diffMs / 60000));

        const lastAction = (lastAuditToday?.action || sessionToday?.ultimoEventoTipo || '').toUpperCase();
        const tabIsHidden = lastAuditToday?.tabStatus === 'MINIMIZADA' || sessionToday?.tabStatus === 'MINIMIZADA';
        const isClosedSession = lastAction === 'LOGOUT' || lastAction === 'BEFORE_UNLOAD' || sessionToday?.estado === 'DESCONECTADO';

        if (isClosedSession) {
          estadoPresencia = 'DESCONECTADO';
          isOnlineNow = false;
        } else if (diffMs <= 5 * 60 * 1000 && !tabIsHidden) {
          // Eventos en los últimos 5 minutos y pestaña visible -> EN LÍNEA
          estadoPresencia = 'EN_LINEA';
          isOnlineNow = true;
        } else if (diffMs <= 15 * 60 * 1000 || tabIsHidden) {
          // Sin eventos entre 5 y 15 minutos, o pestaña oculta -> INACTIVO / EN PAUSA
          estadoPresencia = 'INACTIVO';
          isOnlineNow = false;
        } else {
          // Sin eventos hace más de 15 minutos -> DESCONECTADO
          estadoPresencia = 'DESCONECTADO';
          isOnlineNow = false;
        }
      }

      // Evidencia Verificable
      const evidencia = {
        ultimoEventoId: lastAuditToday?.id || sessionToday?.ultimoEventoId || null,
        ultimoEventoTipo: lastAuditToday?.action || sessionToday?.ultimoEventoTipo || (jornadaToday ? 'JORNADA_CAMPO' : 'SIN_EVIDENCIA'),
        ultimoEventoModulo: lastAuditToday?.modulo || sessionToday?.ultimoEventoModulo || 'General',
        ultimoEventoDesc: lastAuditToday?.recordDetails || sessionToday?.ultimoEventoDesc || 'Sin detalle de evento',
        ultimoEventoFecha: ultimoAccesoHoy,
        ip: lastAuditToday?.ip || sessionToday?.ip || 'N/A',
        navegador: lastAuditToday?.navegador || sessionToday?.navegador || 'N/A',
        so: lastAuditToday?.so || sessionToday?.so || 'N/A',
        dispositivo: lastAuditToday?.dispositivo || sessionToday?.dispositivo || 'N/A',
        tabStatus: lastAuditToday?.tabStatus || sessionToday?.tabStatus || 'N/A',
        hash: lastAuditToday?.hash || null,
        totalEventosHoy: auditsToday.length,
        modulosVisitados: Array.from(new Set(auditsToday.map(a => a.modulo).filter(Boolean))),
        tiempoActivoMinutos: sessionToday ? Math.round((sessionToday.tiempoActivoSegundos || 0) / 60) : 0,
        tiempoInactivoMinutos: sessionToday ? Math.round((sessionToday.tiempoInactivoSegundos || 0) / 60) : 0
      };

      const userData = {
        id: u.id,
        user: u.user,
        nombre: `${u.nombre} ${u.apellido || ''}`.trim(),
        cargo: u.cargo || u.role?.name || 'Colaborador',
        correo: u.correo,
        foto: u.foto,
        isOnline: isOnlineNow,
        estadoPresencia,
        primerIngreso,
        ultimoAccesoHoy,
        ultimoAccesoHistorico,
        minutesSinceLast,
        tieneJornada: Boolean(jornadaToday),
        estadoJornada: jornadaToday?.estado || null,
        visitasHoy,
        totalAuditsToday: auditsToday.length,
        evidencia
      };

      // Clasificación en grupos de auditoría
      if (isOnlineNow) {
        onlineUsers.push(userData);
      } else if (ultimoAccesoHoy || hasAuditsToday || jornadaToday || visitasHoy > 0) {
        activeTodayUsers.push(userData);
      } else {
        const lastDate = ultimoAccesoHistorico;
        if (!lastDate || (now.getTime() - new Date(lastDate).getTime()) >= tresDiasMs) {
          inactivosProlongados.push(userData);
        } else {
          inactivosPendientes.push(userData);
        }
      }
    }

    return {
      fechaCorte: now,
      onlineUsers,
      activeTodayUsers,
      inactivosPendientes,
      inactivosProlongados,
      totalHabilitados: allUsers.length,
      kpis: {
        enLinea: onlineUsers.length,
        activosHoyOff: activeTodayUsers.length,
        inactivosPendientes: inactivosPendientes.length,
        inactivosProlongados: inactivosProlongados.length
      }
    };
  }

  /**
   * Retorna toda la evidencia cronológica auditable para un colaborador
   */
  async obtenerEvidenciaUsuario(userId, fechaStr = null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: { select: { id: true, name: true } } }
    });

    if (!user) throw new Error('Usuario no encontrado');

    const targetDate = fechaStr ? new Date(`${fechaStr}T12:00:00.000Z`) : new Date();
    const { startOfDay, endOfDay } = getColombiaDayBounds(targetDate);

    const eventos = await prisma.auditoria.findMany({
      where: {
        userId,
        fecha: { gte: startOfDay, lte: endOfDay }
      },
      orderBy: { fecha: 'desc' }
    });

    const sesion = await prisma.auditoriaSesion.findFirst({
      where: {
        userId,
        fechaInicio: { gte: startOfDay, lte: endOfDay }
      },
      orderBy: { fechaInicio: 'desc' }
    });

    // Calcular estado con evidencia real
    const now = new Date();
    let estado = 'DESCONECTADO';
    let ultimoEvento = eventos[0] || null;

    if (ultimoEvento) {
      const diffMs = now.getTime() - new Date(ultimoEvento.fecha).getTime();
      const lastAction = (ultimoEvento.action || '').toUpperCase();
      if (lastAction === 'LOGOUT' || lastAction === 'BEFORE_UNLOAD') {
        estado = 'DESCONECTADO';
      } else if (diffMs <= 5 * 60 * 1000 && ultimoEvento.tabStatus !== 'MINIMIZADA') {
        estado = 'EN_LINEA';
      } else if (diffMs <= 15 * 60 * 1000 || ultimoEvento.tabStatus === 'MINIMIZADA') {
        estado = 'INACTIVO';
      } else {
        estado = 'DESCONECTADO';
      }
    }

    return {
      usuario: {
        id: user.id,
        user: user.user,
        nombre: `${user.nombre} ${user.apellido || ''}`.trim(),
        correo: user.correo,
        cargo: user.cargo || user.role?.name || 'Colaborador',
        foto: user.foto,
        estadoActual: estado,
        ultimoEvento
      },
      sesion,
      totalEventos: eventos.length,
      modulosRecorridos: Array.from(new Set(eventos.map(e => e.modulo).filter(Boolean))),
      eventos
    };
  }
}

module.exports = new AuditoriaService();
