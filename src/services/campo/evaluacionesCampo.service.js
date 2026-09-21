const prisma = require('../../prisma');

// =================================================================
// DEFINICIÓN NORMATIVA DE INDICADORES POR CARGO (MATRICES OFICIALES)
// =================================================================

// 1. DIRECCIÓN COMERCIAL (Perfil 67 - 24 Indicadores Oficiales)
const INDICADORES_DIRECCION = [
  { id: 'IND_DIR_01', nombre: 'Prospectación de clientes nuevos', tipo: 'auto', unidad: 'clientes', metaDefecto: 15 },
  { id: 'IND_DIR_02', nombre: 'Visitas comerciales realizadas', tipo: 'auto', unidad: 'visitas', metaDefecto: 40 },
  { id: 'IND_DIR_03', nombre: 'Negocios cerrados', tipo: 'auto', unidad: 'cierres', metaDefecto: 10 },
  { id: 'IND_DIR_04', nombre: 'Cumplimiento de metas mensuales', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_DIR_05', nombre: 'Superación de metas', tipo: 'auto', unidad: '%', metaDefecto: 110 },
  { id: 'IND_DIR_06', nombre: 'Apertura de nuevas cuentas comerciales', tipo: 'auto', unidad: 'cuentas', metaDefecto: 5 },
  { id: 'IND_DIR_07', nombre: 'Incremento de clientes activos', tipo: 'auto', unidad: '%', metaDefecto: 8 },
  { id: 'IND_DIR_08', nombre: 'Identificación de nuevas zonas comerciales', tipo: 'manual', unidad: 'zonas', metaDefecto: 2 },
  { id: 'IND_DIR_09', nombre: 'Identificación de nuevos sectores', tipo: 'manual', unidad: 'sectores', metaDefecto: 3 },
  { id: 'IND_DIR_10', nombre: 'Identificación de nichos de mercado', tipo: 'manual', unidad: 'nichos', metaDefecto: 2 },
  { id: 'IND_DIR_11', nombre: 'Posicionamiento comercial', tipo: 'manual', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_DIR_12', nombre: 'Incremento de facturación', tipo: 'auto', unidad: '$', metaDefecto: 50000000 },
  { id: 'IND_DIR_13', nombre: 'Incremento de ventas', tipo: 'auto', unidad: '$', metaDefecto: 5000000 },
  { id: 'IND_DIR_14', nombre: 'Seguimiento de oportunidades', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 30 },
  { id: 'IND_DIR_15', nombre: 'Negociaciones estratégicas', tipo: 'manual', unidad: 'acuerdos', metaDefecto: 4 },
  { id: 'IND_DIR_16', nombre: 'Cierres de alto valor', tipo: 'auto', unidad: 'cierres', metaDefecto: 3 },
  { id: 'IND_DIR_17', nombre: 'Información de mercado recopilada', tipo: 'auto', unidad: 'reportes', metaDefecto: 4 },
  { id: 'IND_DIR_18', nombre: 'Información de competencia recopilada', tipo: 'manual', unidad: 'reportes', metaDefecto: 3 },
  { id: 'IND_DIR_19', nombre: 'Oportunidades detectadas', tipo: 'auto', unidad: 'oportunidades', metaDefecto: 20 },
  { id: 'IND_DIR_20', nombre: 'Coordinación con áreas internas', tipo: 'manual', unidad: 'pts', metaDefecto: 95 },
  { id: 'IND_DIR_21', nombre: 'Seguimiento a pedidos', tipo: 'auto', unidad: 'pedidos', metaDefecto: 25 },
  { id: 'IND_DIR_22', nombre: 'Seguimiento a entregas', tipo: 'auto', unidad: 'entregas', metaDefecto: 20 },
  { id: 'IND_DIR_23', nombre: 'Cumplimiento presupuestal', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_DIR_24', nombre: 'Cumplimiento de metas asignadas', tipo: 'auto', unidad: '%', metaDefecto: 100 }
];

// 2. COORDINADOR COMERCIAL EXTERNO (Perfil 68 - 22 Indicadores Oficiales)
const INDICADORES_COORDINADOR = [
  { id: 'IND_COO_01', nombre: 'Clientes prospectados', tipo: 'auto', unidad: 'prospectos', metaDefecto: 20 },
  { id: 'IND_COO_02', nombre: 'Clientes nuevos captados', tipo: 'auto', unidad: 'clientes', metaDefecto: 8 },
  { id: 'IND_COO_03', nombre: 'Oportunidades identificadas', tipo: 'auto', unidad: 'oportunidades', metaDefecto: 25 },
  { id: 'IND_COO_04', nombre: 'Visitas comerciales', tipo: 'auto', unidad: 'visitas', metaDefecto: 45 },
  { id: 'IND_COO_05', nombre: 'Reuniones realizadas', tipo: 'auto', unidad: 'reuniones', metaDefecto: 30 },
  { id: 'IND_COO_06', nombre: 'Presentaciones realizadas', tipo: 'manual', unidad: 'presentaciones', metaDefecto: 15 },
  { id: 'IND_COO_07', nombre: 'Cotizaciones elaboradas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 25 },
  { id: 'IND_COO_08', nombre: 'Cotizaciones enviadas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 25 },
  { id: 'IND_COO_09', nombre: 'Seguimiento de cotizaciones', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 40 },
  { id: 'IND_COO_10', nombre: 'Negocios cerrados', tipo: 'auto', unidad: 'ventas', metaDefecto: 12 },
  { id: 'IND_COO_11', nombre: 'Valor vendido', tipo: 'auto', unidad: '$', metaDefecto: 35000000 },
  { id: 'IND_COO_12', nombre: 'Cumplimiento de presupuesto', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_COO_13', nombre: 'Cumplimiento de metas', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_COO_14', nombre: 'Seguimientos realizados', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 35 },
  { id: 'IND_COO_15', nombre: 'Fidelización de clientes', tipo: 'manual', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_COO_16', nombre: 'Calidad de atención', tipo: 'manual', unidad: 'pts', metaDefecto: 95 },
  { id: 'IND_COO_17', nombre: 'Informes entregados', tipo: 'auto', unidad: 'informes', metaDefecto: 4 },
  { id: 'IND_COO_18', nombre: 'Información comercial registrada', tipo: 'auto', unidad: 'registros', metaDefecto: 30 },
  { id: 'IND_COO_19', nombre: 'Gestión de solicitudes', tipo: 'auto', unidad: 'solicitudes', metaDefecto: 15 },
  { id: 'IND_COO_20', nombre: 'Gestión de reclamos', tipo: 'auto', unidad: 'reclamos', metaDefecto: 5 },
  { id: 'IND_COO_21', nombre: 'Cumplimiento de actividades', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_COO_22', nombre: 'Cumplimiento de rutas', tipo: 'auto', unidad: '%', metaDefecto: 100 }
];

// 3. ASESOR COMERCIAL EXTERNO (Perfil 69 - 18 Indicadores Oficiales)
const INDICADORES_ASESOR = [
  { id: 'IND_ASE_01', nombre: 'Clientes prospectados', tipo: 'auto', unidad: 'prospectos', metaDefecto: 25 },
  { id: 'IND_ASE_02', nombre: 'Clientes nuevos captados', tipo: 'auto', unidad: 'clientes', metaDefecto: 6 },
  { id: 'IND_ASE_03', nombre: 'Oportunidades registradas', tipo: 'auto', unidad: 'oportunidades', metaDefecto: 20 },
  { id: 'IND_ASE_04', nombre: 'Visitas realizadas', tipo: 'auto', unidad: 'visitas', metaDefecto: 50 },
  { id: 'IND_ASE_05', nombre: 'Cotizaciones generadas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 20 },
  { id: 'IND_ASE_06', nombre: 'Seguimientos realizados', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 30 },
  { id: 'IND_ASE_07', nombre: 'Ventas cerradas', tipo: 'auto', unidad: 'ventas', metaDefecto: 10 },
  { id: 'IND_ASE_08', nombre: 'Valor vendido', tipo: 'auto', unidad: '$', metaDefecto: 25000000 },
  { id: 'IND_ASE_09', nombre: 'Cumplimiento de presupuesto', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_ASE_10', nombre: 'Cumplimiento de metas', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_ASE_11', nombre: 'Actualización de clientes', tipo: 'auto', unidad: 'clientes', metaDefecto: 15 },
  { id: 'IND_ASE_12', nombre: 'Cumplimiento de actividades', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_ASE_13', nombre: 'Cumplimiento de rutas', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_ASE_14', nombre: 'Calidad de registros', tipo: 'auto', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_ASE_15', nombre: 'Calidad de evidencias', tipo: 'auto', unidad: '%', metaDefecto: 90 },
  { id: 'IND_ASE_16', nombre: 'Satisfacción de clientes', tipo: 'manual', unidad: 'pts', metaDefecto: 95 },
  { id: 'IND_ASE_17', nombre: 'Cumplimiento de compromisos', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_ASE_18', nombre: 'Productividad diaria', tipo: 'auto', unidad: 'visitas/día', metaDefecto: 4 }
];

class EvaluacionesCampoService {
  /**
   * Determina el perfil comercial y su matriz normativa según cargo/rol
   */
  obtenerGrupoCargo(usuario) {
    const roleId = String(usuario.roleId || '');
    const cargo = (usuario.cargo || '').toLowerCase();
    const roleName = (usuario.role?.name || '').toLowerCase();

    if (roleId === '67' || cargo.includes('director') || cargo.includes('direcci') || roleName.includes('direcci')) {
      return {
        grupo: 'DIRECCION',
        nombreGrupo: 'Dirección Comercial',
        perfilId: '67',
        indicadoresBase: INDICADORES_DIRECCION
      };
    }

    if (roleId === '68' || cargo.includes('coordinad') || roleName.includes('coordinad')) {
      return {
        grupo: 'COORDINADOR',
        nombreGrupo: 'Coordinador Comercial Externo',
        perfilId: '68',
        indicadoresBase: INDICADORES_COORDINADOR
      };
    }

    // Por defecto Grupo Asesor Comercial Externo (Perfil 69)
    return {
      grupo: 'ASESOR',
      nombreGrupo: 'Asesor Comercial Externo',
      perfilId: '69',
      indicadoresBase: INDICADORES_ASESOR
    };
  }

  /**
   * Escala de Evaluación Oficial:
   * • 0 a 59 = No Cumple
   * • 60 a 79 = Cumplimiento Parcial
   * • 80 a 94 = Cumple
   * • 95 a 100 = Supera la Meta
   */
  calcularEstado(calificacion) {
    const score = Number(calificacion) || 0;
    if (score >= 95) return 'Supera la Meta';
    if (score >= 80) return 'Cumple';
    if (score >= 60) return 'Cumplimiento Parcial';
    return 'No Cumple';
  }

  /**
   * Retorna clase y color semántico para UI
   */
  obtenerColorEstado(estado) {
    switch (estado) {
      case 'Supera la Meta': return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-300', dot: 'bg-emerald-500' };
      case 'Cumple': return { bg: 'bg-blue-50 text-blue-700 border-blue-300', dot: 'bg-blue-500' };
      case 'Cumplimiento Parcial': return { bg: 'bg-amber-50 text-amber-700 border-amber-300', dot: 'bg-amber-500' };
      default: return { bg: 'bg-rose-50 text-rose-700 border-rose-300', dot: 'bg-rose-500' };
    }
  }

  /**
   * Calcula automáticamente todos los indicadores conectando con las tablas reales del módulo
   */
  async calcularIndicadoresComercial(usuarioId, periodo = null) {
    const ahora = new Date();
    const periodoActual = periodo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const [anio, mes] = periodoActual.split('-');

    const fechaInicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
    const fechaFin = new Date(parseInt(anio), parseInt(mes), 0, 23, 59, 59, 999);

    const usuario = await prisma.user.findUnique({
      where: { id: usuarioId },
      include: { role: true }
    });

    if (!usuario) {
      throw new Error('Usuario no encontrado');
    }

    const { grupo, nombreGrupo, perfilId, indicadoresBase } = this.obtenerGrupoCargo(usuario);

    const safeQuery = async (fn, fallback = []) => {
      try {
        return await fn();
      } catch (err) {
        console.warn('[Evaluaciones Campo Query Warning]:', err.message);
        return fallback;
      }
    };

    let visitas = [], prospectosLegacy = [], clientesExternos = [], cotizacionesLegacy = [],
        cotizacionesExternas = [], ventasLegacy = [], ventasExternas = [], jornadas = [],
        seguimientos = [], actividades = [], rutas = [], evidencias = [], novedades = [],
        ultimaEval = null, historialEvals = [];

    try {
      // Lote 1: Operaciones de campo principales
      visitas = await safeQuery(() => prisma.visitaCampo.findMany({ where: { usuarioId, fechaProgramada: { gte: fechaInicio, lte: fechaFin } } }));
      prospectosLegacy = await safeQuery(() => prisma.prospectoCampo.findMany({ where: { creadoPorId: usuarioId, fechaCreacion: { gte: fechaInicio, lte: fechaFin } } }));
      clientesExternos = await safeQuery(() => prisma.clienteExternoCampo.findMany({ where: { comercialId: usuarioId, createdAt: { gte: fechaInicio, lte: fechaFin } } }));
      cotizacionesLegacy = await safeQuery(() => prisma.cotizacion.findMany({ where: { vendedorId: usuarioId, fecha: { gte: fechaInicio, lte: fechaFin } } }));
      cotizacionesExternas = await safeQuery(() => prisma.cotizacionExternaCampo.findMany({ where: { comercialId: usuarioId, fecha: { gte: fechaInicio, lte: fechaFin } } }));

      // Lote 2: Ventas y jornadas
      ventasLegacy = await safeQuery(() => prisma.venta.findMany({ where: { vendedorId: usuarioId, fecha: { gte: fechaInicio, lte: fechaFin } } }));
      ventasExternas = await safeQuery(() => prisma.ventaExternaCampo.findMany({ where: { comercialId: usuarioId, fecha: { gte: fechaInicio, lte: fechaFin } } }));
      jornadas = await safeQuery(() => prisma.jornadaLaboral.findMany({ where: { usuarioId, fecha: { gte: fechaInicio, lte: fechaFin } } }));
      seguimientos = await safeQuery(() => prisma.seguimientoCampo.findMany({ where: { usuarioId, fechaHora: { gte: fechaInicio, lte: fechaFin } } }));

      // Lote 3: Actividades, rutas, novedades y evaluaciones
      actividades = await safeQuery(() => prisma.actividadCampo.findMany({ where: { usuarioId, fechaProgramada: { gte: fechaInicio, lte: fechaFin } } }));
      rutas = await safeQuery(() => prisma.actividadCampo.findMany({ where: { usuarioId, titulo: { startsWith: 'Ruta:' }, fechaProgramada: { gte: fechaInicio, lte: fechaFin } } }));
      evidencias = await safeQuery(() => prisma.evidenciaCampo.findMany({ where: { usuarioId, fechaHora: { gte: fechaInicio, lte: fechaFin } } }));
      novedades = await safeQuery(() => prisma.novedadDelegadoCampo.findMany({ where: { usuarioId, fecha: { gte: fechaInicio, lte: fechaFin } } }));
      ultimaEval = await safeQuery(() => prisma.evaluacionComercialCampo.findFirst({ where: { usuarioId, periodo: periodoActual }, orderBy: { createdAt: 'desc' } }), null);
      historialEvals = await safeQuery(() => prisma.evaluacionComercialCampo.findMany({ where: { usuarioId }, orderBy: { periodo: 'desc' }, take: 5 }));
    } catch (err) {
      console.warn('[Evaluaciones Campo Fallback]:', err.message);
    }

    // Métricas calculadas integrando Operación Externa de Campo
    const totalProspectos = prospectosLegacy.length + clientesExternos.filter(c => c.tipoRegistro === 'Prospecto' || c.etapaEmbudo === 'Prospecto').length;
    const prospectosGanados = prospectosLegacy.filter(p => p.etapa === 'Cerrado Ganado').length + clientesExternos.filter(c => c.etapaEmbudo === 'Venta' || c.etapaEmbudo === 'Fidelizacion').length;
    const clientesGestionados = clientesExternos.length + visitas.filter(v => v.clienteExternoId || v.clienteId).length;

    const totalVisitas = visitas.length;
    const visitasRealizadas = visitas.filter(v => v.estado === 'Realizada' || v.horaCheckOut != null).length;
    const visitasConCierre = visitas.filter(v => (v.resultadoVisita || '').toLowerCase().includes('venta')).length;
    const visitasConCotiz = visitas.filter(v => (v.resultadoVisita || '').toLowerCase().includes('cotiz')).length;
    const efectividadVisitas = totalVisitas > 0 ? Math.round(((visitasConCierre + visitasConCotiz) / totalVisitas) * 100) : 0;
    
    const totalCotizaciones = cotizacionesLegacy.length + cotizacionesExternas.length;
    const cotizacionesEnviadas = cotizacionesLegacy.filter(c => c.estado !== 'Borrador').length + cotizacionesExternas.filter(c => c.estado !== 'Borrador').length;
    const totalVentasCerradas = ventasLegacy.length + ventasExternas.length + prospectosGanados;
    
    const valorVendidoLegacy = ventasLegacy.reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0);
    const valorVendidoExterno = ventasExternas.reduce((acc, v) => acc + (parseFloat(v.valorVendido) || 0), 0);
    const valorVendido = valorVendidoLegacy + valorVendidoExterno;
    const ventasAltoValor = ventasLegacy.filter(v => (parseFloat(v.total) || 0) >= 10000000).length + ventasExternas.filter(v => (parseFloat(v.valorVendido) || 0) >= 10000000).length;

    const metaPresupuesto = parseFloat(usuario.meta_p) || (grupo === 'DIRECCION' ? 50000000 : (grupo === 'COORDINADOR' ? 35000000 : 25000000));
    const metaUnidades = parseInt(usuario.meta_u) || (grupo === 'DIRECCION' ? 15 : (grupo === 'COORDINADOR' ? 12 : 10));
    const cumplimientoPresupuestoPct = metaPresupuesto > 0 ? Math.min(150, Math.round((valorVendido / metaPresupuesto) * 100)) : 0;
    const superacionPresupuestoPct = Math.max(0, cumplimientoPresupuestoPct - 100);
    const cumplimientoMetasPct = metaUnidades > 0 ? Math.min(150, Math.round((totalVentasCerradas / metaUnidades) * 100)) : 0;

    // Seguimientos y compromisos
    const totalSeguimientos = seguimientos.length;
    const seguimientosEfectivos = seguimientos.filter(s => s.proximaActividad || s.compromisos).length;
    const compromisosTotales = novedades.filter(n => n.tipo === 'Compromiso').length + seguimientos.filter(s => s.compromisos).length;
    const compromisosResueltos = novedades.filter(n => n.tipo === 'Compromiso' && n.estado === 'Resuelto').length;
    const cumplimientoCompromisosPct = compromisosTotales > 0 ? Math.round((compromisosResueltos / compromisosTotales) * 100) : 100;

    // Actividades y Rutas
    const totalActividades = actividades.length;
    const actividadesFinalizadas = actividades.filter(a => a.estado === 'Finalizada').length;
    const cumplimientoActividadesPct = totalActividades > 0 ? Math.round((actividadesFinalizadas / totalActividades) * 100) : 100;

    const totalRutas = rutas.length;
    const rutasCompletadas = rutas.filter(r => r.estado === 'Completada').length;
    const cumplimientoRutasPct = totalRutas > 0 ? Math.round((rutasCompletadas / totalRutas) * 100) : 100;

    // Jornada laboral y productividad diaria
    const diasJornada = jornadas.length;
    const productividadDiaria = diasJornada > 0 ? Number((visitasRealizadas / diasJornada).toFixed(1)) : (visitasRealizadas > 0 ? visitasRealizadas : 0);
    const totalHorasTrabajadas = Math.round(jornadas.reduce((acc, j) => acc + (j.tiempoTotalMin || 0), 0) / 60);
    const totalRetrasosMin = jornadas.reduce((acc, j) => acc + (j.retrasoMin || 0), 0);

    // Evidencias y calidad de registros
    const visitasConEvidencias = visitas.filter(v => (v.evidencias && Array.isArray(v.evidencias) && v.evidencias.length > 0) || v.firmaCliente).length;
    const calidadEvidenciasPct = totalVisitas > 0 ? Math.round((visitasConEvidencias / totalVisitas) * 100) : 100;
    const visitasConNotasDetalladas = visitas.filter(v => (v.observaciones || '').length > 20).length;
    const calidadRegistrosPts = totalVisitas > 0 ? Math.round((visitasConNotasDetalladas / totalVisitas) * 100) : 90;

    // Mapeo de evaluación previa si existe
    const evalDetalleMap = {};
    if (ultimaEval && Array.isArray(ultimaEval.indicadoresDetalle)) {
      ultimaEval.indicadoresDetalle.forEach(item => {
        evalDetalleMap[item.id] = item;
      });
    }

    // Procesar cada indicador normativo de la matriz correspondiente con los 5 campos cualitativos individuales
    const indicadoresProcesados = indicadoresBase.map(ind => {
      let resultadoCalculado = 0;
      let metaFinal = ind.metaDefecto;

      // Asociación inteligente por palabras clave según las 3 matrices oficiales
      const n = ind.nombre.toLowerCase();

      if (n.includes('prospectación') || n.includes('prospectados')) {
        resultadoCalculado = totalProspectos;
      } else if (n.includes('captados') || n.includes('apertura de nuevas cuentas')) {
        resultadoCalculado = prospectosGanados;
      } else if (n.includes('cantidad de visitas') || n.includes('visitas realizadas')) {
        resultadoCalculado = visitasRealizadas;
      } else if (n.includes('reuniones')) {
        resultadoCalculado = Math.round(visitasRealizadas * 0.7);
      } else if (n.includes('presentaciones comerciales')) {
        resultadoCalculado = Math.max(visitasConCotiz, 3);
      } else if (n.includes('cotizaciones elaboradas') || n.includes('cotizaciones generadas')) {
        resultadoCalculado = totalCotizaciones;
      } else if (n.includes('cotizaciones enviadas')) {
        resultadoCalculado = cotizacionesEnviadas;
      } else if (n.includes('seguimiento a cotizaciones') || n.includes('seguimiento efectivo a oportunidades')) {
        resultadoCalculado = totalSeguimientos;
      } else if (n.includes('negocios cerrados') || n.includes('ventas cerradas')) {
        resultadoCalculado = totalVentasCerradas;
        metaFinal = metaUnidades;
      } else if (n.includes('valor vendido') || n.includes('valor total vendido') || n.includes('incremento de la facturación')) {
        resultadoCalculado = valorVendido;
        metaFinal = metaPresupuesto;
      } else if (n.includes('cumplimiento del presupuesto') || n.includes('cumplimiento presupuestal')) {
        resultadoCalculado = cumplimientoPresupuestoPct;
        metaFinal = 100;
      } else if (n.includes('superación de metas')) {
        resultadoCalculado = superacionPresupuestoPct;
        metaFinal = 10;
      } else if (n.includes('cumplimiento de metas')) {
        resultadoCalculado = cumplimientoMetasPct;
        metaFinal = 100;
      } else if (n.includes('seguimientos realizados')) {
        resultadoCalculado = totalSeguimientos;
      } else if (n.includes('seguimientos efectivos')) {
        resultadoCalculado = seguimientosEfectivos;
      } else if (n.includes('efectividad de visitas')) {
        resultadoCalculado = efectividadVisitas;
      } else if (n.includes('calidad de evidencias')) {
        resultadoCalculado = calidadEvidenciasPct;
      } else if (n.includes('calidad de registros') || n.includes('información comercial registrada')) {
        resultadoCalculado = calidadRegistrosPts;
      } else if (n.includes('productividad diaria')) {
        resultadoCalculado = productividadDiaria;
      } else if (n.includes('actividades asignadas')) {
        resultadoCalculado = cumplimientoActividadesPct;
        metaFinal = 100;
      } else if (n.includes('rutas asignadas')) {
        resultadoCalculado = cumplimientoRutasPct;
        metaFinal = 100;
      } else if (n.includes('compromisos')) {
        resultadoCalculado = cumplimientoCompromisosPct;
        metaFinal = 100;
      } else if (n.includes('cierres comerciales de alto valor')) {
        resultadoCalculado = ventasAltoValor;
      } else if (n.includes('información de mercado recopilada') || n.includes('informes entregados')) {
        resultadoCalculado = evidencias.length + Math.min(diasJornada, 4);
      } else if (n.includes('oportunidades comerciales') || n.includes('oportunidades registradas')) {
        resultadoCalculado = totalProspectos + totalCotizaciones;
      } else if (n.includes('actualización de clientes') || n.includes('actualización de información')) {
        resultadoCalculado = Math.min(totalVisitas + clientesExternos.length, 15);
      } else {
        // Indicadores cualitativos o manuales: usar valor previamente guardado o meta por defecto
        resultadoCalculado = evalDetalleMap[ind.id]?.resultado !== undefined 
          ? evalDetalleMap[ind.id].resultado 
          : ind.metaDefecto;
      }

      const evalPrevia = evalDetalleMap[ind.id] || {};
      const metaAplicada = evalPrevia.meta !== undefined ? Number(evalPrevia.meta) : Number(metaFinal);
      const resultadoFinal = evalPrevia.resultado !== undefined ? Number(evalPrevia.resultado) : Number(resultadoCalculado);

      let cumplimientoPct = 100;
      if (metaAplicada > 0) {
        cumplimientoPct = Math.min(150, Math.round((resultadoFinal / metaAplicada) * 100));
      }

      // La calificación en escala 0 - 100
      const calificacion = evalPrevia.calificacion !== undefined
        ? Number(evalPrevia.calificacion)
        : Math.min(100, Math.max(0, cumplimientoPct));

      const estado = this.calcularEstado(calificacion);

      return {
        id: ind.id,
        nombre: ind.nombre,
        tipo: ind.tipo,
        unidad: ind.unidad,
        meta: metaAplicada,
        resultado: resultadoFinal,
        cumplimientoPct,
        calificacion,
        estado,
        observaciones: evalPrevia.observaciones || '',
        fortalezas: evalPrevia.fortalezas || '',
        debilidades: evalPrevia.debilidades || '',
        compromisos: evalPrevia.compromisos || '',
        accionesCorrectivas: evalPrevia.accionesCorrectivas || '',
        planMejora: evalPrevia.planMejora || ''
      };
    });

    const sumaCalificaciones = indicadoresProcesados.reduce((acc, i) => acc + (i.calificacion || 0), 0);
    const promedioGeneral = indicadoresProcesados.length > 0
      ? Number((sumaCalificaciones / indicadoresProcesados.length).toFixed(1))
      : 0;

    const estadoCumplimiento = this.calcularEstado(promedioGeneral);

    // EXPEDIENTE OPERATIVO COMPLETO DEL COMERCIAL PARA EL DELEGADO DE GERENCIA
    const expediente = {
      informacionGeneral: {
        id: usuario.id,
        nombreCompleto: `${usuario.nombre} ${usuario.apellido}`,
        user: usuario.user,
        correo: usuario.correo,
        telefono: usuario.telefono || 'No registrado',
        cedula: usuario.cedula,
        cargo: usuario.cargo || nombreGrupo,
        fechaIngreso: usuario.createdAt,
        foto: usuario.foto,
        codigoAsesor: usuario.codigoAsesor || usuario.user
      },
      cargo: usuario.cargo || nombreGrupo,
      fechaIngreso: usuario.createdAt,
      jornadaLaboral: {
        diasTrabajados: diasJornada,
        horasTotales: totalHorasTrabajadas,
        retrasosMin: totalRetrasosMin,
        promedioHorasDia: diasJornada > 0 ? (totalHorasTrabajadas / diasJornada).toFixed(1) : 0
      },
      visitasRealizadas,
      totalVisitas,
      clientesGestionados,
      cotizacionesRealizadas: totalCotizaciones,
      ventasRealizadas: totalVentasCerradas,
      valorVendido,
      actividadesCumplidas: actividadesFinalizadas,
      totalActividades,
      rutasCumplidas: rutasCompletadas,
      totalRutas,
      seguimientosRealizados: totalSeguimientos,
      historial: historialEvals.map(h => ({
        id: h.id,
        periodo: h.periodo,
        fecha: h.fecha,
        calificacionGeneral: h.calificacionGeneral,
        estadoCumplimiento: h.estadoCumplimiento
      }))
    };

    return {
      usuario: {
        id: usuario.id,
        nombre: `${usuario.nombre} ${usuario.apellido}`,
        user: usuario.user,
        cargo: usuario.cargo,
        roleId: usuario.roleId,
        codigoAsesor: usuario.codigoAsesor,
        meta_p: usuario.meta_p,
        meta_u: usuario.meta_u,
        foto: usuario.foto,
        createdAt: usuario.createdAt
      },
      expediente,
      periodo: periodoActual,
      grupo,
      nombreGrupo,
      perfilId,
      calificacionGeneral: promedioGeneral,
      estadoCumplimiento,
      escala: '0-59 No Cumple | 60-79 Cumplimiento Parcial | 80-94 Cumple | 95-100 Supera la Meta',
      ultimaEvaluacion: ultimaEval ? {
        id: ultimaEval.id,
        fecha: ultimaEval.fecha,
        evaluadorId: ultimaEval.evaluadorId,
        calificacionGeneral: ultimaEval.calificacionGeneral,
        estadoCumplimiento: ultimaEval.estadoCumplimiento,
        observacionesGenerales: ultimaEval.observacionesGenerales,
        fortalezasGenerales: ultimaEval.fortalezasGenerales,
        debilidadesGenerales: ultimaEval.debilidadesGenerales,
        recomendaciones: ultimaEval.recomendaciones,
        compromisos: ultimaEval.compromisos,
        accionesCorrectivas: ultimaEval.accionesCorrectivas,
        oportunidadesMejora: ultimaEval.oportunidadesMejora,
        planAccionGeneral: ultimaEval.planAccionGeneral,
        fechaSeguimiento: ultimaEval.fechaSeguimiento,
        fechaProximaEvaluacion: ultimaEval.fechaProximaEvaluacion
      } : null,
      resumenOperativo: {
        totalProspectos,
        prospectosGanados,
        clientesGestionados,
        totalVisitas,
        visitasRealizadas,
        efectividadVisitas,
        totalCotizaciones,
        cotizacionesEnviadas,
        totalVentasCerradas,
        valorVendido,
        metaPresupuesto,
        metaUnidades,
        cumplimientoPresupuestoPct,
        cumplimientoMetasPct,
        totalSeguimientos,
        seguimientosEfectivos,
        totalActividades,
        actividadesFinalizadas,
        cumplimientoActividadesPct,
        totalRutas,
        rutasCompletadas,
        cumplimientoRutasPct,
        diasJornada,
        totalHorasTrabajadas,
        totalRetrasosMin,
        productividadDiaria,
        calidadEvidenciasPct,
        calidadRegistrosPts
      },
      resumenMatriz: {
        totalIndicadores: indicadoresProcesados.length,
        superaMeta: indicadoresProcesados.filter(i => i.estado === 'Supera la Meta').length,
        cumple: indicadoresProcesados.filter(i => i.estado === 'Cumple').length,
        cumplimientoParcial: indicadoresProcesados.filter(i => i.estado === 'Cumplimiento Parcial').length,
        noCumple: indicadoresProcesados.filter(i => i.estado === 'No Cumple').length
      },
      indicadores: indicadoresProcesados
    };
  }

  /**
   * Guarda o actualiza la evaluación oficial realizada por el Delegado de Gerencia
   */
  async guardarEvaluacion(evaluadorId, payload) {
    const {
      usuarioId,
      periodo,
      indicadoresDetalle,
      observacionesGenerales,
      fortalezasGenerales,
      debilidadesGenerales,
      recomendaciones,
      compromisos,
      accionesCorrectivas,
      oportunidadesMejora,
      planAccionGeneral,
      fechaSeguimiento,
      fechaProximaEvaluacion,
      metadata = null,
      adjuntos = [],
      evidencias = []
    } = payload;

    const finalAdjuntos = Array.isArray(adjuntos) && adjuntos.length > 0 ? adjuntos : (Array.isArray(evidencias) ? evidencias : []);
    const finalMetadata = {
      ...(typeof metadata === 'object' && metadata !== null ? metadata : {}),
      ...(finalAdjuntos.length > 0 ? { adjuntos: finalAdjuntos } : {})
    };

    if (!usuarioId) throw new Error('usuarioId requerido');
    if (!Array.isArray(indicadoresDetalle) || indicadoresDetalle.length === 0) {
      throw new Error('indicadoresDetalle debe ser un arreglo con las calificaciones de los indicadores');
    }

    const usuario = await prisma.user.findUnique({
      where: { id: usuarioId },
      include: { role: true }
    });
    if (!usuario) throw new Error('Usuario a evaluar no encontrado');

    const { nombreGrupo } = this.obtenerGrupoCargo(usuario);

    // Calcular calificación promedio ponderada de los indicadores
    const totalScores = indicadoresDetalle.reduce((acc, item) => acc + (Number(item.calificacion) || 0), 0);
    const calificacionGeneral = Number((totalScores / indicadoresDetalle.length).toFixed(1));
    const estadoCumplimiento = this.calcularEstado(calificacionGeneral);

    const ahora = new Date();
    const periodoFinal = periodo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

    // Buscar si ya existe una evaluación en el periodo
    const existente = await prisma.evaluacionComercialCampo.findFirst({
      where: { usuarioId, periodo: periodoFinal }
    });

    const dataPayload = {
      evaluadorId,
      usuarioId,
      periodo: periodoFinal,
      grupoCargo: nombreGrupo,
      calificacionGeneral,
      estadoCumplimiento,
      indicadoresDetalle,
      observacionesGenerales: observacionesGenerales || null,
      fortalezasGenerales: fortalezasGenerales || null,
      debilidadesGenerales: debilidadesGenerales || null,
      recomendaciones: recomendaciones || null,
      compromisos: compromisos || null,
      accionesCorrectivas: accionesCorrectivas || null,
      oportunidadesMejora: oportunidadesMejora || null,
      planAccionGeneral: planAccionGeneral || null,
      fechaSeguimiento: fechaSeguimiento ? new Date(fechaSeguimiento) : null,
      fechaProximaEvaluacion: fechaProximaEvaluacion ? new Date(fechaProximaEvaluacion) : null,
      metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : null,
      aprobadoDelegado: true
    };

    let evaluacionGuardada;
    if (existente) {
      evaluacionGuardada = await prisma.evaluacionComercialCampo.update({
        where: { id: existente.id },
        data: {
          ...dataPayload,
          updatedAt: new Date()
        }
      });
    } else {
      evaluacionGuardada = await prisma.evaluacionComercialCampo.create({
        data: {
          ...dataPayload,
          fecha: new Date()
        }
      });
    }

    // Si se registraron compromisos, registrarlos como novedad en el historial
    if (compromisos && compromisos.trim()) {
      await prisma.novedadDelegadoCampo.create({
        data: {
          delegadoId: evaluadorId,
          usuarioId,
          tipo: 'Compromiso',
          titulo: `Compromisos de Evaluación (${periodoFinal})`,
          descripcion: compromisos,
          gravedad: 'Normal',
          fechaCompromiso: fechaSeguimiento ? new Date(fechaSeguimiento) : null,
          estado: 'Activo',
          accionCorrectiva: planAccionGeneral || null
        }
      });
    }

    return evaluacionGuardada;
  }

  /**
   * Consolida el Tablero Operativo y Ejecutivo del Delegado de Gerencia
   */
  async getTableroDelegado(periodo = null) {
    const ahora = new Date();
    const periodoActual = periodo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0);
    const hoyFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59);

    // Obtener todos los comerciales de campo
    const comerciales = await prisma.user.findMany({
      where: {
        esComercialCampo: true
      },
      include: { role: true },
      orderBy: { nombre: 'asc' }
    });

    // Jornadas de hoy para validar quién está en calle
    const jornadasHoy = await prisma.jornadaLaboral.findMany({
      where: {
        fecha: { gte: hoyInicio, lte: hoyFin }
      }
    });
    const jornadaPorUsuario = {};
    jornadasHoy.forEach(j => {
      jornadaPorUsuario[j.usuarioId] = j;
    });

    // Tareas vencidas, pendientes y operaciones de hoy
    const [
      actividadesPendientes,
      tareasVencidas,
      seguimientosPendientes,
      visitasHoy,
      ventasLegacyHoy,
      ventasExternasHoy,
      totalClientesExternos,
      totalProspectosExternos,
      totalCotizacionesExternas,
      totalVentasExternas
    ] = await Promise.all([
      prisma.actividadCampo.count({
        where: { estado: { in: ['Pendiente', 'En ejecucion'] } }
      }),
      prisma.actividadCampo.count({
        where: {
          estado: { in: ['Pendiente', 'En ejecucion'] },
          fechaProgramada: { lt: hoyInicio }
        }
      }),
      prisma.seguimientoCampo.count({
        where: { fechaProgramada: { lte: hoyFin } }
      }),
      prisma.visitaCampo.count({
        where: {
          fechaProgramada: { gte: hoyInicio, lte: hoyFin },
          estado: 'Realizada'
        }
      }),
      prisma.venta.findMany({
        where: { fecha: { gte: hoyInicio, lte: hoyFin } },
        select: { total: true }
      }),
      prisma.ventaExternaCampo.findMany({
        where: { fecha: { gte: hoyInicio, lte: hoyFin } },
        select: { valorVendido: true }
      }),
      prisma.clienteExternoCampo.count(),
      prisma.clienteExternoCampo.count({
        where: {
          OR: [
            { tipoRegistro: 'Prospecto' },
            { etapaEmbudo: 'Prospecto' }
          ]
        }
      }),
      prisma.cotizacionExternaCampo.count(),
      prisma.ventaExternaCampo.count()
    ]);

    const totalVentasHoy = ventasLegacyHoy.reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0) +
      ventasExternasHoy.reduce((acc, v) => acc + (parseFloat(v.valorVendido) || 0), 0);

    const resumenEquipo = [];
    let totalPresupuestoEquipo = 0;
    let totalVendidoEquipo = 0;
    let sumaCumplimientoPpto = 0;
    let sumaCalificaciones = 0;
    let evalsPendientesCount = 0;
    let enJornadaCount = 0;
    let sinIniciarCount = 0;
    const alertas = [];

    for (const c of comerciales) {
      const dataInd = await this.calcularIndicadoresComercial(c.id, periodoActual);
      const resOp = dataInd.resumenOperativo;
      const metaP = parseFloat(c.meta_p) || resOp.metaPresupuesto;
      totalPresupuestoEquipo += metaP;
      totalVendidoEquipo += resOp.valorVendido;
      sumaCumplimientoPpto += resOp.cumplimientoPresupuestoPct;
      sumaCalificaciones += dataInd.calificacionGeneral;

      const jHoy = jornadaPorUsuario[c.id];
      const enJornada = jHoy && jHoy.estado === 'En jornada';
      const sinIniciar = !jHoy || jHoy.estado === 'No iniciada';
      if (enJornada) enJornadaCount++;
      if (sinIniciar) sinIniciarCount++;

      const tieneEval = !!dataInd.ultimaEvaluacion;
      if (!tieneEval) {
        evalsPendientesCount++;
      }

      // Alertas Inteligentes
      if (sinIniciar) {
        alertas.push({
          tipo: 'Turno Sin Iniciar',
          nivel: 'warning',
          usuario: `${c.nombre} ${c.apellido}`,
          mensaje: `${c.nombre} ${c.apellido} no ha registrado inicio de jornada hoy.`
        });
      }
      if (enJornada && resOp.visitasRealizadas === 0) {
        alertas.push({
          tipo: 'Baja Actividad',
          nivel: 'warning',
          usuario: `${c.nombre} ${c.apellido}`,
          mensaje: `${c.nombre} ${c.apellido} está en jornada activa pero no registra visitas aún hoy.`
        });
      }
      if (dataInd.calificacionGeneral < 60) {
        alertas.push({
          tipo: 'Incumplimiento Crítico',
          nivel: 'danger',
          usuario: `${c.nombre} ${c.apellido}`,
          mensaje: `${c.nombre} ${c.apellido} registra calificación de ${dataInd.calificacionGeneral}/100 (${dataInd.estadoCumplimiento}). Requiere plan de mejora.`
        });
      }

      resumenEquipo.push({
        usuarioId: c.id,
        nombreCompleto: `${c.nombre} ${c.apellido}`,
        user: c.user,
        cargo: c.cargo,
        roleId: c.roleId,
        grupo: dataInd.grupo,
        nombreGrupo: dataInd.nombreGrupo,
        calificacionGeneral: dataInd.calificacionGeneral,
        estadoCumplimiento: dataInd.estadoCumplimiento,
        metaPresupuesto: metaP,
        valorVendido: resOp.valorVendido,
        cumplimientoPptoPct: resOp.cumplimientoPresupuestoPct,
        cumplimientoMetasPct: resOp.cumplimientoMetasPct,
        visitasRealizadas: resOp.visitasRealizadas,
        horasTrabajadas: resOp.totalHorasTrabajadas,
        estadoJornadaHoy: jHoy ? jHoy.estado : 'Sin iniciar',
        horaInicioHoy: jHoy ? jHoy.horaInicio : null,
        evaluado: tieneEval,
        fechaSeguimiento: dataInd.ultimaEvaluacion?.fechaSeguimiento || null
      });
    }

    // Ranking ordenado por calificación general y ventas
    const ranking = [...resumenEquipo].sort((a, b) => {
      if (b.calificacionGeneral !== a.calificacionGeneral) {
        return b.calificacionGeneral - a.calificacionGeneral;
      }
      return b.valorVendido - a.valorVendido;
    });

    const totalComerciales = comerciales.length;
    const promedioCumplimientoPpto = totalComerciales > 0 ? Math.round(sumaCumplimientoPpto / totalComerciales) : 0;
    const promedioScoreGeneral = totalComerciales > 0
      ? Number((sumaCalificaciones / totalComerciales).toFixed(1))
      : 0;

    return {
      periodo: periodoActual,
      totalComerciales,
      comercialesActivos: totalComerciales,
      comercialesEnJornada: enJornadaCount,
      comercialesSinIniciar: sinIniciarCount,
      clientesGestionados: totalClientesExternos,
      prospectosGenerados: totalProspectosExternos,
      cotizacionesGeneradas: totalCotizacionesExternas,
      ventasCerradas: totalVentasExternas,
      actividadesPendientes,
      tareasVencidas,
      seguimientosPendientes,
      visitasHoy,
      ventasHoy: totalVentasHoy,
      promedioCumplimiento: promedioCumplimientoPpto,
      promedioScoreGeneral,
      presupuestoMes: totalPresupuestoEquipo,
      ventasMes: totalVendidoEquipo,
      porcentajePresupuesto: totalPresupuestoEquipo > 0 ? Math.round((totalVendidoEquipo / totalPresupuestoEquipo) * 100) : 0,
      evaluacionesPendientes: evalsPendientesCount,
      visitasTotales: resumenEquipo.reduce((acc, r) => acc + (r.visitasRealizadas || 0), 0),
      alertas,
      ranking,
      resumenEquipo
    };
  }

  /**
   * Obtiene el listado de evaluaciones históricas
   */
  async getHistorialEvaluaciones(usuarioId = null, periodo = null) {
    const where = {};
    if (usuarioId && usuarioId !== 'TODOS' && usuarioId !== 'undefined' && usuarioId !== 'null') {
      where.usuarioId = usuarioId;
    }
    if (periodo && periodo !== 'TODOS' && periodo !== 'undefined' && periodo !== 'null') {
      where.periodo = periodo;
    }

    return prisma.evaluacionComercialCampo.findMany({
      where,
      include: {
        usuario: {
          select: { id: true, nombre: true, apellido: true, cargo: true, user: true, roleId: true }
        },
        evaluador: {
          select: { id: true, nombre: true, apellido: true, cargo: true, user: true }
        }
      },
      orderBy: { fecha: 'desc' }
    });
  }

  /**
   * Crea una Novedad, Observación, Llamado de Atención o Reconocimiento del Delegado
   */
  async crearNovedadDelegado(delegadoId, payload) {
    const {
      usuarioId: reqUsuarioId,
      comercialId,
      tipo, // 'Observacion' | 'Compromiso' | 'Incumplimiento' | 'Reconocimiento' | 'LlamadoAtencion' | 'Comentario' | 'SolicitudSeguimiento' | 'Objetivo' | 'Instrucción Operativa' | 'Felicitación' | 'Llamado de Atención' | 'Novedad de Campo'
      titulo,
      descripcion,
      gravedad,
      prioridad,
      fechaCompromiso = null,
      accionCorrectiva = null,
      metadata = null,
      adjuntos = [],
      evidencias = []
    } = payload;

    const usuarioId = reqUsuarioId || comercialId;
    const finalGravedad = gravedad || prioridad || 'Normal';
    const finalAdjuntos = Array.isArray(adjuntos) && adjuntos.length > 0 ? adjuntos : (Array.isArray(evidencias) ? evidencias : []);

    if (!usuarioId || !tipo || !titulo || !descripcion) {
      throw new Error('Asesor comercial, tipo, título y descripción son campos obligatorios');
    }

    const finalMetadata = {
      ...(typeof metadata === 'object' && metadata !== null ? metadata : {}),
      ...(finalAdjuntos.length > 0 ? { adjuntos: finalAdjuntos } : {})
    };

    return prisma.novedadDelegadoCampo.create({
      data: {
        delegadoId,
        usuarioId,
        tipo,
        titulo,
        descripcion,
        gravedad: finalGravedad,
        fechaCompromiso: fechaCompromiso ? new Date(fechaCompromiso) : null,
        accionCorrectiva: accionCorrectiva || null,
        metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : null,
        estado: 'Activo'
      },
      include: {
        delegado: {
          select: { id: true, nombre: true, apellido: true, user: true }
        },
        usuario: {
          select: { id: true, nombre: true, apellido: true, user: true }
        }
      }
    });
  }

  /**
   * Obtiene las novedades registradas para un comercial o para todo el equipo si usuarioId es null
   */
  async getNovedadesComercial(usuarioId = null) {
    const where = usuarioId ? { usuarioId } : {};
    return prisma.novedadDelegadoCampo.findMany({
      where,
      include: {
        delegado: {
          select: { id: true, nombre: true, apellido: true, user: true }
        },
        usuario: {
          select: { id: true, nombre: true, apellido: true, user: true }
        }
      },
      orderBy: { fecha: 'desc' }
    });
  }

  /**
   * Actualiza el estado de una novedad o compromiso
   */
  async actualizarEstadoNovedad(novedadId, estado, accionCorrectiva = null) {
    const data = { estado, updatedAt: new Date() };
    if (accionCorrectiva) data.accionCorrectiva = accionCorrectiva;

    return prisma.novedadDelegadoCampo.update({
      where: { id: novedadId },
      data
    });
  }

  /**
   * Genera la FICHA HISTÓRICA COMPLETA de un comercial en campo
   */
  async getFichaHistoricaComercial(usuarioId) {
    const usuario = await prisma.user.findUnique({
      where: { id: usuarioId },
      include: { role: true }
    });

    if (!usuario) throw new Error('Colaborador comercial no encontrado');

    const { grupo, nombreGrupo } = this.obtenerGrupoCargo(usuario);

    const [
      evaluaciones,
      novedades,
      actividades,
      rutas
    ] = await Promise.all([
      prisma.evaluacionComercialCampo.findMany({
        where: { usuarioId },
        include: {
          evaluador: { select: { id: true, nombre: true, apellido: true } }
        },
        orderBy: { periodo: 'desc' }
      }),
      prisma.novedadDelegadoCampo.findMany({
        where: { usuarioId },
        include: {
          delegado: { select: { id: true, nombre: true, apellido: true } }
        },
        orderBy: { fecha: 'desc' }
      }),
      prisma.actividadCampo.findMany({
        where: {
          usuarioId,
          NOT: { titulo: { startsWith: 'Ruta:' } }
        },
        orderBy: { fechaProgramada: 'desc' },
        take: 50
      }),
      prisma.actividadCampo.findMany({
        where: {
          usuarioId,
          titulo: { startsWith: 'Ruta:' }
        },
        orderBy: { fechaProgramada: 'desc' },
        take: 30
      })
    ]);

    // Evolución de calificaciones por periodo
    const evolucionPeriodos = evaluaciones.map(e => ({
      periodo: e.periodo,
      calificacion: e.calificacionGeneral,
      estado: e.estadoCumplimiento,
      fecha: e.fecha
    })).reverse(); // Cronológico

    // Determinar tendencia de desempeño
    let tendencia = 'Estable →';
    if (evolucionPeriodos.length >= 2) {
      const ultimo = evolucionPeriodos[evolucionPeriodos.length - 1].calificacion;
      const penultimo = evolucionPeriodos[evolucionPeriodos.length - 2].calificacion;
      if (ultimo > penultimo + 2) tendencia = 'Creciente ↗';
      else if (ultimo < penultimo - 2) tendencia = 'Decreciente ↘';
    }

    const promedioHistorico = evaluaciones.length > 0
      ? Number((evaluaciones.reduce((a, b) => a + b.calificacionGeneral, 0) / evaluaciones.length).toFixed(1))
      : 0;

    const llamadosAtencion = novedades.filter(n => n.tipo === 'LlamadoAtencion' || n.tipo === 'Incumplimiento').length;
    const reconocimientos = novedades.filter(n => n.tipo === 'Reconocimiento').length;
    const compromisosPendientes = novedades.filter(n => n.tipo === 'Compromiso' && n.estado !== 'Resuelto').length;

    return {
      usuario: {
        id: usuario.id,
        nombre: `${usuario.nombre} ${usuario.apellido}`,
        user: usuario.user,
        cargo: usuario.cargo,
        roleId: usuario.roleId,
        codigoAsesor: usuario.codigoAsesor,
        foto: usuario.foto,
        meta_p: usuario.meta_p,
        meta_u: usuario.meta_u,
        grupo,
        nombreGrupo
      },
      resumenHistorico: {
        totalEvaluaciones: evaluaciones.length,
        promedioHistorico,
        estadoHistorico: this.calcularEstado(promedioHistorico),
        tendencia,
        llamadosAtencion,
        reconocimientos,
        compromisosPendientes,
        totalActividades: actividades.length,
        actividadesCompletadas: actividades.filter(a => a.estado === 'Finalizada').length,
        totalRutas: rutas.length,
        rutasCompletadas: rutas.filter(r => r.estado === 'Completada').length
      },
      evolucionPeriodos,
      evaluaciones,
      novedades,
      actividades,
      rutas
    };
  }
}

module.exports = new EvaluacionesCampoService();
