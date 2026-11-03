/**
 * Guardia para scripts de desarrollo / mantenimiento potencialmente destructivos.
 * Aborta si NODE_ENV === 'production' salvo que se pase explícitamente --force.
 */
require('dotenv').config();

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const forced = process.argv.includes('--force');

if (isProduction && !forced) {
  console.error('[ABORTADO] Este script modifica datos y no debe ejecutarse con NODE_ENV=production.');
  console.error('           Si realmente sabe lo que hace, vuelva a ejecutarlo con --force.');
  process.exit(1);
}

if (forced) {
  console.warn('[ADVERTENCIA] Ejecutando script de mantenimiento con --force.');
}

module.exports = { isProduction, forced };
