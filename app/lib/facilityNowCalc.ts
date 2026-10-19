import { bucketOf } from "./metrics";

// Lógica pura (sin Prisma) de la capa "Ahora" del análisis de facility (/facility): ventanas de día, semana y
// mes con su comparación, agregados por ventana y alertas. Las tasas usan la definición única de metrics.ts:
// demanda = confirmados / (confirmados + cancelados por falta de jugadores); "cancha no disponible" aparte.
// Todas las fechas son ISO "YYYY-MM-DD" (UTC puro: el día calendario del partido, sin huso).

export type Range = { from: string; to: string };
export type NowPeriod = "day" | "week" | "month";
export type NowWindows = Record<NowPeriod, { cur: Range; prior: Range }>;

export const SERIES_DAYS = 28; // barras de la evolución diaria
export const RECENT_GAMES_DAYS = 7; // listado de partidos recientes
export const FIELD_ALERT_MIN = 2; // cancha no disponible en la serie para disparar la alerta
export const DEMAND_DROP_PTS = 0.1; // caída de la tasa de demanda semanal que dispara la alerta
export const MIN_BASE_FOR_ALERT = 5; // base de demanda mínima en cada ventana para comparar

const DAY_MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
/** Lunes = 0 … domingo = 6. */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}
function lastDayOfMonth(y: number, m1: number): number {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = mes 1..12
}

/**
 * Ventanas a partir del día de referencia (el último día con datos, o el que elija la persona):
 *  - Día: el día contra el mismo día de la semana anterior.
 *  - Semana: lunes → referencia (semana ISO, parcial si la referencia no es domingo) contra la semana
 *    anterior con la misma cantidad de días transcurridos.
 *  - Mes: día 1 → referencia contra el mes anterior con los mismos días transcurridos (no el mes
 *    completo, que sesgaría la comparación a la baja).
 */
export function buildWindows(ref: string): NowWindows {
  const dow = weekdayIndex(ref);
  const weekFrom = addDays(ref, -dow);
  const priorWeekFrom = addDays(weekFrom, -7);

  const [y, m] = ref.split("-").map(Number);
  const dayOfMonth = Number(ref.slice(8, 10));
  const monthFrom = `${ref.slice(0, 7)}-01`;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const priorMonthFrom = `${py}-${String(pm).padStart(2, "0")}-01`;
  const priorMonthTo = `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(dayOfMonth, lastDayOfMonth(py, pm))).padStart(2, "0")}`;

  return {
    day: { cur: { from: ref, to: ref }, prior: { from: addDays(ref, -7), to: addDays(ref, -7) } },
    week: { cur: { from: weekFrom, to: ref }, prior: { from: priorWeekFrom, to: addDays(priorWeekFrom, dow) } },
    month: { cur: { from: monthFrom, to: ref }, prior: { from: priorMonthFrom, to: priorMonthTo } },
  };
}

/** Primer día que hay que leer: cubre las ventanas, la serie de 28 días y el listado reciente. */
export function readFrom(ref: string): string {
  const w = buildWindows(ref);
  const candidates = [w.month.prior.from, w.week.prior.from, addDays(ref, -(SERIES_DAYS - 1))];
  return candidates.reduce((a, b) => (a < b ? a : b));
}

export type NowGame = {
  date: string;
  time: string;
  dayOfWeek: string;
  fieldName: string | null;
  gameSize: string | null;
  status: "CONFIRMED" | "CANCELLED";
  category: string | null;
  players: number;
  maxPlayers: number;
  price: number | null;
  waitlist: number;
  dropped: number;
};

export type Agg = {
  published: number;
  confirmed: number;
  cancelled: number;
  demandCancelled: number;
  fieldUnavailable: number;
  operational: number;
  plugin: number;
  demandBase: number;
  demandRate: number | null; // null si no hubo base de demanda
  rawRate: number | null; // confirmados / publicados
  fieldShare: number | null; // cancha no disponible / publicados
  fillRate: number | null; // jugadores confirmados / cupo de confirmados
  players: number;
  avgPrice: number | null;
  revenue: number | null; // suma de precio × jugadores finales en confirmados (estimado)
  waitlist: number;
  dropped: number;
};

export function emptyAgg(): Agg {
  return {
    published: 0, confirmed: 0, cancelled: 0, demandCancelled: 0, fieldUnavailable: 0, operational: 0, plugin: 0, demandBase: 0,
    demandRate: null, rawRate: null, fieldShare: null, fillRate: null, players: 0, avgPrice: null, revenue: null, waitlist: 0, dropped: 0,
  };
}

const inRange = (d: string, r: Range) => d >= r.from && d <= r.to;

export function aggregateGames(games: NowGame[], range: Range): Agg {
  const a = emptyAgg();
  let capacity = 0, priceSum = 0, priceN = 0, revenue = 0, revenueN = 0;
  for (const g of games) {
    if (!inRange(g.date, range)) continue;
    a.published += 1;
    a.waitlist += g.waitlist;
    a.dropped += g.dropped;
    if (g.status === "CONFIRMED") {
      a.confirmed += 1;
      a.players += g.players;
      capacity += g.maxPlayers;
    } else {
      a.cancelled += 1;
      const b = bucketOf(g.category);
      if (b === "demand") a.demandCancelled += 1;
      else if (b === "fieldUnavailable") a.fieldUnavailable += 1;
      else if (b === "plugin") a.plugin += 1;
      else a.operational += 1;
    }
    if (g.price !== null) {
      priceSum += g.price; priceN += 1;
      if (g.status === "CONFIRMED") { revenue += g.price * g.players; revenueN += 1; }
    }
  }
  return finishAgg(a, capacity, priceSum, priceN, revenue, revenueN);
}

function finishAgg(a: Agg, capacity: number, priceSum: number, priceN: number, revenue: number, revenueN: number): Agg {
  a.demandBase = a.confirmed + a.demandCancelled;
  a.demandRate = a.demandBase > 0 ? a.confirmed / a.demandBase : null;
  a.rawRate = a.published > 0 ? a.confirmed / a.published : null;
  a.fieldShare = a.published > 0 ? a.fieldUnavailable / a.published : null;
  a.fillRate = capacity > 0 ? a.players / capacity : null;
  a.avgPrice = priceN > 0 ? priceSum / priceN : null;
  a.revenue = revenueN > 0 ? revenue : null;
  return a;
}

/** Conteos ya agrupados (benchmark del market): una fila por fecha × estado × categoría. */
export type CountRow = { date: string; status: "CONFIRMED" | "CANCELLED"; category: string | null; n: number };
export type MarketAgg = { published: number; demandRate: number | null; fieldShare: number | null };

export function aggregateCounts(rows: CountRow[], range: Range): MarketAgg {
  let published = 0, confirmed = 0, demandCancelled = 0, field = 0;
  for (const r of rows) {
    if (!inRange(r.date, range)) continue;
    published += r.n;
    if (r.status === "CONFIRMED") confirmed += r.n;
    else {
      const b = bucketOf(r.category);
      if (b === "demand") demandCancelled += r.n;
      else if (b === "fieldUnavailable") field += r.n;
    }
  }
  const base = confirmed + demandCancelled;
  return { published, demandRate: base > 0 ? confirmed / base : null, fieldShare: published > 0 ? field / published : null };
}

export type SeriesDay = { date: string; confirmed: number; demandCancelled: number; fieldUnavailable: number; other: number };

export function buildSeries(games: NowGame[], ref: string): SeriesDay[] {
  const out = new Map<string, SeriesDay>();
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const d = addDays(ref, -i);
    out.set(d, { date: d, confirmed: 0, demandCancelled: 0, fieldUnavailable: 0, other: 0 });
  }
  for (const g of games) {
    const e = out.get(g.date);
    if (!e) continue;
    if (g.status === "CONFIRMED") e.confirmed += 1;
    else {
      const b = bucketOf(g.category);
      if (b === "demand") e.demandCancelled += 1;
      else if (b === "fieldUnavailable") e.fieldUnavailable += 1;
      else e.other += 1;
    }
  }
  return [...out.values()];
}

export type NowAlert =
  | { kind: "field"; n: number; days: number; share: number | null }
  | { kind: "demandDrop"; from: number; to: number; pts: number };

export function buildAlerts(series: SeriesDay[], week: { cur: Agg; prior: Agg }): NowAlert[] {
  const out: NowAlert[] = [];
  const fieldN = series.reduce((s, d) => s + d.fieldUnavailable, 0);
  if (fieldN >= FIELD_ALERT_MIN) {
    const published = series.reduce((s, d) => s + d.confirmed + d.demandCancelled + d.fieldUnavailable + d.other, 0);
    out.push({ kind: "field", n: fieldN, days: series.length, share: published > 0 ? fieldN / published : null });
  }
  const { cur, prior } = week;
  if (cur.demandRate !== null && prior.demandRate !== null && cur.demandBase >= MIN_BASE_FOR_ALERT && prior.demandBase >= MIN_BASE_FOR_ALERT) {
    const pts = cur.demandRate - prior.demandRate;
    if (pts <= -DEMAND_DROP_PTS) out.push({ kind: "demandDrop", from: prior.demandRate, to: cur.demandRate, pts });
  }
  return out;
}
