const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.chatGroup.findMany();
  console.log('GROUPS COUNT:', groups.length);
  console.log('SAMPLE GROUPS:', JSON.stringify(groups.slice(0, 3), null, 2));

  const chats = await prisma.chat.findMany({
    take: 5,
    orderBy: { timestamp: 'desc' }
  });
  console.log('RECENT CHATS:', JSON.stringify(chats, null, 2));

  const users = await prisma.user.findMany({ select: { id: true, user: true, nombre: true } });
  console.log('USERS COUNT:', users.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
