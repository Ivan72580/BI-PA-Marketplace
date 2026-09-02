import { Prisma, GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

// ---------- Contexto de una facility puntual ----------

// A diferencia de resolveFilterNames (que solo resuelve lo que ya está en
// la URL), esto siempre trae el market/región REAL de la facility — hace
// falta para el ranking de posición relativa aunque la URL no traiga
// marketId (ej: se llegó por el selector de Facility con "todos los markets").
async function getFacilityContextImpl(facilityId: string) {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      name: true,
      marketId: true,
      market: { select: { name: true, regionId: true, region: { select: { name: true } } } },
    },
  });
  if (!facility) return null;
  return {
    facilityName: facility.name,
    marketId: facility.marketId,
    marketName: facility.market.name,
    regionId: facility.market.regionId,
    regionName: facility.market.region.name,
  };
}

export const getFacilityContext = cached("getFacilityContext", getFacilityContextImpl);

// ---------- Evolución temporal de una facility puntual ----------

export type FacilitySeriesPoint = {
  bucket: string; // clave ordenable: "YYYY-MM" o "YYYY-MM-DD" (lunes de esa semana)
  label: string; // etiqueta corta para el eje del gráfico
  confirmedGames: number;
  cancelledGames: number;
  confirmationRate: number;
  cancellationRate: number;
};

function startOfWeekUTC(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

// Serie de una facility puntual, agrupada por semana o por mes según se pida,
// acotada a una ventana de fechas — usada por el gráfico de "evolución", que
// adapta la unidad y la ventana según la granularidad activa en la página.
async function getFacilitySeriesImpl(
  facilityId: string,
  unit: "week" | "month",
  windowStart: Date,
  windowEnd: Date
): Promise<FacilitySeriesPoint[]> {
  const games = await prisma.game.findMany({
    where: { facilityId, date: { gte: windowStart, lte: windowEnd } },
    select: { date: true, status: true },
  });

  const map = new Map<string, { confirmed: number; cancelled: number; label: string }>();
  for (const g of games) {
    let key: string;
    let label: string;
    if (unit === "month") {
      const y = g.date.getUTCFullYear();
      const m = g.date.getUTCMonth();
      key = `${y}-${String(m + 1).padStart(2, "0")}`;
      label = new Date(Date.UTC(y, m, 1)).toLocaleDateString("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" });
    } else {
      const weekStart = startOfWeekUTC(g.date);
      key = weekStart.toISOString().slice(0, 10);
      label = weekStart.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    }
    const entry = map.get(key) ?? { confirmed: 0, cancelled: 0, label };
    if (g.status === "CONFIRMED") entry.confirmed += 1;
    else entry.cancelled += 1;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, v]) => {
      const total = v.confirmed + v.cancelled;
      return {
        bucket,
        label: v.label,
        confirmedGames: v.confirmed,
        cancelledGames: v.cancelled,
        confirmationRate: total > 0 ? v.confirmed / total : 0,
        cancellationRate: total > 0 ? v.cancelled / total : 0,
      };
    });
}

export const getFacilitySeries = cached("getFacilitySeries", getFacilitySeriesImpl);

// ---------- Tabla completa por facility ----------

export type FacilitySortKey = "games" | "cancellationRate" | "rating" | "price";

export type FacilityTableRow = {
  facilityId: string;
  marketId: string;
  regionId: string;
  name: string;
  totalGames: number;
  confirmedGames: number;
  confirmationRate: number;
  cancellationRate: number;
  avgRating: number | null;
  ratingCount: number;
  avgPrice: number | null;
  avgLeadTime: number | null;
};

async function getFacilityTableImpl(filters: OverviewFilters, sortBy: FacilitySortKey = "games") {
  const where = buildWhere(filters);
  const cancelledWhere: Prisma.GameWhereInput = { ...where, status: GameStatus.CANCELLED };

  const [totals, cancelledGroups, priceGroups, ratingRows, leadTimeRows] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...where, gamePrice: { not: null } }, _avg: { gamePrice: true } }),
    // Rating ponderado y mediana de lead time necesitan fila por fila, pero
    // filtramos a solo los partidos con ese dato cargado (fracción chica).
    prisma.game.findMany({
      where: { ...where, ratingCount: { gt: 0 } },
      select: { facilityId: true, averageRating: true, ratingCount: true },
    }),
    prisma.game.findMany({
      where: { ...where, confirmationLeadTime: { not: null } },
      select: { facilityId: true, confirmationLeadTime: true },
    }),
  ]);

  type FacilityInfo = { id: string; name: string; marketId: string; market: { regionId: string } };
  const facilityInfoRows = (await prisma.facility.findMany({
    select: { id: true, name: true, marketId: true, market: { select: { regionId: true } } },
  })) as FacilityInfo[];

  const facilityInfoMap = new Map(facilityInfoRows.map((f): [string, typeof f] => [f.id, f]));
  const cancelledMap = new Map<string, number>(cancelledGroups.map((g) => [g.facilityId, Number(g._count._all)]));
  const priceMap = new Map<string, number | null>(priceGroups.map((g) => [g.facilityId, g._avg.gamePrice ?? null]));

  type RatingAgg = { sum: number; count: number };
  const ratingMap = new Map<string, RatingAgg>();
  for (const r of ratingRows) {
    if (r.averageRating == null || !r.ratingCount) continue;
    const entry = ratingMap.get(r.facilityId) ?? { sum: 0, count: 0 };
    entry.sum += r.averageRating * r.ratingCount;
    entry.count += r.ratingCount;
    ratingMap.set(r.facilityId, entry);
  }

  const leadTimeMap = new Map<string, number[]>();
  for (const r of leadTimeRows) {
    if (r.confirmationLeadTime == null) continue;
    const arr = leadTimeMap.get(r.facilityId) ?? [];
    arr.push(r.confirmationLeadTime);
    leadTimeMap.set(r.facilityId, arr);
  }

  function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  let rows: FacilityTableRow[] = totals
    .map((t) => {
      const info = facilityInfoMap.get(t.facilityId);
      if (!info) return null;
      const total = Number(t._count._all);
      const cancelled = cancelledMap.get(t.facilityId) ?? 0;
      const rating = ratingMap.get(t.facilityId);
      return {
        facilityId: t.facilityId,
        marketId: info.marketId,
        regionId: info.market.regionId,
        name: info.name,
        totalGames: total,
        confirmedGames: total - cancelled,
        confirmationRate: total > 0 ? (total - cancelled) / total : 0,
        cancellationRate: total > 0 ? cancelled / total : 0,
        avgRating: rating && rating.count > 0 ? rating.sum / rating.count : null,
        ratingCount: rating?.count ?? 0,
        avgPrice: priceMap.get(t.facilityId) ?? null,
        avgLeadTime: median(leadTimeMap.get(t.facilityId) ?? []), // mediana, no promedio — ver nota en getExtendedMetrics
      };
    })
    .filter((r): r is FacilityTableRow => r !== null);

  const sorters: Record<FacilitySortKey, (a: FacilityTableRow, b: FacilityTableRow) => number> = {
    games: (a, b) => b.totalGames - a.totalGames,
    cancellationRate: (a, b) => b.cancellationRate - a.cancellationRate,
    rating: (a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1),
    price: (a, b) => (b.avgPrice ?? -1) - (a.avgPrice ?? -1),
  };
  rows = rows.sort(sorters[sortBy] ?? sorters.games);

  return rows;
}

export const getFacilityTable = cached("getFacilityTable", getFacilityTableImpl);
