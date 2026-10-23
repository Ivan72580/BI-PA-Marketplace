// Criterios de lectura de los rankings de tasa de cancelación (filtros rápidos y aviso de muestra chica).
// Son umbrales de criterio, no de la base: se ajustan acá con datos reales.

/** Menos partidos que esto = muestra chica: la tasa puede moverse mucho con un solo partido. */
export const SMALL_SAMPLE_GAMES = 10;
/** "Prioridad": mucho volumen y mucha cancelación a la vez. */
export const PRIORITY_MIN_GAMES = 15;
export const PRIORITY_MIN_RATE = 0.55;
/** "Empeoraron": la tasa subió al menos esto (en puntos, 0.05 = 5) contra el período anterior. */
export const WORSE_MIN_DELTA = 0.05;
/** Períodos que muestra la mini línea de tendencia. */
export const TREND_PERIODS = 8;

export type RateFlagInput = { rate: number; games: number; priorRate: number | null };

export const isSmallSample = (r: RateFlagInput) => r.games < SMALL_SAMPLE_GAMES;
export const isPriority = (r: RateFlagInput) => r.games >= PRIORITY_MIN_GAMES && r.rate >= PRIORITY_MIN_RATE;
export const isWorse = (r: RateFlagInput) => r.priorRate !== null && r.rate - r.priorRate >= WORSE_MIN_DELTA;
