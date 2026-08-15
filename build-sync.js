const fs = require('fs');
const lines = fs.readFileSync('src/old_index.js', 'utf16le').split('\n');

const getDbStart = lines.findIndex(l => l.includes("app.get('/api/db'"));
const getDbEnd = lines.findIndex((l, i) => i > getDbStart && l.includes('pendingResets'));

const getDbBody = lines.slice(getDbStart + 5, getDbEnd + 1).join('\n');

const syncStart = lines.findIndex(l => l.includes("app.post('/api/db/sync'"));
const syncEnd = lines.findIndex((l, i) => i > syncStart && l.includes('// Fin de la transacci'));

const syncBody = lines.slice(syncStart + 15, syncEnd + 3).join('\n');

const content = `const prisma = require('../prisma');

class SyncService {
  async getDb() {
${getDbBody}
    return {
      users, roles, clientes, inventario, ventas, pqrs, servicios,
      solicitudes, procesosDisciplinarios, evaluaciones, anuncios,
      cotizaciones, chatGroups, chat, auditoria, notificaciones, cuentasCobro, comisionistas, informesConfig, capacitaciones, pendingResets, config: appConfig, whatsappConfig
    };
  }

  async sync(diff, user) {
${syncBody}
    });
  }
}

module.exports = new SyncService();`;

fs.writeFileSync('src/services/sync.service.js', content, 'utf8');
console.log('done');
