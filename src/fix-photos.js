require('dotenv').config();
const prisma = require('./prisma');

async function fixPhotos() {
  const users = await prisma.user.findMany();
  let count = 0;
  for (const user of users) {
    if (user.foto && user.foto.includes('uc?export=view&id=')) {
      // Avoid appending sz=w1000 multiple times
      let newFoto = user.foto.replace('uc?export=view&id=', 'thumbnail?id=');
      if (!newFoto.includes('sz=')) {
          newFoto += '&sz=w1000';
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { foto: newFoto }
      });
      count++;
      console.log(`Updated foto for user ${user.user}`);
    }
  }
  console.log(`Finished fixing ${count} photos.`);
}

fixPhotos().catch(console.error).finally(() => prisma.$disconnect());
