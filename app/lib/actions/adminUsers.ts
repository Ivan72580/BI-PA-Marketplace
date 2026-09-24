"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAdmin } from "../db/users";

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

export type UpdateLeadershipAccessResult =
  | { ok: true }
  | { ok: false; errorKey: "unauthorized" | "generic" };

// Prende/apaga el acceso a /leadership. A diferencia del rol, no hay un
// mínimo que proteger (no es un recurso escaso como "al menos un Admin"),
// así que no necesita el chequeo de "último Admin" — solo re-validar que
// quien llama sea Admin.
export async function updateLeadershipAccess(userId: string, value: boolean): Promise<UpdateLeadershipAccessResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, errorKey: "unauthorized" };

  try {
    await prisma.user.update({ where: { id: userId }, data: { canViewLeadership: value } });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
