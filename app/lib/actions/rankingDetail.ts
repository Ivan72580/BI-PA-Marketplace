"use server";

import { requireModule } from "../db/users";
import { getRankingDetailData, type RankingDetail } from "../db/rankingDetail";
import type { Locale } from "@/i18n/config";

// Detalle de una fila del ranking, cargado al desplegarla (no para todas las filas de entrada).
export async function getRankingDetail(input: {
  facilityId: string; from: string; to: string; unit: "week" | "month"; windowStart: string; windowEnd: string; locale: Locale;
}): Promise<RankingDetail | null> {
  if (!(await requireModule("MAGIC", "VIEW"))) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/;
  if (![input.from, input.to, input.windowStart, input.windowEnd].every((d) => iso.test(d))) return null;
  if (input.unit !== "week" && input.unit !== "month") return null;
  try {
    return await getRankingDetailData(input.facilityId, input.from, input.to, input.unit, input.windowStart, input.windowEnd, input.locale === "en" ? "en" : "es");
  } catch {
    return null;
  }
}
