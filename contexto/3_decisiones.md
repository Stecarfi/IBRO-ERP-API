# Decisiones Técnicas y de Diseño: IBRO-ERP-API

## 1. Migración a Prisma ORM
Originalmente, el sistema podía depender de manipulaciones manuales en bases NoSQL o archivos estáticos. Sin embargo, se estandarizó **Prisma sobre PostgreSQL** como fuente de verdad.
- **Por qué**: Brinda seguridad estricta de tipos (Typescript-like) y facilita el escalado horizontal, asegurando la integridad referencial para sistemas complejos que relacionan transacciones comerciales, reportes de recursos humanos y clientes.

## 2. Almacenamiento JSON en columnas de Texto
Para campos extremadamente dinámicos (como la `trazabilidad` de un servicio que incluye nombre de usuario, fecha y notas, o las `evidencias` que son arrays de URLs), el modelo en Prisma usa `String @db.Text` para almacenar arrays JSON estringificados en lugar de tablas auxiliares.
- **Por qué**: Esto evita consultas relacionales sumamente costosas para datos que rara vez se filtran individualmente mediante `WHERE`, mejorando drásticamente el rendimiento de lectura del historial, el chat, o la recolección de evidencias.

## 3. Despliegue en Paquete Simple (`index.js`)
El backend centraliza fuertemente sus manejadores directamente sobre `index.js` para mantener un prototipado veloz en entornos como Render. Además, al combinar REST endpoints con el listener puro de `socket.io` en el mismo servidor `http.createServer(app)`, se evita lidiar con el infierno de CORS en sistemas separados.

## 4. Abandono de modos "Mock"
Para garantizar la integridad y el cumplimiento de protección de datos (Habeas Data, Reseteo seguro de contraseñas), el backend elimina cualquier flujo de simulación o "Mock Mode" que entregara enlaces confidenciales vía API. Si falla Resend, el proceso falla de manera segura (fail-closed) para evitar comprometer la base de datos a atacantes.
