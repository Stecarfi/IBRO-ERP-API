# Decisiones Técnicas y de Diseño Backend (ADRs)

## 1. Migración a Resend SDK para Correos
* **Decisión**: Se integró soporte para el SDK de Resend, priorizándolo sobre las implementaciones previas basadas únicamente en SMTP (Nodemailer clásico).
* **Razón**: Mayor confiabilidad en la entregabilidad de los correos y una API moderna más fácil de mantener mediante la variable `RESEND_API_KEY`.

## 2. Eliminación de Contingencias Inseguras en Recuperación de Contraseña
* **Decisión**: Se aplicó un parche crítico eliminando el `mockMode` (modo de prueba) de los servicios de recuperación de contraseña.
* **Razón**: Anteriormente, si el correo electrónico fallaba, el backend generaba el token y lo devolvía en la respuesta JSON al cliente por "facilidad" de prueba. Esto constituía una vulnerabilidad crítica, ya que un atacante podría interceptar o forzar la respuesta y recuperar la cuenta. Ahora el sistema retorna obligatoriamente un error 500 seguro si el envío falla.

## 3. Validaciones con Zod
* **Decisión**: Utilizar Zod como única fuente de validación de entradas de APIs.
* **Razón**: Proveer tipado fuerte end-to-end. Al validar en el límite de la aplicación (la ruta), nos aseguramos de que el controlador reciba siempre datos limpios y seguros, eliminando docenas de condicionales "if-undefined" manuales.

## 4. Prisma como ORM Definitivo
* **Decisión**: Abstraer la capa SQL detrás de Prisma.
* **Razón**: Acelera el desarrollo gracias al autocompletado del Prisma Client. Protege implícitamente contra inyecciones SQL y facilita las migraciones de esquemas en bases de datos relacionales sin tocar código SQL puro.
