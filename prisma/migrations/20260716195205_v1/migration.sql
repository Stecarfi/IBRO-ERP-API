-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modules" TEXT[],
    "canAssignSales" BOOLEAN NOT NULL DEFAULT false,
    "clientLevel" INTEGER NOT NULL DEFAULT 3,
    "canManageEvals" BOOLEAN NOT NULL DEFAULT false,
    "viewTechPrice" BOOLEAN NOT NULL DEFAULT false,
    "viewWholesalePrice" BOOLEAN NOT NULL DEFAULT false,
    "viewCostPrice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "observaciones" TEXT,
    "user" TEXT NOT NULL,
    "pass" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "meta_u" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ejec_u" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meta_p" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ejec_p" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "soundsEnabled" BOOLEAN DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "doc_tipo" TEXT NOT NULL,
    "doc" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "tipo_cliente" TEXT NOT NULL,
    "tel" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "direccion" TEXT,
    "owner" TEXT,
    "lockedBy" TEXT,
    "habeasDataAccepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "cod" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "clasif" TEXT NOT NULL,
    "subclasif" TEXT NOT NULL,
    "tech" TEXT NOT NULL,
    "btu" TEXT NOT NULL,
    "volt" TEXT NOT NULL,
    "cant" INTEGER NOT NULL,
    "pedido" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "precio_publico" DOUBLE PRECISION,
    "precio_tecnico" DOUBLE PRECISION,
    "precio_mayorista" DOUBLE PRECISION,
    "precio_costo" DOUBLE PRECISION,
    "vendidas" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "fechaIso" TEXT NOT NULL,
    "venceGarantiaIso" TEXT NOT NULL,
    "mesesGarantia" INTEGER NOT NULL,
    "vendedor" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cant" INTEGER NOT NULL,
    "desc" DOUBLE PRECISION NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "comisionistaId" TEXT,
    "comisionistaNombre" TEXT,
    "comisionistaPct" DOUBLE PRECISION,
    "comisionistaValor" DOUBLE PRECISION,
    "tipo_precio" TEXT,
    "precioUnitario" DOUBLE PRECISION,
    "lockedBy" TEXT,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PQR" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "limiteIso" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "evidencia" TEXT,
    "fileData" TEXT,
    "estado" TEXT NOT NULL,
    "satisfecho" TEXT NOT NULL,
    "lockedBy" TEXT,

    CONSTRAINT "PQR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "fechaProg" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "obs" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "obsAdmin" TEXT,
    "lockedBy" TEXT,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solicitud" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "asesor" TEXT NOT NULL,
    "nombreAsesor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "evidencia" TEXT,
    "fileData" TEXT,
    "estado" TEXT NOT NULL,
    "lockedBy" TEXT,

    CONSTRAINT "Solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcesoDisciplinario" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "asesor" TEXT NOT NULL,
    "jefe" TEXT NOT NULL,
    "falta" TEXT NOT NULL,
    "obs" TEXT NOT NULL,
    "etapa" INTEGER NOT NULL,
    "descargo" TEXT,
    "sancion" TEXT,
    "diasSuspension" INTEGER NOT NULL DEFAULT 0,
    "renunciaTerminos" BOOLEAN NOT NULL DEFAULT false,
    "timestampEtapa" DOUBLE PRECISION NOT NULL,
    "lockedBy" TEXT,

    CONSTRAINT "ProcesoDisciplinario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluacion" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "evaluador" TEXT NOT NULL,
    "evaluado" TEXT NOT NULL,
    "evaluadoNombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "obs" TEXT,
    "scores" JSONB NOT NULL,
    "lockedBy" TEXT,

    CONSTRAINT "Evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anuncio" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "lockedBy" TEXT,

    CONSTRAINT "Anuncio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cant" INTEGER NOT NULL,
    "desc" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "comisionistaId" TEXT,
    "comisionistaNombre" TEXT,
    "comisionistaPct" DOUBLE PRECISION,
    "comisionistaValor" DOUBLE PRECISION,
    "lockedBy" TEXT,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "timestamp" DOUBLE PRECISION NOT NULL,
    "fecha" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "text" TEXT,
    "senderTabId" TEXT,
    "isNudge" BOOLEAN NOT NULL DEFAULT false,
    "isSticker" BOOLEAN NOT NULL DEFAULT false,
    "stickerId" TEXT,
    "stickerData" TEXT,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "recordDetails" TEXT,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "targetModule" TEXT,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comisionista" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "direccion" TEXT,
    "cliente_remite" TEXT,
    "valor_venta" DOUBLE PRECISION,
    "pct_comision" DOUBLE PRECISION,
    "fecha" TEXT,
    "owner" TEXT,
    "lockedBy" TEXT,

    CONSTRAINT "Comisionista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "phone" TEXT NOT NULL DEFAULT '573000000000',
    "status" TEXT NOT NULL DEFAULT 'Activo',

    CONSTRAINT "WhatsappConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingReset" (
    "id" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expire" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PendingReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_user_key" ON "User"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_doc_key" ON "Cliente"("doc");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PQR" ADD CONSTRAINT "PQR_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
