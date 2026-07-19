const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  console.log('=== TEMPORARY PRODUCTION PASSWORD RESET ===');
  const hashedPassword = bcrypt.hashSync('admin', 10);
  
  const existingUser = await prisma.user.findFirst({
    where: { 
      user: { 
        in: ['Stecrafi05', 'Stecarfi05', 'stecarfi05', 'stecrafi05'],
        mode: 'insensitive'
      } 
    }
  });

  if (existingUser) {
    // Si existe, actualizar y asegurar nombre y contraseña
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        user: 'Stecarfi05',
        pass: hashedPassword,
        correo: 'djuridica@obelixsa.com',
        roleId: '1'
      }
    });
    console.log(`Updated existing user record (id: ${existingUser.id}) to username 'Stecarfi05' with password 'admin'.`);
  } else {
    // Si no existe, crearlo desde cero
    const newUser = await prisma.user.create({
      data: {
        id: Date.now().toString(),
        nombre: 'Stephanie',
        apellido: 'Carrasquilla',
        cedula: '222',
        correo: 'djuridica@obelixsa.com',
        cargo: 'Administrador Master',
        user: 'Stecarfi05',
        pass: hashedPassword,
        roleId: '1'
      }
    });
    console.log(`Created new user 'Stecarfi05' from scratch (id: ${newUser.id}) with password 'admin'.`);
  }
  
  console.log('=== PASSWORD RESET SUCCESSFUL ===');
}

main()
  .catch(err => {
    console.error('Error during password reset:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
