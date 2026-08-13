# Glosario y Términos Clave: IBRO-ERP-API

Este documento recopila las definiciones de términos técnicos o de negocio usados dentro de la infraestructura del backend de IBRO ERP.

- **Prisma Client**: Capa ORM generada automáticamente (a partir de `schema.prisma`) que expone métodos como `prisma.user.findFirst` para interactuar de forma segura con PostgreSQL.
- **Rate Limit**: Mecanismo protector configurado en Express para limitar el número de peticiones por segundo que una dirección IP puede realizar. Crucial para prevenir ataques de denegación de servicio (DDoS) o fuerza bruta (ej: en login).
- **Zod Schema**: Estructura declarativa (objeto) que define el esquema, tipo, longitud y formato esperado de los datos entrantes (req.body) previo a su procesamiento (Ej: Validar que un email tenga el formato correcto y la contraseña el largo suficiente).
- **Socket / Emisión Global**: Evento emitido a través de `io.emit('event', data)`. Esto le llega a todos los clientes conectados a la aplicación, sin importar qué módulo estén visualizando, para asegurar consistencia del estado.
- **Multer Storage**: Middleware configurado que intercepta subidas de formato `multipart/form-data`, verifica la extensión (MIME) del archivo, le asigna un nombre único (UUID) y lo guarda físicamente en `/public/uploads`.
- **Fail-Closed**: Filosofía de diseño de seguridad adoptada: Si una función segura, como el envío de un correo de recuperación de contraseña, sufre una caída de red o API KEY incorrecta, el proceso detiene la ejecución inmediatamente retornando un HTTP 500, en lugar de continuar inseguramente.
