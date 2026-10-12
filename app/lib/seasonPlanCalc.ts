// =====================================================================================
// Cálculo puro (sin base de datos) de la vista de temporadas de Estacionalidad.
//
// Todo el "volumen" de acá es VOLUMEN DE DEMANDA = confirmados + cancelados por falta de
// jugadores (definición única, ver metrics.ts). No es lo publicado: lo publicado depende de
// la oferta, y justamente queremos separar "bajó el volumen porque no hubo demanda" de "bajó
// porque faltó cancha".
//
// Índice estacional: volumen de cada mes relativo a su nivel "normal" de ese momento, así el
// crecimiento del negocio no hace parecer alto a un mes solo por ser más reciente.
//  - Con 24+ meses completos: razón contra la media móvil centrada de 12 meses (2x12), que
//    es el método clásico de descomposición estacional.
//  - Con 12 a 23 meses: razón contra el promedio de todos los meses completos. Es PROVISORIO:
//    no descuenta el crecimiento.
//  - Con menos de 12 meses no hay estacionalidad que medir.
// =====================================================================================

export type MonthAgg = {
  year: number;
  month: number; // 0 = enero … 11 = diciembre
  published: number;
  confirmed: number;
  demandBase: number; // confirmados + cancelados por demanda
  fieldUnavailable: number; // cancelados por cancha no disponible
};

export type SeasonLevel = "high" | "mid" | "low";

// Umbrales (centralizados acá a propósito; ver backlog "umbrales").
export const SEASON_HIGH_INDEX = 1.1;
export const SEASON_LOW_INDEX = 0.9;
export const SEASON_MAX_MONTHS = 3; // una temporada agrupa como máximo un trimestre
export const DEMAND_OK_RATE = 0.55; // mismo piso que el "sí o sí" de Daily/Trends
export const UNAVAIL_ELEVATED_RATE = 0.1;
export const UNAVAIL_HIGH_RATE = 0.25;
export const TREND_WORSENING_PP = 0.05; // +5 puntos de cancha no disponible vs el año previo
export const TREND_STRONG_PP = 0.1;
export const MIN_PUBLISHED_FOR_RATE = 20;
export const MIN_PUBLISHED_FOR_TREND = 30; // por año, para comparar dos años
export const LEAD_WEEKS_MIN = 1;
export const LEAD_WEEKS_MAX = 4;

const keyOf = (year: number, month: number) => year * 12 + month;

export type SeasonalIndexResult = {
  method: "centeredMA" | "provisional";
  completeMonths: number;
  byMonth: { month: number; index: number | null; observations: number; avgDemandVolume: number | null }[];
};

/** Rellena con ceros los meses sin ninguna fila entre el primero y el último (no hubo actividad). */
function fillTimeline(months: MonthAgg[]): MonthAgg[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort((a, b) => keyOf(a.year, a.month) - keyOf(b.year, b.month));
  const byKey = new Map(sorted.map((m) => [keyOf(m.year, m.month), m]));
  const first = keyOf(sorted[0].year, sorted[0].month);
  const last = keyOf(sorted[sorted.length - 1].year, sorted[sorted.length - 1].month);
  const out: MonthAgg[] = [];
  for (let k = first; k <= last; k++) {
    out.push(byKey.get(k) ?? { year: Math.floor(k / 12), month: k % 12, published: 0, confirmed: 0, demandBase: 0, fieldUnavailable: 0 });
  }
  return out;
}

export function seasonalIndex(completeMonths: MonthAgg[]): SeasonalIndexResult | null {
  const series = fillTimeline(completeMonths);
  const n = series.length;
  if (n < 12) return null;

  const v = series.map((m) => m.demandBase);
  const ratios: { month: number; ratio: number; volume: number }[] = [];
  let method: SeasonalIndexResult["method"];

  if (n >= 24) {
    method = "centeredMA";
    for (let i = 6; i <= n - 7; i++) {
      let s = 0.5 * v[i - 6] + 0.5 * v[i + 6];
      for (let j = i - 5; j <= i + 5; j++) s += v[j];
      const ma = s / 12;
      if (ma > 0) ratios.push({ month: series[i].month, ratio: v[i] / ma, volume: v[i] });
    }
  } else {
    method = "provisional";
    const mean = v.reduce((a, b) => a + b, 0) / n;
    if (mean > 0) series.forEach((m, i) => ratios.push({ month: m.month, ratio: v[i] / mean, volume: v[i] }));
  }
  if (ratios.length === 0) return null;

  const raw = Array.from({ length: 12 }, (_, month) => {
    const rs = ratios.filter((r) => r.month === month);
    return {
      month,
      observations: rs.length,
      mean: rs.length ? rs.reduce((a, r) => a + r.ratio, 0) / rs.length : null,
      // Volumen de demanda promedio por año en ese mes, sobre TODOS los años completos de la serie.
      avgDemandVolume: (() => {
        const all = series.filter((m) => m.month === month);
        return all.length ? all.reduce((a, m) => a + m.demandBase, 0) / all.length : null;
      })(),
    };
  });
  // Re-normaliza para que el promedio de los 12 índices sea exactamente 1.
  const present = raw.filter((r) => r.mean !== null);
  const avg = present.reduce((a, r) => a + (r.mean as number), 0) / present.length;

  return {
    method,
    completeMonths: n,
    byMonth: raw.map((r) => ({
      month: r.month,
      index: r.mean === null || avg <= 0 ? null : r.mean / avg,
      observations: r.observations,
      avgDemandVolume: r.avgDemandVolume,
    })),
  };
}

export function levelOf(index: number): SeasonLevel {
  return index >= SEASON_HIGH_INDEX ? "high" : index <= SEASON_LOW_INDEX ? "low" : "mid";
}

export type Season = { months: number[]; level: SeasonLevel; avgIndex: number };

/**
 * Agrupa automáticamente los meses contiguos (circular: diciembre enlaza con enero) del mismo
 * nivel en temporadas de hasta SEASON_MAX_MONTHS meses. Los meses sin índice quedan afuera.
 */
export function groupSeasons(byMonth: { month: number; index: number | null }[]): Season[] {
  const idx = new Map(byMonth.map((m) => [m.month, m.index]));
  const levelAt = (m: number) => {
    const i = idx.get(m);
    return i === null || i === undefined ? null : levelOf(i);
  };
  // Arranca justo después de un corte de nivel, para que ninguna temporada quede partida por el 11→0.
  let start = 0;
  for (let m = 0; m < 12; m++) {
    if (levelAt(m) !== levelAt((m + 11) % 12)) {
      start = m;
      break;
    }
  }
  const seasons: Season[] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const lvl = levelAt(current[0]);
    if (lvl) {
      // Tramos largos se parten en partes parejas (4 → 2+2, no 3+1).
      const pieces = Math.ceil(current.length / SEASON_MAX_MONTHS);
      const size = Math.ceil(current.length / pieces);
      for (let i = 0; i < current.length; i += size) {
        const chunk = current.slice(i, i + size);
        seasons.push({ months: chunk, level: lvl, avgIndex: chunk.reduce((a, m) => a + (idx.get(m) as number), 0) / chunk.length });
      }
    }
    current = [];
  };
  for (let k = 0; k < 12; k++) {
    const m = (start + k) % 12;
    if (current.length > 0 && levelAt(m) !== levelAt(current[0])) flush();
    current.push(m);
  }
  flush();
  return seasons.sort((a, b) => a.months[0] - b.months[0]);
}

export type AvailabilityMonth = {
  month: number;
  published: number;
  fieldUnavailable: number;
  rate: number | null; // cancha no disponible / publicados, años completos agrupados
  avgLostPerYear: number | null;
  trendPp: number | null; // último año vs el anterior (puntos de tasa, 0.05 = 5 pp); null si no hay muestra
  years: number;
};

export function availabilityByMonth(completeMonths: MonthAgg[]): AvailabilityMonth[] {
  return Array.from({ length: 12 }, (_, month) => {
    const ms = completeMonths.filter((m) => m.month === month).sort((a, b) => a.year - b.year);
    const published = ms.reduce((a, m) => a + m.published, 0);
    const fu = ms.reduce((a, m) => a + m.fieldUnavailable, 0);
    const last = ms[ms.length - 1];
    const prev = ms[ms.length - 2];
    const trend =
      last && prev && last.published >= MIN_PUBLISHED_FOR_TREND && prev.published >= MIN_PUBLISHED_FOR_TREND
        ? last.fieldUnavailable / last.published - prev.fieldUnavailable / prev.published
        : null;
    return {
      month,
      published,
      fieldUnavailable: fu,
      rate: published >= MIN_PUBLISHED_FOR_RATE ? fu / published : null,
      avgLostPerYear: ms.length ? fu / ms.length : null,
      trendPp: trend,
      years: ms.length,
    };
  });
}

export type ActionKind = "supplyLimited" | "demandLimited" | "mixed" | "healthy" | "insufficient";

export function classify(input: { published: number; demandRate: number | null; unavailRate: number | null; trendPp: number | null }): ActionKind {
  const { published, demandRate, unavailRate, trendPp } = input;
  if (published < MIN_PUBLISHED_FOR_RATE || demandRate === null || unavailRate === null) return "insufficient";
  const demandOk = demandRate >= DEMAND_OK_RATE;
  const unavailElevated = unavailRate >= UNAVAIL_ELEVATED_RATE || (trendPp !== null && trendPp >= TREND_WORSENING_PP && unavailRate >= UNAVAIL_ELEVATED_RATE / 2);
  if (demandOk && unavailElevated) return "supplyLimited";
  if (!demandOk && unavailElevated) return "mixed";
  if (!demandOk) return "demandLimited";
  return "healthy";
}

/** Semanas de anticipación para reservar, entre LEAD_WEEKS_MIN y LEAD_WEEKS_MAX, según cuánta oferta se perdió. */
export function leadWeeks(unavailRate: number, trendPp: number | null): number {
  if (unavailRate >= UNAVAIL_HIGH_RATE || (trendPp !== null && trendPp >= TREND_STRONG_PP)) return LEAD_WEEKS_MAX;
  if (unavailRate >= UNAVAIL_ELEVATED_RATE + (UNAVAIL_HIGH_RATE - UNAVAIL_ELEVATED_RATE) / 2) return 3;
  if (unavailRate >= UNAVAIL_ELEVATED_RATE) return 2;
  return LEAD_WEEKS_MIN;
}

/** Un mes es "completo" si el primer dato lo cubre desde el inicio y el último dato llega a su último día. */
export function isCompleteMonth(year: number, month: number, firstDateISO: string, latestDateISO: string): boolean {
  const start = Date.UTC(year, month, 1);
  const end = Date.UTC(year, month + 1, 0);
  const first = Date.parse(`${firstDateISO}T00:00:00Z`);
  const latest = Date.parse(`${latestDateISO}T00:00:00Z`);
  return first <= start + 6 * 86_400_000 && latest >= end;
}
