import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "../auth";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";
import { firstAccessibleHome, hasLevel, resolveAccess, type AppModule, type ModuleAccess, type ModuleLevel } from "../module";

// Fuente de verdad para "quién soy" del lado del negocio (rol, locale, id).
// A propósito NO se guarda el rol en el JWT de la sesión: así un cambio de
// rol hecho desde /admin/users aplica de inmediato en el próximo request,
// sin esperar a que el token expire o se re-emita. El costo es una consulta
// a User por request que la necesite — aceptable para el tamaño de este
// equipo, y es el mismo criterio que ya usa i18n/request.ts hoy.
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  try {
    return await prisma.user.findUnique({ where: { email } });
  } catch {
    // Tabla todavía no migrada, o DB no responde: tratamos como "sin datos
    // de negocio" en vez de romper el render (mismo criterio defensivo que
    // el resto de la app).
    return null;
  }
}

// Devuelve el usuario actual solo si es ADMIN; null en cualquier otro caso
// (no logueado, MEMBER, o error). Pensado para gatear páginas/acciones —
// nunca confiar en un chequeo de rol hecho solo del lado del cliente.
export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}

// ---------- Acceso por módulo (ver app/lib/module.ts) ----------
// Usuario + acceso efectivo a cada módulo, una sola consulta por request:
// cache() de React lo comparte entre el layout, el gate de la sección, la
// página y el menú del mismo render. A propósito NO es "ADMIN ve todo":
// administrar usuarios y ver un módulo son preguntas distintas, y un Admin
// se asigna su propio acceso desde /admin/users como a cualquiera.
export type UserWithAccess = { user: User; access: ModuleAccess };

export const getCurrentUserWithAccess = cache(async (): Promise<UserWithAccess | null> => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { moduleAccess: true } });
    if (!user) return null;
    const { moduleAccess, ...rest } = user;
    return { user: rest, access: resolveAccess(moduleAccess) };
  } catch {
    return null;
  }
});

// Para server actions y páginas: el usuario si tiene al menos `min` en el
// módulo; null si no. Nunca confiar en que la UI escondió un botón.
export async function requireModule(appModule: AppModule, min: ModuleLevel = "VIEW"): Promise<User | null> {
  const current = await getCurrentUserWithAccess();
  return current && hasLevel(current.access[appModule], min) ? current.user : null;
}

// Para el layout de cada sección: sin acceso de lectura al módulo, manda a
// la página de inicio de otro módulo que sí pueda ver, o a /sin-acceso.
// Sin sesión no hace nada (eso lo resuelve middleware.ts mandando a /login).
export async function gateModule(appModule: AppModule): Promise<UserWithAccess | null> {
  const current = await getCurrentUserWithAccess();
  if (!current) return null;
  if (!hasLevel(current.access[appModule], "VIEW")) {
    redirect(firstAccessibleHome(current.access, appModule) ?? "/sin-acceso");
  }
  return current;
}

// Acceso de lectura a Executive (antes: el flag canViewLeadership, hoy
// obsoleto). Se mantiene el nombre porque lo usan varias páginas.
export async function requireLeadershipAccess(): Promise<User | null> {
  return requireModule("EXECUTIVE", "VIEW");
}
