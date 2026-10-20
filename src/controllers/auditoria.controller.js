const auditoriaService = require('../services/auditoria.service');
const { generateActivityReport } = require('../cron/backup');

class AuditoriaController {
  /**
   * Endpoint de ingesta de eventos reales desde el frontend
   * POST /api/auditoria/evento
   */
  async postEvento(req, res) {
    try {
      const userId = req.user?.id || req.body?.userId;
      const userLogin = req.user?.user || req.body?.userLogin;
      const { action, modulo, recordDetails, metadata, sessionId, tabStatus, elapsedActiveSeconds, elapsedIdleSeconds } = req.body || {};

      if (!userId && !userLogin) {
        return res.status(400).json({ error: 'Identificador de usuario requerido' });
      }

      const result = await auditoriaService.registrarEvento(req, {
        userId,
        userLogin,
        action,
        modulo,
        recordDetails,
        metadata,
        sessionId,
        tabStatus,
        elapsedActiveSeconds,
        elapsedIdleSeconds
      });

      // Emitir evento Socket.IO para actualizar el monitor en vivo sin refrescar pantalla
      const io = req.app?.get('io');
      if (io) {
        io.emit('auditoria_live_event', {
          userId,
          userLogin,
          action,
          modulo,
          recordDetails,
          fecha: result.fecha,
          estado: result.estado,
          hash: result.hash
        });
      }

      res.status(201).json(result);
    } catch (err) {
      console.error('[AuditoriaController.postEvento]', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Heartbeat de presencia periódica activa (cada 30s)
   * POST /api/auditoria/heartbeat
   */
  async postHeartbeat(req, res) {
    try {
      const userId = req.user?.id || req.body?.userId;
      const userLogin = req.user?.user || req.body?.userLogin;
      const { sessionId, tabStatus, elapsedActiveSeconds, elapsedIdleSeconds, currentModule } = req.body || {};

      if (!userId && !userLogin) {
        return res.status(400).json({ error: 'Identificador de usuario requerido' });
      }

      const result = await auditoriaService.procesarHeartbeat(req, {
        userId,
        userLogin,
        sessionId,
        tabStatus,
        elapsedActiveSeconds,
        elapsedIdleSeconds,
        currentModule
      });

      const io = req.app?.get('io');
      if (io) {
        io.emit('presencia_heartbeat', {
          userId,
          userLogin,
          estado: result.estado,
          tabStatus,
          currentModule,
          fecha: result.fecha
        });
      }

      res.json(result);
    } catch (err) {
      console.error('[AuditoriaController.postHeartbeat]', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Desconexión inmediata capturada mediante navigator.sendBeacon
   * POST /api/auditoria/beacon-exit
   */
  async postBeaconExit(req, res) {
    try {
      let bodyData = req.body;
      if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }

      const userId = bodyData?.userId;
      const userLogin = bodyData?.userLogin;
      const sessionId = bodyData?.sessionId;
      const currentModule = bodyData?.currentModule;
      const motivo = bodyData?.motivo || 'Cierre de pestaña o navegador';

      if (userId || userLogin) {
        await auditoriaService.procesarBeaconExit(req, {
          userId,
          userLogin,
          sessionId,
          currentModule,
          motivo
        });

        const io = req.app?.get('io');
        if (io) {
          io.emit('usuario_desconectado', { userId, userLogin, fecha: new Date() });
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[AuditoriaController.postBeaconExit]', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Obtiene la lista oficial de colaboradores con presencia verificable
   * GET /api/auditoria/sesiones/activas
   */
  async getSesionesActivas(req, res) {
    try {
      const fechaRef = req.query?.fecha ? new Date(req.query.fecha) : new Date();
      const data = await auditoriaService.obtenerSesionesActivas(fechaRef);
      res.json(data);
    } catch (err) {
      console.error('[AuditoriaController.getSesionesActivas]', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Obtiene la evidencia auditable completa de un colaborador
   * GET /api/auditoria/usuarios/:userId/evidencia
   */
  async getEvidenciaUsuario(req, res) {
    try {
      const { userId } = req.params;
      const fechaStr = req.query?.fecha || null;
      const data = await auditoriaService.obtenerEvidenciaUsuario(userId, fechaStr);
      res.json(data);
    } catch (err) {
      console.error('[AuditoriaController.getEvidenciaUsuario]', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Generación y envío a demanda del reporte oficial de presencia
   * POST /api/auditoria/sesiones/reporte-manual
   */
  async postReporteManual(req, res) {
    try {
      const corte = req.body?.corteNombre || req.query?.corteNombre || "Corte a Demanda de Control Gerencial";
      const result = await generateActivityReport(corte);
      res.json(result);
    } catch (err) {
      console.error('[AuditoriaController.postReporteManual]', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new AuditoriaController();
