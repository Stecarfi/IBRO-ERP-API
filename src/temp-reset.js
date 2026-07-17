const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  console.log('=== TEMPORARY PRODUCTION PASSWORD RESET ===');
  const hashedPassword = bcrypt.hashSync('admin', 10);
  
  const result = await prisma.user.updateMany({
    where: { 
      user: { equals: 'Stecrafi05', mode: 'insensitive' } 
    },
    data: { 
      pass: hashedPassword 
    }
  });
  
  console.log(`Updated ${result.count} user records.`);
  console.log('=== PASSWORD RESET SUCCESSFUL ===');
}

main()
  .catch(err => {
    console.error('Error during password reset:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
