const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  console.log('=== TEMPORARY PRODUCTION PASSWORD RESET ===');
  const hashedPassword = bcrypt.hashSync('admin', 10);
  
  // Primero, renombrar de Stecrafi05 a Stecarfi05 si existe
  const renameResult = await prisma.user.updateMany({
    where: {
      user: {
        equals: 'Stecrafi05',
        mode: 'insensitive'
      }
    },
    data: {
      user: 'Stecarfi05'
    }
  });
  console.log(`Renamed ${renameResult.count} user records to Stecarfi05.`);

  // Luego, actualizar la contraseña y correo para Stecarfi05
  const result = await prisma.user.updateMany({
    where: { 
      user: { 
        in: ['Stecarfi05', 'stecarfi05'],
        mode: 'insensitive'
      } 
    },
    data: { 
      pass: hashedPassword,
      correo: 'djuridica@obelixsa.com'
    }
  });
  
  console.log(`Updated ${result.count} user records password.`);
  console.log('=== PASSWORD RESET SUCCESSFUL ===');
}

main()
  .catch(err => {
    console.error('Error during password reset:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
