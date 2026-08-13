# Flujo de Trabajo Backend (Workflow)

## 1. Flujo de una Petición Típica a la API
1. **Recepción HTTP**: La petición llega a Express.js desde el frontend.
2. **CORS y Parsers**: El middleware de CORS verifica el origen. El middleware de `express.json()` o Multer extraen el body/archivos.
3. **Autenticación (Middleware)**: Verifica las cookies o el header `Authorization`. Si el JWT es válido, inyecta `req.user` para uso posterior.
4. **Validación (Zod)**: Verifica que el body posea todos los campos obligatorios.
5. **Controlador**: Contiene la lógica de negocio. Realiza consultas a Prisma.
6. **Emisión de Eventos (Opcional)**: Si la acción afecta a otros usuarios (ej. Chat nuevo, Pedido nuevo), dispara un evento por `Socket.io` a las salas correspondientes.
7. **Respuesta HTTP**: Devuelve un JSON estructurado con estado HTTP (200, 201, 400).

## 2. Flujo de Archivos Restringidos
* Al subir un archivo al endpoint de Inventario, la petición es interceptada por un middleware de Multer.
* Multer inspecciona el `mimetype`. Si detecta un `.exe` u otra extensión prohibida, el middleware rechaza la subida inmediatamente, abortando el proceso antes de que llegue al controlador o toque el disco de manera definitiva.

## 3. Flujo de Recuperación de Contraseñas Segura
* Cliente solicita recuperación (`POST /forgot-password`).
* Controlador busca si el usuario existe (Prisma). Genera un token JWT temporal y arma un enlace web de un solo uso.
* El servicio de Email (Resend) intenta enviar el enlace.
* Si Resend responde OK, el servidor responde con status 200 genérico ("Revisa tu correo").
* Si Resend falla, el servidor elimina el token y lanza un error 500 genérico ("Error del servidor, inténtelo más tarde"), sin exponer tokens jamás en el payload de respuesta.
