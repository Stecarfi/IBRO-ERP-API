require('dotenv').config();

/**
 * Secreto JWT único y obligatorio.
 * Fase 0 (contención): se eliminan los secretos de respaldo quemados en el código.
 * Si la variable no existe, el servidor no arranca (fail-closed): nunca se firman
 * tokens con un secreto público conocido.
 */
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || String(JWT_SECRET).trim().length < 16) {
  console.error('[FATAL] JWT_SECRET no está definido o es demasiado corto (mínimo 16 caracteres). Abortando arranque.');
  process.exit(1);
}

module.exports = { JWT_SECRET };
