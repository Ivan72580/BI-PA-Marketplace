import { CancellationCategory } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, DAY_ORDER, DAY_LABEL_ES, sortHoursByOperatingDay, labelForCancellationCategory } from "./shared";
import { combineFormatLabel } from "./format";

// Página de seguimiento diario: a diferencia de Trends/Market (que agregan
// por período), acá todo está anclado a un día calendario puntual + una
// facility puntual. Este archivo agrupa las 5 consultas que alimentan esa
// página: foto del día, línea base histórica del mismo día de semana,
// evolución reciente, la franja semanal de navegación, y el calendario de
// slots "sí o sí" (metodología propia, distinta de getSlotConsistency).

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysUTC(d: Date, delta: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + delta);
  return r;
}
function addMonthsUTC(d: Date, delta: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, d.getUTCDate()));
}
const JS_DAY_TO_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayOfWeekName(d: Date): string {
  return JS_DAY_TO_NAME[d.getUTCDay()];
}
// Lunes de la semana que contiene d (mismo criterio que el resto de la app: semana Lunes->Domingo)
function mondayOfUTC(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7;
  return addDaysUTC(d, -day);
}

// ---------- Foto del día: todo lo que pasó en esta facility, este día ----------

export type DayGameCard = {
  id: number;
  time: string;
  formatLabel: string;
  status: "CONFIRMED" | "CANCELLED";
  finalPlayers: number;
  maxPlayers: number;
  waitlistPlayers: number;
  droppedPlayers: number;
  cancellationReason: string | null;
  confirmationLeadTime: number | null;
  eventRevenue: number | null;
  averageRating: number | null;
};

export type DaySummary = {
  dateISO: string;
  dayOfWeek: string;
  dayLabel: string;
  facilityName: string;
  totalGames: number;
  confirmedGames: number;
  cancelledGames: number;
  confirmationRate: number;
  cancellationRate: number;
  occupancyRate: number;
  conversionRate: number;
  totalRevenue: number;
  avgRating: number | null;
  cancellationBreakdown: { category: string; label: string; count: number }[];
  games: DayGameCard[];
};

type DayRow = {
  id: number;
  time: string;
  status: "CONFIRMED" | "CANCELLED";
  finalPlayers: number;
  maxPlayers: number;
  waitlistPlayers: number;
  droppedPlayers: number;
  gameSize: string | null;
  fieldType: string | null;
  cancellationCategory: CancellationCategory | null;
  confirmationLeadTime: number | null;
  eventRevenue: number | null;
  averageRating: number | null;
};

async function getDaySnapshotImpl(facilityId: string, dateISO: string): Promise<DaySummary> {
  const date = parseISODate(dateISO);
  const dow = dayOfWeekName(date);
  const where = buildWhere({ facilityId, dateFrom: date, dateTo: date });

  const [facility, games] = await Promise.all([
    prisma.facility.findUnique({ where: { id: facilityId }, select: { name: true } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.game.findMany as any)({
      where,
      orderBy: { time: "asc" },
      select: {
        id: true, time: true, status: true, finalPlayers: true, maxPlayers: true,
        waitlistPlayers: true, droppedPlayers: true, gameSize: true, fieldType: true,
        cancellationCategory: true, confirmationLeadTime: true, eventRevenue: true, averageRating: true,
      },
    }) as Promise<DayRow[]>,
  ]);

  let confirmed = 0, cancelled = 0, sumFinal = 0, sumMax = 0, sumDropped = 0, revenue = 0, ratingSum = 0, ratingCount = 0;
  const cancelCounts = new Map<string, number>();

  const cards: DayGameCard[] = games.map((g) => {
    if (g.status === "CONFIRMED") {
      confirmed += 1;
      sumFinal += g.finalPlayers;
      sumMax += g.maxPlayers;
    } else {
      cancelled += 1;
      const cat = g.cancellationCategory ?? "OTHER";
      cancelCounts.set(cat, (cancelCounts.get(cat) ?? 0) + 1);
    }
    sumDropped += g.droppedPlayers ?? 0;
    if (g.eventRevenue) revenue += g.eventRevenue;
    if (g.averageRating != null) { ratingSum += g.averageRating; ratingCount += 1; }

    return {
      id: g.id,
      time: g.time,
      formatLabel: combineFormatLabel(g.gameSize, g.fieldType, g.maxPlayers),
      status: g.status,
      finalPlayers: g.finalPlayers,
      maxPlayers: g.maxPlayers,
      waitlistPlayers: g.waitlistPlayers,
      droppedPlayers: g.droppedPlayers,
      cancellationReason: g.cancellationCategory ? labelForCancellationCategory(g.cancellationCategory) : null,
      confirmationLeadTime: g.confirmationLeadTime,
      eventRevenue: g.eventRevenue,
      averageRating: g.averageRating,
    };
  });

  const total = confirmed + cancelled;
  const cancellationBreakdown = Array.from(cancelCounts.entries())
    .map(([category, count]) => ({ category, label: labelForCancellationCategory(category), count }))
    .sort((a, b) => b.count - a.count);

  return {
    dateISO,
    dayOfWeek: dow,
    dayLabel: DAY_LABEL_ES[dow] ?? dow,
    facilityName: facility?.name ?? "",
    totalGames: total,
    confirmedGames: confirmed,
    cancelledGames: cancelled,
    confirmationRate: total > 0 ? confirmed / total : 0,
    cancellationRate: total > 0 ? cancelled / total : 0,
    occupancyRate: sumMax > 0 ? sumFinal / sumMax : 0,
    conversionRate: sumFinal + sumDropped > 0 ? sumFinal / (sumFinal + sumDropped) : 0,
    totalRevenue: revenue,
    avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    cancellationBreakdown,
    games: cards,
  };
}

export const getDaySnapshot = cached("getDaySnapshot", getDaySnapshotImpl);

// ---------- Línea base: mismo día de semana, últimas N ocurrencias previas ----------
// "¿Este martes viene mejor o peor que los martes anteriores en esta
// facility?" — el punto de comparación no es el día calendario anterior
// (eso mezclaría días de semana distintos) sino las ocurrencias previas del
// MISMO día de semana.

export type DayBaseline = {
  occurrences: number;
  avgConfirmationRate: number;
  avgCancellationRate: number;
  avgOccupancyRate: number;
  avgGamesPerOccurrence: number;
};

type BaselineRow = { date: Date; status: "CONFIRMED" | "CANCELLED"; finalPlayers: number; maxPlayers: number; droppedPlayers: number };

async function getDayBaselineImpl(facilityId: string, dateISO: string, lookback = 8): Promise<DayBaseline> {
  const date = parseISODate(dateISO);
  const dow = dayOfWeekName(date);
  const where = { ...buildWhere({ facilityId, dateTo: addDaysUTC(date, -1) }), dayOfWeek: dow };

  const rows = (await prisma.game.findMany({
    where,
    select: { date: true, status: true, finalPlayers: true, maxPlayers: true, droppedPlayers: true },
  })) as BaselineRow[];

  const byDate = new Map<string, { confirmed: number; cancelled: number; sumFinal: number; sumMax: number; sumDropped: number }>();
  for (const g of rows) {
    const key = isoOf(g.date);
    const e = byDate.get(key) ?? { confirmed: 0, cancelled: 0, sumFinal: 0, sumMax: 0, sumDropped: 0 };
    if (g.status === "CONFIRMED") { e.confirmed += 1; e.sumFinal += g.finalPlayers; e.sumMax += g.maxPlayers; }
    else e.cancelled += 1;
    e.sumDropped += g.droppedPlayers ?? 0;
    byDate.set(key, e);
  }

  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a)).slice(0, lookback);
  let confirmed = 0, cancelled = 0, sumMax = 0, sumFinal = 0;
  for (const d of dates) {
    const e = byDate.get(d)!;
    confirmed += e.confirmed; cancelled += e.cancelled; sumMax += e.sumMax; sumFinal += e.sumFinal;
  }
  const total = confirmed + cancelled;

  return {
    occurrences: dates.length,
    avgConfirmationRate: total > 0 ? confirmed / total : 0,
    avgCancellationRate: total > 0 ? cancelled / total : 0,
    avgOccupancyRate: sumMax > 0 ? sumFinal / sumMax : 0,
    avgGamesPerOccurrence: dates.length > 0 ? total / dates.length : 0,
  };
}

export const getDayBaseline = cached("getDayBaseline", getDayBaselineImpl);

// ---------- Evolución: tasa de confirmación en las últimas N ocurrencias del mismo día de semana ----------

export type DayEvolutionPoint = { dateISO: string; label: string; confirmationRate: number; totalGames: number };

async function getDayEvolutionImpl(facilityId: string, dateISO: string, occurrences = 12): Promise<DayEvolutionPoint[]> {
  const date = parseISODate(dateISO);
  const dow = dayOfWeekName(date);
  const where = { ...buildWhere({ facilityId, dateTo: date }), dayOfWeek: dow };

  const rows = (await prisma.game.findMany({
    where,
    select: { date: true, status: true },
  })) as { date: Date; status: "CONFIRMED" | "CANCELLED" }[];

  const byDate = new Map<string, { confirmed: number; cancelled: number }>();
  for (const g of rows) {
    const key = isoOf(g.date);
    const e = byDate.get(key) ?? { confirmed: 0, cancelled: 0 };
    if (g.status === "CONFIRMED") e.confirmed += 1; else e.cancelled += 1;
    byDate.set(key, e);
  }

  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a)).slice(0, occurrences).reverse();
  return dates.map((key) => {
    const e = byDate.get(key)!;
    const total = e.confirmed + e.cancelled;
    const d = parseISODate(key);
    return {
      dateISO: key,
      label: d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" }),
      confirmationRate: total > 0 ? e.confirmed / total : 0,
      totalGames: total,
    };
  });
}

export const getDayEvolution = cached("getDayEvolution", getDayEvolutionImpl);

// ---------- Franja semanal: navegación liviana Lunes->Domingo alrededor del día elegido ----------
// No es un modo de agrupación nuevo — son datos reales de esos 7 días
// puntuales (no un promedio histórico), pensados solo para saltar de un día
// a otro de la misma semana sin perder contexto.

export type WeekStripDay = { dateISO: string; dayLabel: string; totalGames: number; confirmationRate: number; hasData: boolean };

async function getWeekStripImpl(facilityId: string, dateISO: string): Promise<WeekStripDay[]> {
  const date = parseISODate(dateISO);
  const monday = mondayOfUTC(date);
  const sunday = addDaysUTC(monday, 6);
  const where = buildWhere({ facilityId, dateFrom: monday, dateTo: sunday });

  const rows = (await prisma.game.findMany({ where, select: { date: true, status: true } })) as { date: Date; status: "CONFIRMED" | "CANCELLED" }[];
  const byDate = new Map<string, { confirmed: number; cancelled: number }>();
  for (const g of rows) {
    const key = isoOf(g.date);
    const e = byDate.get(key) ?? { confirmed: 0, cancelled: 0 };
    if (g.status === "CONFIRMED") e.confirmed += 1; else e.cancelled += 1;
    byDate.set(key, e);
  }

  const days: WeekStripDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDaysUTC(monday, i);
    const key = isoOf(d);
    const e = byDate.get(key);
    const total = e ? e.confirmed + e.cancelled : 0;
    days.push({
      dateISO: key,
      dayLabel: DAY_LABEL_ES[dayOfWeekName(d)] ?? "",
      totalGames: total,
      confirmationRate: total > 0 ? e!.confirmed / total : 0,
      hasData: total > 0,
    });
  }
  return days;
}

export const getWeekStrip = cached("getWeekStrip", getWeekStripImpl);

// ---------- Calendario "sí o sí": qué slots hay que tener agendados ----------
// Metodología propia y separada de getSlotConsistency (Trends): en vez de
// "en cuántos meses históricos hubo actividad", esto mide la tasa de
// CONFIRMACIÓN real de los últimos 3 meses (ventana móvil, relativa a la
// fecha vista) y exige >55%. Las cancelaciones por cancha no disponible se
// excluyen POR COMPLETO del cálculo (ni suman al numerador ni al
// denominador) porque no reflejan una decisión de demanda — dejarlas afuera
// evita que un problema de disponibilidad de cancha esconda (o abarate
// artificialmente) la tasa real de confirmación de ese slot.

export type MustScheduleSlot = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  confirmationRate: number;
  totalGames: number; // ya excluye cancha-no-disponible
  confirmedGames: number;
  trend: "up" | "down" | "flat";
  insight: string;
};

const MUST_SCHEDULE_MIN_RATE = 0.55;
const MUST_SCHEDULE_MIN_SAMPLE = 3; // mínimo dentro de la ventana de 3 meses para que el % sea representativo
const TREND_DELTA = 0.1; // 10 puntos entre la primera y segunda mitad de la ventana para hablar de tendencia

function buildMustScheduleInsight(rate: number, total: number, trend: "up" | "down" | "flat", earlyRate: number | null, lateRate: number | null): string {
  const pct = (rate * 100).toFixed(0);
  const base = `${pct}% de confirmación en los últimos 3 meses (${total} partidos, sin contar cancelaciones por cancha no disponible)`;

  if (trend === "up" && earlyRate !== null && lateRate !== null) {
    return `${base}. Viene mejorando: de ${(earlyRate * 100).toFixed(0)}% a ${(lateRate * 100).toFixed(0)}% entre la primera y la segunda mitad del período — buena candidata a reforzar en las próximas semanas.`;
  }
  if (trend === "down" && earlyRate !== null && lateRate !== null) {
    return `${base}. Viene bajando: de ${(earlyRate * 100).toFixed(0)}% a ${(lateRate * 100).toFixed(0)}% — todavía cumple el umbral, pero vale la pena confirmar que se sostenga antes de asumirla como fija.`;
  }
  return `${base}. Estable en el período — se espera que se mantenga en las próximas semanas si no cambia el contexto.`;
}

type MustScheduleRow = {
  date: Date;
  dayOfWeek: string;
  time: string;
  status: "CONFIRMED" | "CANCELLED";
  gameSize: string | null;
  fieldType: string | null;
  maxPlayers: number;
  cancellationCategory: CancellationCategory | null;
};

async function getMustScheduleSlotsImpl(facilityId: string, dateISO: string): Promise<{ days: string[]; hours: string[]; cells: MustScheduleSlot[] }> {
  const date = parseISODate(dateISO);
  const windowStart = addMonthsUTC(date, -3);
  const midPoint = new Date((windowStart.getTime() + date.getTime()) / 2);
  const where = buildWhere({ facilityId, dateFrom: windowStart, dateTo: date });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = (await (prisma.game.findMany as any)({
    where,
    select: { date: true, dayOfWeek: true, time: true, status: true, gameSize: true, fieldType: true, maxPlayers: true, cancellationCategory: true },
  })) as MustScheduleRow[];

  const hoursSet = new Set<string>();
  const map = new Map<string, { confirmed: number; total: number; confirmedEarly: number; totalEarly: number; confirmedLate: number; totalLate: number }>();

  for (const g of games) {
    const hour = g.time?.slice(0, 2);
    const day = g.dayOfWeek;
    if (!hour || !day) continue;
    hoursSet.add(hour);
    // Cancha no disponible: fuera del cálculo por completo (ni numerador ni denominador).
    if (g.status === "CANCELLED" && g.cancellationCategory === CancellationCategory.FACILITY_UNAVAILABLE) continue;

    const formatLabel = combineFormatLabel(g.gameSize, g.fieldType, g.maxPlayers);
    const slotKey = `${day}|${hour}|${formatLabel}`;
    const e = map.get(slotKey) ?? { confirmed: 0, total: 0, confirmedEarly: 0, totalEarly: 0, confirmedLate: 0, totalLate: 0 };
    const isConfirmed = g.status === "CONFIRMED";
    e.total += 1;
    if (isConfirmed) e.confirmed += 1;
    if (g.date < midPoint) { e.totalEarly += 1; if (isConfirmed) e.confirmedEarly += 1; }
    else { e.totalLate += 1; if (isConfirmed) e.confirmedLate += 1; }
    map.set(slotKey, e);
  }

  const cells: MustScheduleSlot[] = [];
  for (const [slotKey, v] of map.entries()) {
    if (v.total < MUST_SCHEDULE_MIN_SAMPLE) continue;
    const rate = v.confirmed / v.total;
    if (rate <= MUST_SCHEDULE_MIN_RATE) continue;

    const [day, hour, formatLabel] = slotKey.split("|");
    const earlyRate = v.totalEarly > 0 ? v.confirmedEarly / v.totalEarly : null;
    const lateRate = v.totalLate > 0 ? v.confirmedLate / v.totalLate : null;
    let trend: "up" | "down" | "flat" = "flat";
    if (earlyRate !== null && lateRate !== null) {
      if (lateRate - earlyRate >= TREND_DELTA) trend = "up";
      else if (earlyRate - lateRate >= TREND_DELTA) trend = "down";
    }

    cells.push({
      day,
      dayLabel: DAY_LABEL_ES[day] ?? day,
      hour: `${hour}h`,
      formatLabel,
      confirmationRate: rate,
      totalGames: v.total,
      confirmedGames: v.confirmed,
      trend,
      insight: buildMustScheduleInsight(rate, v.total, trend, earlyRate, lateRate),
    });
  }
  cells.sort((a, b) => b.confirmationRate - a.confirmationRate);

  const hours = sortHoursByOperatingDay(Array.from(hoursSet));
  return {
    days: DAY_ORDER.map((d) => DAY_LABEL_ES[d] ?? d),
    hours: hours.map((h) => `${h}h`),
    cells,
  };
}

export const getMustScheduleSlots = cached("getMustScheduleSlots", getMustScheduleSlotsImpl);
