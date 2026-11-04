/**
 * Utilidades PURAS de seguridad / autorización (sin acceso a BD), para poder probarlas
 * con `node --test` sin base de datos.
 *
 * Modelo de permisos (igual que el frontend, ver IBRIO-ERP-APP/src/context/AppContext.jsx#hasPermission):
 *   - Rol '1' (Administrador Master) o rol con el módulo 'admin' => acceso total.
 *   - `role.permissions` (JSON, puede venir doblemente serializado): { [moduleId]: ['view', 'edit', ...] | true }
 *     o { isSuperAdmin | fullAccess: true } o 'all' / ['all'].
 *   - `role.modules`: string[] de módulos habilitados.
 *   - Banderas del usuario: esDelegadoGerencia / esComercialCampo otorgan módulos de campo.
 */

// ---------------------------------------------------------------------------
// Sanitización de usuarios
// ---------------------------------------------------------------------------

/** Campos que JAMÁS deben salir del servidor. */
const SECRET_USER_FIELDS = ['pass', 'refreshToken', 'pendingResets'];

/** Campos personales que solo ve el propio usuario o un administrador. */
const PRIVATE_USER_FIELDS = [
  'cedula', 'tipoDoc', 'firma', 'observaciones',
  'failedLoginAttempts', 'isLocked', 'habeasDataAccepted'
];

/** Campos de geolocalización de otros usuarios (solo para quien puede ver el radar GPS). */
const LOCATION_USER_FIELDS = ['lat', 'lng', 'lastLocationUpdate'];

/** Elimina secretos (hash de contraseña, refresh tokens, tokens de reset) de un usuario. */
function sanitizeUser(user) {
  if (!user || typeof user !== 'object') return user;
  const safe = { ...user };
  for (const f of SECRET_USER_FIELDS) delete safe[f];
  return safe;
}

/**
 * Versión de un usuario AJENO para un usuario no administrador: sin secretos ni datos personales.
 * Conserva lo que la UI necesita (id, user, nombre, apellido, roleId, cargo, foto, isOnline, etc.).
 */
function sanitizeOtherUser(user, { canSeeLocation = false } = {}) {
  const safe = sanitizeUser(user);
  if (!safe || typeof safe !== 'object') return safe;
  for (const f of PRIVATE_USER_FIELDS) delete safe[f];
  if (!canSeeLocation) for (const f of LOCATION_USER_FIELDS) delete safe[f];
  return safe;
}

// ---------------------------------------------------------------------------
// Roles / módulos
// ---------------------------------------------------------------------------

function parsePermissions(raw) {
  let perms = raw;
  let guard = 0;
  while (typeof perms === 'string' && guard < 3) {
    try { perms = JSON.parse(perms); } catch { break; }
    guard++;
  }
  if (perms === null || perms === undefined) return {};
  return perms;
}

function isFullAccessPerms(perms) {
  if (perms === 'all') return true;
  if (Array.isArray(perms)) return perms.includes('all');
  return Boolean(perms && typeof perms === 'object' && (perms.isSuperAdmin === true || perms.fullAccess === true));
}

/** ¿El rol tiene habilitado el módulo (con cualquier acción)? */
function roleHasModule(role, moduleName) {
  if (!role) return false;
  const perms = parsePermissions(role.permissions);
  if (isFullAccessPerms(perms)) return true;
  if (Array.isArray(role.modules) && role.modules.includes(moduleName)) return true;
  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    const p = perms[moduleName];
    if (Array.isArray(p)) return p.length > 0;
    if (p && typeof p === 'object') return Object.values(p).some(Boolean);
    return p === true;
  }
  return false;
}

/** ¿El rol tiene una acción concreta (p. ej. 'delete') sobre el módulo? */
function roleHasAction(role, moduleName, action) {
  if (!role) return false;
  const perms = parsePermissions(role.permissions);
  if (isFullAccessPerms(perms)) return true;
  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    const p = perms[moduleName];
    if (p === true) return true;
    if (Array.isArray(p)) return p.includes(action);
    if (p && typeof p === 'object') return Boolean(p[action]);
  }
  return false;
}

const isTruthyFlag = (v) => v === true || v === 'true';

/** Módulos que otorgan las banderas operativas del usuario (misma regla que el frontend). */
const DELEGADO_MODULES = ['operaciones_campo', 'control_gerencial', 'comercial_campo', 'cotizaciones', 'pedidos', 'ventas'];
const COMERCIAL_CAMPO_MODULES = ['operaciones_campo', 'comercial_campo'];
const ALWAYS_ALLOWED_MODULES = ['dashboard', 'perfil', 'chat'];

/**
 * Construye el contexto de acceso del usuario autenticado.
 * @param {object} params
 * @param {object} params.user  payload del JWT / req.user ({ id, user, roleId, esDelegadoGerencia, esComercialCampo })
 * @param {object|null} params.role  registro Role de la BD
 * @param {boolean} params.isAdmin
 */
function buildAccessContext({ user, role = null, isAdmin = false }) {
  const userId = user && user.id !== undefined && user.id !== null ? String(user.id) : '';
  const username = String((user && user.user) || '').toLowerCase();
  const esDelegado = isTruthyFlag(user && user.esDelegadoGerencia);
  const esComercialCampo = isTruthyFlag(user && user.esComercialCampo);

  const has = (moduleId) => {
    if (isAdmin) return true;
    if (ALWAYS_ALLOWED_MODULES.includes(moduleId)) return true;
    if (esDelegado && DELEGADO_MODULES.includes(moduleId)) return true;
    if (esComercialCampo && COMERCIAL_CAMPO_MODULES.includes(moduleId)) return true;
    return roleHasModule(role, moduleId);
  };
  const hasAny = (moduleIds) => moduleIds.some(has);
  const hasAction = (moduleId, action) => isAdmin || roleHasAction(role, moduleId, action);

  return { isAdmin: Boolean(isAdmin), userId, username, esDelegado, esComercialCampo, role, has, hasAny, hasAction };
}

// ---------------------------------------------------------------------------
// Mapa colección de /api/db/sync -> módulos del frontend que pueden escribirla
// ---------------------------------------------------------------------------

const CAMPO_MODULES = ['operaciones_campo', 'control_gerencial', 'comercial_campo'];

/**
 * Cualquiera de los módulos listados habilita upsert/delete sobre la colección.
 * Las listas incluyen los flujos legítimos entre módulos (p. ej. un pedido descuenta inventario,
 * Comisionistas actualiza ventas/servicios, PQRS escala a servicios).
 */
const COLLECTION_MODULES = {
  clientes: ['clientes'],
  inventario: ['inventario', 'ventas', 'cotizaciones', ...CAMPO_MODULES],
  ventas: ['ventas', 'cotizaciones', 'registro_ventas', 'comisionistas'],
  cotizaciones: ['cotizaciones', 'ventas'],
  pqrs: ['pqrs', 'servicios'],
  servicios: ['servicios', 'pqrs', 'comisionistas'],
  solicitudes: ['solicitudes'],
  procesosDisciplinarios: ['disciplinario'],
  evaluaciones: ['evaluacion_desempeno'],
  anuncios: ['comunicados'],
  comunicados: ['comunicados'],
  comisionistas: ['comisionistas'],
  cuentasCobro: ['comisionistas', 'cuentasCobro', 'cuentas_cobro'],
  cotizaciones_externas: CAMPO_MODULES,
  pedidos_externos: CAMPO_MODULES,
  clientes_externos: CAMPO_MODULES,
  whatsappConfig: ['whatsapp_comercial'],
  informesConfig: ['informe_ventas', 'registro_ventas']
};

/** Colecciones que cualquier usuario autenticado usa en su trabajo diario (con reglas por registro). */
const OPEN_COLLECTIONS = ['chat', 'chatGroups', 'notificaciones', 'auditoria', 'capacitaciones'];

/** Colecciones reservadas a administradores. */
const ADMIN_ONLY_COLLECTIONS = ['roles'];

/** Campos de usuario que un no administrador nunca puede modificar (ni de sí mismo). */
const PROTECTED_USER_FIELDS = ['roleId', 'isLocked', 'failedLoginAttempts', 'user', 'esComercialCampo', 'esDelegadoGerencia', 'refreshToken'];

/** Campos de presupuesto que el módulo "Asignación de Presupuestos" (registro_ventas) puede editar de otros usuarios. */
const BUDGET_USER_FIELDS = ['meta_u', 'ejec_u', 'meta_p', 'ejec_p'];

/** Campos de InformesConfig editables con solo 'registro_ventas' (calendario de presupuesto). */
const INFORMES_CALENDAR_FIELDS = ['diasHabilesMes', 'mesPresupuesto', 'fechaCorte', 'diasTranscurridos'];

/**
 * Decide si el contexto puede escribir (op = 'upsert' | 'delete') una colección a nivel de colección.
 * Las reglas por registro (dueño del mensaje, notificación propia, etc.) se aplican aparte.
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canWriteCollection(ctx, collection, op = 'upsert') {
  if (!ctx) return { allowed: false, reason: 'sin contexto de acceso' };
  if (ctx.isAdmin) return { allowed: true };
  if (ADMIN_ONLY_COLLECTIONS.includes(collection)) return { allowed: false, reason: 'solo administradores' };
  if (collection === 'users') return { allowed: op === 'upsert', reason: op === 'upsert' ? undefined : 'solo administradores pueden eliminar usuarios' };
  if (OPEN_COLLECTIONS.includes(collection)) return { allowed: true };
  const modules = COLLECTION_MODULES[collection];
  if (!modules) return { allowed: false, reason: `colección desconocida '${collection}'` };
  if (ctx.hasAny(modules)) return { allowed: true };
  return { allowed: false, reason: `el rol no tiene acceso a los módulos [${modules.join(', ')}]` };
}

const pick = (obj, fields) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const f of fields) if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
  return out;
};

module.exports = {
  SECRET_USER_FIELDS,
  PRIVATE_USER_FIELDS,
  LOCATION_USER_FIELDS,
  sanitizeUser,
  sanitizeOtherUser,
  parsePermissions,
  roleHasModule,
  roleHasAction,
  buildAccessContext,
  COLLECTION_MODULES,
  OPEN_COLLECTIONS,
  ADMIN_ONLY_COLLECTIONS,
  PROTECTED_USER_FIELDS,
  BUDGET_USER_FIELDS,
  INFORMES_CALENDAR_FIELDS,
  canWriteCollection,
  pick
};
