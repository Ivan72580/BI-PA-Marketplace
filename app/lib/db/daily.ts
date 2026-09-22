import { CancellationCategory } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, DAY_ORDER, sortHoursByOperatingDay, labelForCancellationCategory } from "./shared";
import { combineFormatLabel } from "./format";
import { weekdayAbbr } from "./weekday";
import { getDailyTranslator, type DailyTranslator } from "./dailyMessages";
import type { Locale } from "@/i18n/config";

// Página de seguimiento diario: a diferencia de Trends/Market (que agregan
// por período), acá todo está anclado a un día calendario puntual + una
// facility puntual. Este archivo agrupa las 5 consultas que alimentan esa
// página: foto del día, línea base histórica del mismo día de semana,
// evolución reciente, la franja semanal de navegación, y el calendario de
// slots "sí o sí" (metodología propia, distinta de getSlotConsistency).
//
// Las funciones que devuelven texto (dayLabel, insight) reciben `locale`
// como argumento explícito de la función CACHEADA (no lo resuelven ellas
// mismas vía getLocale()) por dos razones:
//   1. `cached()` usa unstable_cache, cuya clave de caché se deriva de los
//      argumentos de la función. Si el locale no fuera un argumento
//      explícito, dos requests con el mismo facilityId+dateISO pero
//      distinto idioma compartirían la MISMA entrada de caché — el primero
//      en pedirla "gana" el idioma para el otro durante los próximos 5
//      minutos.
//   2. Next.js prohíbe leer APIs dinámicas (headers()/cookies()) DENTRO de
//      una función envuelta en unstable_cache. getTranslations()/
//      getLocale() de "next-intl/server" las tocan internamente incluso
//      con locale explícito, así que no se pueden llamar acá adentro — de
//      ahí getDailyTranslator() en ./dailyMessages, que arma el texto leyendo
//      los JSON de mensajes directo, sin ninguna API de request.

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
  organizer: string;
  status: "CONFIRMED" | "CANCELLED";
  minPlayers: number;
  finalPlayers: number;
  maxPlayers: number;
  waitlistPlayers: number;
  droppedPlayers: number;
  playersMissing: number | null;
  cancellationReason: string | null;
  confirmationLeadTime: number | null;
  gamePrice: number | null;
  eventRevenue: number | null;
  revenuePerPlayer: number | null;
  ratingCount: number | null;
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
  avgGamePrice: number | null;
  avgRevenuePerPlayer: number | null;
  avgRating: number | null;
  cancellationBreakdown: { category: string; label: string; count: number }[];
  games: DayGameCard[];
};

type DayRow = {
  id: number;
  time: string;
  organizer: string;
  status: "CONFIRMED" | "CANCELLED";
  minPlayers: number;
  finalPlayers: number;
  maxPlayers: number;
  waitlistPlayers: number;
  droppedPlayers: number;
  playersMissing: number | null;
  gameSize: string | null;
  fieldType: string | null;
  cancellationCategory: CancellationCategory | null;
  confirmationLeadTime: number | null;
  gamePrice: number | null;
  eventRevenue: number | null;
  revenuePerPlayer: number | null;
  ratingCount: number | null;
  averageRating: number | null;
};

async function getDaySnapshotImpl(facilityId: string, dateISO: string, locale: Locale): Promise<DaySummary> {
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
        id: true, time: true, organizer: true, status: true, minPlayers: true, finalPlayers: true, maxPlayers: true,
        waitlistPlayers: true, droppedPlayers: true, playersMissing: true, gameSize: true, fieldType: true,
        cancellationCategory: true, confirmationLeadTime: true, gamePrice: true, eventRevenue: true,
        revenuePerPlayer: true, ratingCount: true, averageRating: true,
      },
    }) as Promise<DayRow[]>,
  ]);

  let confirmed = 0, cancelled = 0, sumFinal = 0, sumMax = 0, sumDropped = 0, revenue = 0;
  let ratingSum = 0, ratingCount = 0, priceSum = 0, priceCount = 0, revPerPlayerSum = 0, revPerPlayerCount = 0;
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
    if (g.gamePrice != null) { priceSum += g.gamePrice; priceCount += 1; }
    if (g.revenuePerPlayer != null) { revPerPlayerSum += g.revenuePerPlayer; revPerPlayerCount += 1; }

    return {
      id: g.id,
      time: g.time,
      formatLabel: combineFormatLabel(g.gameSize, g.fieldType, g.maxPlayers),
      organizer: g.organizer,
      status: g.status,
      minPlayers: g.minPlayers,
      finalPlayers: g.finalPlayers,
      maxPlayers: g.maxPlayers,
      waitlistPlayers: g.waitlistPlayers,
      droppedPlayers: g.droppedPlayers,
      playersMissing: g.playersMissing,
      cancellationReason: g.cancellationCategory ? labelForCancellationCategory(g.cancellationCategory) : null,
      confirmationLeadTime: g.confirmationLeadTime,
      gamePrice: g.gamePrice,
      eventRevenue: g.eventRevenue,
      revenuePerPlayer: g.revenuePerPlayer,
      ratingCount: g.ratingCount,
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
    dayLabel: weekdayAbbr(dow, locale),
    facilityName: facility?.name ?? "",
    totalGames: total,
    confirmedGames: confirmed,
    cancelledGames: cancelled,
    confirmationRate: total > 0 ? confirmed / total : 0,
    cancellationRate: total > 0 ? cancelled / total : 0,
    occupancyRate: sumMax > 0 ? sumFinal / sumMax : 0,
    conversionRate: sumFinal + sumDropped > 0 ? sumFinal / (sumFinal + sumDropped) : 0,
    totalRevenue: revenue,
    avgGamePrice: priceCount > 0 ? priceSum / priceCount : null,
    avgRevenuePerPlayer: revPerPlayerCount > 0 ? revPerPlayerSum / revPerPlayerCount : null,
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
// MISMO día de semana. Sin texto en el resultado (solo números) — no
// necesita locale.

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

async function getDayEvolutionImpl(facilityId: string, dateISO: string, locale: Locale, occurrences = 12): Promise<DayEvolutionPoint[]> {
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

  const dateLocale = locale === "en" ? "en-US" : "es-AR";
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a)).slice(0, occurrences).reverse();
  return dates.map((key) => {
    const e = byDate.get(key)!;
    const total = e.confirmed + e.cancelled;
    const d = parseISODate(key);
    return {
      dateISO: key,
      label: d.toLocaleDateString(dateLocale, { day: "2-digit", month: "short", timeZone: "UTC" }),
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

async function getWeekStripImpl(facilityId: string, dateISO: string, locale: Locale): Promise<WeekStripDay[]> {
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
      dayLabel: weekdayAbbr(dayOfWeekName(d), locale),
      totalGames: total,
      confirmationRate: total > 0 ? e!.confirmed / total : 0,
      hasData: total > 0,
    });
  }
  return days;
}

export const getWeekStrip = cached("getWeekStrip", getWeekStripImpl);

// ---------- Pulso reciente: tasa de confirmación día a día, últimos N días calendario ----------
// A diferencia de getDayEvolution (que sigue el MISMO día de semana, para
// comparar peras con peras), esto es la serie cruda día por día — mezclando
// días de semana — pensada para un sparkline tipo app de trading: da una
// sensación rápida de "cómo viene la facility" en las últimas ~2 semanas,
// no una comparación estadística. Los días sin partidos se omiten (no se
// interpolan con 0), así la línea no muestra caídas falsas por días donde
// simplemente no había nada agendado. Sin texto en el resultado — no
// necesita locale.

export type RecentDailyPoint = { dateISO: string; confirmationRate: number; totalGames: number };

async function getRecentDailyTrendImpl(facilityId: string, dateISO: string, days = 15): Promise<RecentDailyPoint[]> {
  const date = parseISODate(dateISO);
  const windowStart = addDaysUTC(date, -(days - 1));
  const where = buildWhere({ facilityId, dateFrom: windowStart, dateTo: date });

  const rows = (await prisma.game.findMany({ where, select: { date: true, status: true } })) as { date: Date; status: "CONFIRMED" | "CANCELLED" }[];
  const byDate = new Map<string, { confirmed: number; cancelled: number }>();
  for (const g of rows) {
    const key = isoOf(g.date);
    const e = byDate.get(key) ?? { confirmed: 0, cancelled: 0 };
    if (g.status === "CONFIRMED") e.confirmed += 1; else e.cancelled += 1;
    byDate.set(key, e);
  }

  const points: RecentDailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const key = isoOf(addDaysUTC(windowStart, i));
    const e = byDate.get(key);
    if (!e) continue;
    const total = e.confirmed + e.cancelled;
    points.push({ dateISO: key, confirmationRate: total > 0 ? e.confirmed / total : 0, totalGames: total });
  }
  return points;
}

export const getRecentDailyTrend = cached("getRecentDailyTrend", getRecentDailyTrendImpl);

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

// Slots de confirmación altísima o perfecta (≥90%) — resumen de lo que
// muestran sus partidos confirmados en promedio (mismos campos que las
// tarjetas de "Detalle de los partidos del día", pero agregados en vez de
// partido por partido).
export type TopSlotSummary = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  confirmationRate: number;
  totalGames: number;
  confirmedGames: number;
  avgOccupancyRate: number | null;
  avgGamePrice: number | null;
  avgRevenuePerPlayer: number | null;
  avgRating: number | null;
  avgLeadTime: number | null;
};

// Slots a vigilar: o ya son confiables pero vienen cayendo, o todavía no
// llegan al umbral del 55% y no muestran señales de mejora (estancados).
export type StrugglingSlot = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  confirmationRate: number;
  totalGames: number;
  confirmedGames: number;
  reason: "declining" | "stuck_below_threshold";
  insight: string;
};

// ---------- Vista invertida (cancelaciones) ----------
// Misma ventana, mismo query, misma agrupación por slot — es la cara opuesta
// de exactamente los mismos datos, no una metodología nueva. Los umbrales
// numéricos son los mismos (55% / 90% / 35%) aplicados a la tasa de
// cancelación en vez de a la de confirmación, y la tendencia es la inversa
// exacta de `trend` (si la confirmación mejora, la cancelación por
// definición baja) — nunca se recalcula por separado, para que ambas vistas
// jamás puedan quedar inconsistentes entre sí.
export type MustScheduleCancelSlot = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  cancellationRate: number;
  totalGames: number; // ya excluye cancha-no-disponible
  cancelledGames: number;
  trend: "up" | "down" | "flat"; // de la CANCELACIÓN: "up" = empeora
  insight: string;
};

// Los partidos cancelados no tienen rating, revenue ni lead time de
// confirmación (nunca se jugaron), así que en vez de repetir esos 3 campos
// vacíos se muestran los que sí describen un partido que no llegó a
// cerrarse: ocupación alcanzada antes de cancelar, precio (cuando el dato
// existe) y déficit promedio de jugadores respecto del mínimo.
export type TopCancelSlotSummary = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  cancellationRate: number;
  totalGames: number;
  cancelledGames: number;
  avgOccupancyAtCancel: number | null;
  avgGamePrice: number | null;
  avgDeficit: number | null; // promedio de jugadores que faltaron para el mínimo
};

export type StrugglingCancelSlot = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  cancellationRate: number;
  totalGames: number;
  cancelledGames: number;
  reason: "worsening" | "stuck_elevated";
  insight: string;
};

const MUST_SCHEDULE_MIN_RATE = 0.55;
const MUST_SCHEDULE_MIN_SAMPLE = 3; // mínimo dentro de la ventana de 3 meses para que el % sea representativo
const TREND_DELTA = 0.1; // 10 puntos entre la primera y segunda mitad de la ventana para hablar de tendencia
const TOP_SLOT_MIN_RATE = 0.9; // "altísima o perfecta"
const STRUGGLING_MIN_RATE = 0.35; // piso para no listar slots sin señal real de demanda
const MAX_TOP_SLOTS = 8;
const MAX_STRUGGLING_SLOTS = 8;

function buildMustScheduleInsight(t: DailyTranslator, rate: number, total: number, trend: "up" | "down" | "flat", earlyRate: number | null, lateRate: number | null): string {
  const pct = (rate * 100).toFixed(0);
  const base = t("mustScheduleInsight.base", { pct, total });

  if (trend === "up" && earlyRate !== null && lateRate !== null) {
    return t("mustScheduleInsight.up", { base, early: (earlyRate * 100).toFixed(0), late: (lateRate * 100).toFixed(0) });
  }
  if (trend === "down" && earlyRate !== null && lateRate !== null) {
    return t("mustScheduleInsight.down", { base, early: (earlyRate * 100).toFixed(0), late: (lateRate * 100).toFixed(0) });
  }
  return t("mustScheduleInsight.flat", { base });
}

function buildStrugglingInsight(t: DailyTranslator, reason: "declining" | "stuck_below_threshold", rate: number, earlyRate: number | null, lateRate: number | null): string {
  const pct = (rate * 100).toFixed(0);
  if (reason === "declining" && earlyRate !== null && lateRate !== null) {
    return t("strugglingInsight.declining", { early: (earlyRate * 100).toFixed(0), late: (lateRate * 100).toFixed(0) });
  }
  return t("strugglingInsight.stuck", { pct });
}

function buildMustScheduleCancelInsight(t: DailyTranslator, rate: number, total: number, trend: "up" | "down" | "flat", earlyRate: number | null, lateRate: number | null): string {
  const pct = (rate * 100).toFixed(0);
  const base = t("mustScheduleCancelInsight.base", { pct, total });

  if (trend === "down" && earlyRate !== null && lateRate !== null) {
    return t("mustScheduleCancelInsight.down", { base, early: (earlyRate * 100).toFixed(0), late: (lateRate * 100).toFixed(0) });
  }
  if (trend === "up" && earlyRate !== null && lateRate !== null) {
    return t("mustScheduleCancelInsight.up", { base, early: (earlyRate * 100).toFixed(0), late: (lateRate * 100).toFixed(0) });
  }
  return t("mustScheduleCancelInsight.flat", { base });
}

// A diferencia de la versión "confirmados", acá sí sumamos siempre un
// comentario de déficit/abandono cuando hay dato — es la pregunta que más
// importa frente a un horario que cancela mucho: ¿falta gente para llegar al
// mínimo, o se anotan pero después se bajan?
function buildStrugglingCancelInsight(
  t: DailyTranslator,
  reason: "worsening" | "stuck_elevated",
  rate: number,
  earlyRate: number | null,
  lateRate: number | null,
  avgDeficit: number | null,
  avgDropped: number | null
): string {
  const pct = (rate * 100).toFixed(0);
  const base =
    reason === "worsening" && earlyRate !== null && lateRate !== null
      ? t("strugglingCancelInsight.worsening", { early: (earlyRate * 100).toFixed(0), late: (lateRate * 100).toFixed(0) })
      : t("strugglingCancelInsight.stuck", { pct });

  const extra: string[] = [];
  if (avgDeficit !== null) extra.push(t("strugglingCancelInsight.deficitExtra", { n: Math.round(avgDeficit * 10) / 10 }));
  if (avgDropped !== null && avgDropped >= 0.5) extra.push(t("strugglingCancelInsight.droppedExtra", { n: Math.round(avgDropped * 10) / 10 }));

  return extra.length > 0 ? `${base}${t("strugglingCancelInsight.extraSuffix", { extra: extra.join(" y ") })}` : base;
}

type MustScheduleRow = {
  date: Date;
  dayOfWeek: string;
  time: string;
  status: "CONFIRMED" | "CANCELLED";
  gameSize: string | null;
  fieldType: string | null;
  finalPlayers: number;
  maxPlayers: number;
  cancellationCategory: CancellationCategory | null;
  gamePrice: number | null;
  revenuePerPlayer: number | null;
  averageRating: number | null;
  confirmationLeadTime: number | null;
  playersMissing: number | null;
  droppedPlayers: number;
};

type SlotAccumulator = {
  confirmed: number; total: number;
  confirmedEarly: number; totalEarly: number;
  confirmedLate: number; totalLate: number;
  sumFinalConfirmed: number; sumMaxConfirmed: number;
  priceSum: number; priceCount: number;
  revPerPlayerSum: number; revPerPlayerCount: number;
  ratingSum: number; ratingCount: number;
  leadTimeSum: number; leadTimeCount: number;
  // --- lado cancelados: ocupación alcanzada, precio y déficit/abandono ---
  sumFinalCancelled: number; sumMaxCancelled: number;
  cancelPriceSum: number; cancelPriceCount: number;
  deficitSum: number; deficitCount: number;
  droppedSum: number;
};

async function getMustScheduleSlotsImpl(
  facilityId: string,
  dateISO: string,
  locale: Locale
): Promise<{
  days: string[];
  hours: string[];
  cells: MustScheduleSlot[];
  topSlots: TopSlotSummary[];
  strugglingSlots: StrugglingSlot[];
  cancelCells: MustScheduleCancelSlot[];
  topCancelSlots: TopCancelSlotSummary[];
  strugglingCancelSlots: StrugglingCancelSlot[];
}> {
  const t = getDailyTranslator(locale);
  const date = parseISODate(dateISO);
  const windowStart = addMonthsUTC(date, -3);
  const midPoint = new Date((windowStart.getTime() + date.getTime()) / 2);
  const where = buildWhere({ facilityId, dateFrom: windowStart, dateTo: date });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = (await (prisma.game.findMany as any)({
    where,
    select: {
      date: true, dayOfWeek: true, time: true, status: true, gameSize: true, fieldType: true,
      finalPlayers: true, maxPlayers: true, cancellationCategory: true, gamePrice: true,
      revenuePerPlayer: true, averageRating: true, confirmationLeadTime: true,
      playersMissing: true, droppedPlayers: true,
    },
  })) as MustScheduleRow[];

  const hoursSet = new Set<string>();
  const map = new Map<string, SlotAccumulator>();

  for (const g of games) {
    const hour = g.time?.slice(0, 2);
    const day = g.dayOfWeek;
    if (!hour || !day) continue;
    hoursSet.add(hour);
    // Cancha no disponible: fuera del cálculo por completo (ni numerador ni
    // denominador), en las dos direcciones — no es una falla de demanda ni
    // de los jugadores, es un problema operativo ajeno a esta lectura.
    if (g.status === "CANCELLED" && g.cancellationCategory === CancellationCategory.FACILITY_UNAVAILABLE) continue;

    const formatLabel = combineFormatLabel(g.gameSize, g.fieldType, g.maxPlayers);
    const slotKey = `${day}|${hour}|${formatLabel}`;
    const e: SlotAccumulator = map.get(slotKey) ?? {
      confirmed: 0, total: 0, confirmedEarly: 0, totalEarly: 0, confirmedLate: 0, totalLate: 0,
      sumFinalConfirmed: 0, sumMaxConfirmed: 0, priceSum: 0, priceCount: 0,
      revPerPlayerSum: 0, revPerPlayerCount: 0, ratingSum: 0, ratingCount: 0, leadTimeSum: 0, leadTimeCount: 0,
      sumFinalCancelled: 0, sumMaxCancelled: 0, cancelPriceSum: 0, cancelPriceCount: 0,
      deficitSum: 0, deficitCount: 0, droppedSum: 0,
    };
    const isConfirmed = g.status === "CONFIRMED";
    e.total += 1;
    if (isConfirmed) {
      e.confirmed += 1;
      e.sumFinalConfirmed += g.finalPlayers;
      e.sumMaxConfirmed += g.maxPlayers;
      if (g.gamePrice != null) { e.priceSum += g.gamePrice; e.priceCount += 1; }
      if (g.revenuePerPlayer != null) { e.revPerPlayerSum += g.revenuePerPlayer; e.revPerPlayerCount += 1; }
      if (g.averageRating != null) { e.ratingSum += g.averageRating; e.ratingCount += 1; }
      if (g.confirmationLeadTime != null) { e.leadTimeSum += g.confirmationLeadTime; e.leadTimeCount += 1; }
    } else {
      e.sumFinalCancelled += g.finalPlayers;
      e.sumMaxCancelled += g.maxPlayers;
      if (g.gamePrice != null) { e.cancelPriceSum += g.gamePrice; e.cancelPriceCount += 1; }
      if (g.playersMissing != null) { e.deficitSum += g.playersMissing; e.deficitCount += 1; }
      e.droppedSum += g.droppedPlayers;
    }
    if (g.date < midPoint) { e.totalEarly += 1; if (isConfirmed) e.confirmedEarly += 1; }
    else { e.totalLate += 1; if (isConfirmed) e.confirmedLate += 1; }
    map.set(slotKey, e);
  }

  const cells: MustScheduleSlot[] = [];
  const topSlots: TopSlotSummary[] = [];
  const strugglingSlots: StrugglingSlot[] = [];
  const cancelCells: MustScheduleCancelSlot[] = [];
  const topCancelSlots: TopCancelSlotSummary[] = [];
  const strugglingCancelSlots: StrugglingCancelSlot[] = [];

  for (const [slotKey, v] of map.entries()) {
    if (v.total < MUST_SCHEDULE_MIN_SAMPLE) continue;
    const rate = v.confirmed / v.total;
    const [day, hour, formatLabel] = slotKey.split("|");
    const dayLabel = weekdayAbbr(day, locale);
    const hourLabel = `${hour}h`;
    const earlyRate = v.totalEarly > 0 ? v.confirmedEarly / v.totalEarly : null;
    const lateRate = v.totalLate > 0 ? v.confirmedLate / v.totalLate : null;
    let trend: "up" | "down" | "flat" = "flat";
    if (earlyRate !== null && lateRate !== null) {
      if (lateRate - earlyRate >= TREND_DELTA) trend = "up";
      else if (earlyRate - lateRate >= TREND_DELTA) trend = "down";
    }

    if (rate > MUST_SCHEDULE_MIN_RATE) {
      cells.push({
        day, dayLabel, hour: hourLabel, formatLabel,
        confirmationRate: rate, totalGames: v.total, confirmedGames: v.confirmed, trend,
        insight: buildMustScheduleInsight(t, rate, v.total, trend, earlyRate, lateRate),
      });

      if (rate >= TOP_SLOT_MIN_RATE) {
        topSlots.push({
          day, dayLabel, hour: hourLabel, formatLabel,
          confirmationRate: rate, totalGames: v.total, confirmedGames: v.confirmed,
          avgOccupancyRate: v.sumMaxConfirmed > 0 ? v.sumFinalConfirmed / v.sumMaxConfirmed : null,
          avgGamePrice: v.priceCount > 0 ? v.priceSum / v.priceCount : null,
          avgRevenuePerPlayer: v.revPerPlayerCount > 0 ? v.revPerPlayerSum / v.revPerPlayerCount : null,
          avgRating: v.ratingCount > 0 ? v.ratingSum / v.ratingCount : null,
          avgLeadTime: v.leadTimeCount > 0 ? v.leadTimeSum / v.leadTimeCount : null,
        });
      }
      if (trend === "down") {
        strugglingSlots.push({
          day, dayLabel, hour: hourLabel, formatLabel,
          confirmationRate: rate, totalGames: v.total, confirmedGames: v.confirmed,
          reason: "declining",
          insight: buildStrugglingInsight(t, "declining", rate, earlyRate, lateRate),
        });
      }
    } else if (rate >= STRUGGLING_MIN_RATE && trend !== "up") {
      strugglingSlots.push({
        day, dayLabel, hour: hourLabel, formatLabel,
        confirmationRate: rate, totalGames: v.total, confirmedGames: v.confirmed,
        reason: "stuck_below_threshold",
        insight: buildStrugglingInsight(t, "stuck_below_threshold", rate, earlyRate, lateRate),
      });
    }

    // ---- Vista invertida: misma fila de datos, métrica complementaria ----
    // cancellationRate = 1 - rate porque en la ventana ya filtrada solo
    // quedan CONFIRMED/CANCELLED (cancha-no-disponible se excluyó arriba);
    // cancelTrend es el espejo exacto de `trend`, nunca un cálculo aparte.
    const cancelRate = 1 - rate;
    const cancelEarlyRate = earlyRate !== null ? 1 - earlyRate : null;
    const cancelLateRate = lateRate !== null ? 1 - lateRate : null;
    const cancelTrend: "up" | "down" | "flat" = trend === "up" ? "down" : trend === "down" ? "up" : "flat";
    const cancelledCount = v.total - v.confirmed;
    const avgDeficit = v.deficitCount > 0 ? v.deficitSum / v.deficitCount : null;
    const avgDropped = cancelledCount > 0 ? v.droppedSum / cancelledCount : null;

    if (cancelRate > MUST_SCHEDULE_MIN_RATE) {
      cancelCells.push({
        day, dayLabel, hour: hourLabel, formatLabel,
        cancellationRate: cancelRate, totalGames: v.total, cancelledGames: cancelledCount, trend: cancelTrend,
        insight: buildMustScheduleCancelInsight(t, cancelRate, v.total, cancelTrend, cancelEarlyRate, cancelLateRate),
      });

      if (cancelRate >= TOP_SLOT_MIN_RATE) {
        topCancelSlots.push({
          day, dayLabel, hour: hourLabel, formatLabel,
          cancellationRate: cancelRate, totalGames: v.total, cancelledGames: cancelledCount,
          avgOccupancyAtCancel: v.sumMaxCancelled > 0 ? v.sumFinalCancelled / v.sumMaxCancelled : null,
          avgGamePrice: v.cancelPriceCount > 0 ? v.cancelPriceSum / v.cancelPriceCount : null,
          avgDeficit,
        });
      }
      if (cancelTrend === "up") {
        strugglingCancelSlots.push({
          day, dayLabel, hour: hourLabel, formatLabel,
          cancellationRate: cancelRate, totalGames: v.total, cancelledGames: cancelledCount,
          reason: "worsening",
          insight: buildStrugglingCancelInsight(t, "worsening", cancelRate, cancelEarlyRate, cancelLateRate, avgDeficit, avgDropped),
        });
      }
    } else if (cancelRate >= STRUGGLING_MIN_RATE && cancelTrend !== "down") {
      strugglingCancelSlots.push({
        day, dayLabel, hour: hourLabel, formatLabel,
        cancellationRate: cancelRate, totalGames: v.total, cancelledGames: cancelledCount,
        reason: "stuck_elevated",
        insight: buildStrugglingCancelInsight(t, "stuck_elevated", cancelRate, cancelEarlyRate, cancelLateRate, avgDeficit, avgDropped),
      });
    }
  }
  cells.sort((a, b) => b.confirmationRate - a.confirmationRate);
  topSlots.sort((a, b) => b.confirmationRate - a.confirmationRate);
  strugglingSlots.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "declining" ? -1 : 1;
    return b.confirmationRate - a.confirmationRate;
  });
  cancelCells.sort((a, b) => b.cancellationRate - a.cancellationRate);
  topCancelSlots.sort((a, b) => b.cancellationRate - a.cancellationRate);
  strugglingCancelSlots.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "worsening" ? -1 : 1;
    return b.cancellationRate - a.cancellationRate;
  });

  const hours = sortHoursByOperatingDay(Array.from(hoursSet));
  return {
    days: DAY_ORDER.map((d) => weekdayAbbr(d, locale)),
    hours: hours.map((h) => `${h}h`),
    cells,
    topSlots: topSlots.slice(0, MAX_TOP_SLOTS),
    strugglingSlots: strugglingSlots.slice(0, MAX_STRUGGLING_SLOTS),
    cancelCells,
    topCancelSlots: topCancelSlots.slice(0, MAX_TOP_SLOTS),
    strugglingCancelSlots: strugglingCancelSlots.slice(0, MAX_STRUGGLING_SLOTS),
  };
}

export const getMustScheduleSlots = cached("getMustScheduleSlots", getMustScheduleSlotsImpl);
