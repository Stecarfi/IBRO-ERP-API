# Arquitectura del Backend: IBRO-ERP-API

## 1. Visión General
El backend está estructurado sobre **Node.js** utilizando **Express.js** como framework web. Su objetivo principal es exponer APIs RESTful seguras, manejar eventos de tiempo real y gestionar la lógica de negocio persistente.

## 2. Tecnologías Principales (Stack Backend)
* **Servidor**: Node.js + Express.
* **Base de Datos y ORM**: **Prisma** (`@prisma/client`). Provee seguridad de tipos estática, migraciones eficientes y un modelo de datos robusto para interactuar con la base de datos SQL.
* **Autenticación**: JSON Web Tokens (`jsonwebtoken`), manejo seguro de contraseñas con `bcryptjs`, y gestión segura de cookies con `cookie-parser`.
* **Validación**: **Zod** (`zod`) se usa para asegurar que los payloads de las peticiones coincidan con los esquemas esperados, rechazando peticiones malformadas automáticamente.
* **Tiempo Real**: **Socket.io** (`socket.io`) y WebSockets crudos (`ws`) para emitir eventos de notificaciones, tracking de usuarios conectados y mensajería en vivo.
* **Inteligencia Artificial**: Integración nativa con Google Generative AI (`@google/generative-ai`) para módulos analíticos o asistenciales.
* **Comunicaciones**: **Nodemailer** y **Resend SDK** para el envío transaccional de correos electrónicos.
* **Gestión de Archivos**: **Multer** (`multer`) procesa los multipart/form-data enviados desde el frontend.
* **Tareas Asíncronas**: Node-cron (`node-cron`) para programar mantenimientos de base de datos o envíos de reportes.
