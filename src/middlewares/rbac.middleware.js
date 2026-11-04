const prisma = require('../prisma');
const { roleHasModule, buildAccessContext } = require('../security/permissions');

/**
 * RBAC de servidor.
 * El frontend controla la visibilidad con el JSON `permissions` del rol; el backend
 * aplica la MISMA regla (ver src/security/permissions.js) para que no baste con saltarse la UI.
 */

const roleCache = new Map(); // roleId -> { role, ts }
const ROLE_TTL_MS = 60 * 1000;

async function loadRole(roleId) {
  if (!roleId) return null;
  const key = String(roleId);
  const hit = roleCache.get(key);
  if (hit && Date.now() - hit.ts < ROLE_TTL_MS) return hit.role;
  let role = null;
  try {
    role = await prisma.role.findUnique({ where: { id: key } });
  } catch (e) {
    role = null;
  }
  roleCache.set(key, { role, ts: Date.now() });
  return role;
}

async function isAdminUser(reqUser) {
  if (!reqUser) return false;
  const roleId = String(reqUser.roleId || '');
  if (roleId === '1') return true;
  const role = await loadRole(roleId);
  return roleHasModule(role, 'admin');
}

async function userHasModule(reqUser, moduleName) {
  if (!reqUser) return false;
  if (await isAdminUser(reqUser)) return true;
  const role = await loadRole(reqUser.roleId);
  return roleHasModule(role, moduleName);
}

/**
 * Contexto de acceso completo del usuario autenticado (rol + banderas operativas).
 * Ver buildAccessContext en src/security/permissions.js.
 */
async function getAccessContext(reqUser) {
  if (!reqUser) return buildAccessContext({ user: null, role: null, isAdmin: false });
  let isAdmin = false;
  let role = null;
  try {
    role = await loadRole(reqUser.roleId);
    isAdmin = String(reqUser.roleId || '') === '1' || roleHasModule(role, 'admin');
  } catch (e) {
    isAdmin = false;
  }
  return buildAccessContext({ user: reqUser, role, isAdmin });
}

/** Middleware: exige que el usuario autenticado tenga acceso a alguno de los módulos. */
function requireModuleAccess(...moduleNames) {
  return async (req, res, next) => {
    try {
      const ctx = await getAccessContext(req.user);
      if (ctx.hasAny(moduleNames)) return next();
    } catch (e) {}
    return res.status(403).json({ error: 'Acceso denegado: su rol no tiene permiso para este recurso.', code: 'FORBIDDEN' });
  };
}

/** Middleware: exige rol administrador. */
async function requireAdmin(req, res, next) {
  try {
    if (await isAdminUser(req.user)) return next();
  } catch (e) {}
  return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de Administrador.', code: 'FORBIDDEN' });
}

module.exports = { isAdminUser, userHasModule, requireModuleAccess, requireAdmin, loadRole, getAccessContext };
