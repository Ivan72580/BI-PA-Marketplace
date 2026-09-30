import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, MIN_GAMES_FOR_CONTRIBUTION, type OverviewFilters } from "./shared";

export type ContributionRow = {
  facilityId: string;
  marketId: string;
  regionId: string;
  label: string;
  excessCancellations: number; // positivo = canceló más de lo esperado según su propia tasa del período anterior
  excessConfirmations: number; // positivo = confirmó más de lo esperado según su propia tasa del período anterior
  curCancelRate: number;
  priorCancelRate: number;
  curTotal: number;
  priorTotal: number;
};

// Fila de conteo de un groupBy por facility — mismo shape que ya usa
// getDailyRiskFacilitiesImpl en daily.ts para este mismo patrón.
type FacilityCountRow = { facilityId: string; _count: { _all: number } };
type FacilityInfoRow = { id: string; name: string; marketId: string; market: { regionId: string } };

// Responde "¿quién explica el cambio?", comparando a cada facility contra SU
// PROPIO comportamiento en el período anterior (no contra un promedio ajeno,
// ni contra un histórico más amplio — específicamente el período con el que
// se está comparando en el resto de la página).
//
// Antes: un findMany crudo de TODOS los partidos del rango combinado
// (current ∪ prior), con facility/market/región anidados en CADA fila, y el
// conteo por facility hecho en JS. Con la red completa y varios meses de
// historial eso es fácilmente miles de filas viajando desde Neon en cada
// cache-miss — el mismo patrón que infló memoria (OOM en Vercel) y
// transferencia de red (tope mensual de Neon) en getGameReviewSatisfaction.
// Ahora Postgres agrega directamente por facility (groupBy), mismo patrón ya
// probado en getDailyRiskFacilitiesImpl: lo único que viaja son 4 tandas de
// conteos por facility (current/prior × total/cancelado) más una lista chica
// de nombres — nunca una fila por partido.
async function getContributionRankingImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  current: { dateFrom: Date; dateTo: Date },
  prior: { dateFrom: Date; dateTo: Date }
): Promise<ContributionRow[]> {
  const curWhere = buildWhere({ ...filters, dateFrom: current.dateFrom, dateTo: current.dateTo });
  const priorWhere = buildWhere({ ...filters, dateFrom: prior.dateFrom, dateTo: prior.dateTo });

  const [curTotals, curCancelled, priorTotals, priorCancelled, facilityRows] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId"], where: curWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...curWhere, status: "CANCELLED" }, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: priorWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...priorWhere, status: "CANCELLED" }, _count: { _all: true } }),
    prisma.facility.findMany({ select: { id: true, name: true, marketId: true, market: { select: { regionId: true } } } }),
  ]) as [FacilityCountRow[], FacilityCountRow[], FacilityCountRow[], FacilityCountRow[], FacilityInfoRow[]];

  const infoById = new Map(facilityRows.map((f): [string, FacilityInfoRow] => [f.id, f]));
  const curTotalMap = new Map(curTotals.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
  const curCancelledMap = new Map(curCancelled.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
  const priorTotalMap = new Map(priorTotals.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
  const priorCancelledMap = new Map(priorCancelled.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));

  const rows: ContributionRow[] = [];
  for (const [facilityId, curTotal] of curTotalMap.entries()) {
    const priorTotal = priorTotalMap.get(facilityId) ?? 0;
    if (curTotal < MIN_GAMES_FOR_CONTRIBUTION || priorTotal < MIN_GAMES_FOR_CONTRIBUTION) continue;
    const info = infoById.get(facilityId);
    if (!info) continue; // defensivo: no debería pasar, facilityId viene de un Game con FK a Facility

    const curCancelledCount = curCancelledMap.get(facilityId) ?? 0;
    const priorCancelledCount = priorCancelledMap.get(facilityId) ?? 0;
    const priorCancelRate = priorCancelledCount / priorTotal;
    const curCancelRate = curCancelledCount / curTotal;
    const expectedCancelled = curTotal * priorCancelRate;
    const expectedConfirmed = curTotal * (1 - priorCancelRate);
    const curConfirmed = curTotal - curCancelledCount;

    rows.push({
      facilityId,
      marketId: info.marketId,
      regionId: info.market.regionId,
      label: info.name,
      excessCancellations: Math.round((curCancelledCount - expectedCancelled) * 10) / 10,
      excessConfirmations: Math.round((curConfirmed - expectedConfirmed) * 10) / 10,
      curCancelRate,
      priorCancelRate,
      curTotal,
      priorTotal,
    });
  }

  return rows;
}

export const getContributionRanking = cached("getContributionRanking", getContributionRankingImpl);

// `t` se recibe como parámetro en vez de resolverse acá adentro:
// generateContributionInsights NO está envuelta en cached()/unstable_cache
// (a diferencia de generateOverviewInsights en overview.ts) — se llama
// directo desde el Server Component (NetworkOverview.tsx), después de que
// getContributionRanking (la parte cacheada, que solo devuelve números y
// nombres de la base) ya resolvió. Por eso alcanza con pasarle el
// traductor normal de next-intl (getTranslations("Overview")), sin
// necesidad del traductor puro basado en los JSON estáticos.
export function generateContributionInsights(
  rows: ContributionRow[],
  comparePeriodLabel: string,
  t: (key: string, values?: Record<string, string | number>) => string
): string[] {
  const MIN_MAGNITUDE = 3; // menos de 3 partidos de diferencia no vale la pena destacarlo
  const insights: string[] = [];

  const worsened = [...rows].filter((r) => r.excessCancellations >= MIN_MAGNITUDE).sort((a, b) => b.excessCancellations - a.excessCancellations)[0];
  if (worsened) {
    insights.push(
      t("insights.worsened", {
        facility: worsened.label,
        priorRate: (worsened.priorCancelRate * 100).toFixed(0),
        curRate: (worsened.curCancelRate * 100).toFixed(0),
        period: comparePeriodLabel,
        excess: worsened.excessCancellations.toFixed(1),
      })
    );
  }

  const improved = [...rows].filter((r) => r.excessCancellations <= -MIN_MAGNITUDE).sort((a, b) => a.excessCancellations - b.excessCancellations)[0];
  if (improved) {
    insights.push(
      t("insights.improved", {
        facility: improved.label,
        priorRate: (improved.priorCancelRate * 100).toFixed(0),
        curRate: (improved.curCancelRate * 100).toFixed(0),
        period: comparePeriodLabel,
        excess: improved.excessCancellations.toFixed(1),
      })
    );
  }

  return insights;
}
