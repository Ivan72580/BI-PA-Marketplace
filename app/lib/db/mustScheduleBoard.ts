import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cachedWeekly } from "./cache";
import { buildWhere } from "./shared";
import { bucketOf } from "../metrics";
import { getLatestDataDate } from "./freshness";
import { todayISO } from "../period";
import {
  MUST_SCHEDULE_WINDOW_MONTHS,
  MUST_SCHEDULE_MIN_SAMPLE,
  isDemandHealthy,
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

// Marcas rápidas de la vista (botones "Asegurar" / "Evitar"):
//  ASEGURAR = el slot califica, su tasa de demanda es verde (>= GREEN_MIN_RATE, la misma que el semáforo de
//             Pronóstico) y es recurrente (apareció en al menos SECURE_MIN_WEEKS semanas distintas de la ventana).
//  EVITAR   = con muestra suficiente, su tasa de demanda no supera el piso del "sí o sí" (<= 55 %), o tuvo
//             RECENT_CANCEL_MIN cancelaciones (por demanda o por cancha no disponible) en los últimos
//             RECENT_CANCEL_DAYS días. Evitar le gana a Asegurar si coinciden.
// OJO: "Asegurar" acá es "conviene mantenerlo agendado"; en Pronóstico "Asegurar cancha" es "reservar la cancha
// con anticipación". Son marcas distintas.
export const SECURE_MIN_RATE = 0.75;
export const SECURE_MIN_WEEKS = 6;
export const RECENT_CANCEL_DAYS = 28;
export const RECENT_CANCEL_MIN = 2;
const MAX_AVOID_CARDS = 400;

export type ScheduleTrend = "up" | "down" | "flat";
export type ScheduleFocus = "secure" | "avoid";
export type AvoidReason = "lowRate" | "recentCancels";

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
  /** Marca rápida: asegurar / evitar / ninguna. */
  focus: ScheduleFocus | null;
  avoidReason: AvoidReason | null;
  /** Califica como "sí o sí" (las tarjetas "evitar" que no califican solo aparecen al filtrar por Evitar). */
  qualifies: boolean;
  recentCancelled: number; // cancelaciones recientes (demanda o cancha) en los últimos RECENT_CANCEL_DAYS días
  weeks: number; // semanas distintas en que apareció en la ventana
};

export type ScheduleBoard = {
  windowFrom: string;
  windowTo: string;
  weekKey: string;
  cards: ScheduleCard[]; // ordenadas por día de semana y hora
  totalQualifying: number;
  totalSecure: number;
  totalAvoid: number;
  truncated: boolean; // se leyó el tope de partidos: faltan datos de la ventana
};

type Acc = {
  facilityId: string; dayOfWeek: string; time: string; fieldName: string | null; gameSize: string | null;
  confirmed: number; demandCancelled: number; fieldUnavailable: number;
  confirmedEarly: number; baseEarly: number; confirmedLate: number; baseLate: number;
  players: number; capacity: number; priceSum: number; priceN: number; last: number;
  weeks: Set<number>; recentCancelled: number;
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
  const recentFromT = Date.parse(`${to}T00:00:00Z`) - (RECENT_CANCEL_DAYS - 1) * 86_400_000;

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
        players: 0, capacity: 0, priceSum: 0, priceN: 0, last: 0, weeks: new Set<number>(), recentCancelled: 0, occ: [],
      };
      acc.set(key, a);
    }
    const t = g.date.getTime();
    if (t > a.last) a.last = t;
    a.weeks.add(Math.floor((t / 86_400_000 + 3) / 7)); // semanas lunes–domingo
    const isConfirmed = g.status === GameStatus.CONFIRMED;
    const bucket = isConfirmed ? null : bucketOf(g.cancellationCategory);
    if (!isConfirmed && (bucket === "demand" || bucket === "fieldUnavailable") && t >= recentFromT) a.recentCancelled += 1;
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

  type Classified = { a: Acc; base: number; rate: number | null; qualifies: boolean; focus: ScheduleFocus | null; avoidReason: AvoidReason | null };
  const classified: Classified[] = [];
  for (const a of acc.values()) {
    const base = a.confirmed + a.demandCancelled;
    const rate = base > 0 ? a.confirmed / base : null;
    const qualifies = qualifiesMustSchedule(base, rate);
    let avoidReason: AvoidReason | null = null;
    if (base >= MUST_SCHEDULE_MIN_SAMPLE) {
      if (!isDemandHealthy(rate)) avoidReason = "lowRate";
      else if (a.recentCancelled >= RECENT_CANCEL_MIN) avoidReason = "recentCancels";
    }
    const secure = qualifies && rate !== null && rate >= SECURE_MIN_RATE && a.weeks.size >= SECURE_MIN_WEEKS && !avoidReason;
    if (!qualifies && !avoidReason) continue;
    classified.push({ a, base, rate, qualifies, focus: avoidReason ? "avoid" : secure ? "secure" : null, avoidReason });
  }
  const byDayTime = (x: Classified, y: Classified) => (DAY_INDEX[x.a.dayOfWeek] ?? 9) - (DAY_INDEX[y.a.dayOfWeek] ?? 9) || x.a.time.localeCompare(y.a.time);
  const qualifying = classified.filter((c) => c.qualifies).sort(byDayTime);
  const avoidOnly = classified.filter((c) => !c.qualifies).sort(byDayTime);
  const top = [...qualifying.slice(0, MAX_CARDS), ...avoidOnly.slice(0, MAX_AVOID_CARDS)];

  const ids = [...new Set(top.map((c) => c.a.facilityId))];
  const facilities = ids.length
    ? ((await prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, market: { select: { name: true } } } })) as { id: string; name: string; market: { name: string } }[])
    : [];
  const fac = new Map(facilities.map((f) => [f.id, f]));

  const cards: ScheduleCard[] = top.map(({ a, base, rate, qualifies, focus, avoidReason }) => {
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
      demandRate: rate ?? 0,
      demandBase: base,
      confirmed: a.confirmed,
      trend,
      fillRate: a.capacity > 0 ? a.players / a.capacity : null,
      avgPrice: a.priceN > 0 ? a.priceSum / a.priceN : null,
      fieldUnavailable: a.fieldUnavailable,
      lastDate: new Date(a.last).toISOString().slice(0, 10),
      recent: [...a.occ].sort((x, y) => x.t - y.t).map(({ date, status }) => ({ date, status })),
      focus,
      avoidReason,
      qualifies,
      recentCancelled: a.recentCancelled,
      weeks: a.weeks.size,
    };
  });

  return { windowFrom: from, windowTo: to, weekKey: _weekKey, cards,
    totalQualifying: qualifying.length,
    totalSecure: classified.filter((c) => c.focus === "secure").length,
    totalAvoid: classified.filter((c) => c.focus === "avoid").length,
    truncated,
  };
}

const getMustScheduleBoardCached = cachedWeekly("getMustScheduleBoard", getMustScheduleBoardImpl);

export function getMustScheduleBoard(filters: { regionId?: string; marketId?: string; facilityId?: string }): Promise<ScheduleBoard | null> {
  return getMustScheduleBoardCached(filters, isoWeekKey(todayISO()));
}
