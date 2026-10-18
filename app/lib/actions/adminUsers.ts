"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAdmin } from "../db/users";
import { isAppModule, isModuleLevel, MODULES, type AppModule, type ModuleLevel } from "../module";

export type UpdateRoleResult =
  | { ok: true }
  | { ok: false; errorKey: "lastAdmin" | "unauthorized" | "generic" };

// Cambia el rol de un usuario desde /admin/users. Nunca confía en que quien
// llama sea Admin solo porque la UI lo muestra: vuelve a chequear contra la
// DB acá, server-side, antes de tocar nada.
export async function updateUserRole(userId: string, newRole: Role): Promise<UpdateRoleResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, errorKey: "unauthorized" };

  try {
    if (newRole !== "ADMIN") {
      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (target?.role === "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
        // Nunca dejar el sistema sin ningún Admin: si este es el último,
        // el cambio se rechaza en vez de aplicarse.
        if (adminCount <= 1) {
          return { ok: false, errorKey: "lastAdmin" };
        }
      }
    }

    await prisma.user.update({ where: { id: userId }, data: { role: newRole } });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export type UpdateModuleAccessResult =
  | { ok: true }
  | { ok: false; errorKey: "unauthorized" | "generic" };

// Cambia el nivel de una persona en un módulo (ver app/lib/module.ts).
// Siempre guarda una fila, aunque el nivel coincida con el default: así un
// cambio futuro de default no le cambia el acceso a quien ya fue revisado.
export async function updateModuleAccess(userId: string, appModule: AppModule, level: ModuleLevel): Promise<UpdateModuleAccessResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, errorKey: "unauthorized" };
  if (!isAppModule(appModule) || !isModuleLevel(level) || !MODULES[appModule].levels.includes(level)) {
    return { ok: false, errorKey: "generic" };
  }

  try {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId, module: appModule } },
      update: { level },
      create: { userId, module: appModule, level },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export type UpdateWeeklyReportOptInResult =
  | { ok: true }
  | { ok: false; errorKey: "unauthorized" | "generic" };

// Mismo criterio que updateLeadershipAccess (un solo booleano, sin mínimo
// que proteger) — opt-out del mail semanal de Reportes. El cron de
// /api/cron/weekly-report lo lee directo de la fila, no hace falta tocar
// nada más acá.
export async function updateWeeklyReportOptIn(userId: string, value: boolean): Promise<UpdateWeeklyReportOptInResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, errorKey: "unauthorized" };

  try {
    await prisma.user.update({ where: { id: userId }, data: { receivesWeeklyReport: value } });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
