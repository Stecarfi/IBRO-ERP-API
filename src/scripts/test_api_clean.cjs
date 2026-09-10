const http = require('http');

function postLogin() {
  const loginData = JSON.stringify({ user: 'admin', pass: 'admin' });
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Login Status code:', res.statusCode);
      try {
        const json = JSON.parse(data);
        if (json.token) {
          console.log('Token received successfully! User:', json.user?.user, 'Role:', json.user?.roleId);
          fetchDbWithToken(json.token);
        } else {
          console.error('No token in login response:', json);
        }
      } catch (e) {
        console.error('Error parsing login response:', e.message);
      }
    });
  });

  req.on('error', (e) => console.error('Error in login request:', e.message));
  req.write(loginData);
  req.end();
}

function fetchDbWithToken(token) {
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/db',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('GET /api/db Status code:', res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log('\n=== RESUMEN DE LA API /api/db CON TOKEN ===');
        console.log('- Clientes:', json.clientes?.length || 0);
        console.log('- Inventario:', json.inventario?.length || 0);
        console.log('- Ventas:', json.ventas?.length || 0);
        console.log('- Cotizaciones:', json.cotizaciones?.length || 0);
        console.log('- PQRS:', json.pqrs?.length || 0);
        console.log('- Servicios:', json.servicios?.length || 0);
        console.log('- Chats:', json.chat?.length || 0);
        console.log('- ChatGroups:', json.chatGroups?.length || 0);
        console.log('- Solicitudes:', json.solicitudes?.length || 0);
        console.log('- Disciplinario:', json.procesosDisciplinarios?.length || 0);
        console.log('- Evaluaciones:', json.evaluaciones?.length || 0);
        console.log('- Comisionistas:', json.comisionistas?.length || 0);
        console.log('- CuentasCobro:', json.cuentasCobro?.length || 0);
        console.log('- Capacitaciones:', json.capacitaciones?.length || 0);
        console.log('- Anuncios:', json.anuncios?.length || 0);
        console.log('- Users:', json.users?.length || 0, json.users?.map(u => u.user));
        console.log('- Roles:', json.roles?.length || 0, json.roles?.map(r => r.name));
      } catch (e) {
        console.error('Error parsing JSON:', e.message);
      }
    });
  });

  req.on('error', (e) => console.error('Error fetching /api/db:', e.message));
  req.end();
}

postLogin();
