import { prisma } from "./prisma";
import { cached } from "./cache";
import { withDemandOnly } from "../metrics";
import { getLatestDataDate } from "./freshness";
import { average, buildWhere, type OverviewFilters } from "./shared";
import {
  LOOKBACK_BLOCKS, MIN_BLOCKS_FOR_TREND, RANGE_DAYS, addDaysUTC, buildMetric, emptyBlock, parseISODate,
  type BlockTotals, type ForecastRange,
} from "./forecast";
import {
  directionOf, topSlotShifts,
  type Direction, type FacilityDriver, type ReasonShift,
} from "../forecastWatchCalc";

// ---------- Pronóstico: "Facilities a vigilar" y "Facilities en alza" ----------
// Misma proyección por facility que getForecastRiskFacilities (regresión de 12 bloques de 7 o 30
// días sobre partidos publicados y tasa de demanda), pero devolviendo TODAS las facilities con
// historial suficiente, ya clasificadas en baja / alza / estable, más lo necesario para explicar
// el cambio: motivos de cancelación, slots que ganaron o perdieron confirmados y variación del
// tiempo de confirmación. Los textos se arman en la UI (ver forecastWatchCalc.ts).

const DRIVER_DAYS: Record<ForecastRange, number> = { week: 28, month: 60 };
const LIST_SIZE = 5;
const BREAKDOWN_SIZE = 8;

type FilterNoDates = Omit<OverviewFilters, "dateFrom" | "dateTo">;

export type FacilityOutlook = {
  facilityId: string;
  facilityName: string;
  marketId: string;
  marketName: string;
  regionId: string;
  regionName: string;
  /** Partidos agendados (publicados) proyectados para la ventana. */
  predictedGames: number;
  predictedConfirmed: number;
  predictedCancelled: number;
  /** Promedio de confirmados por bloque en el historial, como referencia. */
  avgConfirmed: number;
  /** Confirmados proyectados menos su promedio: cuánto aporta la facility al cambio de la proyección. */
  confirmedDelta: number;
  predictedRate: number;
  /** Tasa de demanda proyectada menos su promedio histórico (0.03 = 3 puntos). */
  rateDelta: number;
  direction: Direction;
};

type CountRow = { facilityId: string; _count: { _all: number } };
type FacilityMeta = { id: string; name: string; market: { id: string; name: string; regionId: string; region: { name: string } } };

async function getForecastOutlookImpl(filters: FilterNoDates, range: ForecastRange, todayISOStr: string): Promise<FacilityOutlook[]> {
  if (filters.facilityId) return [];
  const blockDays = RANGE_DAYS[range];
  const windowEnd = addDaysUTC(parseISODate(todayISOStr), -1);

  const blockRanges = Array.from({ length: LOOKBACK_BLOCKS }, (_, idx) => {
    const blockDateTo = addDaysUTC(windowEnd, -(LOOKBACK_BLOCKS - 1 - idx) * blockDays);
    return { blockDateFrom: addDaysUTC(blockDateTo, -(blockDays - 1)), blockDateTo };
  });

  const [blockGroups, metaRows] = await Promise.all([
    Promise.all(
      blockRanges.map(async ({ blockDateFrom, blockDateTo }) => {
        const blockWhere = buildWhere({ ...filters, dateFrom: blockDateFrom, dateTo: blockDateTo });
        return (await Promise.all([
          prisma.game.groupBy({ by: ["facilityId"], where: blockWhere, _count: { _all: true } }),
          prisma.game.groupBy({ by: ["facilityId"], where: { ...blockWhere, status: "CONFIRMED" }, _count: { _all: true } }),
          prisma.game.groupBy({ by: ["facilityId"], where: withDemandOnly(blockWhere), _count: { _all: true } }),
        ])) as [CountRow[], CountRow[], CountRow[]];
      })
    ),
    prisma.facility.findMany({
      select: { id: true, name: true, market: { select: { id: true, name: true, regionId: true, region: { select: { name: true } } } } },
    }) as Promise<FacilityMeta[]>,
  ]);
  const metaById = new Map(metaRows.map((f): [string, FacilityMeta] => [f.id, f]));

  const byFacility = new Map<string, BlockTotals[]>();
  blockGroups.forEach(([totals, confirmed, demand], idx) => {
    const confirmedBy = new Map(confirmed.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
    const demandBy = new Map(demand.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
    for (const g of totals) {
      const blocks = byFacility.get(g.facilityId) ?? Array.from({ length: LOOKBACK_BLOCKS }, emptyBlock);
      blocks[idx].totalGames = Number(g._count._all);
      blocks[idx].confirmedGames = confirmedBy.get(g.facilityId) ?? 0;
      blocks[idx].demandBase = demandBy.get(g.facilityId) ?? 0;
      byFacility.set(g.facilityId, blocks);
    }
  });

  const out: FacilityOutlook[] = [];
  for (const [facilityId, blocks] of byFacility.entries()) {
    const meta = metaById.get(facilityId);
    if (!meta) continue;
    const withData = blocks.filter((b) => b.totalGames > 0);
    const withDemand = withData.filter((b) => b.demandBase > 0);
    // Sin historial propio suficiente no se proyecta (mismo piso que el resto del Pronóstico).
    if (withData.length < MIN_BLOCKS_FOR_TREND || withDemand.length < MIN_BLOCKS_FOR_TREND) continue;

    const sumTotal = withData.reduce((a, b) => a + b.totalGames, 0);
    const demandShare = sumTotal > 0 ? withData.reduce((a, b) => a + b.demandBase, 0) / sumTotal : 1;
    const gamesMetric = buildMetric(withData.map((b) => b.totalGames), withData.length, "regression", null);
    const rateMetric = buildMetric(withDemand.map((b) => b.confirmedGames / b.demandBase), withDemand.length, "regression", [0, 1]);
    if (gamesMetric.predicted === null || rateMetric.predicted === null || rateMetric.avg === null) continue;

    const predictedConfirmed = gamesMetric.predicted * demandShare * rateMetric.predicted;
    const avgConfirmed = average(withData.map((b) => b.confirmedGames));
    const rateDelta = rateMetric.predicted - rateMetric.avg;
    const confirmedDelta = predictedConfirmed - avgConfirmed;
    const predictedCancelled = Math.round(gamesMetric.predicted) - Math.round(predictedConfirmed);

    out.push({
      facilityId,
      facilityName: meta.name,
      marketId: meta.market.id,
      marketName: meta.market.name,
      regionId: meta.market.regionId,
      regionName: meta.market.region.name,
      predictedGames: gamesMetric.predicted,
      predictedConfirmed,
      predictedCancelled,
      avgConfirmed,
      confirmedDelta,
      predictedRate: rateMetric.predicted,
      rateDelta,
      direction: directionOf(rateDelta, confirmedDelta, predictedCancelled),
    });
  }
  return out;
}

const getForecastOutlook = cached("getForecastOutlook", getForecastOutlookImpl);

// ---------- Por qué cambió: último período vs el anterior ----------

type CatRow = { facilityId: string; cancellationCategory: string | null; _count: { _all: number } };
type SlotRow = { facilityId: string; dayOfWeek: string; time: string; _count: { _all: number } };
type LeadRow = { facilityId: string; _count: { _all: number }; _avg: { confirmationLeadTime: number | null } };

async function getForecastDriversImpl(facilityIds: string[], range: ForecastRange, todayISOStr: string): Promise<Record<string, FacilityDriver>> {
  if (facilityIds.length === 0) return {};
  const days = DRIVER_DAYS[range];
  // Se ancla en el último día con datos cargados (no en "ayer"): si el import se atrasó, el período
  // reciente no queda vacío por culpa del atraso.
  const latest = await getLatestDataDate();
  const end = latest ? parseISODate(latest) : addDaysUTC(parseISODate(todayISOStr), -1);
  const recent = { gte: addDaysUTC(end, -(days - 1)), lte: end };
  const prior = { gte: addDaysUTC(end, -(2 * days - 1)), lte: addDaysUTC(end, -days) };
  const base = { facilityId: { in: facilityIds } };

  const [catR, catP, slotR, slotP, leadR, leadP] = (await Promise.all([
    ...[recent, prior].map((date) => prisma.game.groupBy({ by: ["facilityId", "cancellationCategory"], where: { ...base, date, status: "CANCELLED" }, _count: { _all: true } })),
    ...[recent, prior].map((date) => prisma.game.groupBy({ by: ["facilityId", "dayOfWeek", "time"], where: { ...base, date, status: "CONFIRMED" }, _count: { _all: true } })),
    ...[recent, prior].map((date) => prisma.game.groupBy({ by: ["facilityId"], where: { ...base, date, status: "CONFIRMED" }, _count: { _all: true }, _avg: { confirmationLeadTime: true } })),
  ])) as [CatRow[], CatRow[], SlotRow[], SlotRow[], LeadRow[], LeadRow[]];

  const out: Record<string, FacilityDriver> = {};
  for (const id of facilityIds) {
    const reasonMap = new Map<string, ReasonShift>();
    const bump = (rows: CatRow[], key: "recent" | "prior") => {
      for (const r of rows) {
        if (r.facilityId !== id) continue;
        const category = r.cancellationCategory ?? "UNSPECIFIED";
        const cur = reasonMap.get(category) ?? { category, recent: 0, prior: 0 };
        cur[key] += Number(r._count._all);
        reasonMap.set(category, cur);
      }
    };
    bump(catR, "recent");
    bump(catP, "prior");
    const reasons = [...reasonMap.values()];

    const slotMap = (rows: SlotRow[]) => new Map(rows.filter((r) => r.facilityId === id).map((r): [string, number] => [`${r.dayOfWeek}|${r.time}`, Number(r._count._all)]));
    const { gainers, losers } = topSlotShifts(slotMap(slotR), slotMap(slotP));

    const lead = (rows: LeadRow[]) => rows.find((r) => r.facilityId === id);
    const lr = lead(leadR);
    const lp = lead(leadP);
    out[id] = {
      facilityId: id,
      days,
      confirmed: { recent: Number(lr?._count._all ?? 0), prior: Number(lp?._count._all ?? 0) },
      cancelled: { recent: reasons.reduce((a, r) => a + r.recent, 0), prior: reasons.reduce((a, r) => a + r.prior, 0) },
      reasons,
      slotGainers: gainers,
      slotLosers: losers,
      leadTime: { recent: lr?._avg.confirmationLeadTime ?? null, prior: lp?._avg.confirmationLeadTime ?? null },
    };
  }
  return out;
}

const getForecastDrivers = cached("getForecastDrivers", getForecastDriversImpl);

// ---------- Lo que muestra la página, según el nivel elegido ----------

export type WatchItem = FacilityOutlook & { driver: FacilityDriver | null };
export type WatchRegion = { regionId: string; regionName: string; down: WatchItem[] };

// downCount / upCount: cuántas facilities del filtro proyectan baja / alza en total (las listas muestran las primeras).
export type ForecastWatch = { downCount: number; upCount: number; topDownName: string | null } & (
  | { scope: "network"; regions: WatchRegion[] }
  | { scope: "region" | "market"; down: WatchItem[]; up: WatchItem[]; breakdown: WatchItem[] }
);

/** Baja: peor tasa + más cancelados (por posición, como antes). Alza: más confirmados sobre su promedio. */
function rankDown(items: FacilityOutlook[]): FacilityOutlook[] {
  const byDrop = [...items].sort((a, b) => a.rateDelta - b.rateDelta);
  const byCancelled = [...items].sort((a, b) => b.predictedCancelled - a.predictedCancelled);
  const dropRank = new Map(byDrop.map((c, i) => [c.facilityId, i + 1]));
  const cancelledRank = new Map(byCancelled.map((c, i) => [c.facilityId, i + 1]));
  return [...items].sort((a, b) => (dropRank.get(a.facilityId)! + cancelledRank.get(a.facilityId)!) - (dropRank.get(b.facilityId)! + cancelledRank.get(b.facilityId)!));
}

export async function getForecastWatch(filters: FilterNoDates, range: ForecastRange, todayISOStr: string): Promise<ForecastWatch | null> {
  if (filters.facilityId) return null;
  const outlook = await getForecastOutlook(filters, range, todayISOStr);
  const downAll = rankDown(outlook.filter((o) => o.direction === "down"));
  const upAll = outlook.filter((o) => o.direction === "up").sort((a, b) => b.confirmedDelta - a.confirmedDelta);

  let network: { regionId: string; regionName: string; down: FacilityOutlook[] }[] = [];
  let down: FacilityOutlook[] = [];
  let up: FacilityOutlook[] = [];
  let breakdown: FacilityOutlook[] = [];

  if (!filters.regionId && !filters.marketId) {
    const regions = new Map<string, string>();
    for (const o of outlook) regions.set(o.regionId, o.regionName);
    network = [...regions.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([regionId, regionName]) => ({ regionId, regionName, down: downAll.filter((o) => o.regionId === regionId).slice(0, LIST_SIZE) }));
  } else {
    down = downAll.slice(0, LIST_SIZE);
    up = upAll.slice(0, LIST_SIZE);
    if (filters.marketId) breakdown = [...outlook].sort((a, b) => Math.abs(b.confirmedDelta) - Math.abs(a.confirmedDelta)).slice(0, BREAKDOWN_SIZE);
  }

  const ids = [...new Set([...network.flatMap((r) => r.down), ...down, ...up, ...breakdown].map((o) => o.facilityId))].sort();
  const drivers = await getForecastDrivers(ids, range, todayISOStr);
  const withDriver = (o: FacilityOutlook): WatchItem => ({ ...o, driver: drivers[o.facilityId] ?? null });

  const counts = { downCount: downAll.length, upCount: upAll.length, topDownName: downAll[0]?.facilityName ?? null };
  if (!filters.regionId && !filters.marketId) {
    return { ...counts, scope: "network", regions: network.map((r) => ({ ...r, down: r.down.map(withDriver) })) };
  }
  return {
    ...counts,
    scope: filters.marketId ? "market" : "region",
    down: down.map(withDriver),
    up: up.map(withDriver),
    breakdown: breakdown.map(withDriver),
  };
}
