const { z } = require('zod');

/**
 * IBRO ERP - Backend Schema Validators & Sanitizers (validators.js)
 * Validación Zod y sanitización estricta para garantizar compatibilidad con PostgreSQL y Prisma ORM.
 */

// 1. Esquemas Zod por Entidad
const clienteSchema = z.object({
  id: z.string().min(1),
  doc: z.string().optional().nullable(),
  nom: z.string().min(1, 'El nombre es obligatorio'),
  tipo_cliente: z.string().optional().nullable(),
  tel: z.string().optional().nullable(),
  correo: z.string().optional().nullable(),
}).passthrough();

const inventarioSchema = z.object({
  id: z.string().min(1),
  cod: z.string().min(1, 'El código es obligatorio'),
  nom: z.string().min(1, 'El nombre del ítem es obligatorio'),
  cant: z.number().or(z.string().regex(/^\d+$/).transform(Number)).optional(),
  precio: z.number().or(z.string().transform(Number)).optional(),
}).passthrough();

const ventaSchema = z.object({
  id: z.string().min(1),
  total: z.number().or(z.string().transform(Number)).optional(),
}).passthrough();

const cotizacionSchema = z.object({
  id: z.string().min(1),
  total: z.number().or(z.string().transform(Number)).optional(),
}).passthrough();

const servicioSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
}).passthrough();

const pqrSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
}).passthrough();

const capacitacionSchema = z.object({
  id: z.string().min(1),
  tema: z.string().min(1, 'El tema de capacitación es obligatorio'),
}).passthrough();

const solicitudSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
}).passthrough();

const procesoDisciplinarioSchema = z.object({
  id: z.string().min(1),
  falta: z.string().optional().nullable(),
}).passthrough();

const evaluacionSchema = z.object({
  id: z.string().min(1),
}).passthrough();

const comisionistaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1, 'El nombre del comisionista es obligatorio'),
}).passthrough();

const cuentasCobroSchema = z.object({
  id: z.string().min(1),
}).passthrough();

const anuncioSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1, 'El título del comunicado es obligatorio'),
}).passthrough();

const chatSchema = z.object({
  id: z.string().min(1),
}).passthrough();

const syncDiffSchema = z.object({
  updated: z.record(z.array(z.any())).optional(),
  deleted: z.record(z.array(z.string())).optional()
}).passthrough();

// 2. Diccionario estricto de campos permitidos en Prisma (schema.prisma)
const PRISMA_ALLOWED_FIELDS = {
  cliente: [
    'id', 'doc_tipo', 'doc', 'nom', 'tipo_cliente', 'tel', 'correo', 'direccion',
    'owner', 'lockedBy', 'habeasDataAccepted', 'numVinculacion', 'fechaVinculacion',
    'motivoEncuesta', 'transfA', 'asesorCodigo', 'asesorNombre', 'codigoCliente',
    'personaTipo', 'digitoVerificacion', 'sociedadTipo', 'barrio', 'ciudad',
    'departamento', 'establecimientoNombre', 'correoFacturacion', 'contactoComercial',
    'cargoContacto', 'correoComercial', 'celularContacto', 'condicionesPago',
    'condicionesPagoDias', 'documentosEntregados', 'ameritaSeguimiento', 'formaPago',
    'formaPagoContado', 'formaPagoContadoCual', 'formaContacto', 'formaContactoOtra',
    'transaccionDetalles', 'asesorTransaccion', 'porcentajeAutorizado',
    'observacionesTransaccion', 'firmaNombre', 'firmaCedula', 'firmaFecha', 'firma',
    'descripcion', 'adjuntos'
  ],

  inventario: [
    'id', 'cod', 'ref', 'nom', 'marca', 'clasif', 'subclasif', 'tech', 'btu',
    'volt', 'cant', 'pedido', 'precio', 'precio_publico', 'precio_tecnico',
    'precio_mayorista', 'precio_costo', 'vendidas', 'lockedBy', 'datosExt'
  ],

  venta: [
    'id', 'fecha', 'fechaIso', 'venceGarantiaIso', 'mesesGarantia', 'vendedorId',
    'clienteId', 'metodoPago', 'total', 'comisionistaId', 'comisionistaNombre',
    'comisionistaPct', 'comisionistaValor', 'estadoComision', 'fechaComision',
    'tipo_precio', 'lockedBy', 'vendedorNombre', 'vendedorCargo', 'vendedorEmail',
    'vendedorMovil', 'vendedorCodigoAsesor', 'equipos', 'materiales'
  ],

  cotizacion: [
    'id', 'numCotizacion', 'fecha', 'vendedorId', 'clienteId', 'total',
    'comisionistaId', 'comisionistaNombre', 'comisionistaPct', 'comisionistaValor',
    'lockedBy', 'contacto', 'condiciones', 'tiempoEntrega', 'direccionEntrega',
    'detallePagoMixto', 'cuentas', 'firmanteNombre', 'firmanteCargo', 'firmanteCorreo',
    'firmanteMovil', 'garantia', 'observacion', 'vigencia', 'ivaTipo', 'equipos',
    'materiales', 'tipo_precio', 'fechaSeguimiento', 'estadoSeguimiento',
    'motivoSeguimiento', 'motivoNoCompra', 'vendedorNombre', 'vendedorCargo',
    'vendedorEmail', 'vendedorMovil', 'vendedorCodigoAsesor'
  ],

  servicio: [
    'id', 'clienteId', 'fechaProg', 'tipo', 'obs', 'estado', 'obsAdmin',
    'lockedBy', 'tecnicoId', 'equipoDetalle', 'obsRecepcion', 'obsDiagnostico',
    'obsCotizacion', 'obsEjecucion', 'obsCalidad', 'fechaCreacion', 'fechaIso',
    'radicado', 'inventarioId', 'ventaId', 'cotizacionId', 'etapaActual',
    'evidencias', 'trazabilidad', 'aplicaGarantia', 'costoServicio'
  ],

  pqr: [
    'id', 'fecha', 'limiteIso', 'clienteId', 'tipo', 'detalle', 'evidencia',
    'fileUrl', 'estado', 'satisfecho', 'lockedBy', 'radicado', 'hechos',
    'solicitudes', 'evidencias', 'aplicaGarantia', 'tratamientoGarantia',
    'terminoLegal', 'fechaCierre', 'inventarioId', 'ventaId', 'cotizacionId',
    'trazabilidad', 'usuarioAsignadoId'
  ],

  solicitud: [
    'id', 'fecha', 'asesorId', 'nombreAsesor', 'tipo', 'detalle', 'evidencia',
    'fileUrl', 'estado', 'lockedBy', 'comentario', 'fechaRadicado'
  ],

  procesoDisciplinario: [
    'id', 'fecha', 'asesorId', 'jefeId', 'falta', 'obs', 'etapa', 'descargo',
    'sancion', 'diasSuspension', 'renunciaTerminos', 'timestampEtapa', 'lockedBy', 'evidencias'
  ],

  evaluacion: [
    'id', 'fecha', 'evaluadorId', 'evaluadoId', 'evaluadoNombre', 'tipo', 'obs',
    'scores', 'lockedBy', 'empleado', 'metajobs', 'asistencia', 'objetivos', 'promedio'
  ],

  anuncio: [
    'id', 'fecha', 'titulo', 'mensaje', 'lockedBy', 'contenido', 'expiresAt', 'expired'
  ],

  capacitacion: [
    'id', 'tipo', 'tema', 'descripcion', 'fecha', 'hora', 'obligatoria',
    'creadorId', 'videoLink', 'videoFile', 'videoFileName', 'plataforma', 'enlaceReunion',
    'tutorFirma', 'tutor', 'creadoEn', 'materiales', 'asistentes', 'evaluacion',
    'estado', 'lockedBy'
  ],

  comisionista: [
    'id', 'tipo', 'nombre', 'cedula', 'telefono', 'correo', 'direccion',
    'cliente_remite', 'valor_venta', 'pct_comision', 'fecha', 'ownerId',
    'lockedBy', 'doc', 'tel', 'porcentaje'
  ],

  cuentasCobro: [
    'id', 'ciudad', 'fecha', 'cuenta', 'num', 'nombre', 'comisionista', 'cedula', 'correo',
    'concepto', 'items', 'nequi', 'titular', 'estado', 'total', 'tecnicos'
  ],

  chat: [
    'id', 'timestamp', 'fecha', 'senderId', 'nombre', 'receiverId', 'text',
    'senderTabId', 'isNudge', 'isSticker', 'stickerId', 'stickerUrl', 'isAudio',
    'audioUrl', 'isFile', 'fileUrl', 'fileName', 'fileType', 'fileSize', 'isMeeting',
    'meetingId', 'readAt', 'isDeleted', 'isEdited', 'reactions', 'replyTo', 'replyToObj', 'hiddenBy'
  ],

  chatGroup: [
    'id', 'nombre', 'descripcion', 'createdById', 'fecha', 'integrantes'
  ],

  auditoria: [
    'id', 'userId', 'fecha', 'action', 'modulo', 'recordDetails', 'shadowingData', 'hash'
  ],

  notificacion: [
    'id', 'paraId', 'titulo', 'mensaje', 'de', 'tipo', 'fecha', 'leida', 'targetModule'
  ],

  role: [
    'id', 'name', 'permissions', 'modules', 'canAssignSales', 'clientLevel',
    'canManageEvals', 'canCreateMeetings', 'viewTechPrice', 'viewWholesalePrice', 'viewCostPrice'
  ],

  user: [
    'id', 'nombre', 'apellido', 'cedula', 'tipoDoc', 'correo', 'cargo', 'telefono',
    'observaciones', 'user', 'pass', 'roleId', 'meta_u', 'ejec_u', 'meta_p',
    'ejec_p', 'soundsEnabled', 'cumpleanos', 'habeasDataAccepted', 'failedLoginAttempts',
    'isLocked', 'lastLogin', 'isOnline', 'foto', 'firma', 'lat', 'lng', 'lastLocationUpdate', 'codigoAsesor'
  ],

  whatsappConfig: [
    'id', 'phone', 'status'
  ],

  informesConfig: [
    'id', 'margenOperativo', 'ingresoProyectos', 'gastosInstalacion',
    'anticipos', 'gastosCajaChica', 'diasHabilesMes', 'mesPresupuesto',
    'fechaCorte', 'diasTranscurridos'
  ]
};

const TABLE_TO_MODEL = {
  cliente: 'cliente',
  clientes: 'cliente',
  inventario: 'inventario',
  venta: 'venta',
  ventas: 'venta',
  cotizacion: 'cotizacion',
  cotizaciones: 'cotizacion',
  servicio: 'servicio',
  servicios: 'servicio',
  pqr: 'pqr',
  pqrs: 'pqr',
  solicitud: 'solicitud',
  solicitudes: 'solicitud',
  procesoDisciplinario: 'procesoDisciplinario',
  procesosDisciplinarios: 'procesoDisciplinario',
  evaluacion: 'evaluacion',
  evaluaciones: 'evaluacion',
  anuncio: 'anuncio',
  anuncios: 'anuncio',
  comunicados: 'anuncio',
  capacitacion: 'capacitacion',
  capacitaciones: 'capacitacion',
  comisionista: 'comisionista',
  comisionistas: 'comisionista',
  cuentasCobro: 'cuentasCobro',
  chat: 'chat',
  chatGroup: 'chatGroup',
  chatGroups: 'chatGroup',
  auditoria: 'auditoria',
  notificacion: 'notificacion',
  notificaciones: 'notificacion',
  role: 'role',
  roles: 'role',
  user: 'user',
  users: 'user',
  whatsappConfig: 'whatsappConfig',
  informesConfig: 'informesConfig'
};

/**
 * Parser de fecha ultra seguro y tolerante (ISO, DD/MM/YYYY, timestamps, etc.)
 */
function safeDate(val, fallback = null) {
  if (val === null || val === undefined || val === '') return fallback;
  if (val instanceof Date) return isNaN(val.getTime()) ? fallback : val;

  // Si es timestamp numérico
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? fallback : d;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;

    // Manejar formato "DD/MM/YYYY" o "DD/MM/YYYY, HH:MM:SS"
    if (trimmed.includes('/')) {
      try {
        const [datePart, timePart] = trimmed.split(',');
        const parts = datePart.trim().split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            let hours = 0, mins = 0, secs = 0;
            if (timePart) {
              const tParts = timePart.trim().split(':');
              hours = parseInt(tParts[0], 10) || 0;
              mins = parseInt(tParts[1], 10) || 0;
              secs = parseInt(tParts[2], 10) || 0;
            }
            const constructed = new Date(Date.UTC(year, month, day, hours, mins, secs));
            if (!isNaN(constructed.getTime())) return constructed;
          }
        }
      } catch (e) {}
    }

    // Intentar parser nativo ISO
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return fallback;
}

/**
 * Parser seguro de campos JSON para Prisma
 */
function safeJson(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      return trimmed;
    }
  }
  return fallback;
}

/**
 * Sanitiza un objeto eliminando cualquier clave desconocida antes de tx[table].upsert()
 * y normalizando tipos de datos a los exigidos por PostgreSQL / Prisma.
 */
function sanitizeBackendForPrisma(tableName, item) {
  if (!item || typeof item !== 'object') return item;

  const modelKey = TABLE_TO_MODEL[tableName] || tableName;
  const allowed = PRISMA_ALLOWED_FIELDS[modelKey];

  const cleaned = {};
  if (allowed) {
    for (const field of allowed) {
      if (item[field] !== undefined) {
        cleaned[field] = item[field];
      }
    }
  } else {
    Object.assign(cleaned, item);
    delete cleaned._tempId;
    delete cleaned._dirty;
    delete cleaned.isEditing;
    delete cleaned.theme;
    delete cleaned.darkMode;
    delete cleaned.isDark;
  }

  // --- Normalizaciones y Parsers Específicos por Entidad ---
  if (modelKey === 'cliente') {
    if (cleaned.habeasDataAccepted !== undefined) {
      cleaned.habeasDataAccepted = cleaned.habeasDataAccepted === true || cleaned.habeasDataAccepted === 'true';
    }
    if (cleaned.condicionesPagoDias !== undefined) {
      cleaned.condicionesPagoDias = cleaned.condicionesPagoDias === null || cleaned.condicionesPagoDias === '' 
        ? null 
        : parseInt(cleaned.condicionesPagoDias) || 0;
    }
    if (cleaned.porcentajeAutorizado !== undefined) {
      cleaned.porcentajeAutorizado = cleaned.porcentajeAutorizado === null || cleaned.porcentajeAutorizado === '' 
        ? null 
        : parseFloat(cleaned.porcentajeAutorizado) || 0;
    }
    cleaned.doc_tipo = cleaned.doc_tipo ? String(cleaned.doc_tipo) : 'CC';
    cleaned.doc = cleaned.doc ? String(cleaned.doc) : (cleaned.id ? String(cleaned.id) : '00000000');
    cleaned.nom = cleaned.nom ? String(cleaned.nom) : 'Cliente Sin Nombre';
    cleaned.tipo_cliente = cleaned.tipo_cliente ? String(cleaned.tipo_cliente) : 'General';
    cleaned.tel = cleaned.tel ? String(cleaned.tel) : 'N/A';
    cleaned.correo = cleaned.correo ? String(cleaned.correo) : 'contacto@cliente.com';
    cleaned.fechaVinculacion = safeDate(cleaned.fechaVinculacion, null);
    cleaned.firmaFecha = safeDate(cleaned.firmaFecha, null);
    cleaned.adjuntos = safeJson(cleaned.adjuntos, null);
  } else if (modelKey === 'inventario') {
    cleaned.cant = parseInt(cleaned.cant) || 0;
    cleaned.pedido = parseInt(cleaned.pedido) || 0;
    cleaned.vendidas = parseInt(cleaned.vendidas) || 0;
    cleaned.precio = parseFloat(cleaned.precio) || 0;
    cleaned.precio_publico = cleaned.precio_publico !== undefined && cleaned.precio_publico !== null ? parseFloat(cleaned.precio_publico) || null : null;
    cleaned.precio_tecnico = cleaned.precio_tecnico !== undefined && cleaned.precio_tecnico !== null ? parseFloat(cleaned.precio_tecnico) || null : null;
    cleaned.precio_mayorista = cleaned.precio_mayorista !== undefined && cleaned.precio_mayorista !== null ? parseFloat(cleaned.precio_mayorista) || null : null;
    cleaned.precio_costo = cleaned.precio_costo !== undefined && cleaned.precio_costo !== null ? parseFloat(cleaned.precio_costo) || null : null;
    cleaned.ref = cleaned.ref ? String(cleaned.ref) : (cleaned.cod ? String(cleaned.cod) : 'GENERICO');
    cleaned.nom = cleaned.nom ? String(cleaned.nom) : 'Producto Sin Nombre';
    cleaned.marca = cleaned.marca ? String(cleaned.marca) : 'GENERICO';
    cleaned.clasif = cleaned.clasif ? String(cleaned.clasif) : 'Equipos';
    cleaned.subclasif = cleaned.subclasif ? String(cleaned.subclasif) : 'General';
    cleaned.tech = cleaned.tech ? String(cleaned.tech) : 'Inverter';
    cleaned.btu = cleaned.btu ? String(cleaned.btu) : 'N/A';
    cleaned.volt = cleaned.volt ? String(cleaned.volt) : '220V';

    const extKeys = [
      'tipo_item', 'refrigerante', 'techClass', 'grupo', 'detalleTecnico',
      'cuenta', 'peso', 'pesoEmpaque', 'nombreEmpaque', 'unidadesEmpaque',
      'fabricante', 'presentacion', 'cuentaInventario', 'cuentaCosto',
      'cuentaIngreso', 'cuentaDevolucion', 'categoriaImpuesto', 'porcentajeIva',
      'kardexHistory'
    ];
    let extData = (item.datosExt && typeof item.datosExt === 'object') ? { ...item.datosExt } : {};
    for (const k of extKeys) {
      if (item[k] !== undefined && item[k] !== null && item[k] !== '') {
        extData[k] = item[k];
      }
    }
    cleaned.datosExt = Object.keys(extData).length > 0 ? extData : (cleaned.datosExt || null);
  } else if (modelKey === 'venta') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.fechaIso = safeDate(cleaned.fechaIso, cleaned.fecha || new Date());
    cleaned.venceGarantiaIso = safeDate(cleaned.venceGarantiaIso, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    cleaned.mesesGarantia = parseInt(cleaned.mesesGarantia) || 12;
    cleaned.total = parseFloat(cleaned.total) || 0;
    cleaned.metodoPago = cleaned.metodoPago ? String(cleaned.metodoPago) : 'Efectivo';
    cleaned.comisionistaPct = cleaned.comisionistaPct !== undefined && cleaned.comisionistaPct !== null ? parseFloat(cleaned.comisionistaPct) || null : null;
    cleaned.comisionistaValor = cleaned.comisionistaValor !== undefined && cleaned.comisionistaValor !== null ? parseFloat(cleaned.comisionistaValor) || null : null;
    cleaned.fechaComision = safeDate(cleaned.fechaComision, null);
    cleaned.equipos = safeJson(cleaned.equipos, []);
    cleaned.materiales = safeJson(cleaned.materiales, []);
    delete cleaned.vendedor;
    delete cleaned.cliente;
    delete cleaned.comisionista;
  } else if (modelKey === 'cotizacion') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.total = parseFloat(cleaned.total) || 0;
    cleaned.vigencia = parseInt(cleaned.vigencia) || 10;
    cleaned.fechaSeguimiento = safeDate(cleaned.fechaSeguimiento, null);
    cleaned.comisionistaPct = cleaned.comisionistaPct !== undefined && cleaned.comisionistaPct !== null ? parseFloat(cleaned.comisionistaPct) || null : null;
    cleaned.comisionistaValor = cleaned.comisionistaValor !== undefined && cleaned.comisionistaValor !== null ? parseFloat(cleaned.comisionistaValor) || null : null;
    cleaned.equipos = safeJson(cleaned.equipos, []);
    cleaned.materiales = safeJson(cleaned.materiales, []);
    if (!cleaned.cuentas && item.cuentasBancarias) {
      cleaned.cuentas = typeof item.cuentasBancarias === 'string' ? item.cuentasBancarias : JSON.stringify(item.cuentasBancarias);
    }
    delete cleaned.vendedor;
    delete cleaned.cliente;
    delete cleaned.comisionista;
  } else if (modelKey === 'servicio') {
    cleaned.fechaProg = safeDate(cleaned.fechaProg, new Date());
    cleaned.fechaCreacion = safeDate(cleaned.fechaCreacion, new Date());
    cleaned.fechaIso = safeDate(cleaned.fechaIso, cleaned.fechaCreacion || new Date());
    cleaned.tipo = cleaned.tipo ? String(cleaned.tipo) : 'Mantenimiento';
    cleaned.obs = cleaned.obs ? String(cleaned.obs) : '';
    cleaned.estado = cleaned.estado ? String(cleaned.estado) : 'programado';
    cleaned.etapaActual = cleaned.etapaActual ? String(cleaned.etapaActual) : (cleaned.estado || 'Programado');
    cleaned.costoServicio = parseFloat(cleaned.costoServicio) || 0;
    cleaned.aplicaGarantia = cleaned.aplicaGarantia === true || cleaned.aplicaGarantia === 'true';
    cleaned.evidencias = safeJson(cleaned.evidencias, []);
    cleaned.trazabilidad = safeJson(cleaned.trazabilidad, []);
    cleaned.inventarioId = cleaned.inventarioId ? String(cleaned.inventarioId) : null;
    cleaned.ventaId = cleaned.ventaId ? String(cleaned.ventaId) : null;
    cleaned.cotizacionId = cleaned.cotizacionId ? String(cleaned.cotizacionId) : null;
    cleaned.tecnicoId = cleaned.tecnicoId ? String(cleaned.tecnicoId) : null;
    delete cleaned.cliente;
    delete cleaned.tecnico;
    delete cleaned.inventario;
    delete cleaned.venta;
    delete cleaned.cotizacion;
  } else if (modelKey === 'pqr') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.limiteIso = safeDate(cleaned.limiteIso, new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));
    cleaned.fechaCierre = safeDate(cleaned.fechaCierre, null);
    cleaned.tipo = cleaned.tipo ? String(cleaned.tipo) : 'Petición';
    cleaned.detalle = cleaned.detalle ? String(cleaned.detalle) : 'Sin detalle';
    cleaned.estado = cleaned.estado ? String(cleaned.estado) : 'Abierto';
    cleaned.satisfecho = cleaned.satisfecho ? String(cleaned.satisfecho) : 'Pendiente';
    cleaned.aplicaGarantia = cleaned.aplicaGarantia === true || cleaned.aplicaGarantia === 'true';
    cleaned.evidencias = safeJson(cleaned.evidencias, []);
    cleaned.trazabilidad = safeJson(cleaned.trazabilidad, []);
    cleaned.inventarioId = cleaned.inventarioId ? String(cleaned.inventarioId) : null;
    cleaned.ventaId = cleaned.ventaId ? String(cleaned.ventaId) : null;
    cleaned.cotizacionId = cleaned.cotizacionId ? String(cleaned.cotizacionId) : null;
    cleaned.usuarioAsignadoId = cleaned.usuarioAsignadoId ? String(cleaned.usuarioAsignadoId) : null;
    delete cleaned.cliente;
    delete cleaned.usuarioAsignado;
    delete cleaned.inventario;
    delete cleaned.venta;
    delete cleaned.cotizacion;
  } else if (modelKey === 'solicitud') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.fechaRadicado = safeDate(cleaned.fechaRadicado, cleaned.fecha || new Date());
    cleaned.tipo = cleaned.tipo ? String(cleaned.tipo) : 'General';
    cleaned.estado = cleaned.estado ? String(cleaned.estado) : 'Pendiente';
    cleaned.nombreAsesor = cleaned.nombreAsesor ? String(cleaned.nombreAsesor) : null;
    cleaned.detalle = cleaned.detalle ? String(cleaned.detalle) : '';
    cleaned.comentario = cleaned.comentario ? String(cleaned.comentario) : null;
    cleaned.evidencia = cleaned.evidencia ? String(cleaned.evidencia) : null;
    cleaned.fileUrl = cleaned.fileUrl || cleaned.fileData || null;
    delete cleaned.asesor;
  } else if (modelKey === 'procesoDisciplinario') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.timestampEtapa = safeDate(cleaned.timestampEtapa, cleaned.fecha || new Date());
    cleaned.etapa = parseInt(cleaned.etapa) || 1;
    cleaned.diasSuspension = parseInt(cleaned.diasSuspension) || 0;
    cleaned.renunciaTerminos = cleaned.renunciaTerminos === true || cleaned.renunciaTerminos === 'true';
    cleaned.falta = cleaned.falta ? String(cleaned.falta) : 'Falta sin especificar';
    cleaned.obs = cleaned.obs ? String(cleaned.obs) : '';
    cleaned.descargo = cleaned.descargo ? String(cleaned.descargo) : null;
    cleaned.sancion = cleaned.sancion ? String(cleaned.sancion) : null;
    cleaned.lockedBy = cleaned.lockedBy ? String(cleaned.lockedBy) : null;
    if (cleaned.asesorId || item.asesorId) {
      cleaned.asesorId = String(cleaned.asesorId || item.asesorId);
    }
    if (cleaned.jefeId || item.jefeId) {
      cleaned.jefeId = String(cleaned.jefeId || item.jefeId);
    } else {
      cleaned.jefeId = null;
    }
    cleaned.evidencias = safeJson(cleaned.evidencias, []);
    delete cleaned.asesor;
    delete cleaned.jefe;
    delete cleaned.asesorNombre;
    delete cleaned.jefeNombre;
  } else if (modelKey === 'evaluacion') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.evaluadorId = cleaned.evaluadorId ? String(cleaned.evaluadorId) : null;
    cleaned.evaluadoId = cleaned.evaluadoId ? String(cleaned.evaluadoId) : null;
    cleaned.evaluadoNombre = cleaned.evaluadoNombre ? String(cleaned.evaluadoNombre) : null;
    cleaned.empleado = cleaned.empleado ? String(cleaned.empleado) : (cleaned.evaluado ? String(cleaned.evaluado) : null);
    cleaned.tipo = cleaned.tipo ? String(cleaned.tipo) : 'Evaluación';
    cleaned.obs = cleaned.obs ? String(cleaned.obs) : '';
    cleaned.metajobs = cleaned.metajobs !== undefined && cleaned.metajobs !== null ? parseInt(cleaned.metajobs) || 5 : null;
    cleaned.asistencia = cleaned.asistencia !== undefined && cleaned.asistencia !== null ? parseInt(cleaned.asistencia) || 5 : null;
    const parsedPromedio = parseFloat(cleaned.promedio);
    cleaned.promedio = !isNaN(parsedPromedio)
      ? (parsedPromedio > 5 ? Number((parsedPromedio / 20).toFixed(2)) : parsedPromedio)
      : 5.0;
    cleaned.scores = safeJson(cleaned.scores, null);
    delete cleaned.evaluador;
    delete cleaned.evaluado;
  } else if (modelKey === 'anuncio') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.expiresAt = safeDate(cleaned.expiresAt, null);
    cleaned.expired = cleaned.expired === true || cleaned.expired === 'true';
    cleaned.titulo = cleaned.titulo ? String(cleaned.titulo) : 'Comunicado General';
    cleaned.contenido = cleaned.contenido ? String(cleaned.contenido) : (cleaned.mensaje ? String(cleaned.mensaje) : '');
    cleaned.mensaje = cleaned.mensaje ? String(cleaned.mensaje) : (cleaned.contenido ? String(cleaned.contenido) : '');
    cleaned.lockedBy = cleaned.lockedBy ? String(cleaned.lockedBy) : null;
  } else if (modelKey === 'capacitacion') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.tipo = cleaned.tipo ? String(cleaned.tipo) : 'Capacitación';
    cleaned.tema = cleaned.tema ? String(cleaned.tema) : 'Tema sin especificar';
    cleaned.hora = cleaned.hora ? String(cleaned.hora) : '08:00 AM';
    cleaned.descripcion = cleaned.descripcion ? String(cleaned.descripcion) : null;
    cleaned.videoLink = cleaned.videoLink ? String(cleaned.videoLink) : null;
    cleaned.lockedBy = cleaned.lockedBy ? String(cleaned.lockedBy) : null;
    if (cleaned.creadorId || item.creadorId) {
      cleaned.creadorId = String(cleaned.creadorId || item.creadorId);
    }
    cleaned.plataforma = cleaned.plataforma ? String(cleaned.plataforma) : null;
    cleaned.enlaceReunion = cleaned.enlaceReunion ? String(cleaned.enlaceReunion) : null;
    cleaned.videoFile = cleaned.videoFile ? String(cleaned.videoFile) : null;
    cleaned.videoFileName = cleaned.videoFileName ? String(cleaned.videoFileName) : null;
    cleaned.tutorFirma = cleaned.tutorFirma ? String(cleaned.tutorFirma) : null;
    cleaned.tutor = cleaned.tutor ? String(cleaned.tutor) : null;
    cleaned.creadoEn = safeDate(cleaned.creadoEn, cleaned.fecha || new Date());
    delete cleaned.creador;
    delete cleaned.creadorNombre;
    delete cleaned.duracionMinutos;
    cleaned.estado = cleaned.estado ? String(cleaned.estado) : 'Programada';
    cleaned.obligatoria = cleaned.obligatoria === true || cleaned.obligatoria === 'true';
    cleaned.materiales = safeJson(cleaned.materiales, []);
    cleaned.asistentes = safeJson(cleaned.asistentes, []);
    cleaned.evaluacion = safeJson(cleaned.evaluacion, null);
  } else if (modelKey === 'comisionista') {
    cleaned.fecha = safeDate(cleaned.fecha, null);
    cleaned.nombre = cleaned.nombre ? String(cleaned.nombre) : 'Aliado';
    cleaned.doc = cleaned.doc || cleaned.cedula || null;
    cleaned.cedula = cleaned.cedula || cleaned.doc || null;
    cleaned.tel = cleaned.tel || cleaned.telefono || null;
    cleaned.telefono = cleaned.telefono || cleaned.tel || null;
    cleaned.valor_venta = parseFloat(cleaned.valor_venta) || 0;
    cleaned.pct_comision = parseFloat(cleaned.pct_comision !== undefined && cleaned.pct_comision !== null ? cleaned.pct_comision : cleaned.porcentaje) || 10;
    cleaned.porcentaje = cleaned.pct_comision;
    cleaned.ownerId = cleaned.ownerId ? String(cleaned.ownerId) : null;
    delete cleaned.owner;
  } else if (modelKey === 'cuentasCobro') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.cuenta = cleaned.cuenta || cleaned.num || item.cuenta || item.num ? String(cleaned.cuenta || cleaned.num || item.cuenta || item.num) : 'CC-' + Date.now();
    cleaned.nombre = cleaned.nombre || cleaned.comisionista || item.nombre || item.comisionista ? String(cleaned.nombre || cleaned.comisionista || item.nombre || item.comisionista) : 'Contratista';
    cleaned.total = parseFloat(cleaned.total !== undefined ? cleaned.total : item.total) || 0;
    cleaned.items = safeJson(cleaned.items !== undefined ? cleaned.items : item.items, []);
    cleaned.tecnicos = safeJson(cleaned.tecnicos !== undefined ? cleaned.tecnicos : item.tecnicos, []);
    delete cleaned.num;
    delete cleaned.comisionista;
  } else if (modelKey === 'chat') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.timestamp = safeDate(cleaned.timestamp, new Date());
    cleaned.nombre = cleaned.nombre ? String(cleaned.nombre) : 'Usuario';
    cleaned.text = cleaned.text ? String(cleaned.text) : '';
    cleaned.readAt = safeDate(cleaned.readAt, null);
    cleaned.isNudge = !!cleaned.isNudge;
    cleaned.isSticker = !!cleaned.isSticker;
    cleaned.isAudio = !!cleaned.isAudio;
    cleaned.isFile = !!cleaned.isFile;
    cleaned.isMeeting = !!cleaned.isMeeting;
    cleaned.isDeleted = !!cleaned.isDeleted;
    cleaned.isEdited = !!cleaned.isEdited;
    cleaned.reactions = safeJson(cleaned.reactions, null);
    cleaned.replyTo = cleaned.replyTo ? String(cleaned.replyTo) : null;
    cleaned.replyToObj = safeJson(cleaned.replyToObj, null);
    cleaned.hiddenBy = safeJson(cleaned.hiddenBy, []);
    cleaned.fileSize = cleaned.fileSize !== undefined && cleaned.fileSize !== null ? parseInt(cleaned.fileSize) || null : null;
    delete cleaned.sender;
    delete cleaned.receiver;
    delete cleaned.to;
    delete cleaned.user;
  } else if (modelKey === 'chatGroup') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.nombre = cleaned.nombre ? String(cleaned.nombre) : 'Grupo';
    cleaned.createdById = cleaned.createdById || item.createdById;
    delete cleaned.createdBy;
    cleaned.integrantes = safeJson(cleaned.integrantes, []);
  } else if (modelKey === 'auditoria') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.userId = cleaned.userId || item.userId;
    delete cleaned.user;
    cleaned.action = cleaned.action ? String(cleaned.action) : 'AUDITORIA';
    cleaned.modulo = cleaned.modulo ? String(cleaned.modulo) : 'SISTEMA';
    cleaned.shadowingData = safeJson(cleaned.shadowingData, null);
  } else if (modelKey === 'notificacion') {
    cleaned.fecha = safeDate(cleaned.fecha, new Date());
    cleaned.paraId = cleaned.paraId || item.paraId;
    cleaned.titulo = cleaned.titulo ? String(cleaned.titulo) : null;
    cleaned.de = cleaned.de ? String(cleaned.de) : null;
    cleaned.tipo = cleaned.tipo ? String(cleaned.tipo) : null;
    cleaned.mensaje = item.mensaje ? String(item.mensaje) : (cleaned.mensaje ? String(cleaned.mensaje) : '');
    cleaned.leida = cleaned.leida === true || cleaned.leida === 'true';
    delete cleaned.para;
  } else if (modelKey === 'role') {
    cleaned.permissions = safeJson(cleaned.permissions, {});
    if (!cleaned.modules || !Array.isArray(cleaned.modules) || cleaned.modules.length === 0) {
      if (cleaned.permissions && typeof cleaned.permissions === 'object') {
        cleaned.modules = Object.keys(cleaned.permissions).filter(k => Array.isArray(cleaned.permissions[k]) && cleaned.permissions[k].length > 0);
      } else {
        cleaned.modules = [];
      }
    }
    if (cleaned.canAssignSales !== undefined) cleaned.canAssignSales = cleaned.canAssignSales === true || cleaned.canAssignSales === 'true';
    if (cleaned.canManageEvals !== undefined) cleaned.canManageEvals = cleaned.canManageEvals === true || cleaned.canManageEvals === 'true';
    if (cleaned.canCreateMeetings !== undefined) cleaned.canCreateMeetings = cleaned.canCreateMeetings === true || cleaned.canCreateMeetings === 'true';
    if (cleaned.viewTechPrice !== undefined) cleaned.viewTechPrice = cleaned.viewTechPrice === true || cleaned.viewTechPrice === 'true';
    if (cleaned.viewWholesalePrice !== undefined) cleaned.viewWholesalePrice = cleaned.viewWholesalePrice === true || cleaned.viewWholesalePrice === 'true';
    if (cleaned.viewCostPrice !== undefined) cleaned.viewCostPrice = cleaned.viewCostPrice === true || cleaned.viewCostPrice === 'true';
    if (cleaned.clientLevel !== undefined) cleaned.clientLevel = parseInt(cleaned.clientLevel, 10) || 3;
  } else if (modelKey === 'user') {
    cleaned.cumpleanos = safeDate(cleaned.cumpleanos, null);
    cleaned.lastLogin = safeDate(cleaned.lastLogin, null);
    cleaned.meta_u = parseFloat(cleaned.meta_u) || 0;
    cleaned.ejec_u = parseFloat(cleaned.ejec_u) || 0;
    cleaned.meta_p = parseFloat(cleaned.meta_p) || 0;
    cleaned.ejec_p = parseFloat(cleaned.ejec_p) || 0;
    cleaned.soundsEnabled = cleaned.soundsEnabled !== false;
    cleaned.habeasDataAccepted = cleaned.habeasDataAccepted === true || cleaned.habeasDataAccepted === 'true';
    cleaned.failedLoginAttempts = parseInt(cleaned.failedLoginAttempts) || 0;
    cleaned.isLocked = cleaned.isLocked === true || cleaned.isLocked === 'true';
    cleaned.isOnline = cleaned.isOnline === true || cleaned.isOnline === 'true';
    cleaned.lat = cleaned.lat !== undefined && cleaned.lat !== null ? parseFloat(cleaned.lat) || null : null;
    cleaned.lng = cleaned.lng !== undefined && cleaned.lng !== null ? parseFloat(cleaned.lng) || null : null;
    cleaned.lastLocationUpdate = cleaned.lastLocationUpdate !== undefined && cleaned.lastLocationUpdate !== null ? parseFloat(cleaned.lastLocationUpdate) || null : null;
    cleaned.nombre = cleaned.nombre ? String(cleaned.nombre) : 'Usuario';
    cleaned.apellido = cleaned.apellido ? String(cleaned.apellido) : 'Sistema';
    cleaned.cedula = cleaned.cedula ? String(cleaned.cedula) : '00000000';
    cleaned.correo = cleaned.correo ? String(cleaned.correo) : 'usuario@ibro.com';
    cleaned.cargo = cleaned.cargo ? String(cleaned.cargo) : 'Colaborador';
    cleaned.user = cleaned.user ? String(cleaned.user) : (cleaned.id ? String(cleaned.id) : 'user_' + Date.now());
    if (cleaned.pass !== undefined && cleaned.pass !== null && cleaned.pass !== '') {
      cleaned.pass = String(cleaned.pass);
    } else {
      delete cleaned.pass;
    }
    cleaned.roleId = cleaned.roleId ? String(cleaned.roleId) : '1';
  } else if (modelKey === 'whatsappConfig') {
    cleaned.id = 1;
    cleaned.phone = cleaned.phone ? String(cleaned.phone).trim() : '573000000000';
    cleaned.status = cleaned.status ? String(cleaned.status).trim() : 'Activo';
  } else if (modelKey === 'informesConfig') {
    cleaned.id = 1;
    cleaned.margenOperativo = parseFloat(cleaned.margenOperativo !== undefined ? cleaned.margenOperativo : 72) || 72;
    cleaned.ingresoProyectos = parseFloat(cleaned.ingresoProyectos !== undefined ? cleaned.ingresoProyectos : 85) || 85;
    cleaned.gastosInstalacion = parseFloat(cleaned.gastosInstalacion !== undefined ? cleaned.gastosInstalacion : 35) || 35;
    cleaned.anticipos = parseFloat(cleaned.anticipos !== undefined ? cleaned.anticipos : 12450000) || 12450000;
    cleaned.gastosCajaChica = parseFloat(cleaned.gastosCajaChica !== undefined ? cleaned.gastosCajaChica : 2180000) || 2180000;
    cleaned.diasHabilesMes = parseInt(cleaned.diasHabilesMes !== undefined ? cleaned.diasHabilesMes : 25) || 25;
    cleaned.mesPresupuesto = cleaned.mesPresupuesto ? String(cleaned.mesPresupuesto) : 'ACTUAL';
    cleaned.fechaCorte = cleaned.fechaCorte ? String(cleaned.fechaCorte) : 'HOY';
    cleaned.diasTranscurridos = parseInt(cleaned.diasTranscurridos !== undefined ? cleaned.diasTranscurridos : 0) || 0;
  }

  return cleaned;
}

/**
 * Validador general de payload de sincronización
 */
function validateSyncPayload(diff) {
  if (!diff || typeof diff !== 'object') {
    throw new Error('Estructura de payload de sincronización inválida');
  }

  // Validación de entidades críticas con Zod (modo permisivo que no bloquea si faltan campos no esenciales)
  const checkCollection = (items, schema, name) => {
    if (Array.isArray(items)) {
      items.forEach((item, idx) => {
        const res = schema.safeParse(item);
        if (!res.success) {
          const firstErr = res.error.errors[0]?.message || 'Inválido';
          console.warn(`[Sync Validation] Advertencia en ${name} [#${idx}]: ${firstErr}`);
        }
      });
    }
  };

  if (diff.clientes?.upserted) checkCollection(diff.clientes.upserted, clienteSchema, 'Cliente');
  if (diff.inventario?.upserted) checkCollection(diff.inventario.upserted, inventarioSchema, 'Inventario');
  if (diff.ventas?.upserted) checkCollection(diff.ventas.upserted, ventaSchema, 'Venta');
  if (diff.cotizaciones?.upserted) checkCollection(diff.cotizaciones.upserted, cotizacionSchema, 'Cotización');
  if (diff.servicios?.upserted) checkCollection(diff.servicios.upserted, servicioSchema, 'Servicio');
  if (diff.pqrs?.upserted) checkCollection(diff.pqrs.upserted, pqrSchema, 'PQR');
  if (diff.capacitaciones?.upserted) checkCollection(diff.capacitaciones.upserted, capacitacionSchema, 'Capacitación');
  if (diff.solicitudes?.upserted) checkCollection(diff.solicitudes.upserted, solicitudSchema, 'Solicitud');
  if (diff.comisionistas?.upserted) checkCollection(diff.comisionistas.upserted, comisionistaSchema, 'Comisionista');

  return { success: true };
}

module.exports = {
  validateSyncPayload,
  sanitizeBackendForPrisma,
  safeDate,
  safeJson,
  PRISMA_ALLOWED_FIELDS
};

