const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoria.controller');
const authenticateToken = require('../middlewares/auth.middleware');
const { requireModuleAccess } = require('../middlewares/rbac.middleware');

// Middleware de autenticación opcional para telemetría (solo JWT: Bearer o cookie).
// Fase 0: las cabeceras x-user / x-user-id ya no autentican.
const optionalAuth = (req, res, next) => {
  const hasToken = req.headers['authorization'] || req.cookies?.token;
  if (hasToken) {
    return authenticateToken(req, res, next);
  }
  next();
};

// Solo usuarios con acceso al módulo de Auditoría (o administradores) pueden consultar evidencia.
const auditoriaAccess = [authenticateToken, requireModuleAccess('auditoria')];

// Rutas de telemetría y presencia en tiempo real
router.post('/evento', optionalAuth, (req, res) => auditoriaController.postEvento(req, res));
router.post('/heartbeat', optionalAuth, (req, res) => auditoriaController.postHeartbeat(req, res));

// Endpoint beacon de salida / cierre inesperado (navigator.sendBeacon no permite cabeceras)
router.post('/beacon-exit', (req, res) => auditoriaController.postBeaconExit(req, res));

// Monitor oficial de presencia en tiempo real (evidencia verificable) - PROTEGIDO
router.get('/sesiones/activas', ...auditoriaAccess, (req, res) => auditoriaController.getSesionesActivas(req, res));

// Evidencia auditable individual de un colaborador - PROTEGIDO
router.get('/usuarios/:userId/evidencia', ...auditoriaAccess, (req, res) => auditoriaController.getEvidenciaUsuario(req, res));

// Generación de reporte oficial manual / a demanda - PROTEGIDO
router.all('/sesiones/reporte-manual', ...auditoriaAccess, (req, res) => auditoriaController.postReporteManual(req, res));

module.exports = router;
