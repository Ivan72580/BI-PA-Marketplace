import { auth } from "../auth";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

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
