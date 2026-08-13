# Errores Conocidos y Puntos de Dolor: IBRO-ERP-API

## 1. Latencia en Consultas Históricas
- **Problema**: Los módulos que guardan cadenas JSON extensas en campos `Text` (como las trazabilidades, chats borrados u operaciones de evidencias masivas) pueden causar incrementos de peso en peticiones simples `GET /api/all`.
- **Estado**: Las llamadas REST han ido fragmentándose para pedir datos paginados o limitar las devoluciones. Si un endpoint se torna excesivamente lento, se sugiere implementar segmentación manual o limitar los selects vía Prisma: `prisma.modelo.findMany({ select: { campoLigero: true } })`.

## 2. Manejo de Concurrencia en Socket.io
- **Problema**: Al haber reinicios automáticos por caídas (ej, Render auto-sleeping), algunos sockets del cliente pueden generar reconexiones violentas, multiplicando los listeners si el cliente no sanitiza el montaje del Hook en React.
- **Solución implementada**: Desde el Backend, los eventos de broadcast aseguran deduplicación natural para chats. En el frontend, `useApp` controla una única instancia global de `socket`, pero debes tener extrema precaución al adjuntar `.on()` dentro de componentes que montan y desmontan repetidas veces; el backend confía en que el front no saturará con requests.

## 3. Limitaciones en el Manejo de la "Ruta de Archivos"
- **Problema**: Dado que los `uploads` (evidencias, perfiles) se guardan físicamente en el contenedor/disco local del servidor en la carpeta `public/uploads`, la volatilidad (despliegues estáticos que regeneren contenedores, ej: en plataformas PaaS) causaba pérdida de archivos.
- **Mitigación**: Siempre verifica si tu proveedor de nube provee persistencia local (discos atachados permanentes) para la carpeta `public/uploads` o, idealmente, planifica migrar hacia un almacenamiento en la nube externo (como S3 o Cloud Storage) usando middlewares alternativos de multer.

## 4. Limitador de Tasas (Rate Limiting) y Proxy
- **Problema**: En despliegues como Render/Heroku, todas las peticiones llegan con la IP del proxy o balanceador, provocando bloqueos masivos (False Positive DDoS).
- **Solución implementada**: El comando `app.set('trust proxy', 1)` está activado explícitamente en Express para confiar en el header `X-Forwarded-For` e identificar las IP reales de manera individualizada.
