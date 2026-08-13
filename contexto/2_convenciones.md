# Convenciones de Desarrollo Backend

## 1. Organización del Código
* **Separación de Capas**: Se mantiene una arquitectura limpia separando rutas (Routes), controladores (Controllers), y servicios (Services/Models) que interactúan con Prisma.
* **Middlewares Centralizados**: Tareas repetitivas como la autenticación de JWT, el parsing de multipart (Multer) o la validación de Zod deben inyectarse como middlewares en la definición de las rutas, en lugar de escribirse dentro del controlador.

## 2. Seguridad y Autenticación
* **Manejo de Cookies**: Los tokens JWT deben viajar preferiblemente a través de cookies HTTP-Only y Secure, protegidas contra ataques XSS.
* **CORS**: Configurado estrictamente para aceptar peticiones solo desde el dominio del frontend (IBRIO-ERP-APP), bloqueando accesos no autorizados.
* **Manejo de Errores**: Nunca exponer trazas de la base de datos (errores de Prisma) al cliente. El backend debe atrapar (catch) la excepción y devolver un objeto JSON estándar genérico con su respectivo código HTTP (400, 401, 403, 500).

## 3. Restricciones de Carga de Archivos (Multer)
* **Validación de MIME Types en Backend**: Nunca confiar ciegamente en el frontend. Multer debe validar extensiones a nivel de buffer/cabecera:
  * Para los endpoints de Clientes e Inventario: Aceptar únicamente `application/vnd.ms-excel` o `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  * Para los endpoints de PQRS: Aceptar únicamente MIME types de imágenes (`image/png`, `image/jpeg`, etc.). Bloquear incondicionalmente ejecutables (`.exe`, `.sh`).
