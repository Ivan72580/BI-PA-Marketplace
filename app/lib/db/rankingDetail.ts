import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { getFacilitySeries } from "./facility";
import { buildWhere, labelForCancellationCategory } from "./shared";
import { bucketOf } from "../metrics";
import { TREND_PERIODS } from "../rankingFlags";
import type { Locale } from "@/i18n/config";

// Datos extra de las filas del ranking de tasa de cancelación. La tasa del ranking cuenta solo cancelaciones por demanda
// (jugadores insuficientes o sin motivo); el desglose muestra TODAS las cancelaciones y marca cuáles entran en esa tasa.

export type RankingDetail = {
  trend: { label: string; rate: number }[];
  reasons: { label: string; count: number; pct: number; countsInRate: boolean }[];
};

async function detailImpl(
  facilityId: string, from: string, to: string, unit: "week" | "month", windowStart: string, windowEnd: string, locale: Locale,
): Promise<RankingDetail> {
  const [series, groups] = await Promise.all([
    getFacilitySeries(facilityId, unit, new Date(windowStart), new Date(windowEnd), locale),
    prisma.game.groupBy({
      by: ["cancellationCategory"],
      where: { ...buildWhere({ facilityId, dateFrom: new Date(from), dateTo: new Date(to) }), status: GameStatus.CANCELLED },
      _count: { _all: true },
    }),
  ]);
  const total = groups.reduce((s, g) => s + Number(g._count._all), 0);
  const noReason = locale === "en" ? "No reason recorded" : "Sin motivo cargado";
  const reasons = groups
    .map((g) => ({
      label: g.cancellationCategory ? labelForCancellationCategory(g.cancellationCategory, locale) : noReason,
      count: Number(g._count._all),
      pct: total > 0 ? Number(g._count._all) / total : 0,
      countsInRate: bucketOf(g.cancellationCategory) === "demand",
    }))
    .sort((a, b) => b.count - a.count);
  return { trend: series.slice(-TREND_PERIODS).map((p) => ({ label: p.label, rate: p.cancellationRate })), reasons };
}
export const getRankingDetailData = cached("getRankingDetailData", detailImpl);

// Tasa de cancelación por demanda de varias facilities en un período (para "Empeoraron": período anterior).
async function ratesImpl(facilityIds: string[], from: string, to: string): Promise<Record<string, number>> {
  if (facilityIds.length === 0) return {};
  const groups = await prisma.game.groupBy({
    by: ["facilityId", "status", "cancellationCategory"],
    where: { facilityId: { in: facilityIds }, date: { gte: new Date(from), lte: new Date(to) } },
    _count: { _all: true },
  });
  const acc = new Map<string, { base: number; demandCancelled: number }>();
  for (const g of groups) {
    const e = acc.get(g.facilityId) ?? { base: 0, demandCancelled: 0 };
    const n = Number(g._count._all);
    if (g.status === GameStatus.CONFIRMED) e.base += n;
    else if (bucketOf(g.cancellationCategory) === "demand") { e.base += n; e.demandCancelled += n; }
    acc.set(g.facilityId, e);
  }
  const out: Record<string, number> = {};
  for (const [id, e] of acc) if (e.base > 0) out[id] = e.demandCancelled / e.base;
  return out;
}
export const getFacilityDemandCancelRates = cached("getFacilityDemandCancelRates", ratesImpl);
