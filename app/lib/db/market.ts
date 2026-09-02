import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, MIN_GAMES_FOR_RANKING, MAX_NAMED_SEGMENTS, type OverviewFilters } from "./shared";

// ---------- Resumen completo por facility ----------
// Una sola pasada de datos que alimenta market share, reputación, precio y
// engagement — en vez de 4 funciones separadas re-consultando lo mismo.

export type ReputationTier = "platinum" | "bueno" | "intermedio" | "a_revisar" | "sin_datos";

export type MarketFacilityRow = {
  facilityId: string;
  name: string;
  marketId: string;
  marketName: string;
  regionId: string;
  regionName: string;
  totalGames: number;
  confirmedGames: number;
  cancelledGames: number;
  confirmationRate: number;
  cancellationRate: number;
  occupancyRate: number;
  conversionRate: number;
  abandonmentRate: number;
  avgPrice: number | null;
  avgDailyPlayers: number | null; // jugadores confirmados totales / días del rango filtrado
  grossProfitEstimate: number | null; // ticket promedio × jugadores promedio por día × días del rango
  medianLeadTime: number | null;
  nearMissCancelledCount: number; // cancelados que llegaron a >=50% del mínimo
  nearMissCancelledPct: number; // % de los cancelados de esa facility
  marketSharePct: number; // % de los confirmados de su market
  reputationScore: number | null;
  reputationTier: ReputationTier;
  regionRank: number | null;
  regionTotal: number;
  marketRank: number | null;
  marketTotal: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function getMarketFacilitySummaryImpl(filters: OverviewFilters): Promise<MarketFacilityRow[]> {
  const where = buildWhere(filters);
  const confirmedWhere = { ...where, status: GameStatus.CONFIRMED };
  const cancelledWhere = { ...where, status: GameStatus.CANCELLED };

  // Días del rango filtrado — solo tiene sentido "jugadores promedio por día"
  // si hay un rango de fechas definido (ej: un mes puntual).
  const daysInRange =
    filters.dateFrom && filters.dateTo
      ? Math.max(1, Math.round((filters.dateTo.getTime() - filters.dateFrom.getTime()) / 86400000) + 1)
      : null;

  const [
    totals,
    cancelledGroups,
    occupancyGroups,
    engagementGroups,
    priceGroups,
    leadTimeRows,
    cancelledDetailRows,
  ] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: confirmedWhere, _sum: { finalPlayers: true, maxPlayers: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where, _sum: { finalPlayers: true, droppedPlayers: true, waitlistPlayers: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...where, gamePrice: { not: null } }, _avg: { gamePrice: true } }),
    prisma.game.findMany({
      where: { ...where, confirmationLeadTime: { not: null } },
      select: { facilityId: true, confirmationLeadTime: true },
    }) as Promise<{ facilityId: string; confirmationLeadTime: number }[]>,
    // Para el indicador "casi llega al mínimo y se cancela": necesita fila
    // por fila de los cancelados (min/final players), no se puede agregar
    // directo vía groupBy porque es una comparación entre dos columnas.
    prisma.game.findMany({
      where: cancelledWhere,
      select: { facilityId: true, finalPlayers: true, minPlayers: true },
    }) as Promise<{ facilityId: string; finalPlayers: number; minPlayers: number }[]>,
  ]);

  type FacilityInfo = { id: string; name: string; marketId: string; market: { name: string; regionId: string; region: { name: string } } };
  const facilityInfoRows = (await prisma.facility.findMany({
    select: { id: true, name: true, marketId: true, market: { select: { name: true, regionId: true, region: { select: { name: true } } } } },
  })) as FacilityInfo[];
  const facilityInfoMap = new Map(facilityInfoRows.map((f): [string, typeof f] => [f.id, f]));

  const cancelledMap = new Map<string, number>(cancelledGroups.map((g) => [g.facilityId, Number(g._count._all)]));
  const occMap = new Map<string, { final: number; max: number }>(
    occupancyGroups.map((g) => [g.facilityId, { final: g._sum.finalPlayers ?? 0, max: g._sum.maxPlayers ?? 0 }])
  );
  const engMap = new Map<string, { final: number; dropped: number; waitlist: number }>(
    engagementGroups.map((g) => [g.facilityId, { final: g._sum.finalPlayers ?? 0, dropped: g._sum.droppedPlayers ?? 0, waitlist: g._sum.waitlistPlayers ?? 0 }])
  );
  const priceMap = new Map<string, number | null>(priceGroups.map((g) => [g.facilityId, g._avg.gamePrice ?? null]));

  const leadTimeByFacility = new Map<string, number[]>();
  for (const r of leadTimeRows) {
    const arr = leadTimeByFacility.get(r.facilityId) ?? [];
    arr.push(r.confirmationLeadTime);
    leadTimeByFacility.set(r.facilityId, arr);
  }

  const nearMissByFacility = new Map<string, number>();
  for (const r of cancelledDetailRows) {
    if (r.minPlayers > 0 && r.finalPlayers >= 0.5 * r.minPlayers) {
      nearMissByFacility.set(r.facilityId, (nearMissByFacility.get(r.facilityId) ?? 0) + 1);
    }
  }

  // Market share: confirmados de cada facility / confirmados totales de su market
  const confirmedByMarket = new Map<string, number>();
  for (const t of totals) {
    const info = facilityInfoMap.get(t.facilityId);
    if (!info) continue;
    const confirmed = Number(t._count._all) - (cancelledMap.get(t.facilityId) ?? 0);
    confirmedByMarket.set(info.marketId, (confirmedByMarket.get(info.marketId) ?? 0) + confirmed);
  }

  // Primera pasada: todas las métricas menos reputación/ranking (necesitan
  // el conjunto completo ya calculado para compararse entre sí).
  type Partial = Omit<MarketFacilityRow, "reputationScore" | "reputationTier" | "regionRank" | "regionTotal" | "marketRank" | "marketTotal">;
  const partialRows: Partial[] = totals
    .map((t) => {
      const info = facilityInfoMap.get(t.facilityId);
      if (!info) return null;
      const total = Number(t._count._all);
      const cancelled = cancelledMap.get(t.facilityId) ?? 0;
      const confirmed = total - cancelled;
      const occ = occMap.get(t.facilityId) ?? { final: 0, max: 0 };
      const eng = engMap.get(t.facilityId) ?? { final: 0, dropped: 0, waitlist: 0 };
      const nearMiss = nearMissByFacility.get(t.facilityId) ?? 0;
      const marketTotal = confirmedByMarket.get(info.marketId) ?? 0;
      const price = priceMap.get(t.facilityId) ?? null;
      const avgDailyPlayers = daysInRange !== null ? occ.final / daysInRange : null;
      const grossProfitEstimate = price !== null && avgDailyPlayers !== null && daysInRange !== null ? price * avgDailyPlayers * daysInRange : null;

      return {
        facilityId: t.facilityId,
        name: info.name,
        marketId: info.marketId,
        marketName: info.market.name,
        regionId: info.market.regionId,
        regionName: info.market.region.name,
        totalGames: total,
        confirmedGames: confirmed,
        cancelledGames: cancelled,
        confirmationRate: total > 0 ? confirmed / total : 0,
        cancellationRate: total > 0 ? cancelled / total : 0,
        occupancyRate: occ.max > 0 ? occ.final / occ.max : 0,
        conversionRate: eng.final + eng.dropped > 0 ? eng.final / (eng.final + eng.dropped) : 0,
        abandonmentRate: eng.final + eng.dropped > 0 ? eng.dropped / (eng.final + eng.dropped) : 0,
        avgPrice: price,
        avgDailyPlayers,
        grossProfitEstimate,
        medianLeadTime: median(leadTimeByFacility.get(t.facilityId) ?? []),
        nearMissCancelledCount: nearMiss,
        nearMissCancelledPct: cancelled > 0 ? nearMiss / cancelled : 0,
        marketSharePct: marketTotal > 0 ? confirmed / marketTotal : 0,
      };
    })
    .filter((r): r is Partial => r !== null);

  // Reputación: score compuesto de las 3 métricas de calidad que confiamos
  // (confirmación, ocupación, conversión) — dejamos afuera precio/revenue
  // (poco confiables) y lead time (mismo motivo). Tiers por z-score contra
  // el resto de la red, no contra números fijos inventados — así "Platinum"
  // solo aparece si de verdad hay un grupo por encima del resto.
  const eligible = partialRows.filter((r) => r.totalGames >= MIN_GAMES_FOR_RANKING);
  const scores = eligible.map((r) => (r.confirmationRate + r.occupancyRate + r.conversionRate) / 3);
  const scoreMean = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
  const scoreVariance = scores.length > 0 ? scores.reduce((s, v) => s + (v - scoreMean) ** 2, 0) / scores.length : 0;
  const scoreStdDev = Math.sqrt(scoreVariance);

  function tierFor(score: number): ReputationTier {
    if (scoreStdDev === 0) return "intermedio";
    const z = (score - scoreMean) / scoreStdDev;
    if (z >= 1.5) return "platinum";
    if (z >= 0.5) return "bueno";
    if (z >= -0.5) return "intermedio";
    return "a_revisar";
  }

  // Ranking por región/market, solo por CANTIDAD DE PARTIDOS CONFIRMADOS —
  // ningún otro parámetro entra acá, tal como se pidió.
  const byRegion = new Map<string, Partial[]>();
  const byMarket = new Map<string, Partial[]>();
  for (const r of partialRows) {
    (byRegion.get(r.regionId) ?? byRegion.set(r.regionId, []).get(r.regionId)!).push(r);
    (byMarket.get(r.marketId) ?? byMarket.set(r.marketId, []).get(r.marketId)!).push(r);
  }
  const regionRankMap = new Map<string, { rank: number; total: number }>();
  for (const [, list] of byRegion) {
    const sorted = [...list].sort((a, b) => b.confirmedGames - a.confirmedGames);
    sorted.forEach((r, i) => regionRankMap.set(r.facilityId, { rank: i + 1, total: sorted.length }));
  }
  const marketRankMap = new Map<string, { rank: number; total: number }>();
  for (const [, list] of byMarket) {
    const sorted = [...list].sort((a, b) => b.confirmedGames - a.confirmedGames);
    sorted.forEach((r, i) => marketRankMap.set(r.facilityId, { rank: i + 1, total: sorted.length }));
  }

  return partialRows.map((r) => {
    const hasEnoughData = r.totalGames >= MIN_GAMES_FOR_RANKING;
    const score = hasEnoughData ? (r.confirmationRate + r.occupancyRate + r.conversionRate) / 3 : null;
    const regionRank = regionRankMap.get(r.facilityId);
    const marketRank = marketRankMap.get(r.facilityId);
    return {
      ...r,
      reputationScore: score,
      reputationTier: score !== null ? tierFor(score) : "sin_datos",
      regionRank: regionRank?.rank ?? null,
      regionTotal: regionRank?.total ?? 0,
      marketRank: marketRank?.rank ?? null,
      marketTotal: marketRank?.total ?? 0,
    };
  });
}

export const getMarketFacilitySummary = cached("getMarketFacilitySummary", getMarketFacilitySummaryImpl);

// ---------- Grupos del Pareto 80/20 (para la torta + subpágina de ranking) ----------

export type ParetoFacility = { facilityId: string; name: string; count: number; priorYearCount: number | null; changePct: number | null };
export type ParetoGroup = { facilityIds: string[]; facilities: ParetoFacility[]; count: number; pct: number };

async function getParetoGroupsImpl(filters: OverviewFilters): Promise<{ top80: ParetoGroup; others: ParetoGroup; total: number }> {
  const where = buildWhere(filters);
  const groups = await prisma.game.groupBy({
    by: ["facilityId"],
    where: { ...where, status: GameStatus.CONFIRMED },
    _count: { _all: true },
  });

  type FacilityNameInfo = { id: string; name: string };
  const facilityIds = groups.map((g) => g.facilityId);
  const facilityInfoRows = (await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, name: true },
  })) as FacilityNameInfo[];
  const nameMap = new Map(facilityInfoRows.map((f): [string, string] => [f.id, f.name]));

  const sorted = groups
    .map((g) => ({ facilityId: g.facilityId, name: nameMap.get(g.facilityId) ?? "—", count: Number(g._count._all) }))
    .sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, f) => s + f.count, 0);

  const top80Rows: typeof sorted = [];
  let cumulative = 0;
  let i = 0;
  for (; i < sorted.length && i < MAX_NAMED_SEGMENTS; i++) {
    if (total > 0 && cumulative / total >= 0.8) break;
    top80Rows.push(sorted[i]);
    cumulative += sorted[i].count;
  }
  const othersRows = sorted.slice(top80Rows.length);
  const othersCount = othersRows.reduce((s, f) => s + f.count, 0);

  // Variación vs. mismo período, año anterior — solo si hay un rango de
  // fechas definido (vista mensual), y solo para el grupo 80% (nombrado
  // individualmente; "Otros" es un solo bloque agregado).
  let priorCountMap = new Map<string, number>();
  if (filters.dateFrom && filters.dateTo && top80Rows.length > 0) {
    const priorDateFrom = new Date(filters.dateFrom);
    priorDateFrom.setUTCFullYear(priorDateFrom.getUTCFullYear() - 1);
    const priorDateTo = new Date(filters.dateTo);
    priorDateTo.setUTCFullYear(priorDateTo.getUTCFullYear() - 1);

    const priorWhere = buildWhere({ ...filters, dateFrom: priorDateFrom, dateTo: priorDateTo });
    const priorGroups = await prisma.game.groupBy({
      by: ["facilityId"],
      where: { ...priorWhere, status: GameStatus.CONFIRMED, facilityId: { in: top80Rows.map((r) => r.facilityId) } },
      _count: { _all: true },
    });
    priorCountMap = new Map(priorGroups.map((g) => [g.facilityId, Number(g._count._all)]));
  }

  const hasDateRange = Boolean(filters.dateFrom && filters.dateTo);
  const top80Facilities: ParetoFacility[] = top80Rows.map((r) => {
    const priorYearCount = hasDateRange ? priorCountMap.get(r.facilityId) ?? 0 : null;
    const changePct = priorYearCount !== null && priorYearCount > 0 ? (r.count - priorYearCount) / priorYearCount : null;
    return { facilityId: r.facilityId, name: r.name, count: r.count, priorYearCount, changePct };
  });
  const othersFacilities: ParetoFacility[] = othersRows.map((r) => ({
    facilityId: r.facilityId, name: r.name, count: r.count, priorYearCount: null, changePct: null,
  }));

  return {
    top80: {
      facilityIds: top80Rows.map((r) => r.facilityId),
      facilities: top80Facilities,
      count: cumulative,
      pct: total > 0 ? cumulative / total : 0,
    },
    others: {
      facilityIds: othersRows.map((r) => r.facilityId),
      facilities: othersFacilities,
      count: othersCount,
      pct: total > 0 ? othersCount / total : 0,
    },
    total,
  };
}

export const getParetoGroups = cached("getParetoGroups", getParetoGroupsImpl);

// ---------- Ranking mensual por facility (subpágina del Pareto) ----------

export type MonthlyFacilityRankingRow = {
  facilityId: string;
  name: string;
  confirmedGames: number;
  cancelledGames: number;
  conversionRate: number;
  medianLeadTime: number | null;
  avgWaitlist: number | null;
  occupancyRate: number;
};

async function getMonthlyFacilityRankingImpl(facilityIds: string[], month: string /* YYYY-MM */): Promise<MonthlyFacilityRankingRow[]> {
  if (facilityIds.length === 0) return [];

  const [year, monthNum] = month.split("-").map(Number);
  const dateFrom = new Date(Date.UTC(year, monthNum - 1, 1));
  const dateTo = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  const where = { facilityId: { in: facilityIds }, date: { gte: dateFrom, lte: dateTo } };
  const confirmedWhere = { ...where, status: GameStatus.CONFIRMED };
  const cancelledWhere = { ...where, status: GameStatus.CANCELLED };

  const [totals, cancelledGroups, occupancyGroups, engagementGroups, leadTimeRows, waitlistGroups] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: confirmedWhere, _sum: { finalPlayers: true, maxPlayers: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where, _sum: { finalPlayers: true, droppedPlayers: true, waitlistPlayers: true } }),
    prisma.game.findMany({
      where: { ...where, confirmationLeadTime: { not: null } },
      select: { facilityId: true, confirmationLeadTime: true },
    }) as Promise<{ facilityId: string; confirmationLeadTime: number }[]>,
    prisma.game.groupBy({ by: ["facilityId"], where, _avg: { waitlistPlayers: true } }),
  ]);

  type FacilityNameInfo = { id: string; name: string };
  const facilityInfoRows = (await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, name: true },
  })) as FacilityNameInfo[];
  const nameMap = new Map(facilityInfoRows.map((f): [string, string] => [f.id, f.name]));

  const cancelledMap = new Map<string, number>(cancelledGroups.map((g) => [g.facilityId, Number(g._count._all)]));
  const occMap = new Map<string, { final: number; max: number }>(
    occupancyGroups.map((g) => [g.facilityId, { final: g._sum.finalPlayers ?? 0, max: g._sum.maxPlayers ?? 0 }])
  );
  const engMap = new Map<string, { final: number; dropped: number; waitlist: number }>(
    engagementGroups.map((g) => [g.facilityId, { final: g._sum.finalPlayers ?? 0, dropped: g._sum.droppedPlayers ?? 0, waitlist: g._sum.waitlistPlayers ?? 0 }])
  );
  const waitlistAvgMap = new Map<string, number | null>(waitlistGroups.map((g) => [g.facilityId, g._avg.waitlistPlayers ?? null]));

  const leadTimeByFacility = new Map<string, number[]>();
  for (const r of leadTimeRows) {
    const arr = leadTimeByFacility.get(r.facilityId) ?? [];
    arr.push(r.confirmationLeadTime);
    leadTimeByFacility.set(r.facilityId, arr);
  }

  return totals
    .map((t) => {
      const cancelled = cancelledMap.get(t.facilityId) ?? 0;
      const total = Number(t._count._all);
      const occ = occMap.get(t.facilityId) ?? { final: 0, max: 0 };
      const eng = engMap.get(t.facilityId) ?? { final: 0, dropped: 0, waitlist: 0 };
      return {
        facilityId: t.facilityId,
        name: nameMap.get(t.facilityId) ?? "—",
        confirmedGames: total - cancelled,
        cancelledGames: cancelled,
        conversionRate: eng.final + eng.dropped > 0 ? eng.final / (eng.final + eng.dropped) : 0,
        medianLeadTime: median(leadTimeByFacility.get(t.facilityId) ?? []),
        avgWaitlist: waitlistAvgMap.get(t.facilityId) ?? null,
        occupancyRate: occ.max > 0 ? occ.final / occ.max : 0,
      };
    })
    .sort((a, b) => b.confirmedGames - a.confirmedGames);
}

export const getMonthlyFacilityRanking = cached("getMonthlyFacilityRanking", getMonthlyFacilityRankingImpl);

// ---------- Ranking de markets (para la vista de Market Share) ----------
// Variación contra el MES INMEDIATAMENTE ANTERIOR (no año anterior) — a
// propósito distinto del Pareto, que compara contra el mismo mes del año
// pasado. Acá interesa el movimiento mes a mes.

export type MarketRankingRow = {
  marketId: string;
  marketName: string;
  confirmedGames: number;
  priorMonthConfirmedGames: number | null;
  changePct: number | null;
};

async function getMarketRankingImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  month: string /* YYYY-MM */
): Promise<MarketRankingRow[]> {
  const [year, monthNum] = month.split("-").map(Number);
  const dateFrom = new Date(Date.UTC(year, monthNum - 1, 1));
  const dateTo = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  const priorAnchor = new Date(Date.UTC(year, monthNum - 2, 1)); // mes calendario anterior
  const priorYear = priorAnchor.getUTCFullYear();
  const priorMonthNum = priorAnchor.getUTCMonth() + 1;
  const priorDateFrom = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
  const priorDateTo = new Date(Date.UTC(priorYear, priorMonthNum, 0, 23, 59, 59));

  const where = buildWhere({ ...filters, dateFrom, dateTo });
  const priorWhere = buildWhere({ ...filters, dateFrom: priorDateFrom, dateTo: priorDateTo });

  type FacilityMarketInfo = { id: string; marketId: string; market: { name: string } };
  const [currentGroups, priorGroups] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId"], where: { ...where, status: GameStatus.CONFIRMED }, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...priorWhere, status: GameStatus.CONFIRMED }, _count: { _all: true } }),
  ]);
  const facilityInfoRows = (await prisma.facility.findMany({
    select: { id: true, marketId: true, market: { select: { name: true } } },
  })) as FacilityMarketInfo[];

  const facilityMarketMap = new Map(facilityInfoRows.map((f): [string, { marketId: string; marketName: string }] => [f.id, { marketId: f.marketId, marketName: f.market.name }]));

  const currentByMarket = new Map<string, number>();
  for (const g of currentGroups) {
    const info = facilityMarketMap.get(g.facilityId);
    if (!info) continue;
    currentByMarket.set(info.marketId, (currentByMarket.get(info.marketId) ?? 0) + Number(g._count._all));
  }
  const priorByMarket = new Map<string, number>();
  for (const g of priorGroups) {
    const info = facilityMarketMap.get(g.facilityId);
    if (!info) continue;
    priorByMarket.set(info.marketId, (priorByMarket.get(info.marketId) ?? 0) + Number(g._count._all));
  }

  const marketNames = new Map<string, string>();
  for (const f of facilityInfoRows) marketNames.set(f.marketId, f.market.name);

  const rows: MarketRankingRow[] = Array.from(currentByMarket.entries()).map(([marketId, confirmedGames]) => {
    const priorMonthConfirmedGames = priorByMarket.get(marketId) ?? 0;
    return {
      marketId,
      marketName: marketNames.get(marketId) ?? "—",
      confirmedGames,
      priorMonthConfirmedGames,
      changePct: priorMonthConfirmedGames > 0 ? (confirmedGames - priorMonthConfirmedGames) / priorMonthConfirmedGames : null,
    };
  });

  return rows.sort((a, b) => b.confirmedGames - a.confirmedGames);
}

export const getMarketRanking = cached("getMarketRanking", getMarketRankingImpl);
