const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const pqrs = await prisma.pQR.findMany();
  console.log('PQRS with old links:', pqrs.filter(p => (p.evidencias && p.evidencias.includes('uc?export=')) || (p.evidencia && p.evidencia.includes('uc?export='))).length);
  
  const servicios = await prisma.servicio.findMany();
  console.log('Servicios with old links:', servicios.filter(p => p.evidencias && p.evidencias.includes('uc?export=')).length);
  
  const solicitudes = await prisma.solicitud.findMany();
  console.log('Solicitudes with old links:', solicitudes.filter(p => p.evidencia && p.evidencia.includes('uc?export=')).length);

  const clientes = await prisma.cliente.findMany();
  console.log('Clientes with old links:', clientes.filter(p => p.adjuntos && p.adjuntos.includes('uc?export=')).length);
}

check().then(() => prisma.$disconnect());
