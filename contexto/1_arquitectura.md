# Arquitectura del Backend: IBRO-ERP-API

## 1. Visión General
El backend de IBRO ERP está estructurado sobre **Node.js** utilizando **Express.js** como framework web y enrutador. Funciona como el orquestador principal de APIs RESTful, gestión de eventos asíncronos en tiempo real (Sockets) y administrador de la persistencia de datos.

## 2. Tecnologías Principales (Stack Backend)
* **Servidor**: Node.js + Express.
* **Base de Datos y ORM**: **Prisma** (`@prisma/client`) interactuando con PostgreSQL. Provee seguridad de tipos estática, migraciones eficientes (`schema.prisma` gigantesco que mapea relaciones complejas) y un modelo robusto que soporta JSON fields.
* **Autenticación y Seguridad**: 
  - Manejo de JSON Web Tokens (`jsonwebtoken`).
  - Hashing robusto con Bcrypt (`bcryptjs`).
  - Capas de seguridad express-rate-limit contra ataques DDoS e intentos de fuerza bruta en logins.
* **Validación**: **Zod** (`zod`) valida estrictamente los payloads de las peticiones para prevenir inyecciones y asegurar que los datos cumplan las lógicas comerciales.
* **Tiempo Real**: **Socket.io** (`socket.io`). Provee eventos para el Chat (`chat-message`), kickeo forzado, tracking de usuarios en línea y alertas.
* **Inteligencia Artificial**: Integración con Google Generative AI (`@google/generative-ai`) para análisis semánticos o generación de respuestas.
* **Comunicaciones (Mail)**: Transmisión dual vía Nodemailer tradicional y **Resend SDK**, enfocado a notificaciones críticas de la cuenta (recuperación de acceso, cuenta bloqueada).
* **Gestión de Archivos**: **Multer** almacena avatares y arreglos de documentos/evidencias (hasta 50MB de capacidad) provenientes de PQRS, Solicitudes y Mantenimientos, guardándolas localmente en `public/uploads` y exponiendo la URL pública.
* **Tareas Asíncronas**: Node-cron (`node-cron`) para programar rutinas en segundo plano y limpieza de base de datos.
