const prisma = require('../../prisma');

// Definición normativa de los indicadores por grupo comercial
const INDICADORES_GRUPO_A = [ // Dirección Comercial (Perfil 67)
  { id: 'IND_A_01', nombre: 'Prospectación de clientes nuevos', tipo: 'auto', unidad: 'clientes', metaDefecto: 15 },
  { id: 'IND_A_02', nombre: 'Visitas comerciales realizadas', tipo: 'auto', unidad: 'visitas', metaDefecto: 40 },
  { id: 'IND_A_03', nombre: 'Negocios cerrados', tipo: 'auto', unidad: 'cierres', metaDefecto: 10 },
  { id: 'IND_A_04', nombre: 'Cumplimiento de metas mensuales', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_A_05', nombre: 'Superación de metas', tipo: 'auto', unidad: '%', metaDefecto: 110 },
  { id: 'IND_A_06', nombre: 'Apertura de nuevas cuentas comerciales', tipo: 'auto', unidad: 'cuentas', metaDefecto: 5 },
  { id: 'IND_A_07', nombre: 'Crecimiento de clientes activos', tipo: 'auto', unidad: '%', metaDefecto: 8 },
  { id: 'IND_A_08', nombre: 'Identificación de nuevas zonas comerciales', tipo: 'manual', unidad: 'zonas', metaDefecto: 2 },
  { id: 'IND_A_09', nombre: 'Identificación de nuevos sectores', tipo: 'manual', unidad: 'sectores', metaDefecto: 3 },
  { id: 'IND_A_10', nombre: 'Identificación de nichos de mercado', tipo: 'manual', unidad: 'nichos', metaDefecto: 2 },
  { id: 'IND_A_11', nombre: 'Posicionamiento comercial', tipo: 'manual', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_A_12', nombre: 'Incremento de ventas', tipo: 'auto', unidad: '%', metaDefecto: 15 },
  { id: 'IND_A_13', nombre: 'Incremento de facturación', tipo: 'auto', unidad: '$', metaDefecto: 50000000 },
  { id: 'IND_A_14', nombre: 'Seguimiento de oportunidades', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 30 },
  { id: 'IND_A_15', nombre: 'Negociaciones estratégicas', tipo: 'manual', unidad: 'acuerdos', metaDefecto: 4 },
  { id: 'IND_A_16', nombre: 'Cierres de alto valor', tipo: 'auto', unidad: 'cierres', metaDefecto: 3 },
  { id: 'IND_A_17', nombre: 'Información de mercado recopilada', tipo: 'manual', unidad: 'reportes', metaDefecto: 4 },
  { id: 'IND_A_18', nombre: 'Información de competencia recopilada', tipo: 'manual', unidad: 'informes', metaDefecto: 3 },
  { id: 'IND_A_19', nombre: 'Oportunidades detectadas', tipo: 'auto', unidad: 'oportunidades', metaDefecto: 20 },
  { id: 'IND_A_20', nombre: 'Ajustes estratégicos propuestos', tipo: 'manual', unidad: 'propuestas', metaDefecto: 2 },
  { id: 'IND_A_21', nombre: 'Coordinación con áreas internas', tipo: 'manual', unidad: 'pts', metaDefecto: 95 },
  { id: 'IND_A_22', nombre: 'Seguimiento a pedidos', tipo: 'auto', unidad: 'pedidos', metaDefecto: 25 },
  { id: 'IND_A_23', nombre: 'Cumplimiento presupuestal', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_A_24', nombre: 'Cumplimiento de metas asignadas', tipo: 'auto', unidad: '%', metaDefecto: 100 }
];

const INDICADORES_GRUPO_B = [ // Coordinador Comercial Externo (Perfil 68)
  { id: 'IND_B_01', nombre: 'Clientes prospectados', tipo: 'auto', unidad: 'prospectos', metaDefecto: 20 },
  { id: 'IND_B_02', nombre: 'Clientes nuevos captados', tipo: 'auto', unidad: 'clientes', metaDefecto: 8 },
  { id: 'IND_B_03', nombre: 'Oportunidades registradas', tipo: 'auto', unidad: 'oportunidades', metaDefecto: 25 },
  { id: 'IND_B_04', nombre: 'Visitas realizadas', tipo: 'auto', unidad: 'visitas', metaDefecto: 45 },
  { id: 'IND_B_05', nombre: 'Reuniones realizadas', tipo: 'auto', unidad: 'reuniones', metaDefecto: 30 },
  { id: 'IND_B_06', nombre: 'Presentaciones comerciales', tipo: 'manual', unidad: 'presentaciones', metaDefecto: 15 },
  { id: 'IND_B_07', nombre: 'Cotizaciones elaboradas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 25 },
  { id: 'IND_B_08', nombre: 'Cotizaciones enviadas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 25 },
  { id: 'IND_B_09', nombre: 'Seguimiento a cotizaciones', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 40 },
  { id: 'IND_B_10', nombre: 'Ventas cerradas', tipo: 'auto', unidad: 'ventas', metaDefecto: 12 },
  { id: 'IND_B_11', nombre: 'Valor vendido', tipo: 'auto', unidad: '$', metaDefecto: 35000000 },
  { id: 'IND_B_12', nombre: 'Cumplimiento de presupuesto', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_B_13', nombre: 'Cumplimiento de metas', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_B_14', nombre: 'Seguimientos realizados', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 35 },
  { id: 'IND_B_15', nombre: 'Fidelización de clientes', tipo: 'manual', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_B_16', nombre: 'Calidad de servicio', tipo: 'manual', unidad: 'pts', metaDefecto: 95 },
  { id: 'IND_B_17', nombre: 'Informes de gestión', tipo: 'manual', unidad: 'informes', metaDefecto: 4 },
  { id: 'IND_B_18', nombre: 'Información de mercado recopilada', tipo: 'manual', unidad: 'reportes', metaDefecto: 4 },
  { id: 'IND_B_19', nombre: 'Gestión de solicitudes', tipo: 'auto', unidad: 'solicitudes', metaDefecto: 15 },
  { id: 'IND_B_20', nombre: 'Cumplimiento de funciones', tipo: 'manual', unidad: 'pts', metaDefecto: 100 }
];

const INDICADORES_GRUPO_C = [ // Asesor Comercial Externo (Perfil 69)
  { id: 'IND_C_01', nombre: 'Clientes prospectados', tipo: 'auto', unidad: 'prospectos', metaDefecto: 25 },
  { id: 'IND_C_02', nombre: 'Clientes nuevos captados', tipo: 'auto', unidad: 'clientes', metaDefecto: 6 },
  { id: 'IND_C_03', nombre: 'Oportunidades registradas', tipo: 'auto', unidad: 'oportunidades', metaDefecto: 20 },
  { id: 'IND_C_04', nombre: 'Visitas realizadas', tipo: 'auto', unidad: 'visitas', metaDefecto: 50 },
  { id: 'IND_C_05', nombre: 'Reuniones realizadas', tipo: 'auto', unidad: 'reuniones', metaDefecto: 25 },
  { id: 'IND_C_06', nombre: 'Cotizaciones elaboradas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 20 },
  { id: 'IND_C_07', nombre: 'Cotizaciones enviadas', tipo: 'auto', unidad: 'cotizaciones', metaDefecto: 20 },
  { id: 'IND_C_08', nombre: 'Seguimiento a cotizaciones', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 35 },
  { id: 'IND_C_09', nombre: 'Ventas cerradas', tipo: 'auto', unidad: 'ventas', metaDefecto: 10 },
  { id: 'IND_C_10', nombre: 'Valor vendido', tipo: 'auto', unidad: '$', metaDefecto: 25000000 },
  { id: 'IND_C_11', nombre: 'Cumplimiento de presupuesto', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_C_12', nombre: 'Cumplimiento de metas', tipo: 'auto', unidad: '%', metaDefecto: 100 },
  { id: 'IND_C_13', nombre: 'Seguimientos realizados', tipo: 'auto', unidad: 'seguimientos', metaDefecto: 30 },
  { id: 'IND_C_14', nombre: 'Actualización de clientes', tipo: 'auto', unidad: 'actualizaciones', metaDefecto: 15 },
  { id: 'IND_C_15', nombre: 'Fidelización de clientes', tipo: 'manual', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_C_16', nombre: 'Gestión de solicitudes', tipo: 'auto', unidad: 'solicitudes', metaDefecto: 10 },
  { id: 'IND_C_17', nombre: 'Calidad de atención', tipo: 'manual', unidad: 'pts', metaDefecto: 95 },
  { id: 'IND_C_18', nombre: 'Cumplimiento de políticas comerciales', tipo: 'manual', unidad: 'pts', metaDefecto: 100 },
  { id: 'IND_C_19', nombre: 'Calidad de registros', tipo: 'manual', unidad: 'pts', metaDefecto: 90 },
  { id: 'IND_C_20', nombre: 'Cumplimiento de funciones', tipo: 'manual', unidad: 'pts', metaDefecto: 100 }
];

class EvaluacionesCampoService {
  /**
   * Determina el grupo comercial al que pertenece un usuario
   */
  obtenerGrupoCargo(usuario) {
    const roleId = String(usuario.roleId || '');
    const cargo = (usuario.cargo || '').toLowerCase();
    const roleName = (usuario.role?.name || '').toLowerCase();

    if (roleId === '67' || cargo.includes('director') || cargo.includes('direcci') || roleName.includes('direcci')) {
      return {
        grupo: 'GRUPO A',
        nombreGrupo: 'Dirección Comercial',
        perfilId: '67',
        indicadoresBase: INDICADORES_GRUPO_A
      };
    }

    if (roleId === '68' || cargo.includes('coordinad') || roleName.includes('coordinad')) {
      return {
        grupo: 'GRUPO B',
        nombreGrupo: 'Coordinador Comercial Externo',
        perfilId: '68',
        indicadoresBase: INDICADORES_GRUPO_B
      };
    }

    // Por defecto Grupo C (Asesor Comercial Externo)
    return {
      grupo: 'GRUPO C',
      nombreGrupo: 'Asesor Comercial Externo',
      perfilId: '69',
      indicadoresBase: INDICADORES_GRUPO_C
    };
  }

  /**
   * Calcula el estado normativo según la calificación numérica (0 - 100)
   */
  calcularEstado(calificacion) {
    const score = Number(calificacion) || 0;
    if (score >= 95) return 'Supera lo Esperado';
    if (score >= 80) return 'Cumple';
    if (score >= 60) return 'Cumple Parcialmente';
    return 'No Cumple';
  }

  /**
   * Calcula los indicadores de un colaborador comercial para un periodo específico
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

    // Consultas reales del ERP en paralelo
    const [visitas, prospectos, cotizaciones, ventas, jornadas, seguimientos, ultimaEval] = await Promise.all([
      prisma.visitaCampo.findMany({
        where: {
          usuarioId,
          fechaProgramada: { gte: fechaInicio, lte: fechaFin }
        }
      }),
      prisma.prospectoCampo.findMany({
        where: {
          creadoPorId: usuarioId,
          fechaCreacion: { gte: fechaInicio, lte: fechaFin }
        }
      }),
      prisma.cotizacion.findMany({
        where: {
          vendedorId: usuarioId,
          fecha: { gte: fechaInicio, lte: fechaFin }
        }
      }),
      prisma.venta.findMany({
        where: {
          vendedorId: usuarioId,
          fecha: { gte: fechaInicio, lte: fechaFin }
        }
      }),
      prisma.jornadaLaboral.findMany({
        where: {
          usuarioId,
          fecha: { gte: fechaInicio, lte: fechaFin }
        }
      }),
      prisma.seguimientoCampo.findMany({
        where: {
          usuarioId,
          fechaHora: { gte: fechaInicio, lte: fechaFin }
        }
      }),
      prisma.evaluacionComercialCampo.findFirst({
        where: { usuarioId, periodo: periodoActual },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Métricas calculadas en base a datos reales
    const totalProspectos = prospectos.length;
    const prospectosGanados = prospectos.filter(p => p.etapa === 'Cerrado Ganado').length;
    const totalVisitas = visitas.length;
    const visitasRealizadas = visitas.filter(v => v.estado === 'Realizada').length;
    const totalCotizaciones = cotizaciones.length;
    const totalVentasCerradas = ventas.length + prospectosGanados;
    const valorVendido = ventas.reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0);
    const metaPresupuesto = parseFloat(usuario.meta_p) || 25000000;
    const metaUnidades = parseInt(usuario.meta_u) || 10;
    const cumplimientoPresupuestoPct = metaPresupuesto > 0 ? Math.min(150, Math.round((valorVendido / metaPresupuesto) * 100)) : 0;
    const cumplimientoMetasPct = metaUnidades > 0 ? Math.min(150, Math.round((totalVentasCerradas / metaUnidades) * 100)) : 0;
    const totalSeguimientos = seguimientos.length;

    // Jornada laboral agregada
    const totalHorasTrabajadas = Math.round(jornadas.reduce((acc, j) => acc + (j.tiempoTotalMin || 0), 0) / 60);
    const tiempoEfectivoMin = jornadas.reduce((acc, j) => acc + (j.tiempoEfectivoMin || 0), 0);
    const totalRetrasosMin = jornadas.reduce((acc, j) => acc + (j.retrasoMin || 0), 0);
    const promedioCumplimientoHorario = jornadas.length > 0
      ? Math.round(jornadas.reduce((acc, j) => acc + (j.cumplimientoHorarioPct || 100), 0) / jornadas.length)
      : 100;

    // Mapear detalle de indicadores incorporando la evaluación guardada previamente si existe
    const evalDetalleMap = {};
    if (ultimaEval && Array.isArray(ultimaEval.indicadoresDetalle)) {
      ultimaEval.indicadoresDetalle.forEach(item => {
        evalDetalleMap[item.id] = item;
      });
    }

    const indicadoresProcesados = indicadoresBase.map(ind => {
      let resultadoCalculado = 0;
      let metaFinal = ind.metaDefecto;

      if (ind.nombre.includes('Prospecta') || ind.nombre.includes('prospectados')) {
        resultadoCalculado = totalProspectos;
      } else if (ind.nombre.includes('captados') || ind.nombre.includes('Apertura')) {
        resultadoCalculado = prospectosGanados;
      } else if (ind.nombre.includes('Visitas') || ind.nombre.includes('visitas')) {
        resultadoCalculado = visitasRealizadas;
      } else if (ind.nombre.includes('Reuniones')) {
        resultadoCalculado = Math.round(visitasRealizadas * 0.7);
      } else if (ind.nombre.includes('Cotizaciones elaboradas') || ind.nombre.includes('Cotizaciones enviadas')) {
        resultadoCalculado = totalCotizaciones;
      } else if (ind.nombre.includes('Ventas cerradas') || ind.nombre.includes('Negocios cerrados')) {
        resultadoCalculado = totalVentasCerradas;
        metaFinal = metaUnidades;
      } else if (ind.nombre.includes('Valor vendido') || ind.nombre.includes('Incremento de facturación')) {
        resultadoCalculado = valorVendido;
        metaFinal = metaPresupuesto;
      } else if (ind.nombre.includes('presupuest') || ind.nombre.includes('Presupuesto')) {
        resultadoCalculado = cumplimientoPresupuestoPct;
        metaFinal = 100;
      } else if (ind.nombre.includes('metas')) {
        resultadoCalculado = cumplimientoMetasPct;
        metaFinal = 100;
      } else if (ind.nombre.includes('Seguimiento') || ind.nombre.includes('seguimientos')) {
        resultadoCalculado = totalSeguimientos;
      } else if (ind.nombre.includes('Oportunidades') || ind.nombre.includes('oportunidades')) {
        resultadoCalculado = totalProspectos + totalCotizaciones;
      } else {
        // Indicadores cualitativos/manuales
        resultadoCalculado = evalDetalleMap[ind.id]?.resultado !== undefined ? evalDetalleMap[ind.id].resultado : ind.metaDefecto;
      }

      const evalPrevia = evalDetalleMap[ind.id] || {};
      const cumplimientoPct = metaFinal > 0
        ? Math.min(150, Math.round((Number(resultadoCalculado) / Number(metaFinal)) * 100))
        : 100;

      const calificacion = evalPrevia.calificacion !== undefined
        ? Number(evalPrevia.calificacion)
        : Math.min(100, Math.max(0, cumplimientoPct));

      return {
        id: ind.id,
        nombre: ind.nombre,
        tipo: ind.tipo,
        unidad: ind.unidad,
        meta: evalPrevia.meta !== undefined ? evalPrevia.meta : metaFinal,
        resultado: resultadoCalculado,
        cumplimientoPct,
        calificacion,
        estado: this.calcularEstado(calificacion),
        tendencia: cumplimientoPct >= 100 ? 'Positiva' : (cumplimientoPct >= 75 ? 'Estable' : 'Negativa'),
        observaciones: evalPrevia.observaciones || '',
        comentarios: evalPrevia.comentarios || '',
        fortalezas: evalPrevia.fortalezas || '',
        debilidades: evalPrevia.debilidades || '',
        oportunidadesMejora: evalPrevia.oportunidadesMejora || '',
        planAccion: evalPrevia.planAccion || '',
        fechaSeguimiento: evalPrevia.fechaSeguimiento || null
      };
    });

    const sumaCalificaciones = indicadoresProcesados.reduce((acc, i) => acc + (i.calificacion || 0), 0);
    const promedioGeneral = indicadoresProcesados.length > 0
      ? Number((sumaCalificaciones / indicadoresProcesados.length).toFixed(1))
      : 0;

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
        foto: usuario.foto
      },
      periodo: periodoActual,
      grupo,
      nombreGrupo,
      perfilId,
      calificacionGeneral: promedioGeneral,
      estadoCumplimiento: this.calcularEstado(promedioGeneral),
      ultimaEvaluacion: ultimaEval ? {
        id: ultimaEval.id,
        fecha: ultimaEval.fecha,
        evaluadorId: ultimaEval.evaluadorId,
        aprobadoDelegado: ultimaEval.aprobadoDelegado,
        fortalezasGenerales: ultimaEval.fortalezasGenerales,
        debilidadesGenerales: ultimaEval.debilidadesGenerales,
        oportunidadesMejora: ultimaEval.oportunidadesMejora,
        planAccionGeneral: ultimaEval.planAccionGeneral,
        fechaSeguimiento: ultimaEval.fechaSeguimiento,
        observacionesGenerales: ultimaEval.observacionesGenerales
      } : null,
      resumenOperativo: {
        totalProspectos,
        prospectosGanados,
        totalVisitas,
        visitasRealizadas,
        totalCotizaciones,
        totalVentasCerradas,
        valorVendido,
        cumplimientoPresupuestoPct,
        cumplimientoMetasPct,
        totalHorasTrabajadas,
        tiempoEfectivoMin,
        totalRetrasosMin,
        promedioCumplimientoHorario
      },
      resumen: {
        total: indicadoresProcesados.length,
        promedioPct: Math.round(indicadoresProcesados.reduce((a, b) => a + (Number(b.cumplimientoPct) || 0), 0) / (indicadoresProcesados.length || 1)),
        cumple: indicadoresProcesados.filter(i => i.estado === 'Cumple' || i.estado === 'Supera lo Esperado').length,
        parcial: indicadoresProcesados.filter(i => i.estado === 'Cumple Parcialmente').length,
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
      fortalezasGenerales,
      debilidadesGenerales,
      oportunidadesMejora,
      planAccionGeneral,
      fechaSeguimiento,
      observacionesGenerales
    } = payload;

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

    let evaluacionGuardada;
    if (existente) {
      evaluacionGuardada = await prisma.evaluacionComercialCampo.update({
        where: { id: existente.id },
        data: {
          evaluadorId,
          calificacionGeneral,
          estadoCumplimiento,
          indicadoresDetalle,
          fortalezasGenerales: fortalezasGenerales || null,
          debilidadesGenerales: debilidadesGenerales || null,
          oportunidadesMejora: oportunidadesMejora || null,
          planAccionGeneral: planAccionGeneral || null,
          fechaSeguimiento: fechaSeguimiento ? new Date(fechaSeguimiento) : null,
          observacionesGenerales: observacionesGenerales || null,
          aprobadoDelegado: true,
          updatedAt: new Date()
        }
      });
    } else {
      evaluacionGuardada = await prisma.evaluacionComercialCampo.create({
        data: {
          evaluadorId,
          usuarioId,
          periodo: periodoFinal,
          fecha: new Date(),
          grupoCargo: nombreGrupo,
          calificacionGeneral,
          estadoCumplimiento,
          indicadoresDetalle,
          fortalezasGenerales: fortalezasGenerales || null,
          debilidadesGenerales: debilidadesGenerales || null,
          oportunidadesMejora: oportunidadesMejora || null,
          planAccionGeneral: planAccionGeneral || null,
          fechaSeguimiento: fechaSeguimiento ? new Date(fechaSeguimiento) : null,
          observacionesGenerales: observacionesGenerales || null,
          aprobadoDelegado: true
        }
      });
    }

    return evaluacionGuardada;
  }

  /**
   * Consolida el Tablero del Delegado de Gerencia
   */
  async getTableroDelegado(periodo = null) {
    const ahora = new Date();
    const periodoActual = periodo || `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const [anio, mes] = periodoActual.split('-');

    const fechaInicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
    const fechaFin = new Date(parseInt(anio), parseInt(mes), 0, 23, 59, 59, 999);

    // Obtener todos los usuarios de campo
    const comerciales = await prisma.user.findMany({
      where: {
        OR: [
          { esComercialCampo: true },
          { roleId: { in: ['67', '68', '69'] } },
          { cargo: { contains: 'comercial', mode: 'insensitive' } },
          { cargo: { contains: 'asesor', mode: 'insensitive' } },
          { cargo: { contains: 'coordinador', mode: 'insensitive' } },
          { cargo: { contains: 'director', mode: 'insensitive' } }
        ],
        AND: [
          { NOT: { roleId: '1' } }, // Excluir Master Admin
          { NOT: { esDelegadoGerencia: true } } // Excluir a los delegados
        ]
      },
      include: { role: true },
      orderBy: { nombre: 'asc' }
    });

    const resumenEquipo = [];
    let totalPresupuestoEquipo = 0;
    let totalVendidoEquipo = 0;
    let sumaCumplimientoMetas = 0;
    let sumaCumplimientoPpto = 0;
    let evalsPendientesCount = 0;
    const alertas = [];

    for (const c of comerciales) {
      const dataInd = await this.calcularIndicadoresComercial(c.id, periodoActual);
      const resOp = dataInd.resumenOperativo;
      const metaP = parseFloat(c.meta_p) || 25000000;
      totalPresupuestoEquipo += metaP;
      totalVendidoEquipo += resOp.valorVendido;
      sumaCumplimientoPpto += resOp.cumplimientoPresupuestoPct;
      sumaCumplimientoMetas += resOp.cumplimientoMetasPct;

      const tieneEval = !!dataInd.ultimaEvaluacion;
      if (!tieneEval) {
        evalsPendientesCount++;
      }

      // Generar alertas inteligentes
      if (resOp.totalRetrasosMin > 45) {
        alertas.push({
          tipo: 'Retraso',
          nivel: 'warning',
          mensaje: `${c.nombre} ${c.apellido} acumula ${resOp.totalRetrasosMin} min de retrasos en el turno.`
        });
      }
      if (dataInd.calificacionGeneral < 60) {
        alertas.push({
          tipo: 'Bajo Rendimiento',
          nivel: 'danger',
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
    const promedioCumplimientoMetas = totalComerciales > 0 ? Math.round(sumaCumplimientoMetas / totalComerciales) : 0;
    const promedioScoreGeneral = totalComerciales > 0
      ? Number((resumenEquipo.reduce((acc, r) => acc + r.calificacionGeneral, 0) / totalComerciales).toFixed(1))
      : 0;

    return {
      periodo: periodoActual,
      totalComerciales,
      promedioCumplimiento: promedioCumplimientoPpto,
      presupuestoMes: totalPresupuestoEquipo,
      ventasMes: totalVendidoEquipo,
      porcentajePresupuesto: totalPresupuestoEquipo > 0 ? Math.round((totalVendidoEquipo / totalPresupuestoEquipo) * 100) : 0,
      evaluacionesPendientes: evalsPendientesCount,
      visitasTotales: resumenEquipo.reduce((acc, r) => acc + (r.visitasRealizadas || 0), 0),
      comerciales: resumenEquipo,
      metricasGlobales: {
        totalComercialesEnCampo: totalComerciales,
        totalPresupuestoEquipo,
        totalVendidoEquipo,
        promedioCumplimientoPpto,
        promedioCumplimientoMetas,
        promedioScoreGeneral,
        evaluacionesPendientes: evalsPendientesCount,
        totalAlertas: alertas.length
      },
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
}

module.exports = new EvaluacionesCampoService();
