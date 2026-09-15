const express = require('express');
const router = express.Router();
const campoController = require('../controllers/campo.controller');
const authenticateToken = require('../middlewares/auth.middleware');

// Todas las rutas de operaciones de campo requieren sesión activa
router.use(authenticateToken);

// 1. Jornadas
router.post('/jornada/iniciar', (req, res) => campoController.iniciarJornada(req, res));
router.post('/jornada/pausa', (req, res) => campoController.iniciarPausa(req, res));
router.post('/jornada/reanudar', (req, res) => campoController.reanudarPausa(req, res));
router.post('/jornada/finalizar', (req, res) => campoController.finalizarJornada(req, res));
router.get('/jornada/activa', (req, res) => campoController.getJornadaActiva(req, res));

// 2. Telemetría y Tracking
router.post('/tracking/ping', (req, res) => campoController.pingUbicacion(req, res));
router.post('/tracking/batch', (req, res) => campoController.batchUbicaciones(req, res));
router.get('/tracking/en-vivo', (req, res) => campoController.getUltimasUbicaciones(req, res));
router.get('/tracking/historial', (req, res) => campoController.getHistorialRecorrido(req, res));
router.get('/tracking/historial/:usuarioId', (req, res) => campoController.getHistorialRecorrido(req, res));

// 3. Visitas Comerciales y Técnicas
router.post('/visitas/programar', (req, res) => campoController.programarVisita(req, res));
router.get('/visitas/agenda', (req, res) => campoController.getAgenda(req, res));
router.post('/visitas/check-in', (req, res) => campoController.checkInVisita(req, res));
router.post('/visitas/check-out', (req, res) => campoController.checkOutVisita(req, res));

// 4. Prospectos de Campo
router.post('/prospectos', (req, res) => campoController.crearProspecto(req, res));
router.get('/prospectos', (req, res) => campoController.getProspectos(req, res));
router.post('/prospectos/:id/convertir', (req, res) => campoController.convertirProspecto(req, res));

// 5. Productividad y Rankings
router.get('/productividad/dashboard', (req, res) => campoController.getDashboardProductividad(req, res));
router.get('/productividad/ranking', (req, res) => campoController.getRanking(req, res));

// 6. Geocercas y Zonas
router.get('/geocercas', (req, res) => campoController.getGeocercas(req, res));
router.post('/geocercas', (req, res) => campoController.crearGeocerca(req, res));
router.get('/zonas', (req, res) => campoController.getZonas(req, res));
router.post('/zonas', (req, res) => campoController.crearZona(req, res));

// 7. Actividades del Día y Tareas
router.get('/actividades', (req, res) => campoController.getActividades(req, res));
router.post('/actividades', (req, res) => campoController.crearActividad(req, res));
router.put('/actividades/:id', (req, res) => campoController.modificarActividad(req, res));
router.delete('/actividades/:id', (req, res) => campoController.eliminarActividad(req, res));
router.put('/actividades/:id/estado', (req, res) => campoController.actualizarEstadoActividad(req, res));
router.post('/actividades/:id/comentarios', (req, res) => campoController.agregarComentarioActividad(req, res));

// 8. Evidencias Multimedia
router.get('/evidencias', (req, res) => campoController.getEvidencias(req, res));
router.post('/evidencias', (req, res) => campoController.registrarEvidencia(req, res));

// 9. Historial y Seguimiento Continuo
router.get('/seguimientos', (req, res) => campoController.getSeguimientos(req, res));
router.post('/seguimientos', (req, res) => campoController.crearSeguimiento(req, res));

// 10. Reportes Consolidados de Personal en Campo
router.get('/reportes', (req, res) => campoController.getReportes(req, res));
router.get('/reportes/resumen', (req, res) => campoController.getReportes(req, res));

// 11. Asignación de Rutas y Operación
router.post('/rutas/asignar', (req, res) => campoController.asignarRuta(req, res));
router.get('/rutas', (req, res) => campoController.getRutasAsignadas(req, res));
router.get('/trazabilidad/dia', (req, res) => campoController.getHistorialDiaCompleto(req, res));
router.get('/operacion/panel', (req, res) => campoController.getPanelOperativo(req, res));
router.get('/personal-campo', (req, res) => campoController.getPanelOperativo(req, res));

// 12. Delegado de Gerencia, Indicadores y Evaluaciones
router.get('/delegado/dashboard', (req, res) => campoController.getDashboardDelegado(req, res));
router.get('/indicadores', (req, res) => campoController.getIndicadoresComercial(req, res));
router.get('/indicadores/:usuarioId', (req, res) => campoController.getIndicadoresComercial(req, res));
router.post('/evaluaciones', (req, res) => campoController.guardarEvaluacion(req, res));
router.get('/evaluaciones', (req, res) => campoController.getHistorialEvaluaciones(req, res));
router.get('/evaluaciones/historial', (req, res) => campoController.getHistorialEvaluaciones(req, res));
router.get('/evaluaciones/:usuarioId', (req, res) => campoController.getHistorialEvaluaciones(req, res));
router.get('/comerciales', (req, res) => campoController.getComercialesEnCampo(req, res));
router.get('/auditoria', (req, res) => campoController.getAuditoriaCampo(req, res));

// 13. Novedades, Observaciones y Ficha Histórica
router.post('/novedades', (req, res) => campoController.crearNovedadDelegado(req, res));
router.get('/novedades/:usuarioId', (req, res) => campoController.getNovedadesComercial(req, res));
router.put('/novedades/:id/estado', (req, res) => campoController.actualizarEstadoNovedad(req, res));
router.get('/ficha-historica/:usuarioId', (req, res) => campoController.getFichaHistorica(req, res));

// 14. Operación Comercial Externa Independiente (Clientes, Cotizaciones, Ventas y Embudo)
router.get('/externo/clientes', (req, res) => campoController.getClientesExternos(req, res));
router.get('/externo/clientes/:id', (req, res) => campoController.getClienteExternoById(req, res));
router.post('/externo/clientes', (req, res) => campoController.crearClienteExterno(req, res));
router.put('/externo/clientes/:id', (req, res) => campoController.actualizarClienteExterno(req, res));
router.put('/externo/clientes/:id/etapa', (req, res) => campoController.cambiarEtapaEmbudo(req, res));

router.get('/externo/cotizaciones', (req, res) => campoController.getCotizacionesExternas(req, res));
router.post('/externo/cotizaciones', (req, res) => campoController.crearCotizacionExterna(req, res));
router.put('/externo/cotizaciones/:id/estado', (req, res) => campoController.cambiarEstadoCotizacion(req, res));
router.post('/externo/cotizaciones/:id/seguimiento', (req, res) => campoController.agregarSeguimientoCotizacion(req, res));

router.get('/externo/ventas', (req, res) => campoController.getVentasExternas(req, res));
router.post('/externo/ventas', (req, res) => campoController.registrarVentaExterna(req, res));

router.get('/externo/embudo', (req, res) => campoController.getMetricasEmbudo(req, res));

module.exports = router;

