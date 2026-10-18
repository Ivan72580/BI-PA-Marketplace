-- AlterEnum
ALTER TYPE "AppModule" ADD VALUE 'TEAM';

-- CreateEnum
CREATE TYPE "ModuleLevel" AS ENUM ('NONE', 'VIEW', 'EDIT');

-- CreateTable
CREATE TABLE "user_module_access" (
    "userId" TEXT NOT NULL,
    "module" "AppModule" NOT NULL,
    "level" "ModuleLevel" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_module_access_pkey" PRIMARY KEY ("userId","module")
);

-- AddForeignKey
ALTER TABLE "user_module_access" ADD CONSTRAINT "user_module_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: quien tenía acceso a leadership pasa a tener EDIT en Executive
-- (hasta ahora ese permiso permitía ver el panel y editar Facility Profile).
INSERT INTO "user_module_access" ("userId", "module", "level", "updatedAt")
SELECT "id", 'EXECUTIVE', 'EDIT', CURRENT_TIMESTAMP FROM "users" WHERE "canViewLeadership" = true;
