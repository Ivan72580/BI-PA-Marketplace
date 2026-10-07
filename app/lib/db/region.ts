import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { countsForDemand } from "../metrics";
import { clipPriorToElapsed } from "../period";
import { buildWhere, MIN_GAMES_FOR_RANKING, type OverviewFilters } from "./shared";

// ---------- Ranking de regiones (East/West) ----------
// Mismo criterio que getMarketRanking/getMarketConfirmationRanking en
// market.ts, un nivel más arriba en la jerarquía (Region en vez de Market).
// No existía hasta ahora porque ninguna página necesitaba comparar regiones
// entre sí — Overview mira la red completa, Market compara markets/facilities
// dentro de una región. La vista de Leadership es la primera que sí necesita
// esa comparación de más alto nivel, así que vive en su propio archivo en
// vez de "market.ts" (no es un ranking de markets).

type FacilityRegionInfo = { regionId: string; regionName: string };
type FacilityRegionRow = { id: string; market: { regionId: string; region: { name: string } } };

async function loadFacilityRegionMap(): Promise<Map<string, FacilityRegionInfo>> {
  const rows = (await prisma.facility.findMany({
    select: { id: true, market: { select: { regionId: true, region: { select: { name: true } } } } },
  })) as FacilityRegionRow[];
  return new Map(
    rows.map((f): [string, FacilityRegionInfo] => [f.id, { regionId: f.market.regionId, regionName: f.market.region.name }])
  );
}

export type RegionRankingRow = {
  regionId: string;
  regionName: string;
  confirmedGames: number;
  priorMonthConfirmedGames: number | null;
  changePct: number | null;
};

async function getRegionRankingImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  month: string /* YYYY-MM */
): Promise<RegionRankingRow[]> {
  const [year, monthNum] = month.split("-").map(Number);
  const dateFrom = new Date(Date.UTC(year, monthNum - 1, 1));
  const dateTo = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  const priorAnchor = new Date(Date.UTC(year, monthNum - 2, 1)); // mes calendario anterior
  const priorYear = priorAnchor.getUTCFullYear();
  const priorMonthNum = priorAnchor.getUTCMonth() + 1;
  const priorDateFrom = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
  const priorDateTo = clipPriorToElapsed(priorDateFrom, new Date(Date.UTC(priorYear, priorMonthNum, 0, 23, 59, 59)), dateFrom, dateTo);

  const where = buildWhere({ ...filters, dateFrom, dateTo });
  const priorWhere = buildWhere({ ...filters, dateFrom: priorDateFrom, dateTo: priorDateTo });

  const [currentGroups, priorGroups, facilityRegionMap] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId"], where: { ...where, status: GameStatus.CONFIRMED }, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...priorWhere, status: GameStatus.CONFIRMED }, _count: { _all: true } }),
    loadFacilityRegionMap(),
  ]);

  const currentByRegion = new Map<string, number>();
  for (const g of currentGroups) {
    const info = facilityRegionMap.get(g.facilityId);
    if (!info) continue;
    currentByRegion.set(info.regionId, (currentByRegion.get(info.regionId) ?? 0) + Number(g._count._all));
  }
  const priorByRegion = new Map<string, number>();
  for (const g of priorGroups) {
    const info = facilityRegionMap.get(g.facilityId);
    if (!info) continue;
    priorByRegion.set(info.regionId, (priorByRegion.get(info.regionId) ?? 0) + Number(g._count._all));
  }

  const regionNames = new Map<string, string>();
  for (const info of facilityRegionMap.values()) regionNames.set(info.regionId, info.regionName);

  const rows: RegionRankingRow[] = Array.from(currentByRegion.entries()).map(([regionId, confirmedGames]) => {
    const priorMonthConfirmedGames = priorByRegion.get(regionId) ?? 0;
    return {
      regionId,
      regionName: regionNames.get(regionId) ?? "—",
      confirmedGames,
      priorMonthConfirmedGames,
      changePct: priorMonthConfirmedGames > 0 ? (confirmedGames - priorMonthConfirmedGames) / priorMonthConfirmedGames : null,
    };
  });

  return rows.sort((a, b) => b.confirmedGames - a.confirmedGames);
}

export const getRegionRanking = cached("getRegionRanking", getRegionRankingImpl);

// ---------- Ranking de regiones por variación de tasa de confirmación ----------
// Mismo motivo que en market.ts: volumen no es comparable entre regiones de
// tamaño distinto, tasa de confirmación sí — y es la métrica que la app
// prioriza en toda la aplicación.

export type RegionConfirmationRankingRow = {
  regionId: string;
  regionName: string;
  totalGames: number;
  confirmationRate: number;
  priorConfirmationRate: number | null;
  changePts: number | null;
};

async function getRegionConfirmationRankingImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  month: string /* YYYY-MM */
): Promise<RegionConfirmationRankingRow[]> {
  const [year, monthNum] = month.split("-").map(Number);
  const dateFrom = new Date(Date.UTC(year, monthNum - 1, 1));
  const dateTo = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  const priorAnchor = new Date(Date.UTC(year, monthNum - 2, 1));
  const priorYear = priorAnchor.getUTCFullYear();
  const priorMonthNum = priorAnchor.getUTCMonth() + 1;
  const priorDateFrom = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
  const priorDateTo = clipPriorToElapsed(priorDateFrom, new Date(Date.UTC(priorYear, priorMonthNum, 0, 23, 59, 59)), dateFrom, dateTo);

  const where = buildWhere({ ...filters, dateFrom, dateTo });
  const priorWhere = buildWhere({ ...filters, dateFrom: priorDateFrom, dateTo: priorDateTo });

  const [currentGroups, priorGroups, facilityRegionMap] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId", "status", "cancellationCategory"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId", "status", "cancellationCategory"], where: priorWhere, _count: { _all: true } }),
    loadFacilityRegionMap(),
  ]);

  function tallyByRegion(groups: { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number } }[]) {
    const totals = new Map<string, { confirmed: number; total: number; demandBase: number }>();
    for (const g of groups) {
      const info = facilityRegionMap.get(g.facilityId);
      if (!info) continue;
      const entry = totals.get(info.regionId) ?? { confirmed: 0, total: 0, demandBase: 0 };
      entry.total += Number(g._count._all);
      if (countsForDemand(g.status, g.cancellationCategory)) entry.demandBase += Number(g._count._all);
      if (g.status === GameStatus.CONFIRMED) entry.confirmed += Number(g._count._all);
      totals.set(info.regionId, entry);
    }
    return totals;
  }

  const currentByRegion = tallyByRegion(currentGroups as unknown as { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number } }[]);
  const priorByRegion = tallyByRegion(priorGroups as unknown as { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number } }[]);

  const regionNames = new Map<string, string>();
  for (const info of facilityRegionMap.values()) regionNames.set(info.regionId, info.regionName);

  const rows: RegionConfirmationRankingRow[] = Array.from(currentByRegion.entries())
    .filter(([, cur]) => cur.demandBase >= MIN_GAMES_FOR_RANKING)
    .map(([regionId, cur]) => {
      const prior = priorByRegion.get(regionId);
      const confirmationRate = cur.demandBase > 0 ? cur.confirmed / cur.demandBase : 0;
      const priorConfirmationRate = prior && prior.demandBase >= MIN_GAMES_FOR_RANKING ? prior.confirmed / prior.demandBase : null;
      return {
        regionId,
        regionName: regionNames.get(regionId) ?? "—",
        totalGames: cur.total,
        confirmationRate,
        priorConfirmationRate,
        changePts: priorConfirmationRate !== null ? confirmationRate - priorConfirmationRate : null,
      };
    });

  return rows.sort((a, b) => {
    if (a.changePts === null && b.changePts === null) return b.confirmationRate - a.confirmationRate;
    if (a.changePts === null) return 1;
    if (b.changePts === null) return -1;
    return Math.abs(b.changePts) - Math.abs(a.changePts);
  });
}

export const getRegionConfirmationRanking = cached("getRegionConfirmationRanking", getRegionConfirmationRankingImpl);

// ---------- Comparación región-vs-región para Overview (período arbitrario) ----------
// getRegionRanking/getRegionConfirmationRanking de arriba están atadas a "mes
// calendario vs. mes calendario anterior" (mismo criterio que Market/
// Leadership). Overview no tiene esa restricción — su filtro de tiempo puede
// ser una semana, un trimestre, un año o "todo el histórico" — así que acá
// se recibe el rango actual y el anterior ya resueltos (mismo patrón que
// getOverviewData/getContributionRanking), en vez de un string "YYYY-MM".
// Una sola función en vez de dos (volumen + tasa en la misma fila): con solo
// 2 regiones en la red, tiene más sentido una tarjeta por región con ambos
// datos que dos tablas separadas.
export type RegionComparisonRow = {
  regionId: string;
  regionName: string;
  confirmedGames: number;
  totalGames: number;
  changePct: number | null;
  confirmationRate: number;
  changePts: number | null;
};

async function getRegionComparisonImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo" | "regionId">,
  dateFrom?: Date,
  dateTo?: Date,
  priorDateFrom?: Date,
  priorDateTo?: Date
): Promise<RegionComparisonRow[]> {
  const where = buildWhere({ ...filters, dateFrom, dateTo });
  const priorWhere = priorDateFrom && priorDateTo ? buildWhere({ ...filters, dateFrom: priorDateFrom, dateTo: priorDateTo }) : null;

  const [currentGroups, priorGroups, facilityRegionMap] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId", "status", "cancellationCategory"], where, _count: { _all: true } }),
    priorWhere
      ? prisma.game.groupBy({ by: ["facilityId", "status", "cancellationCategory"], where: priorWhere, _count: { _all: true } })
      : Promise.resolve([]),
    loadFacilityRegionMap(),
  ]);

  function tallyByRegion(groups: { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number } }[]) {
    const totals = new Map<string, { confirmed: number; total: number; demandBase: number }>();
    for (const g of groups) {
      const info = facilityRegionMap.get(g.facilityId);
      if (!info) continue;
      const entry = totals.get(info.regionId) ?? { confirmed: 0, total: 0, demandBase: 0 };
      entry.total += Number(g._count._all);
      if (countsForDemand(g.status, g.cancellationCategory)) entry.demandBase += Number(g._count._all);
      if (g.status === GameStatus.CONFIRMED) entry.confirmed += Number(g._count._all);
      totals.set(info.regionId, entry);
    }
    return totals;
  }

  const currentByRegion = tallyByRegion(currentGroups as unknown as { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number } }[]);
  const priorByRegion = tallyByRegion(priorGroups as unknown as { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number } }[]);

  const regionNames = new Map<string, string>();
  for (const info of facilityRegionMap.values()) regionNames.set(info.regionId, info.regionName);

  const rows: RegionComparisonRow[] = Array.from(currentByRegion.entries()).map(([regionId, cur]) => {
    const prior = priorByRegion.get(regionId) ?? null;
    const confirmationRate = cur.demandBase > 0 ? cur.confirmed / cur.demandBase : 0;
    const priorConfirmationRate = prior && prior.demandBase > 0 ? prior.confirmed / prior.demandBase : null;
    return {
      regionId,
      regionName: regionNames.get(regionId) ?? "—",
      confirmedGames: cur.confirmed,
      totalGames: cur.total,
      changePct: prior && prior.confirmed > 0 ? (cur.confirmed - prior.confirmed) / prior.confirmed : null,
      confirmationRate,
      changePts: priorConfirmationRate !== null ? confirmationRate - priorConfirmationRate : null,
    };
  });

  return rows.sort((a, b) => b.confirmedGames - a.confirmedGames);
}

export const getRegionComparison = cached("getRegionComparison", getRegionComparisonImpl);
