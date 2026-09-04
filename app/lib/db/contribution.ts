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

// Responde "¿quién explica el cambio?", comparando a cada facility contra SU
// PROPIO comportamiento en el período anterior (no contra un promedio ajeno,
// ni contra un histórico más amplio — específicamente el período con el que
// se está comparando en el resto de la página).
async function getContributionRankingImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  current: { dateFrom: Date; dateTo: Date },
  prior: { dateFrom: Date; dateTo: Date }
): Promise<ContributionRow[]> {
  const baseWhere = buildWhere(filters);
  const minDate = prior.dateFrom < current.dateFrom ? prior.dateFrom : current.dateFrom;
  const maxDate = prior.dateTo > current.dateTo ? prior.dateTo : current.dateTo;

  const games = await prisma.game.findMany({
    where: { ...baseWhere, date: { gte: minDate, lte: maxDate } },
    select: {
      date: true,
      status: true,
      facilityId: true,
      facility: { select: { name: true, marketId: true, market: { select: { regionId: true } } } },
    },
  });

  type Agg = {
    name: string;
    marketId: string;
    regionId: string;
    curTotal: number;
    curCancelled: number;
    priorTotal: number;
    priorCancelled: number;
  };
  const map = new Map<string, Agg>();

  for (const g of games) {
    const inCurrent = g.date >= current.dateFrom && g.date <= current.dateTo;
    const inPrior = g.date >= prior.dateFrom && g.date <= prior.dateTo;
    if (!inCurrent && !inPrior) continue;

    const entry = map.get(g.facilityId) ?? {
      name: g.facility.name,
      marketId: g.facility.marketId,
      regionId: g.facility.market.regionId,
      curTotal: 0,
      curCancelled: 0,
      priorTotal: 0,
      priorCancelled: 0,
    };
    if (inCurrent) {
      entry.curTotal += 1;
      if (g.status === "CANCELLED") entry.curCancelled += 1;
    } else {
      entry.priorTotal += 1;
      if (g.status === "CANCELLED") entry.priorCancelled += 1;
    }
    map.set(g.facilityId, entry);
  }

  const rows: ContributionRow[] = Array.from(map.entries())
    .filter(([, a]) => a.curTotal >= MIN_GAMES_FOR_CONTRIBUTION && a.priorTotal >= MIN_GAMES_FOR_CONTRIBUTION)
    .map(([facilityId, a]) => {
      const priorCancelRate = a.priorCancelled / a.priorTotal;
      const curCancelRate = a.curCancelled / a.curTotal;
      const expectedCancelled = a.curTotal * priorCancelRate;
      const expectedConfirmed = a.curTotal * (1 - priorCancelRate);
      const curConfirmed = a.curTotal - a.curCancelled;
      return {
        facilityId,
        marketId: a.marketId,
        regionId: a.regionId,
        label: a.name,
        excessCancellations: Math.round((a.curCancelled - expectedCancelled) * 10) / 10,
        excessConfirmations: Math.round((curConfirmed - expectedConfirmed) * 10) / 10,
        curCancelRate,
        priorCancelRate,
        curTotal: a.curTotal,
        priorTotal: a.priorTotal,
      };
    });

  return rows;
}

export const getContributionRanking = cached("getContributionRanking", getContributionRankingImpl);

export function generateContributionInsights(rows: ContributionRow[], comparePeriodLabel: string): string[] {
  const MIN_MAGNITUDE = 3; // menos de 3 partidos de diferencia no vale la pena destacarlo
  const insights: string[] = [];

  const worsened = [...rows].filter((r) => r.excessCancellations >= MIN_MAGNITUDE).sort((a, b) => b.excessCancellations - a.excessCancellations)[0];
  if (worsened) {
    insights.push(
      `⚠ ${worsened.label} explica buena parte del cambio: pasó de ${(worsened.priorCancelRate * 100).toFixed(0)}% a ${(worsened.curCancelRate * 100).toFixed(0)}% de cancelación respecto a ${comparePeriodLabel} (+${worsened.excessCancellations.toFixed(1)} cancelaciones más de lo esperado).`
    );
  }

  const improved = [...rows].filter((r) => r.excessCancellations <= -MIN_MAGNITUDE).sort((a, b) => a.excessCancellations - b.excessCancellations)[0];
  if (improved) {
    insights.push(
      `✓ ${improved.label} mejoró notablemente: pasó de ${(improved.priorCancelRate * 100).toFixed(0)}% a ${(improved.curCancelRate * 100).toFixed(0)}% de cancelación respecto a ${comparePeriodLabel} (${improved.excessCancellations.toFixed(1)} cancelaciones menos de lo esperado).`
    );
  }

  return insights;
}
