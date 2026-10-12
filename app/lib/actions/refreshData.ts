"use server";

import { revalidateTag } from "next/cache";
import { requireAdmin } from "../db/users";
import { GAMES_DATA_TAG, SCHEDULE_TAG } from "../db/cache";

// Botón "Actualizar datos ahora" de /admin/users: salta el caché de 30 min
// para el caso excepcional de un import para revisión. Solo Admin, chequeado
// server-side acá (no alcanza con que la UI esconda el botón).
export async function refreshDataNow(): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false };
  revalidateTag(GAMES_DATA_TAG);
  revalidateTag(SCHEDULE_TAG); // también la lista semanal de "A agendar"
  return { ok: true };
}
