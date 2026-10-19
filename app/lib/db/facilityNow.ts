import { prisma } from "./prisma";
import { cached } from "./cache";
import { getLatestDataDate } from "./freshness";
import {
  buildWindows, readFrom, aggregateGames, aggregateCounts, buildSeries, buildAlerts, addDays,
  RECENT_GAMES_DAYS,
  type Agg, type MarketAgg, type NowGame, type NowAlert, type NowPeriod, type NowWindows, type SeriesDay, type CountRow,
} from "../facilityNowCalc";

// Capa "Ahora" del análisis de facility: una sola lectura de los partidos de la facility (desde el inicio del
// mes anterior, ~2 meses) y una agrupada del resto de su market como benchmark; todo lo demás se calcula en
// memoria (facilityNowCalc.ts). Se cachea el resultado agregado, nunca las filas crudas.

const MAX_GAMES_READ = 20000;
const MAX_RECENT_ROWS = 80;

export type FacilityIdentity = { id: string; name: string; marketId: string; marketName: string; regionId: string; regionName: string };

export type FacilityNow = {
  identity: FacilityIdentity;
  latestISO: string; // último día con datos del dataset
  refISO: string; // día de referencia efectivo (≤ latestISO)
  windows: NowWindows;
  periods: Record<NowPeriod, { cur: Agg; prior: Agg; market: { cur: MarketAgg; prior: MarketAgg } | null }>;
  series: SeriesDay[];
  recent: NowGame[]; // últimos RECENT_GAMES_DAYS días, del más nuevo al más viejo
  recentTruncated: boolean;
  alerts: NowAlert[];
};

type Row = {
  date: Date; time: string; dayOfWeek: string; fieldName: string | null; gameSize: string | null; status: "CONFIRMED" | "CANCELLED";
  cancellationCategory: string | null; finalPlayers: number; maxPlayers: number; gamePrice: number | null; waitlistPlayers: number; droppedPlayers: number;
};

function validISO(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

async function getFacilityNowImpl(facilityId: string, requestedRef: string, latestISO: string): Promise<FacilityNow | null> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { id: true, name: true, marketId: true, market: { select: { name: true, regionId: true, region: { select: { name: true } } } } },
  });
  if (!facility) return null;

  const refISO = validISO(requestedRef) && requestedRef <= latestISO ? requestedRef : latestISO;
  const windows = buildWindows(refISO);
  const from = readFrom(refISO);
  const range = { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${refISO}T00:00:00.000Z`) };

  // Cast sobre el valor ya resuelto (ver getDailyRiskFacilitiesImpl): sobre la Promise rompe la inferencia de Prisma.
  const [rowsRaw, marketRaw] = await Promise.all([
    prisma.game.findMany({
      where: { facilityId, date: range },
      select: {
        date: true, time: true, dayOfWeek: true, fieldName: true, gameSize: true, status: true, cancellationCategory: true,
        finalPlayers: true, maxPlayers: true, gamePrice: true, waitlistPlayers: true, droppedPlayers: true,
      },
      orderBy: { date: "desc" },
      take: MAX_GAMES_READ,
    }),
    prisma.game.groupBy({
      by: ["date", "status", "cancellationCategory"],
      where: { facility: { marketId: facility.marketId }, facilityId: { not: facilityId }, date: range },
      _count: { _all: true },
    }),
  ]);
  const rows = rowsRaw as Row[];
  const marketRows = marketRaw as { date: Date; status: "CONFIRMED" | "CANCELLED"; cancellationCategory: string | null; _count: { _all: number } }[];

  const games: NowGame[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10), time: r.time, dayOfWeek: r.dayOfWeek, fieldName: r.fieldName, gameSize: r.gameSize,
    status: r.status, category: r.cancellationCategory, players: r.finalPlayers, maxPlayers: r.maxPlayers, price: r.gamePrice,
    waitlist: r.waitlistPlayers, dropped: r.droppedPlayers,
  }));
  const counts: CountRow[] = marketRows.map((r) => ({ date: r.date.toISOString().slice(0, 10), status: r.status, category: r.cancellationCategory, n: Number(r._count._all) }));
  const hasMarket = counts.length > 0;

  const periods = Object.fromEntries(
    (["day", "week", "month"] as NowPeriod[]).map((p) => [
      p,
      {
        cur: aggregateGames(games, windows[p].cur),
        prior: aggregateGames(games, windows[p].prior),
        market: hasMarket ? { cur: aggregateCounts(counts, windows[p].cur), prior: aggregateCounts(counts, windows[p].prior) } : null,
      },
    ])
  ) as FacilityNow["periods"];

  const series = buildSeries(games, refISO);
  const recentFrom = addDays(refISO, -(RECENT_GAMES_DAYS - 1));
  const recentAll = games
    .filter((g) => g.date >= recentFrom)
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : b.date.localeCompare(a.date)));

  return {
    identity: { id: facility.id, name: facility.name, marketId: facility.marketId, marketName: facility.market.name, regionId: facility.market.regionId, regionName: facility.market.region.name },
    latestISO,
    refISO,
    windows,
    periods,
    series,
    recent: recentAll.slice(0, MAX_RECENT_ROWS),
    recentTruncated: recentAll.length > MAX_RECENT_ROWS,
    alerts: buildAlerts(series, periods.week),
  };
}

const getFacilityNowCached = cached("getFacilityNow", getFacilityNowImpl);

/** `requestedRef` opcional (YYYY-MM-DD); sin él, o si es posterior al último dato, usa el último día con datos. */
export async function getFacilityNow(facilityId: string, requestedRef?: string): Promise<FacilityNow | null> {
  const latest = await getLatestDataDate();
  if (!latest) return null;
  return getFacilityNowCached(facilityId, requestedRef ?? latest, latest);
}
