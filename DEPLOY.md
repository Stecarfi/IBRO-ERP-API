# Guía de Despliegue en Producción — IBRO ERP API

Esta guía describe los pasos necesarios para desplegar el backend de **IBRO ERP** en un entorno de producción (Render, Railway, VPS con Docker o PM2).

---

## 1. Requisitos Previos
- **Node.js**: v18.x o v20.x LTS.
- **PostgreSQL**: v14 o superior con extensiones estándar habilitadas.
- Base de datos aprovisionada y accesible mediante la variable de conexión `DATABASE_URL`.

---

## 2. Variables de Entorno Requeridas
Configura en tu panel de control de alojamiento (ej. Render Environment Variables) las siguientes variables basándote en `.env.example`:

| Variable | Descripción | Ejemplo / Nota |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://user:pass@host/db?sslmode=require` |
| `JWT_SECRET` | Clave criptográfica para tokens | Cadena aleatoria de 32+ caracteres |
| `ALLOWED_ORIGINS` | Dominios autorizados para CORS | `https://tu-frontend.vercel.app` |
| `VAPID_PUBLIC_KEY` | Clave pública Web Push | Generada con `web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Clave privada Web Push | Generada con `web-push generate-vapid-keys` |
| `VAPID_EMAIL` | Email de contacto VAPID | `mailto:soporte@ibrosas.com` |
| `GOOGLE_CREDENTIALS_BASE64` | Credenciales de Google Drive | Archivo JSON de Service Account en Base64 |

---

## 3. Generación de Nuevas Claves VAPID
Dado que las claves anteriores estuvieron en repositorios de prueba, genera un par nuevo en tu terminal antes de desplegar:
```bash
npx web-push generate-vapid-keys
```
Copia la **Public Key** a `VAPID_PUBLIC_KEY` (y en el frontend a `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), y la **Private Key** a `VAPID_PRIVATE_KEY` en el backend.

---

## 4. Base de Datos y Migraciones

### A. Para inicializar una base de datos existente o sincronizada
Si tu base de datos ya tiene las tablas actuales de Prisma:
```bash
npx prisma generate
```

### B. Para aplicar migraciones en producción
Ejecuta el script configurado:
```bash
npm run build
npm run migrate:deploy
```
> [!NOTE]
> En la configuración actual de `package.json`, el comando de arranque es `npm start` (`node src/index.js`). Ya **no** se ejecuta `prisma db push` en el arranque para evitar mutaciones no planificadas o demoras durante el reinicio de contenedores.

---

## 5. Arranque en Producción
En Render / Railway, define:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health` (responderá `200 OK` con `{ status: "ok", database: "connected" }`).
