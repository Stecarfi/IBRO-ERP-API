# Flujo de Trabajo (Desarrollo Backend): IBRO-ERP-API

## 1. Entorno de Desarrollo Local
Para inicializar la API y conectarla con la base de datos:
1. Asegurarse de tener un servidor PostgreSQL configurado, o usar el que provea la variable `DATABASE_URL` en el archivo `.env`.
2. Desde la terminal en `IBRO-ERP-API`, ejecuta `npm install` si hay nuevas dependencias.
3. Actualizar la capa de base de datos corriendo `npx prisma generate` y `npx prisma db push` para alinear tu base local con el esquema actual.
4. Levantar el servicio en modo observador (hot-reload): `npm run dev`. El backend utilizará el puerto 3000 por defecto.

## 2. Modificación o Adición de Modelos (Prisma)
Cuando un nuevo requerimiento solicite alterar un flujo de negocio que requiere persistencia (Por ejemplo, añadir un nuevo tipo de campo a "Cotización"):
1. Modifica el archivo `prisma/schema.prisma` agregando el campo necesario.
2. Detén el servidor local.
3. Corre `npx prisma db push` para empujar el cambio de esquema a la base de datos subyacente.
4. Actualiza los endpoints correspondientes en `src/index.js` para asegurar que procesan (y validan vía Zod) este nuevo campo adecuadamente.

## 3. Subidas de Archivos (Uploads)
Si estás manipulando endpoints que manejan archivos, recuerda usar las instancias de middleware configuradas (ej. `upload.array('files')`). Valida siempre:
- **Límite de tamaño**: Evita vulnerabilidades de saturación de disco.
- **MIME type (fileFilter)**: Asegúrate que archivos ejecutables o peligrosos (.exe, .sh, archivos extraños) sean bloqueados y solo se admitan PDF, Documentos o Imágenes controladas.

## 4. Tareas en Segundo Plano
Para agregar tareas que deban correr cada cierto tiempo (limpiezas, envíos de reportes), edita `src/cron/backup.js` utilizando la sintaxis de cron POSIX de `node-cron`.
