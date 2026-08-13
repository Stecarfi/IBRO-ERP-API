# Glosario del Backend IBRO ERP

* **Prisma**: Object-Relational Mapper (ORM) principal utilizado para diseñar el esquema de la base de datos y hacer consultas tipadas.
* **Zod**: Librería de declaración y validación de esquemas (schemas). Define qué forma exacta debe tener un JSON recibido (ej. `email` debe ser string y con formato email).
* **Resend**: Proveedor externo moderno (SDK) utilizado para enviar correos electrónicos transaccionales (recuperaciones, reportes).
* **Multer**: Middleware de Express utilizado exclusivamente para manejar peticiones de subida de archivos (multipart).
* **JSON Web Token (JWT)**: Estándar para crear tokens de acceso firmados criptográficamente. Define si una petición a la API tiene permisos o no.
* **CORS**: Intercambio de Recursos de Origen Cruzado. Configuración vital de seguridad en Express para aceptar solo conexiones de la URL del frontend de Next.js.
* **Node-cron**: Demonio de tareas ejecutadas por tiempo (ej. ejecutar una función de limpieza o auditoría todas las noches a las 3:00 AM).
