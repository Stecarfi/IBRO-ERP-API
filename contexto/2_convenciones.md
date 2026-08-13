# Convenciones de Código y Diseño: IBRO-ERP-API

## 1. Arquitectura de Archivos (API REST)
- El punto de entrada exclusivo es `src/index.js`, que unifica rutas, middleware de seguridad y configuración de sockets.
- Para funciones de negocio externas o de terceros, se promueven servicios aislados en archivos dedicados:
  - `emailService.js`: Envío de notificaciones transaccionales.
  - `geminiService.js`: Orquestación de IA y análisis semántico.
  - `cron/backup.js`: Configuración de tareas de cron programadas.
  - `validators.js`: Validaciones Zod centralizadas.

## 2. Convenciones de Base de Datos (Prisma)
- **Modelos (schema.prisma)**: Los nombres de los modelos se escriben en PascalCase y singular (`User`, `Cliente`, `Venta`).
- **Relaciones**: Se prefiere almacenar el ID referencial (ej: `clienteId`) e instruir la relación explícita `@relation(fields: [clienteId], references: [id])`. Para arrays de objetos pequeños y dinámicos (evidencias, trazabilidades en PQRS/Servicios, o permisos) se utilizan tipos `String? @db.Text` con codificación JSON (JSON.stringify) en lugar de crear un centenar de tablas intermedias innecesarias.

## 3. Seguridad Estricta
- Toda ruta crítica está protegida. Ningún enlace o token de recuperación debe viajar como payload devuelto al cliente; siempre deben enviarse vía Email/SMTP o, en caso de fallo crítico, derivar en un error genérico (500) para no filtrar accesos.
- La validación es "paranoica": El backend no confía en el front-end; todos los cálculos matemáticos críticos o mutaciones de estado se validan utilizando Zod o sanitización de cadenas previo al uso de Prisma.

## 4. Respuestas JSON Uniformes
- Todo error devuelto incluye la llave `error` (Ej: `res.status(400).json({ error: 'Mensaje descriptivo' })`).
- Toda transacción de subida de archivos (Multer) o guardado exitoso debe responder con un flag de éxito y el recurso (Ej: `res.json({ success: true, files: [...] })`).
