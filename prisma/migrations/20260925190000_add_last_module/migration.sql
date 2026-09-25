-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('MAGIC', 'EXECUTIVE');

-- AlterTable
-- Default MAGIC para todas las filas existentes: es lo que cualquier cuenta
-- ya venía viendo (no hay ninguna cuenta real hoy cuyo "último módulo" haya
-- sido realmente Executive, porque este concepto no existía antes de esta
-- migración).
ALTER TABLE "users" ADD COLUMN "lastModule" "AppModule" NOT NULL DEFAULT 'MAGIC';
