import { bucketOf } from "./metrics";
import { MUST_SCHEDULE_MIN_SAMPLE, isDemandHealthy } from "./mustSchedule";

// =====================================================================================
// Cálculo puro (sin base de datos) del plan por facility de Pronóstico:
//  - "Próximos 7 días": qué slots deberían estar agendados cada fecha, con un semáforo.
//  - "Próximos 30 días": qué días y horarios son más sólidos, cuáles riesgosos.
//
// Todo parte de la misma foto: los partidos de la facility en la ventana reciente (3 meses,
// la de mustSchedule.ts), identificados como en Inventario (día + hora + cancha + formato).
// La tasa es la tasa de demanda (metrics.ts): confirmados / (confirmados + cancelados por
// falta de jugadores). Cancha no disponible y cancelaciones operativas quedan fuera de la
// tasa y se cuentan aparte.
//
// SEMÁFORO (por tasa de demanda del slot, con al menos MUST_SCHEDULE_MIN_SAMPLE ediciones):
//   VERDE   tasa >= GREEN_MIN_RATE (75 %): confirma sin problemas; la expectativa es confiable.
//   ÁMBAR   tasa entre el piso del sí o sí (55 %) y 75 %: variable. No alcanza para darlo por
//           asegurado ni para sacarlo: conviene seguirlo y empujar la confirmación.
//   ROJO    tasa <= 55 %: no conviene contar con él.
//   Un verde se degrada a ámbar si la segunda mitad de la ventana (lo más reciente) cayó por
//   debajo de 75 %: el promedio de 3 meses ya no describe cómo se comporta hoy.
//
// ASEGURAR CANCHA (marca aparte, independiente del color): el slot se perdió por cancha no
// disponible hace poco y vale la pena reservarlo con anticipación (ver `isWorthFollowing`).
// =====================================================================================

export const GREEN_MIN_RATE = 0.75; // verde: confirma sin problemas (la expectativa es confiable)
export const TREND_DELTA = 0.1; // 10 puntos entre la primera y la segunda mitad de la ventana
export const TREND_MIN_HALF_BASE = 2; // partidos con base de demanda mínimos en cada mitad para hablar de tendencia
export const RECENT_EDITIONS = 6; // últimas N ediciones del slot que se muestran como contexto
export const FOLLOW_RECENT_DAYS = 28; // la última pérdida por cancha tiene que ser de las últimas 4 semanas
export const FOLLOW_MIN_LOSSES_WEAK_EVIDENCE = 2; // con poca muestra de demanda, hace falta que sea recurrente
export const PRICE_ABOVE_AVG_PCT = 0.1; // precio del slot 10 % sobre el promedio del facility en ese formato
export const CELL_MIN_BASE = MUST_SCHEDULE_MIN_SAMPLE; // muestra mínima de una celda día × horario
export const DAY_TIER_DELTA = 0.05; // un día es mejor/peor si se aleja 5 puntos de la tasa del facility
export const DAY_MIN_BASE = 6; // muestra mínima para comparar días de la semana

export type PlanGame = {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  time: string;
  fieldName: string | null;
  gameSize: string | null;
  status: "CONFIRMED" | "CANCELLED";
  category: string | null;
  reason: string | null;
  players: number;
  capacity: number;
  price: number | null;
};

export type Trend = "up" | "down" | "flat";
export type PlanFilter = "green" | "amber" | "red" | "secure"; // filtros de la vista de 7 días
export const PLAN_FILTERS: PlanFilter[] = ["green", "amber", "red", "secure"];
export type Light = "green" | "amber" | "red" | "gray"; // gray: poca muestra, pero con pérdidas recurrentes por cancha

export type SlotStat = {
  key: string;
  dayOfWeek: string;
  time: string;
  fieldName: string | null;
  gameSize: string | null;
  confirmed: number;
  demandCancelled: number;
  fieldLost: { date: string; reason: string | null }[]; // cancelados por cancha no disponible, cronológico
  confirmedEarly: number;
  baseEarly: number;
  confirmedLate: number;
  baseLate: number;
  outcomes: { date: string; ok: boolean }[]; // ediciones con base de demanda, cronológico
  players: number;
  capacity: number;
  priceSum: number;
  priceN: number;
  lastDate: string;
};

const DAY_MS = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const daysBetween = (fromISO: string, toISO: string) => Math.round((t(toISO) - t(fromISO)) / DAY_MS);
export const addDaysISO = (iso: string, n: number) => new Date(t(iso) + n * DAY_MS).toISOString().slice(0, 10);
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayNameOf = (iso: string) => DOW[new Date(t(iso)).getUTCDay()];

export const slotKey = (g: Pick<PlanGame, "dayOfWeek" | "time" | "fieldName" | "gameSize">) =>
  `${g.dayOfWeek}|${g.time}|${g.fieldName ?? ""}|${g.gameSize ?? ""}`;

/** Agrupa los partidos de la ventana por slot. `fromISO`/`toISO` fijan el punto medio para la tendencia. */
export function buildSlotStats(games: PlanGame[], fromISO: string, toISO: string): SlotStat[] {
  const mid = (t(fromISO) + t(toISO)) / 2;
  const sorted = [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const map = new Map<string, SlotStat>();
  for (const g of sorted) {
    const key = slotKey(g);
    let s = map.get(key);
    if (!s) {
      s = {
        key, dayOfWeek: g.dayOfWeek, time: g.time, fieldName: g.fieldName, gameSize: g.gameSize,
        confirmed: 0, demandCancelled: 0, fieldLost: [], confirmedEarly: 0, baseEarly: 0, confirmedLate: 0, baseLate: 0,
        outcomes: [], players: 0, capacity: 0, priceSum: 0, priceN: 0, lastDate: g.date,
      };
      map.set(key, s);
    }
    if (g.date > s.lastDate) s.lastDate = g.date;
    const isConfirmed = g.status === "CONFIRMED";
    const bucket = isConfirmed ? null : bucketOf(g.category);
    if (bucket === "fieldUnavailable") {
      s.fieldLost.push({ date: g.date, reason: g.reason });
      continue;
    }
    if (!isConfirmed && bucket !== "demand") continue; // operativas y plugin: fuera de la tasa
    const early = t(g.date) < mid;
    if (isConfirmed) {
      s.confirmed += 1;
      s.players += g.players;
      s.capacity += g.capacity;
      if (g.price !== null) { s.priceSum += g.price; s.priceN += 1; }
      if (early) s.confirmedEarly += 1; else s.confirmedLate += 1;
    } else {
      s.demandCancelled += 1;
    }
    if (early) s.baseEarly += 1; else s.baseLate += 1;
    s.outcomes.push({ date: g.date, ok: isConfirmed });
  }
  return [...map.values()];
}

export type SlotMetrics = {
  base: number;
  rate: number | null;
  earlyRate: number | null;
  lateRate: number | null;
  trend: Trend;
  recentCancelled: number; // cancelaciones por demanda en las últimas RECENT_EDITIONS ediciones
  recentEditions: number;
  fillRate: number | null;
  avgPrice: number | null;
};

export function slotMetrics(s: SlotStat): SlotMetrics {
  const base = s.confirmed + s.demandCancelled;
  const rate = base > 0 ? s.confirmed / base : null;
  const earlyRate = s.baseEarly >= TREND_MIN_HALF_BASE ? s.confirmedEarly / s.baseEarly : null;
  const lateRate = s.baseLate >= TREND_MIN_HALF_BASE ? s.confirmedLate / s.baseLate : null;
  const trend: Trend =
    earlyRate !== null && lateRate !== null
      ? lateRate - earlyRate >= TREND_DELTA ? "up" : earlyRate - lateRate >= TREND_DELTA ? "down" : "flat"
      : "flat";
  const last = s.outcomes.slice(-RECENT_EDITIONS);
  const recentCancelled = last.filter((o) => !o.ok).length;
  return {
    base, rate, earlyRate, lateRate, trend,
    recentCancelled,
    recentEditions: last.length,
    fillRate: s.capacity > 0 ? s.players / s.capacity : null,
    avgPrice: s.priceN > 0 ? s.priceSum / s.priceN : null,
  };
}

/** ¿Hay que seguir este slot antes de sacarlo de la agenda por cancha no disponible? */
export function isWorthFollowing(s: SlotStat, m: SlotMetrics, toISO: string): boolean {
  if (s.fieldLost.length === 0) return false;
  const last = s.fieldLost[s.fieldLost.length - 1].date;
  if (daysBetween(last, toISO) > FOLLOW_RECENT_DAYS) return false;
  // Con muestra de demanda suficiente, alcanza una pérdida si la demanda es sana; con poca
  // muestra no se sabe si hay demanda, así que se pide que el problema sea recurrente.
  return m.base < MUST_SCHEDULE_MIN_SAMPLE ? s.fieldLost.length >= FOLLOW_MIN_LOSSES_WEAK_EVIDENCE : isDemandHealthy(m.rate);
}

export type PriceNote = {
  slot: number;
  facilityAvg: number;
  pct: number; // (slot - promedio) / promedio
  kind: "above" | "inline" | "below";
};

export type ClassifiedSlot = {
  key: string;
  light: Light;
  secure: boolean; // asegurar cancha: se perdió hace poco por cancha no disponible y vale la pena reservarlo
  dayOfWeek: string;
  time: string;
  fieldName: string | null;
  gameSize: string | null;
  base: number;
  confirmed: number;
  rate: number | null;
  earlyRate: number | null;
  lateRate: number | null;
  trend: Trend;
  recentCancelled: number;
  recentEditions: number;
  fillRate: number | null;
  avgPrice: number | null;
  priceNote: PriceNote | null;
  fieldLost: { date: string; reason: string | null }[];
  recent: { date: string; ok: boolean }[]; // últimas ediciones con base de demanda
  lastDate: string;
};

export type Classification = {
  slots: ClassifiedSlot[];
  /** Slots con menos de MUST_SCHEDULE_MIN_SAMPLE ediciones y sin pérdidas recurrentes por cancha: no se clasifican. */
  thinCount: number;
};

/** Color del semáforo para una tasa y su mitad reciente (null si la muestra no alcanza). */
export function lightOf(base: number, rate: number | null, lateRate: number | null): Light | null {
  if (base < MUST_SCHEDULE_MIN_SAMPLE || rate === null) return null;
  if (rate >= GREEN_MIN_RATE) return lateRate !== null && lateRate < GREEN_MIN_RATE ? "amber" : "green";
  return isDemandHealthy(rate) ? "amber" : "red";
}

/** Precio promedio de los confirmados del facility, por formato (clave "" = sin formato). */
export function priceByFormat(games: PlanGame[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const g of games) {
    if (g.status !== "CONFIRMED" || g.price === null) continue;
    const k = g.gameSize ?? "";
    const a = acc.get(k) ?? { sum: 0, n: 0 };
    a.sum += g.price; a.n += 1;
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, v]) => [k, v.sum / v.n]));
}

function priceNoteOf(avgPrice: number | null, gameSize: string | null, byFormat: Map<string, number>): PriceNote | null {
  const avg = byFormat.get(gameSize ?? "");
  if (avgPrice === null || avg === undefined || avg <= 0) return null;
  const pct = (avgPrice - avg) / avg;
  return { slot: avgPrice, facilityAvg: avg, pct, kind: pct >= PRICE_ABOVE_AVG_PCT ? "above" : pct <= -PRICE_ABOVE_AVG_PCT ? "below" : "inline" };
}

export function classifySlots(stats: SlotStat[], toISO: string, byFormat: Map<string, number>): Classification {
  const slots: ClassifiedSlot[] = [];
  let thinCount = 0;
  for (const s of stats) {
    const m = slotMetrics(s);
    const secure = isWorthFollowing(s, m, toISO);
    const light = lightOf(m.base, m.rate, m.lateRate) ?? (secure ? "gray" : null);
    if (!light) { thinCount += 1; continue; }
    slots.push({
      key: s.key, light, secure, dayOfWeek: s.dayOfWeek, time: s.time, fieldName: s.fieldName, gameSize: s.gameSize,
      base: m.base, confirmed: s.confirmed, rate: m.rate, earlyRate: m.earlyRate, lateRate: m.lateRate, trend: m.trend,
      recentCancelled: m.recentCancelled, recentEditions: m.recentEditions, fillRate: m.fillRate, avgPrice: m.avgPrice,
      priceNote: priceNoteOf(m.avgPrice, s.gameSize, byFormat),
      fieldLost: s.fieldLost.slice(-6),
      recent: s.outcomes.slice(-8),
      lastDate: s.lastDate,
    });
  }
  return { slots, thinCount };
}

// ---------- Próximos 7 días ----------
export type WeekDay = { dateISO: string; dayOfWeek: string; slots: ClassifiedSlot[] };

/** Las próximas `days` fechas desde `todayISO` (incluida), cada una con los slots de su día de semana. */
export function buildWeekPlan(slots: ClassifiedSlot[], todayISO: string, days = 7): WeekDay[] {
  const order: Record<Light, number> = { red: 0, amber: 1, gray: 2, green: 3 };
  return Array.from({ length: days }, (_, i) => {
    const dateISO = addDaysISO(todayISO, i);
    const dayOfWeek = dayNameOf(dateISO);
    return {
      dateISO,
      dayOfWeek,
      slots: slots.filter((s) => s.dayOfWeek === dayOfWeek).sort((a, b) => a.time.localeCompare(b.time) || order[a.light] - order[b.light]),
    };
  });
}

// ---------- Próximos 30 días ----------
export type DayTier = "better" | "typical" | "weaker" | "insufficient";

export type WeekdayStat = {
  dayOfWeek: string;
  confirmed: number;
  base: number;
  rate: number | null;
  trend: Trend;
  tier: DayTier;
  occurrences: number; // fechas de ese día dentro del período
  fieldLost: number;
};

export type CellBand = "green" | "amber" | "red" | "thin";
export type MatrixCell = { dayOfWeek: string; time: string; confirmed: number; base: number; rate: number | null; trend: Trend; fieldLost: number; band: CellBand };

export type MonthPlan = {
  overallRate: number | null;
  overallBase: number;
  weekdays: WeekdayStat[];
  times: string[]; // columnas de la matriz, ordenadas
  cells: MatrixCell[];
  easyTimes: { time: string; rate: number; base: number; days: string[] }[]; // horarios en verde (fáciles de confirmar)
  riskByDay: { dayOfWeek: string; cells: MatrixCell[] }[]; // celdas en ámbar o rojo por día, las rojas primero
  fieldLostTotal: number;
  publishedTotal: number;
};

type Tally = { confirmed: number; base: number; early: [number, number]; late: [number, number]; fieldLost: number };
const newTally = (): Tally => ({ confirmed: 0, base: 0, early: [0, 0], late: [0, 0], fieldLost: 0 });

function trendOf(tl: Tally): Trend {
  const e = tl.early, l = tl.late;
  if (e[1] < TREND_MIN_HALF_BASE || l[1] < TREND_MIN_HALF_BASE) return "flat";
  const d = l[0] / l[1] - e[0] / e[1];
  return d >= TREND_DELTA ? "up" : d <= -TREND_DELTA ? "down" : "flat";
}

export function buildMonthPlan(games: PlanGame[], fromISO: string, toISO: string, todayISO: string, days = 30): MonthPlan {
  const mid = (t(fromISO) + t(toISO)) / 2;
  const byDay = new Map<string, Tally>();
  const byCell = new Map<string, Tally>();
  const overall = newTally();
  let fieldLostTotal = 0;

  for (const g of games) {
    const isConfirmed = g.status === "CONFIRMED";
    const bucket = isConfirmed ? null : bucketOf(g.category);
    const dTally = byDay.get(g.dayOfWeek) ?? newTally();
    const cKey = `${g.dayOfWeek}|${g.time}`;
    const cTally = byCell.get(cKey) ?? newTally();
    byDay.set(g.dayOfWeek, dTally);
    byCell.set(cKey, cTally);
    if (bucket === "fieldUnavailable") {
      dTally.fieldLost += 1; cTally.fieldLost += 1; fieldLostTotal += 1;
      continue;
    }
    if (!isConfirmed && bucket !== "demand") continue;
    const early = t(g.date) < mid;
    for (const tl of [dTally, cTally, overall]) {
      tl.base += 1;
      if (isConfirmed) tl.confirmed += 1;
      const half = early ? tl.early : tl.late;
      half[1] += 1;
      if (isConfirmed) half[0] += 1;
    }
  }

  const overallRate = overall.base > 0 ? overall.confirmed / overall.base : null;
  const occurrences = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const n = dayNameOf(addDaysISO(todayISO, i));
    occurrences.set(n, (occurrences.get(n) ?? 0) + 1);
  }

  const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weekdays: WeekdayStat[] = ORDER.map((d) => {
    const tl = byDay.get(d) ?? newTally();
    const rate = tl.base > 0 ? tl.confirmed / tl.base : null;
    const tier: DayTier =
      rate === null || tl.base < DAY_MIN_BASE || overallRate === null ? "insufficient"
        : rate >= overallRate + DAY_TIER_DELTA ? "better" : rate <= overallRate - DAY_TIER_DELTA ? "weaker" : "typical";
    return { dayOfWeek: d, confirmed: tl.confirmed, base: tl.base, rate, trend: trendOf(tl), tier, occurrences: occurrences.get(d) ?? 0, fieldLost: tl.fieldLost };
  });

  const cells: MatrixCell[] = [];
  for (const [key, tl] of byCell) {
    const [dayOfWeek, time] = key.split("|");
    const rate = tl.base > 0 ? tl.confirmed / tl.base : null;
    const trend = trendOf(tl);
    let band: CellBand = "thin";
    if (tl.base >= CELL_MIN_BASE && rate !== null) {
      band = rate >= GREEN_MIN_RATE ? "green" : isDemandHealthy(rate) ? "amber" : "red";
    }
    cells.push({ dayOfWeek, time, confirmed: tl.confirmed, base: tl.base, rate, trend, fieldLost: tl.fieldLost, band });
  }
  const times = [...new Set(cells.map((c) => c.time))].sort();

  // Horarios fáciles de confirmar: se agrupa por hora del día, sumando los días en que la celda es "easy".
  const timeAcc = new Map<string, { confirmed: number; base: number; days: string[] }>();
  for (const c of cells) {
    if (c.band !== "green") continue;
    const a = timeAcc.get(c.time) ?? { confirmed: 0, base: 0, days: [] };
    a.confirmed += c.confirmed; a.base += c.base; a.days.push(c.dayOfWeek);
    timeAcc.set(c.time, a);
  }
  const easyTimes = [...timeAcc]
    .map(([time, a]) => ({ time, rate: a.confirmed / a.base, base: a.base, days: a.days.sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y)) }))
    .sort((x, y) => y.days.length - x.days.length || y.rate - x.rate)
    .slice(0, 5);

  const riskByDay = ORDER.map((d) => ({
    dayOfWeek: d,
    cells: cells.filter((c) => c.dayOfWeek === d && (c.band === "red" || c.band === "amber")).sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1) || a.time.localeCompare(b.time)),
  })).filter((x) => x.cells.length > 0);

  const publishedTotal = games.length;
  return { overallRate, overallBase: overall.base, weekdays, times, cells, easyTimes, riskByDay, fieldLostTotal, publishedTotal };
}
