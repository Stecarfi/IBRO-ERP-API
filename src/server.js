require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./utils/socket');

// Crear servidor HTTP sobre la app Express
const server = http.createServer(app);

// Inicializar WebSockets
initSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`[OK] Server running on port ${PORT}`);
    console.log(`[OK] Monolithic Architecture (MVC) Loaded`);
    console.log(`======================================================\n`);
});
