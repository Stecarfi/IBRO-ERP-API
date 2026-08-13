# Errores Conocidos y Puntos Críticos - Backend

## 1. Caídas Silenciosas por Falta de Handlers Globales
* **Riesgo**: Si Prisma falla en resolver una transacción de red y lanza una excepción (Promise Rejection), y esta no está envuelta en un bloque `try/catch` dentro de un controlador asíncrono, puede tumbar (crash) el proceso completo de Node.js.
* **Mitigación**: Asegurarse de utilizar envoltorios asíncronos (`express-async-errors` o un HOF customizado) y definir un middleware de errores global (`app.use((err, req, res, next) => {...})`).

## 2. Dependencia de Resend (Servicios de Terceros)
* **Situación**: La plataforma depende críticamente de que el SDK de Resend responda correctamente para procesos vitales (ej. resetear contraseñas, notificar pedidos).
* **Riesgo**: Si la API Key expira, el dominio pierde verificación o el servicio de Resend cae, la aplicación fallará silenciosamente o denegará el acceso al usuario devolviendo errores 500 continuos.
* **Mitigación**: Implementar observabilidad (logs) de las respuestas de Resend y posiblemente mantener una instancia SMTP pura secundaria como "fallback" automático en caso de que el SDK principal falle.

## 3. Límites de Conexión de Prisma
* **Riesgo**: Si la aplicación escala y múltiples instancias del servidor se despliegan simultáneamente o hay picos de usuarios concurrentes (sockets), se pueden agotar rápidamente los puertos del Pool de conexiones a la base de datos SQL.
* **Mitigación futura**: Monitorear las conexiones activas en Prisma y considerar herramientas como PgBouncer o Prisma Accelerate si el tráfico de ERP incrementa exponencialmente.
