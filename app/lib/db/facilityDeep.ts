import { prisma } from "./prisma";
import { cached } from "./cache";
import { getLatestDataDate } from "./freshness";
import type { Agg, NowGame, Range } from "../facilityNowCalc";
import { aggregateGames } from "../facilityNowCalc";
import {
  deepWindows, deepReadFrom, groupAggregate, monthlyAggregates, reasonCounts, hourOf,
  type GroupAgg, type MonthAgg, type ReasonRow,
} from "../facilityDeepCalc";

// Capas de análisis profundo de facility (oferta, demanda, precio, tendencia): UNA lectura de los partidos de
// los últimos 13 meses y todo el corte en memoria. Se cachea solo el resultado agregado (nunca filas crudas).

const MAX_GAMES_READ = 60000;

export type FacilityDeep = {
  refISO: string;
  windows: { cur: Range; prior: Range };
  cur: Agg;
  prior: Agg;
  /** Hora × día de semana (clave "Monday|20") en la ventana reciente. */
  heat: GroupAgg;
  byWeekday: GroupAgg; // clave: día en inglés (Monday…)
  byFormat: { cur: GroupAgg; prior: GroupAgg };
  byField: GroupAgg; // clave: nombre de cancha ("" = sin dato)
  byHour: GroupAgg; // clave: "HH"
  reasons: ReasonRow[];
  monthly: MonthAgg[];
  truncated: boolean;
};

type Row = {
  date: Date; time: string; dayOfWeek: string; fieldName: string | null; gameSize: string | null; status: "CONFIRMED" | "CANCELLED";
  cancellationCategory: string | null; finalPlayers: number; maxPlayers: number; gamePrice: number | null; waitlistPlayers: number; droppedPlayers: number;
};

async function getFacilityDeepImpl(facilityId: string, refISO: string): Promise<FacilityDeep> {
  const from = deepReadFrom(refISO);
  const rowsRaw = await prisma.game.findMany({
    where: { facilityId, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${refISO}T00:00:00.000Z`) } },
    select: {
      date: true, time: true, dayOfWeek: true, fieldName: true, gameSize: true, status: true, cancellationCategory: true,
      finalPlayers: true, maxPlayers: true, gamePrice: true, waitlistPlayers: true, droppedPlayers: true,
    },
    orderBy: { date: "desc" },
    take: MAX_GAMES_READ,
  });
  const rows = rowsRaw as Row[];
  const games: NowGame[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10), time: r.time, dayOfWeek: (r.dayOfWeek ?? "").trim(), fieldName: r.fieldName, gameSize: r.gameSize,
    status: r.status, category: r.cancellationCategory, players: r.finalPlayers, maxPlayers: r.maxPlayers, price: r.gamePrice,
    waitlist: r.waitlistPlayers, dropped: r.droppedPlayers,
  }));

  const w = deepWindows(refISO);
  return {
    refISO,
    windows: w,
    cur: aggregateGames(games, w.cur),
    prior: aggregateGames(games, w.prior),
    heat: groupAggregate(games, w.cur, (g) => (g.dayOfWeek && g.time ? `${g.dayOfWeek}|${hourOf(g.time)}` : null)),
    byWeekday: groupAggregate(games, w.cur, (g) => g.dayOfWeek || null),
    byFormat: { cur: groupAggregate(games, w.cur, (g) => g.gameSize ?? ""), prior: groupAggregate(games, w.prior, (g) => g.gameSize ?? "") },
    byField: groupAggregate(games, w.cur, (g) => g.fieldName ?? ""),
    byHour: groupAggregate(games, w.cur, (g) => (g.time ? hourOf(g.time) : null)),
    reasons: reasonCounts(games, w.cur, w.prior),
    monthly: monthlyAggregates(games, refISO),
    truncated: rows.length >= MAX_GAMES_READ,
  };
}

const getFacilityDeepCached = cached("getFacilityDeep", getFacilityDeepImpl);

export async function getFacilityDeep(facilityId: string, requestedRef?: string): Promise<FacilityDeep | null> {
  const latest = await getLatestDataDate();
  if (!latest) return null;
  const ref = requestedRef && /^\d{4}-\d{2}-\d{2}$/.test(requestedRef) && requestedRef <= latest ? requestedRef : latest;
  return getFacilityDeepCached(facilityId, ref);
}
