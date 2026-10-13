import { prisma } from "./prisma";
import { cached } from "./cache";
import { getLatestDataDate } from "./freshness";
import { todayISO } from "../period";
import { MUST_SCHEDULE_WINDOW_MONTHS, windowStartISO } from "../mustSchedule";
import {
  buildSlotStats,
  classifySlots,
  priceByFormat,
  buildWeekPlan,
  buildMonthPlan,
  type PlanGame,
  type ClassifiedSlot,
  type WeekDay,
  type MonthPlan,
} from "../slotPlanCalc";

// ---------- Plan por facility para Pronóstico: próximos 7 días y próximos 30 días ----------
// Una sola lectura de los partidos del facility en la ventana reciente (3 meses, la de
// mustSchedule.ts) alimenta las dos vistas. Las definiciones están en app/lib/slotPlanCalc.ts.
// La base no tiene partidos futuros, así que esto dice qué debería estar agendado según el
// historial, no qué falta agendar. Devuelve datos planos (sin Date): pasa por unstable_cache.

const MAX_GAMES_READ = 20000;

export type FacilityPlan = {
  windowFrom: string;
  windowTo: string;
  today: string;
  gamesRead: number;
  truncated: boolean;
  slots: ClassifiedSlot[];
  gapCount: number;
  week: WeekDay[];
  month: MonthPlan;
};

type Row = {
  date: Date; dayOfWeek: string; time: string; fieldName: string | null; gameSize: string | null; status: string;
  cancellationCategory: string | null; cancellationReasonRaw: string | null; finalPlayers: number; maxPlayers: number; gamePrice: number | null;
};

async function getFacilityPlanImpl(facilityId: string, today: string): Promise<FacilityPlan | null> {
  const to = await getLatestDataDate();
  if (!to) return null;
  const from = windowStartISO(to, MUST_SCHEDULE_WINDOW_MONTHS);

  const rows = (await prisma.game.findMany({
    where: { facilityId, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
    select: {
      date: true, dayOfWeek: true, time: true, fieldName: true, gameSize: true, status: true,
      cancellationCategory: true, cancellationReasonRaw: true, finalPlayers: true, maxPlayers: true, gamePrice: true,
    },
    orderBy: { date: "desc" },
    take: MAX_GAMES_READ,
  })) as Row[];
  if (rows.length === 0) return null;

  const games: PlanGame[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    dayOfWeek: r.dayOfWeek,
    time: r.time,
    fieldName: r.fieldName,
    gameSize: r.gameSize,
    status: r.status === "CONFIRMED" ? "CONFIRMED" : "CANCELLED",
    category: r.cancellationCategory,
    reason: r.cancellationReasonRaw,
    players: r.finalPlayers,
    capacity: r.maxPlayers,
    price: r.gamePrice,
  }));

  const stats = buildSlotStats(games, from, to);
  const { slots, gapCount } = classifySlots(stats, to, priceByFormat(games));
  return {
    windowFrom: from,
    windowTo: to,
    today,
    gamesRead: rows.length,
    truncated: rows.length >= MAX_GAMES_READ,
    slots,
    gapCount,
    week: buildWeekPlan(slots, today, 7),
    month: buildMonthPlan(games, from, to, today, 30),
  };
}

const getFacilityPlanCached = cached("getFacilityPlan", getFacilityPlanImpl);

export function getFacilityPlan(facilityId: string): Promise<FacilityPlan | null> {
  // `today` va como argumento: es parte de la clave del caché y el calendario cambia cada día.
  return getFacilityPlanCached(facilityId, todayISO());
}
