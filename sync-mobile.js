const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mobileDir = path.resolve(__dirname, '../IBRO-ERP-MOBILE');
const targetDir = path.resolve(__dirname, 'src/public/mobile');

console.log('[SYNC-MOBILE] Iniciando sincronización del aplicativo móvil...');

if (fs.existsSync(mobileDir)) {
  console.log('[SYNC-MOBILE] Compilando IBRO-ERP-MOBILE...');
  execSync('npm run build', { cwd: mobileDir, stdio: 'inherit' });

  const distDir = path.join(mobileDir, 'dist');
  if (fs.existsSync(distDir)) {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    function copyRecursive(src, dest) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, item.name);
        const destPath = path.join(dest, item.name);
        if (item.isDirectory()) {
          copyRecursive(srcPath, destPath);
        } else {
          // No sobreescribir descargar.html si ya existe y no está en dist
          if (item.name === 'descargar.html' && !fs.existsSync(srcPath)) continue;
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    copyRecursive(distDir, targetDir);
    console.log('[SYNC-MOBILE] ✅ Aplicativo móvil sincronizado exitosamente en src/public/mobile');
  }
} else {
  console.log('[SYNC-MOBILE] Directorio IBRO-ERP-MOBILE no encontrado en entorno (probablemente en producción Render). Se mantienen archivos existentes.');
}
