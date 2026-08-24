const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    
    for (const u of users) {
        const updateData = {};
        let needsUpdate = false;

        const dummyValues = ['222', '123', '0000', 'abc', 'texto de prueba', 'test'];

        const checkDummy = (val) => val && dummyValues.some(d => val.toLowerCase().includes(d));

        if (checkDummy(u.cedula)) {
            updateData.cedula = '';
            needsUpdate = true;
        }
        if (checkDummy(u.cargo)) {
            updateData.cargo = '';
            needsUpdate = true;
        }
        if (checkDummy(u.codigoAsesor)) {
            updateData.codigoAsesor = '';
            needsUpdate = true;
        }
        if (checkDummy(u.telefono)) {
            updateData.telefono = '';
            needsUpdate = true;
        }
        if (u.nombre && u.nombre.toLowerCase().includes('texto de prueba')) {
            updateData.nombre = '';
            needsUpdate = true;
        }

        if (needsUpdate) {
            await prisma.user.update({
                where: { id: u.id },
                data: updateData
            });
            console.log(`Updated user ${u.user}`);
        }
    }
    
    console.log("Dummy data cleared from API Database.");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
