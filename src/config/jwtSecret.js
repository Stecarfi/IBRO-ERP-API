require('dotenv').config();

/**
 * Secreto JWT único y obligatorio.
 * Se eliminaron los secretos de respaldo quemados en el código: si la variable no existe
 * (o es demasiado corta) el servidor NO arranca (fail-closed) y nunca se firman tokens
 * con un secreto público conocido.
 */
const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

// Valores que estuvieron publicados en el repositorio: deben considerarse comprometidos.
const LEAKED_SECRETS = new Set([
  'ibro_fallback_secret_2026',
  'ibro_super_secret_jwt_key_2026_!@#'
]);

if (!JWT_SECRET || String(JWT_SECRET).trim().length < 16) {
  const msg = '[FATAL] JWT_SECRET no está definido o es demasiado corto (mínimo 16 caracteres). Abortando arranque.';
  console.error(msg);
  if (isProduction) throw new Error(msg);
  process.exit(1);
}

if (LEAKED_SECRETS.has(String(JWT_SECRET).trim())) {
  const msg = '[SEGURIDAD] JWT_SECRET coincide con un valor publicado en el repositorio. Genere uno nuevo (p. ej. `openssl rand -hex 48`).';
  if (isProduction) {
    console.error(msg);
    throw new Error(msg);
  }
  console.warn(msg);
}

module.exports = { JWT_SECRET };
