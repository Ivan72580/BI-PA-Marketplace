// ---------- "Facilities a vigilar" de Pronóstico: cálculo puro (sin Prisma) ----------
// Decide qué facilities van a la lista de baja o de alza y arma la explicación breve
// (qué cambió, por qué y qué hacer) a partir de conteos ya agregados. Está separado de
// app/lib/db/forecastWatch.ts para poder probarlo sin base. Los textos viven en los mensajes
// (Forecast.watch.*); acá solo se decide QUÉ decir, no cómo.

/** Caída mínima de la tasa de demanda proyectada (vs su promedio) para contar como baja: 1 punto. Debajo de eso es ruido. */
export const DOWN_MIN_RATE_DROP = 0.01;
/** Cancelados proyectados por bloque a partir de los cuales una facility con confirmados a la baja se vigila aunque la tasa no caiga. */
export const DOWN_MIN_CANCELLED = 3;
/** Si lo publicado (confirmados + cancelados) cae al menos esto entre períodos, la merma se explica por menos oferta. */
export const SUPPLY_DROP_PCT = 0.2;

export type Direction = "down" | "up" | "flat";

/**
 * Baja: la tasa de demanda proyectada cae al menos 1 punto bajo su propio promedio, o hay muchos cancelados
 * proyectados Y los confirmados proyectados quedan bajo su promedio. Alza: confirmados proyectados por encima
 * de su promedio sin que sea baja. El resto es estable y no se lista.
 * (Antes bastaba tener 3 cancelados proyectados para entrar a "a vigilar", aunque la facility estuviera mejorando.)
 */
export function directionOf(rateDelta: number, confirmedDelta: number, predictedCancelled: number): Direction {
  if (rateDelta <= -DOWN_MIN_RATE_DROP || (predictedCancelled >= DOWN_MIN_CANCELLED && confirmedDelta < 0)) return "down";
  if (confirmedDelta > 0 && rateDelta >= 0) return "up";
  return "flat";
}

export type ReasonShift = { category: string; recent: number; prior: number };
export type SlotShift = { dayOfWeek: string; time: string; recent: number; prior: number };

/** Conteos de una facility en el último período (`days` días) y en el anterior de igual largo. */
export type FacilityDriver = {
  facilityId: string;
  days: number;
  confirmed: { recent: number; prior: number };
  cancelled: { recent: number; prior: number };
  /** Cancelados por categoría ("UNSPECIFIED" = sin motivo cargado). */
  reasons: ReasonShift[];
  /** Slots (día + hora) que más ganaron / más perdieron confirmados entre períodos. */
  slotGainers: SlotShift[];
  slotLosers: SlotShift[];
  /** Horas promedio entre la confirmación y el partido, de los confirmados de cada período. */
  leadTime: { recent: number | null; prior: number | null };
};

export type SuggestionKey =
  | "NOT_ENOUGH_PLAYERS" | "FACILITY_UNAVAILABLE" | "WEATHER" | "MAINTENANCE" | "HOLIDAY" | "OTHER" | "PLUGIN"
  | "UNSPECIFIED" | "supply" | "generic" | "up";

export type DownExplanation = {
  /** Lo publicado en cada período, solo si cayó lo suficiente para ser la explicación. */
  supply: { prior: number; recent: number } | null;
  /** Motivos de cancelación que más crecieron (hasta 2); si ninguno creció, los más frecuentes del último período. */
  reasons: ReasonShift[];
  growing: boolean;
  /** Slots que más confirmados perdieron (hasta 2). */
  slots: SlotShift[];
  suggestion: SuggestionKey;
};

const SUGGESTIBLE = new Set(["NOT_ENOUGH_PLAYERS", "FACILITY_UNAVAILABLE", "WEATHER", "MAINTENANCE", "HOLIDAY", "OTHER", "PLUGIN", "UNSPECIFIED"]);

export function explainDown(d: FacilityDriver): DownExplanation {
  const growing = d.reasons.filter((r) => r.recent > r.prior).sort((a, b) => b.recent - b.prior - (a.recent - a.prior));
  const byRecent = [...d.reasons].filter((r) => r.recent > 0).sort((a, b) => b.recent - a.recent);
  const reasons = (growing.length > 0 ? growing : byRecent).slice(0, 2);

  const pubPrior = d.confirmed.prior + d.cancelled.prior;
  const pubRecent = d.confirmed.recent + d.cancelled.recent;
  const supplyDrop = pubPrior > 0 && pubRecent <= pubPrior * (1 - SUPPLY_DROP_PCT) && d.confirmed.recent < d.confirmed.prior;

  const top = reasons[0]?.category;
  let suggestion: SuggestionKey = "generic";
  if (growing.length > 0 && top && SUGGESTIBLE.has(top)) suggestion = top as SuggestionKey;
  else if (supplyDrop) suggestion = "supply";
  else if (top && SUGGESTIBLE.has(top)) suggestion = top as SuggestionKey;

  return {
    supply: supplyDrop ? { prior: pubPrior, recent: pubRecent } : null,
    reasons,
    growing: growing.length > 0,
    slots: d.slotLosers.filter((s) => s.recent < s.prior).slice(0, 2),
    suggestion,
  };
}

export type UpExplanation = { slots: SlotShift[]; suggestion: "up" };

export function explainUp(d: FacilityDriver): UpExplanation {
  return { slots: d.slotGainers.filter((s) => s.recent > s.prior).slice(0, 2), suggestion: "up" };
}

/** Los `limit` slots con mayor cambio (positivo para ganadores, negativo para perdedores), de las claves "día|hora". */
export function topSlotShifts(recent: Map<string, number>, prior: Map<string, number>, limit = 2): { gainers: SlotShift[]; losers: SlotShift[] } {
  const keys = new Set([...recent.keys(), ...prior.keys()]);
  const all: SlotShift[] = [...keys].map((k) => {
    const [dayOfWeek, time] = k.split("|");
    return { dayOfWeek, time, recent: recent.get(k) ?? 0, prior: prior.get(k) ?? 0 };
  });
  const delta = (s: SlotShift) => s.recent - s.prior;
  return {
    gainers: all.filter((s) => delta(s) > 0).sort((a, b) => delta(b) - delta(a)).slice(0, limit),
    losers: all.filter((s) => delta(s) < 0).sort((a, b) => delta(a) - delta(b)).slice(0, limit),
  };
}
