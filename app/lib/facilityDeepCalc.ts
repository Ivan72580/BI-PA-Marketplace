import { aggregateGames, addDays, type Agg, type NowGame, type Range } from "./facilityNowCalc";

// Lógica pura de las capas de análisis profundo de facility (oferta, demanda, precio, tendencia): agrupa los
// partidos de la facility de los últimos 12 meses en memoria. Mismas definiciones que la capa "Ahora"
// (aggregateGames); acá solo cambia el corte (hora × día, cancha, formato, mes).

export const DEEP_DAYS = 90; // ventana "reciente" de las capas profundas (≈ 3 meses, igual que A agendar)
export const HISTORY_MONTHS = 13; // meses de historial para precio y tendencia (incluye el mes en curso)

export type GroupAgg = Record<string, Agg>;

export function groupAggregate(games: NowGame[], range: Range, key: (g: NowGame) => string | null): GroupAgg {
  const buckets = new Map<string, NowGame[]>();
  for (const g of games) {
    if (g.date < range.from || g.date > range.to) continue;
    const k = key(g);
    if (k === null) continue;
    const arr = buckets.get(k);
    if (arr) arr.push(g);
    else buckets.set(k, [g]);
  }
  return Object.fromEntries([...buckets].map(([k, arr]) => [k, aggregateGames(arr, range)]));
}

export function deepWindows(ref: string): { cur: Range; prior: Range } {
  return {
    cur: { from: addDays(ref, -(DEEP_DAYS - 1)), to: ref },
    prior: { from: addDays(ref, -(2 * DEEP_DAYS - 1)), to: addDays(ref, -DEEP_DAYS) },
  };
}

/** Primer día a leer: cubre HISTORY_MONTHS meses completos hacia atrás desde el mes de la referencia. */
export function deepReadFrom(ref: string): string {
  const [y, m] = ref.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - (HISTORY_MONTHS - 1), 1));
  return d.toISOString().slice(0, 10);
}

export type MonthAgg = { month: string; agg: Agg };

/** Un agregado por mes calendario (el último, hasta la referencia). */
export function monthlyAggregates(games: NowGame[], ref: string): MonthAgg[] {
  const [y, m] = ref.split("-").map(Number);
  const out: MonthAgg[] = [];
  for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const month = d.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    out.push({ month, agg: aggregateGames(games, { from: `${month}-01`, to: i === 0 ? ref : last }) });
  }
  return out;
}

export const hourOf = (time: string): string => time.slice(0, 2);
/** Orden de día operativo: arranca a las 6 AM. */
export const opKey = (hour: string): number => (parseInt(hour, 10) - 6 + 24) % 24;

export type ReasonRow = { category: string; cur: number; prior: number };
export function reasonCounts(games: NowGame[], cur: Range, prior: Range): ReasonRow[] {
  const m = new Map<string, ReasonRow>();
  for (const g of games) {
    if (g.status !== "CANCELLED") continue;
    const inCur = g.date >= cur.from && g.date <= cur.to;
    const inPrior = g.date >= prior.from && g.date <= prior.to;
    if (!inCur && !inPrior) continue;
    const category = g.category ?? "OTHER";
    const r = m.get(category) ?? { category, cur: 0, prior: 0 };
    if (inCur) r.cur += 1;
    else r.prior += 1;
    m.set(category, r);
  }
  return [...m.values()].sort((a, b) => b.cur - a.cur);
}
