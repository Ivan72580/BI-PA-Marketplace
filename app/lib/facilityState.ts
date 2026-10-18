// Bitácora de Facilities — estado calculado (Fase 2). Lógica pura: recibe los aportes y los datos duros de
// partidos ya consultados y devuelve el estado. Nada de Prisma acá, así se puede probar y reutilizar.
//
// Modelo (ver "facility-relationship-modelo-conceptual"): dos ejes independientes, cuatro dimensiones.
//   Fiabilidad = D1 Cumplimiento + D2 Calidad de oferta   ·   Relación = D3 Alineación + D4 Trato y comunicación
// El sistema PROPONE un cuadrante; la persona decide. Todos los números de este archivo son una primera
// calibración: están agrupados en constantes para ajustarlos con datos reales sin tocar la lógica.

import type { EventType, LogKind, Sentiment, Tone } from "./facilityLog";

export type Dimension = "D1" | "D2" | "D3" | "D4";
export const DIMENSIONS: readonly Dimension[] = ["D1", "D2", "D3", "D4"];

export type QuadrantKey = "PARTNER" | "RELIABLE_DIFFICULT" | "OPPORTUNIST_CORDIAL" | "OPPORTUNIST_CONFLICT" | "NO_SIGNAL";
export type ActionKey = "INVEST" | "MAINTAIN" | "CONDITION" | "REDUCE";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type Trend = "UP" | "DOWN" | "FLAT";
export type AlertKey = "SUB_LOGGING" | "HOSTILE_REPEAT" | "RETIRO_STREAK" | "PLEI_FAULTS";

// ---------- Calibración ----------
/** Vida media del peso de un aporte: a los 45 días vale la mitad. */
export const HALF_LIFE_DAYS = 45;
/** Suma mínima de pesos efectivos para que una dimensión (o un eje, con las dos suyas juntas) deje de figurar "sin señal". */
export const MIN_SIGNAL = 2;
/** puntaje = 50 + 50·tanh(suma / SCORE_SCALE): 50 es neutro, 0–100 los extremos. */
export const SCORE_SCALE = 6;
/** Umbral entre "alta/baja" fiabilidad y "buena/mala" relación. */
export const AXIS_THRESHOLD = 50;
/** Partidos en 90 días a partir de los cuales los eventos de D1/D2 se diluyen (normalización por exposición). */
export const EXPOSURE_BASE_GAMES = 30;
export const WINDOW_DAYS = 90;
export const TREND_RECENT_DAYS = 30;
/** Cambio mínimo de puntaje (30 días vs. los 90 previos) para hablar de tendencia. */
export const TREND_DELTA = 10;

// ---------- Entradas ----------
export type StateEntry = {
  kind: LogKind;
  eventType: EventType | null;
  subtype: string | null;
  tone: Tone | null;
  resolution: string | null;
  severity: number | null;
  committedSlot: boolean | null;
  hours: number | null;
  hoursSincePublished: number | null;
  playersSigned: number | null;
  sentiment: Sentiment | null;
  authorId: string | null;
  occurredAt: string; // YYYY-MM-DD
  agree: number;
  disagree: number;
};

/** Datos duros de partidos de la facility en los últimos 90 días (sin PLUGIN en las cancelaciones). */
export type GameExposure = {
  confirmed: number;
  /** Cancelados por demanda (para la tasa de demanda). */
  demandCancelled: number;
  /** Todos los cancelados sin PLUGIN. */
  cancelled: number;
  /** Cancelados con motivo FACILITY_UNAVAILABLE. */
  facilityCancelled: number;
  /** Cancelados con otro motivo pero vinculados a un evento de disponibilidad (RETIRO_SLOT / LIBERACION_TARDIA) por game_id. */
  linkedCancelled: number;
};

export const EMPTY_EXPOSURE: GameExposure = { confirmed: 0, demandCancelled: 0, cancelled: 0, facilityCancelled: 0, linkedCancelled: 0 };

// ---------- Fechas ----------
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}
function ageDays(iso: string, today: string): number {
  return Math.max(0, dayNumber(today) - dayNumber(iso));
}

// ---------- Aporte → contribuciones por dimensión ----------
type Contribution = { dim: Dimension; value: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Valor firmado de un aporte (negativo = señal mala para la facility) y la dimensión donde cuenta.
 * Los INSIGHT no puntúan (son lectura del equipo, no un hecho) y INCUMPLIMIENTO_PLEI tampoco: es nuestro,
 * no de la facility; se muestra aparte para que el estado no salga sesgado a un solo lado.
 */
export function contributionsOf(e: StateEntry): Contribution[] {
  if (e.kind === "INSIGHT") return [];
  if (e.kind === "OBSERVATION") {
    // Sin tema fijo no se sabe a qué dimensión pertenece: cuenta chico en Trato y comunicación.
    if (e.sentiment === "NEGATIVE") return [{ dim: "D4", value: -0.5 }];
    if (e.sentiment === "POSITIVE") return [{ dim: "D4", value: 0.5 }];
    return [];
  }
  switch (e.eventType) {
    case "RETIRO_SLOT": {
      // Sustitución de un slot comprometido > retiro con poco aviso > retiro con aviso (y mantenimiento/error, que casi no pesan).
      let v = e.subtype === "SUBSTITUTION" ? 2 : e.subtype === "RENTED_PRIVATE" ? 1.5 : e.subtype === "MAINTENANCE" || e.subtype === "BOOKING_ERROR" ? 0.5 : 1;
      if (e.committedSlot) v *= 1.5;
      if (e.hours !== null) v *= e.hours < 24 ? 1.5 : e.hours < 72 ? 1.2 : 1;
      if (e.hoursSincePublished !== null && e.hoursSincePublished <= 1) v *= 1.3;
      if (e.playersSigned !== null && e.playersSigned > 0) v *= 1.2;
      return [{ dim: "D1", value: -Math.min(5, v) }];
    }
    case "LIBERACION_TARDIA":
      return [{ dim: "D2", value: -(e.hours !== null && e.hours < 24 ? 1.5 : 1) }];
    case "OFERTA_RESIDUAL":
      return [{ dim: "D2", value: e.subtype === "ONLY_LEFTOVERS" ? -1.2 : e.subtype === "MAX_ONE_PER_DAY" ? -0.8 : -1 }];
    case "QUEJA_JUGADOR":
      return [{ dim: "D2", value: -0.5 }];
    case "PEDIDO": {
      // Insistir es neutral; lo que pesa es cómo termina cuando decimos que no.
      const byResolution: Record<string, number> = { ACCEPTED: 0, REJECTED_ACCEPTED: 0.5, REJECTED_INSISTED_ACCEPTED: -0.5, REJECTED_REACTED_BADLY: -1.5, IMPOSED_CONDITION: -2 };
      const out: Contribution[] = [{ dim: "D3", value: byResolution[e.resolution ?? ""] ?? 0 }];
      if (e.tone === "TENSE") out.push({ dim: "D4", value: -0.5 });
      if (e.tone === "HOSTILE") out.push({ dim: "D4", value: -1.5 });
      return out;
    }
    case "TRATO_INADECUADO":
      return [{ dim: "D4", value: -clamp(e.severity ?? 1, 1, 3) }];
    case "SIN_RESPUESTA":
      return [{ dim: "D4", value: e.hours === null ? -1 : -(0.5 + Math.min(e.hours, 96) / 48) }];
    case "POSITIVO":
      if (e.subtype === "EXTRA_SLOT") return [{ dim: "D2", value: 1.5 }];
      if (e.subtype === "EARLY_NOTICE") return [{ dim: "D1", value: 1 }];
      if (e.subtype === "ACCEPTED_NO") return [{ dim: "D3", value: 1 }];
      return [{ dim: "D4", value: e.subtype === "SOLVED_PROBLEM" ? 1.5 : 1 }];
    default:
      return [];
  }
}

/** Multiplicador por perspectivas: +0,5 por cada "coincido" (tope 2) y −0,3 por cada "no coincido" (piso 0,3). */
export function reactionMultiplier(agree: number, disagree: number): number {
  return clamp(1 + 0.5 * agree - 0.3 * disagree, 0.3, 2);
}

function decay(age: number): number {
  return Math.pow(0.5, age / HALF_LIFE_DAYS);
}

export function scoreOf(sum: number): number {
  return Math.round(50 + 50 * Math.tanh(sum / SCORE_SCALE));
}

// ---------- Resultado ----------
export type DimensionState = {
  /** 0–100 (50 neutro) o null si no hay señal suficiente. */
  score: number | null;
  /** Suma de pesos efectivos (cuánta evidencia hay, no su signo). */
  weight: number;
};

export type FacilityState = {
  dims: Record<Dimension, DimensionState>;
  reliability: number | null;
  relation: number | null;
  quadrant: QuadrantKey;
  suggestedAction: ActionKey | null;
  trend: Trend | null;
  confidence: Confidence;
  /** Eventos negativos cada 10 partidos confirmados (90 días). null si hay menos de 10 partidos. */
  friction: number | null;
  /** % de las cancelaciones de 90 días atribuibles a la facility (FACILITY_UNAVAILABLE + vinculadas), sin doble conteo. null con menos de 5 cancelaciones. */
  attributableShare: number | null;
  /** Tasa de demanda de la facility (90 días) o null sin base. */
  demandRate: number | null;
  /** Pedidos por mes (90 días): la insistencia, neutral por sí sola. */
  requestsPerMonth: number;
  /** % de pedidos rechazados que terminaron en reacción hostil o imposición: la conflictividad. null sin pedidos rechazados. */
  conflictShare: number | null;
  alerts: AlertKey[];
  entryCount: number;
  contributors: number;
  /** Aportes con perspectiva de más de una persona sobre el mismo hecho no se calculan acá: se ven con Coincido / No coincido. */
  lastDate: string | null;
};

export const QUADRANT_ACTION: Record<Exclude<QuadrantKey, "NO_SIGNAL">, ActionKey> = {
  PARTNER: "INVEST",
  RELIABLE_DIFFICULT: "MAINTAIN",
  OPPORTUNIST_CORDIAL: "CONDITION",
  OPPORTUNIST_CONFLICT: "REDUCE",
};

const NEGATIVE_EVENT_TYPES: readonly EventType[] = ["RETIRO_SLOT", "LIBERACION_TARDIA", "OFERTA_RESIDUAL", "TRATO_INADECUADO", "SIN_RESPUESTA", "QUEJA_JUGADOR"];
const AVAILABILITY_TYPES: readonly EventType[] = ["RETIRO_SLOT", "LIBERACION_TARDIA"];

export function computeFacilityState(entries: StateEntry[], games: GameExposure, today: string): FacilityState {
  // ---- Dimensiones (con decaimiento y perspectivas) ----
  const sums: Record<Dimension, number> = { D1: 0, D2: 0, D3: 0, D4: 0 };
  const weights: Record<Dimension, number> = { D1: 0, D2: 0, D3: 0, D4: 0 };
  // Para la tendencia: suma firmada sin decaimiento en dos ventanas.
  let recentSum = 0, recentWeight = 0, priorSum = 0, priorWeight = 0;

  for (const e of entries) {
    const age = ageDays(e.occurredAt, today);
    const mult = reactionMultiplier(e.agree, e.disagree);
    for (const c of contributionsOf(e)) {
      const w = Math.abs(c.value) * decay(age) * mult;
      sums[c.dim] += Math.sign(c.value) * w;
      weights[c.dim] += w;
      const raw = c.value * mult;
      if (age < TREND_RECENT_DAYS) { recentSum += raw; recentWeight += Math.abs(raw); }
      else if (age < TREND_RECENT_DAYS + WINDOW_DAYS) { priorSum += raw; priorWeight += Math.abs(raw); }
    }
  }

  // Normalización por exposición: los eventos de disponibilidad pesan menos en una facility con mucho volumen.
  const exposureFactor = EXPOSURE_BASE_GAMES / Math.max(EXPOSURE_BASE_GAMES, games.confirmed + games.cancelled);
  const adj = (d: Dimension) => (d === "D1" || d === "D2" ? sums[d] * exposureFactor : sums[d]);
  const dims = {} as Record<Dimension, DimensionState>;
  for (const d of DIMENSIONS) dims[d] = { score: weights[d] >= MIN_SIGNAL ? scoreOf(adj(d)) : null, weight: Math.round(weights[d] * 10) / 10 };
  // Cada eje junta la evidencia de sus dos dimensiones: con hechos repartidos (un par de positivos acá, un retiro allá)
  // ninguna dimensión llega sola al mínimo, pero el eje sí tiene señal. La dimensión sin señal se sigue mostrando como tal.
  const axis = (a: Dimension, b: Dimension) => (weights[a] + weights[b] >= MIN_SIGNAL ? scoreOf(adj(a) + adj(b)) : null);
  const reliability = axis("D1", "D2");
  const relation = axis("D3", "D4");

  let quadrant: QuadrantKey = "NO_SIGNAL";
  if (reliability !== null && relation !== null) {
    const highRel = reliability >= AXIS_THRESHOLD;
    const goodRelation = relation >= AXIS_THRESHOLD;
    quadrant = highRel ? (goodRelation ? "PARTNER" : "RELIABLE_DIFFICULT") : goodRelation ? "OPPORTUNIST_CORDIAL" : "OPPORTUNIST_CONFLICT";
  }

  // ---- Tendencia: 30 días vs. los 90 previos, ambos llevados a ritmo "por 30 días" ----
  let trend: Trend | null = null;
  if (recentWeight >= 1 && priorWeight >= 1) {
    const delta = scoreOf(recentSum) - scoreOf(priorSum * (TREND_RECENT_DAYS / WINDOW_DAYS));
    trend = delta >= TREND_DELTA ? "UP" : delta <= -TREND_DELTA ? "DOWN" : "FLAT";
  }

  // ---- Confianza: cuántas personas distintas y cuántos aportes en 180 días ----
  const last180 = entries.filter((e) => ageDays(e.occurredAt, today) <= 180);
  const people180 = new Set(last180.map((e) => e.authorId).filter((a): a is string => !!a)).size;
  const confidence: Confidence = people180 >= 3 && last180.length >= 8 ? "HIGH" : people180 >= 2 && last180.length >= 4 ? "MEDIUM" : "LOW";

  // ---- Ventana de 90 días para los indicadores de conducta ----
  const w90 = entries.filter((e) => ageDays(e.occurredAt, today) < WINDOW_DAYS);
  const negativeEvents90 = w90.filter((e) => e.kind === "EVENT" && e.eventType !== null && NEGATIVE_EVENT_TYPES.includes(e.eventType)).length;
  const friction = games.confirmed >= 10 ? Math.round((negativeEvents90 / games.confirmed) * 100) / 10 : null;

  const requests = w90.filter((e) => e.kind === "EVENT" && e.eventType === "PEDIDO");
  const rejected = requests.filter((e) => e.resolution && e.resolution !== "ACCEPTED");
  const conflictive = rejected.filter((e) => e.resolution === "REJECTED_REACTED_BADLY" || e.resolution === "IMPOSED_CONDITION");
  const conflictShare = rejected.length > 0 ? Math.round((conflictive.length / rejected.length) * 100) : null;

  const attributable = games.facilityCancelled + games.linkedCancelled;
  const attributableShare = games.cancelled >= 5 ? Math.round((Math.min(attributable, games.cancelled) / games.cancelled) * 100) : null;
  const demandBase = games.confirmed + games.demandCancelled;
  const demandRate = demandBase > 0 ? games.confirmed / demandBase : null;

  // ---- Alertas ----
  const alerts: AlertKey[] = [];
  const availability90 = w90.filter((e) => e.kind === "EVENT" && e.eventType !== null && AVAILABILITY_TYPES.includes(e.eventType)).length;
  const unavailRate = games.confirmed + games.cancelled > 0 ? games.facilityCancelled / (games.confirmed + games.cancelled) : 0;
  // Cancelaciones por la facility en los datos pero ningún evento de disponibilidad cargado: falta registro, no "facility sana".
  if (games.facilityCancelled >= 3 && unavailRate >= 0.05 && availability90 === 0) alerts.push("SUB_LOGGING");
  const hostile90 = w90.filter((e) => (e.eventType === "TRATO_INADECUADO" && (e.severity ?? 1) >= 2) || ((e.eventType === "PEDIDO") && e.tone === "HOSTILE")).length;
  if (hostile90 >= 2) alerts.push("HOSTILE_REPEAT");
  const retiros60 = entries.filter((e) => e.eventType === "RETIRO_SLOT" && ageDays(e.occurredAt, today) < 60).length;
  if (retiros60 >= 3) alerts.push("RETIRO_STREAK");
  if (w90.filter((e) => e.eventType === "INCUMPLIMIENTO_PLEI").length >= 2) alerts.push("PLEI_FAULTS");

  let lastDate: string | null = null;
  for (const e of entries) if (!lastDate || e.occurredAt > lastDate) lastDate = e.occurredAt;

  return {
    dims,
    reliability,
    relation,
    quadrant,
    suggestedAction: quadrant === "NO_SIGNAL" ? null : QUADRANT_ACTION[quadrant],
    trend,
    confidence,
    friction,
    attributableShare,
    demandRate,
    requestsPerMonth: Math.round((requests.length / 3) * 10) / 10,
    conflictShare,
    alerts,
    entryCount: entries.length,
    contributors: new Set(entries.map((e) => e.authorId).filter((a): a is string => !!a)).size,
    lastDate,
  };
}
