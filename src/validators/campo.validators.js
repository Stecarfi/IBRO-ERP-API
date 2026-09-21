const { z } = require('zod');

// Schema para inicio de jornada
const iniciarJornadaSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const lat = val.lat !== undefined ? val.lat : val.latitud;
    const lng = val.lng !== undefined ? val.lng : val.longitud;
    return { ...val, ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}) };
  }
  return val;
}, z.object({
  lat: z.coerce.number().min(-90).max(90).optional().default(10.9685),
  lng: z.coerce.number().min(-180).max(180).optional().default(-74.7813),
  precision: z.coerce.number().optional().default(10),
  direccionInicio: z.string().optional().nullable(),
  fotoInicio: z.string().optional().nullable(),
  odometroInicio: z.coerce.number().optional().nullable(),
  bateriaInicio: z.coerce.number().min(0).max(100).optional().nullable()
}).default({}));

// Schema para pausa de jornada
const pausaJornadaSchema = z.object({
  jornadaId: z.string().optional().nullable(),
  tipo: z.enum(['Almuerzo', 'Descanso', 'Capacitacion', 'Incidente', 'Calamidad', 'Taller', 'Otro']).optional().default('Descanso'),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  motivo: z.string().optional().nullable()
}).default({});

// Schema para reanudar jornada
const reanudarJornadaSchema = z.object({
  pausaId: z.string().optional().nullable(),
  jornadaId: z.string().optional().nullable()
}).default({});

// Schema para finalizar jornada
const finalizarJornadaSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const lat = val.lat !== undefined ? val.lat : val.latitud;
    const lng = val.lng !== undefined ? val.lng : val.longitud;
    return { ...val, ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}) };
  }
  return val;
}, z.object({
  jornadaId: z.string().optional().nullable(),
  lat: z.coerce.number().min(-90).max(90).optional().default(10.9685),
  lng: z.coerce.number().min(-180).max(180).optional().default(-74.7813),
  direccionFin: z.string().optional().nullable(),
  fotoFin: z.string().optional().nullable(),
  odometroFin: z.coerce.number().optional().nullable(),
  bateriaFin: z.coerce.number().min(0).max(100).optional().nullable(),
  observaciones: z.string().optional().nullable()
}).default({}));

// Schema para ping de telemetría unitario
const pingUbicacionSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const lat = val.lat !== undefined ? val.lat : val.latitud;
    const lng = val.lng !== undefined ? val.lng : val.longitud;
    return { ...val, ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}) };
  }
  return val;
}, z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  precision: z.coerce.number().optional().nullable(),
  velocidad: z.coerce.number().optional().nullable(),
  rumbo: z.coerce.number().optional().nullable(),
  bateria: z.coerce.number().min(0).max(100).optional().nullable(),
  esSimulado: z.boolean().optional().default(false),
  enMovimiento: z.boolean().optional().default(false),
  redTipo: z.string().optional().nullable(),
  jornadaId: z.string().optional().nullable(),
  timestamp: z.coerce.date().optional()
}));

// Schema para ingesta masiva (batch) offline
const batchUbicacionesSchema = z.object({
  puntos: z.array(pingUbicacionSchema).min(1).max(500)
});

// Schema para Check-In de visita
const checkInVisitaSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const lat = val.lat !== undefined ? val.lat : val.latitud;
    const lng = val.lng !== undefined ? val.lng : val.longitud;
    return { ...val, ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}) };
  }
  return val;
}, z.object({
  visitaId: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  precision: z.coerce.number().optional().nullable(),
  foto: z.string().optional().nullable(),
  bateria: z.coerce.number().optional().nullable()
}));

// Schema para Check-Out de visita
const checkOutVisitaSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const lat = val.lat !== undefined ? val.lat : val.latitud;
    const lng = val.lng !== undefined ? val.lng : val.longitud;
    return { ...val, ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}) };
  }
  return val;
}, z.object({
  visitaId: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  resultadoResumen: z.string().optional().nullable(),
  resultadoVisita: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  compromisos: z.string().optional().nullable(),
  proximaVisita: z.coerce.date().optional().nullable(),
  contactoAtendio: z.string().optional().nullable(),
  firmaCliente: z.string().optional().nullable(),
  evidencias: z.any().optional().nullable(),
  fotosEvidencia: z.any().optional().nullable(),
  adjuntos: z.any().optional().nullable(),
  motivoNoEfectiva: z.string().optional().nullable(),
  cotizacionId: z.string().optional().nullable(),
  ventaId: z.string().optional().nullable()
}));

// Schema para creación rápida de prospecto en campo
const prospectoCampoSchema = z.object({
  nombreComercial: z.string().min(2, 'Nombre comercial requerido'),
  razonSocial: z.string().optional().nullable(),
  nitRut: z.string().optional().nullable(),
  contactoNombre: z.string().min(2, 'Nombre del contacto requerido'),
  contactoTelefono: z.string().min(5, 'Teléfono del contacto requerido'),
  contactoCorreo: z.string().email('Correo electrónico inválido').optional().nullable().or(z.literal('')),
  direccion: z.string().min(3, 'Dirección requerida'),
  barrio: z.string().optional().nullable(),
  ciudad: z.string().default('Barranquilla'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  origen: z.string().default('En Frio / Puerta a Puerta'),
  interesDetalle: z.string().optional().nullable(),
  presupuestoEst: z.coerce.number().optional().default(0),
  probabilidadPct: z.coerce.number().min(0).max(100).optional().default(20),
  adjuntos: z.any().optional().nullable(),
  evidencias: z.any().optional().nullable()
});

// Schema para agendar nueva visita
const programarVisitaSchema = z.object({
  clienteId: z.string().optional().nullable(),
  clienteExternoId: z.string().optional().nullable(),
  prospectoId: z.string().optional().nullable(),
  tipoVisita: z.string().optional().default('Comercial Prospeccion'),
  fechaProgramada: z.coerce.date(),
  horaEstimada: z.string().optional().nullable(),
  compromisos: z.string().optional().nullable(),
  adjuntos: z.any().optional().nullable(),
  evidencias: z.any().optional().nullable()
});

// Schema para geocerca
const geocercaSchema = z.object({
  nombre: z.string().min(2),
  tipo: z.enum(['Circular', 'Poligonal']).default('Circular'),
  centroLat: z.coerce.number().optional().nullable(),
  centroLng: z.coerce.number().optional().nullable(),
  radioMetros: z.coerce.number().optional().nullable(),
  poligonoJson: z.any().optional().nullable(),
  zonaId: z.string().optional().nullable(),
  color: z.string().optional().default('#34D399'),
  activo: z.boolean().optional().default(true)
});

// Schema para zona comercial
const zonaComercialSchema = z.object({
  codigo: z.string().min(2),
  nombre: z.string().min(2),
  ciudad: z.string().optional().nullable(),
  departamento: z.string().optional().nullable(),
  descripcion: z.string().optional().nullable(),
  colorHex: z.string().optional().default('#2563eb'),
  metaMensual: z.coerce.number().optional().default(0),
  activo: z.boolean().optional().default(true)
});

module.exports = {
  iniciarJornadaSchema,
  pausaJornadaSchema,
  reanudarJornadaSchema,
  finalizarJornadaSchema,
  pingUbicacionSchema,
  batchUbicacionesSchema,
  checkInVisitaSchema,
  checkOutVisitaSchema,
  prospectoCampoSchema,
  programarVisitaSchema,
  geocercaSchema,
  zonaComercialSchema
};
