const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const data = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
    doc: '1234567890',
    nom: 'Cliente Test',
    tel: '',
    correo: '',
    direccion: '',
    owner: 'admin',
    personaTipo: JSON.stringify({ natural: true, juridica: false }),
    doc_tipo: 'Cédula',
    sociedadTipo: 'SAS',
    condicionesPago: JSON.stringify({ contado: true, credito: false, mixto: false }),
    formaPago: JSON.stringify({ efectivo: true, tarjetaDebito: false, tarjetaCredito: false, creditoPlazo: false }),
    tipo_cliente: JSON.stringify({ domestico: true, almacenes: false, constructores: false, inmobiliarias: false, institucional: false, tecnicos: false, libre: false }),
  };

  try {
    const res = await prisma.cliente.upsert({
      where: { id: data.id },
      update: data,
      create: data
    });
    console.log('SUCCESS:', res.id);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
