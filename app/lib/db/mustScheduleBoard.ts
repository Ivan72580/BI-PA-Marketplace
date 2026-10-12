import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cachedWeekly } from "./cache";
import { buildWhere } from "./shared";
import { bucketOf } from "../metrics";
import { getLatestDataDate } from "./freshness";
import { todayISO } from "../period";
import {
  MUST_SCHEDULE_WINDOW_MONTHS,
  qualifiesMustSchedule,
  windowStartISO,
  isoWeekKey,
} from "../mustSchedule";

// ---------- "A agendar": slots que conviene sí o sí tener publicados ----------
// Identidad del slot = la de Inventario (facility + día + hora + cancha + formato).
// Definición: ver app/lib/mustSchedule.ts. Ventana: últimos 3 meses hasta el último día
// con datos. La lista se renueva una vez por semana (caché semanal, ver cache.ts).

const MAX_GAMES_READ = 60000;
const MAX_CARDS = 400;
const TREND_DELTA = 0.1; // 10 puntos entre la primera y la segunda mitad de la ventana

export type ScheduleTrend = "up" | "down" | "flat";

export type ScheduleCard = {
  key: string;
  facilityId: string;
  facilityName: string;
  marketName: string;
  dayOfWeek: string;
  time: string;
  fieldName: string | null;
  gameSize: string | null;
  demandRate: number;
  demandBase: number; // confirmados + cancelados por demanda
  confirmed: number;
  trend: ScheduleTrend;
  fillRate: number | null;
  avgPrice: number | null;
  fieldUnavailable: number; // veces que se perdió por cancha no disponible en la ventana
  lastDate: string;
  recent: { date: string; status: "CONFIRMED" | "CANCELLED" }[];
};

export type ScheduleBoard = {
  windowFrom: string;
  windowTo: string;
  weekKey: string;
  cards: ScheduleCard[]; // ordenadas por día de semana y hora
  totalQualifying: number;
  truncated: boolean; // se leyó el tope de partidos: faltan datos de la ventana
};

type Acc = {
  facilityId: string; dayOfWeek: string; time: string; fieldName: string | null; gameSize: string | null;
  confirmed: number; demandCancelled: number; fieldUnavailable: number;
  confirmedEarly: number; baseEarly: number; confirmedLate: number; baseLate: number;
  players: number; capacity: number; priceSum: number; priceN: number; last: number;
  occ: { t: number; date: string; status: "CONFIRMED" | "CANCELLED" }[];
};

type GameRow = {
  facilityId: string; date: Date; time: string; dayOfWeek: string; fieldName: string | null; gameSize: string | null;
  status: string; cancellationCategory: string | null; finalPlayers: number; maxPlayers: number; gamePrice: number | null;
};

const DAY_INDEX: Record<string, number> = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

async function getMustScheduleBoardImpl(
  filters: { regionId?: string; marketId?: string; facilityId?: string },
  _weekKey: string // solo para que la semana sea parte de la clave del caché
): Promise<ScheduleBoard | null> {
  void _weekKey;
  const to = await getLatestDataDate();
  if (!to) return null;
  const from = windowStartISO(to, MUST_SCHEDULE_WINDOW_MONTHS);
  const midT = (Date.parse(`${from}T00:00:00Z`) + Date.parse(`${to}T00:00:00Z`)) / 2;

  const games = (await prisma.game.findMany({
    where: buildWhere({ ...filters, dateFrom: new Date(`${from}T00:00:00.000Z`), dateTo: new Date(`${to}T00:00:00.000Z`) }),
    select: {
      facilityId: true, date: true, time: true, dayOfWeek: true, fieldName: true, gameSize: true, status: true,
      cancellationCategory: true, finalPlayers: true, maxPlayers: true, gamePrice: true,
    },
    orderBy: { date: "desc" },
    take: MAX_GAMES_READ,
  })) as GameRow[];
  const truncated = games.length >= MAX_GAMES_READ;

  const acc = new Map<string, Acc>();
  for (const g of games) {
    const key = `${g.facilityId}|${g.dayOfWeek}|${g.time}|${g.fieldName ?? ""}|${g.gameSize ?? ""}`;
    let a = acc.get(key);
    if (!a) {
      a = {
        facilityId: g.facilityId, dayOfWeek: g.dayOfWeek, time: g.time, fieldName: g.fieldName, gameSize: g.gameSize,
        confirmed: 0, demandCancelled: 0, fieldUnavailable: 0, confirmedEarly: 0, baseEarly: 0, confirmedLate: 0, baseLate: 0,
        players: 0, capacity: 0, priceSum: 0, priceN: 0, last: 0, occ: [],
      };
      acc.set(key, a);
    }
    const t = g.date.getTime();
    if (t > a.last) a.last = t;
    const isConfirmed = g.status === GameStatus.CONFIRMED;
    const bucket = isConfirmed ? null : bucketOf(g.cancellationCategory);
    if (!isConfirmed && bucket === "fieldUnavailable") a.fieldUnavailable += 1;
    // Fuera de la tasa (ni numerador ni denominador): todo lo que no habla de demanda (metrics.ts).
    if (!isConfirmed && bucket !== "demand") {
      if (a.occ.length < 8) a.occ.push({ t, date: g.date.toISOString().slice(0, 10), status: "CANCELLED" });
      continue;
    }
    const early = t < midT;
    if (isConfirmed) {
      a.confirmed += 1;
      a.players += g.finalPlayers;
      a.capacity += g.maxPlayers;
      if (g.gamePrice !== null) { a.priceSum += g.gamePrice; a.priceN += 1; }
      if (early) a.confirmedEarly += 1; else a.confirmedLate += 1;
    } else {
      a.demandCancelled += 1;
    }
    if (early) a.baseEarly += 1; else a.baseLate += 1;
    if (a.occ.length < 8) a.occ.push({ t, date: g.date.toISOString().slice(0, 10), status: isConfirmed ? "CONFIRMED" : "CANCELLED" });
  }

  const qualifying: Acc[] = [];
  for (const a of acc.values()) {
    const base = a.confirmed + a.demandCancelled;
    if (qualifiesMustSchedule(base, base > 0 ? a.confirmed / base : null)) qualifying.push(a);
  }
  qualifying.sort((x, y) => (DAY_INDEX[x.dayOfWeek] ?? 9) - (DAY_INDEX[y.dayOfWeek] ?? 9) || x.time.localeCompare(y.time));
  const top = qualifying.slice(0, MAX_CARDS);

  const ids = [...new Set(top.map((a) => a.facilityId))];
  const facilities = ids.length
    ? ((await prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, market: { select: { name: true } } } })) as { id: string; name: string; market: { name: string } }[])
    : [];
  const fac = new Map(facilities.map((f) => [f.id, f]));

  const cards: ScheduleCard[] = top.map((a) => {
    const base = a.confirmed + a.demandCancelled;
    const early = a.baseEarly > 0 ? a.confirmedEarly / a.baseEarly : null;
    const late = a.baseLate > 0 ? a.confirmedLate / a.baseLate : null;
    const trend: ScheduleTrend = early !== null && late !== null ? (late - early >= TREND_DELTA ? "up" : early - late >= TREND_DELTA ? "down" : "flat") : "flat";
    return {
      key: `${a.facilityId}|${a.dayOfWeek}|${a.time}|${a.fieldName ?? ""}|${a.gameSize ?? ""}`,
      facilityId: a.facilityId,
      facilityName: fac.get(a.facilityId)?.name ?? a.facilityId,
      marketName: fac.get(a.facilityId)?.market.name ?? "",
      dayOfWeek: a.dayOfWeek,
      time: a.time,
      fieldName: a.fieldName,
      gameSize: a.gameSize,
      demandRate: a.confirmed / base,
      demandBase: base,
      confirmed: a.confirmed,
      trend,
      fillRate: a.capacity > 0 ? a.players / a.capacity : null,
      avgPrice: a.priceN > 0 ? a.priceSum / a.priceN : null,
      fieldUnavailable: a.fieldUnavailable,
      lastDate: new Date(a.last).toISOString().slice(0, 10),
      recent: [...a.occ].sort((x, y) => x.t - y.t).map(({ date, status }) => ({ date, status })),
    };
  });

  return { windowFrom: from, windowTo: to, weekKey: _weekKey, cards, totalQualifying: qualifying.length, truncated };
}

const getMustScheduleBoardCached = cachedWeekly("getMustScheduleBoard", getMustScheduleBoardImpl);

export function getMustScheduleBoard(filters: { regionId?: string; marketId?: string; facilityId?: string }): Promise<ScheduleBoard | null> {
  return getMustScheduleBoardCached(filters, isoWeekKey(todayISO()));
}
