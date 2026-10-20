const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoria.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

// Middleware de autenticación opcional para telemetría (admite JWT, cabeceras fallback o datos en payload)
const optionalAuth = (req, res, next) => {
  const hasAuthHeader = req.headers['authorization'] || req.cookies?.token || req.headers['x-user-id'] || req.headers['x-user'];
  if (hasAuthHeader) {
    return authenticateToken(req, res, next);
  }
  next();
};

// Rutas de telemetría y presencia en tiempo real
router.post('/evento', optionalAuth, (req, res) => auditoriaController.postEvento(req, res));
router.post('/heartbeat', optionalAuth, (req, res) => auditoriaController.postHeartbeat(req, res));

// Endpoint beacon de salida / cierre inesperado
router.post('/beacon-exit', (req, res) => auditoriaController.postBeaconExit(req, res));

// Monitor oficial de presencia en tiempo real (evidencia verificable)
router.get('/sesiones/activas', (req, res) => auditoriaController.getSesionesActivas(req, res));

// Evidencia auditable individual de un colaborador
router.get('/usuarios/:userId/evidencia', (req, res) => auditoriaController.getEvidenciaUsuario(req, res));

// Generación de reporte oficial manual / a demanda
router.all('/sesiones/reporte-manual', (req, res) => auditoriaController.postReporteManual(req, res));

module.exports = router;
