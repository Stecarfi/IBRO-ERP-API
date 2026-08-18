require('dotenv').config();
const prisma = require('./prisma');

function fixUrl(url) {
  if (typeof url === 'string' && url.includes('uc?export=view&id=')) {
    let newUrl = url.replace('uc?export=view&id=', 'thumbnail?id=');
    if (!newUrl.includes('sz=')) {
      newUrl += '&sz=w1000';
    }
    return newUrl;
  }
  return url;
}

function processJsonArray(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') return jsonString;
  try {
    let arr = JSON.parse(jsonString);
    if (!Array.isArray(arr)) return jsonString;
    
    let modified = false;
    arr = arr.map(item => {
      if (typeof item === 'string') {
        const fixed = fixUrl(item);
        if (fixed !== item) modified = true;
        return fixed;
      } else if (item && typeof item === 'object' && item.url) {
        const fixed = fixUrl(item.url);
        if (fixed !== item.url) {
          modified = true;
          item.url = fixed;
        }
        return item;
      }
      return item;
    });

    if (modified) {
      return JSON.stringify(arr);
    }
    return jsonString; // no changes
  } catch (e) {
    // If it's just a single url string, try fixing it
    const fixed = fixUrl(jsonString);
    if (fixed !== jsonString) return fixed;
    return jsonString;
  }
}

async function fixAllDriveLinks() {
  console.log('[+] Iniciando corrección de enlaces de Google Drive...');
  let totalFixed = 0;

  // 1. PQRS
  const pqrs = await prisma.pQR.findMany();
  for (const pqr of pqrs) {
    let updateData = {};
    if (pqr.evidencias) {
      const fixed = processJsonArray(pqr.evidencias);
      if (fixed !== pqr.evidencias) updateData.evidencias = fixed;
    }
    if (pqr.evidencia) {
      const fixed = fixUrl(pqr.evidencia);
      if (fixed !== pqr.evidencia) updateData.evidencia = fixed;
    }
    
    if (Object.keys(updateData).length > 0) {
      await prisma.pQR.update({ where: { id: pqr.id }, data: updateData });
      totalFixed++;
      console.log(`[PQR] Actualizado ID: ${pqr.id}`);
    }
  }

  // 2. Servicios
  const servicios = await prisma.servicio.findMany();
  for (const serv of servicios) {
    let updateData = {};
    if (serv.evidencias) {
      const fixed = processJsonArray(serv.evidencias);
      if (fixed !== serv.evidencias) updateData.evidencias = fixed;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.servicio.update({ where: { id: serv.id }, data: updateData });
      totalFixed++;
      console.log(`[Servicio] Actualizado ID: ${serv.id}`);
    }
  }

  // 3. Solicitudes
  const solicitudes = await prisma.solicitud.findMany();
  for (const sol of solicitudes) {
    let updateData = {};
    if (sol.evidencia) {
      const fixed = processJsonArray(sol.evidencia);
      if (fixed !== sol.evidencia) updateData.evidencia = fixed;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.solicitud.update({ where: { id: sol.id }, data: updateData });
      totalFixed++;
      console.log(`[Solicitud] Actualizado ID: ${sol.id}`);
    }
  }

  // 4. Clientes
  const clientes = await prisma.cliente.findMany();
  for (const cli of clientes) {
    let updateData = {};
    if (cli.adjuntos) {
      const fixed = processJsonArray(cli.adjuntos);
      if (fixed !== cli.adjuntos) updateData.adjuntos = fixed;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.cliente.update({ where: { id: cli.id }, data: updateData });
      totalFixed++;
      console.log(`[Cliente] Actualizado ID: ${cli.id}`);
    }
  }

  console.log(`[!] Finalizado. Total de registros corregidos: ${totalFixed}`);
}

fixAllDriveLinks().catch(console.error).finally(() => prisma.$disconnect());
