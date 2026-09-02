import { PrismaClient } from "@prisma/client";

// En desarrollo, Next.js recarga módulos en cada cambio de archivo.
// Sin este patrón, cada recarga crearía una conexión nueva a la base
// de datos hasta agotar el pool. Guardamos la instancia en `global`
// para reutilizarla entre recargas.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
