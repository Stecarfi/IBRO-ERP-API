/**
 * Política CORS centralizada (API REST + Socket.io).
 *
 * - Lista blanca combinando siempre DEFAULT_ALLOWED_ORIGINS con ALLOWED_ORIGINS y FRONTEND_URL.
 * - Garantiza que https://g-ibro.onrender.com nunca quede excluido por variables parciales en Render.
 * - Las peticiones SIN cabecera Origin (apps móviles nativas, curl, server-to-server,
 *   navegación directa) se permiten: CORS solo protege a navegadores.
 * - Fuera de producción también se aceptan IPs de red local (pruebas desde el celular en LAN).
 */

const DEFAULT_ALLOWED_ORIGINS = [
  // Desarrollo local
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  // Producción (frontend y la propia API en Render)
  'https://g-ibro.onrender.com',
  'https://ibro-api.onrender.com',
  // WebView de la app Android (Capacitor / TWA)
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'https://appassets.androidplatform.net'
];

const PRIVATE_NETWORK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i;

const normalizeOrigin = (o) => String(o || '').trim().replace(/\/+$/, '').toLowerCase();

function parseAllowedOrigins(raw = process.env.ALLOWED_ORIGINS, frontendUrl = process.env.FRONTEND_URL) {
  const merged = new Set(DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin));
  for (const source of [raw, frontendUrl]) {
    String(source || '')
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean)
      .forEach((origin) => merged.add(origin));
  }
  return Array.from(merged);
}

/**
 * Crea la función `origin` compatible con el paquete `cors` y con Socket.io.
 * @param {object} [opts]
 * @param {string[]} [opts.allowedOrigins]
 * @param {boolean} [opts.isProduction]
 */
function createOriginChecker(opts = {}) {
  const allowed = new Set((opts.allowedOrigins || parseAllowedOrigins()).map(normalizeOrigin));
  const isProduction = opts.isProduction !== undefined ? opts.isProduction : process.env.NODE_ENV === 'production';

  const isAllowed = (origin) => {
    if (!origin) return true; // Sin Origin: móvil nativo / curl / server-to-server
    const o = normalizeOrigin(origin);
    if (o === 'null') return false; // file:// o iframes sandbox: nunca con credenciales
    if (allowed.has(o)) return true;
    if (!isProduction && PRIVATE_NETWORK_ORIGIN.test(o)) return true;
    return false;
  };

  const origin = (requestOrigin, callback) => {
    if (isAllowed(requestOrigin)) return callback(null, true);
    console.warn(`[CORS] Origen rechazado: ${requestOrigin}`);
    // false => no se envían cabeceras CORS (el navegador bloquea) sin provocar un 500
    return callback(null, false);
  };

  return { origin, isAllowed, allowed };
}

module.exports = { DEFAULT_ALLOWED_ORIGINS, parseAllowedOrigins, createOriginChecker };
