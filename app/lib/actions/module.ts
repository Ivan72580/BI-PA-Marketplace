"use server";

import { cookies } from "next/headers";
import { auth } from "../auth";
import { prisma } from "../db/prisma";
import { isAppModule, MODULE_COOKIE, type AppModule } from "../module";

// Guarda qué módulo (Magic/Executive) está usando ahora: siempre en la
// cookie (para que /entrada lo sepa desde el primer request de la sesión
// sin esperar una consulta a la base), y además en User.lastModule si hay
// sesión activa, para que viaje entre dispositivos — mismo criterio que
// setLocale. Se llama automáticamente al entrar a cualquier página de
// alguno de los dos módulos (ver RecordModule.tsx), no requiere ninguna
// acción explícita del usuario.
// Nombre del parámetro a propósito no es "module": choca con la regla de
// Next.js no-assign-module-variable (piensa en el "module" de CommonJS).
export async function setLastModule(appModule: AppModule) {
  if (!isAppModule(appModule)) return;

  (await cookies()).set(MODULE_COOKIE, appModule, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const session = await auth();
  const email = session?.user?.email;
  if (email) {
    try {
      // update-only: mismo motivo que en setLocale (fila todavía no creada,
      // o migración de Prisma pendiente) — la cookie ya quedó guardada.
      await prisma.user.update({
        where: { email },
        data: { lastModule: appModule },
      });
    } catch {
      // Ver comentario arriba.
    }
  }
}
