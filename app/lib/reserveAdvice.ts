import { MUST_SCHEDULE_MIN_SAMPLE } from "./mustSchedule";

// =====================================================================================
// Definición única de la sugerencia "reservar la cancha con anticipación" (Asegurar cancha), compartida por
// el plan de 7 días de Pronóstico y la vista "A agendar". Cancha no disponible NO alcanza por sí sola: el slot
// tiene que valer la pena.
//
//  1. Se perdió por cancha no disponible en los últimos RESERVE_RECENT_DAYS días.
//  2. En la ventana reciente es un slot con potencial: tasa de demanda >= RESERVE_MIN_RATE con muestra mínima.
//  3. El énfasis depende de cuántos jugadores tenía el partido cuando se canceló, contra lo que reúne el slot
//     en sus últimas ediciones confirmadas (la tendencia reciente):
//       - >= STRONG_PLAYERS_RATIO de lo habitual  → "strong": el partido iba a salir; reservá la cancha.
//       - menos                                  → "test":   hay potencial pero no se vio la demanda del
//                                                  día; probá reservarla para medir si responde.
//     Si hubo varias pérdidas recientes se toma la que tenía más jugadores (la mejor evidencia de demanda).
// =====================================================================================

export const RESERVE_MIN_RATE = 0.75;
export const RESERVE_MIN_BASE = MUST_SCHEDULE_MIN_SAMPLE;
export const RESERVE_RECENT_DAYS = 28;
export const STRONG_PLAYERS_RATIO = 0.8;
export const BASELINE_EDITIONS = 6; // últimas N ediciones confirmadas que definen "lo habitual"

export type FieldLoss = { date: string; players: number };
export type ReserveLevel = "strong" | "test";
export type ReserveAdvice = {
  level: ReserveLevel;
  playersAtLoss: number; // jugadores del partido perdido con más jugadores (dentro de la ventana de pérdidas recientes)
  lossDate: string;
  baseline: number; // jugadores habituales del slot en sus últimas ediciones confirmadas
  ratio: number | null; // playersAtLoss / baseline
  recentLosses: number; // pérdidas por cancha dentro de RESERVE_RECENT_DAYS
};

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/**
 * `confirmedPlayers`: jugadores finales de las ediciones confirmadas del slot, en orden cronológico.
 * Devuelve null si no corresponde sugerir la reserva.
 */
export function reserveAdvice(input: {
  base: number;
  rate: number | null;
  losses: FieldLoss[];
  confirmedPlayers: number[];
  toISO: string;
}): ReserveAdvice | null {
  const { base, rate, losses, confirmedPlayers, toISO } = input;
  if (base < RESERVE_MIN_BASE || rate === null || rate < RESERVE_MIN_RATE) return null;
  const recent = losses.filter((l) => daysBetween(l.date, toISO) <= RESERVE_RECENT_DAYS);
  if (recent.length === 0) return null;
  const lastN = confirmedPlayers.slice(-BASELINE_EDITIONS);
  const baseline = lastN.length > 0 ? lastN.reduce((s, n) => s + n, 0) / lastN.length : 0;
  const best = recent.reduce((a, b) => (b.players > a.players ? b : a));
  const ratio = baseline > 0 ? best.players / baseline : null;
  return {
    level: ratio !== null && ratio >= STRONG_PLAYERS_RATIO ? "strong" : "test",
    playersAtLoss: best.players,
    lossDate: best.date,
    baseline,
    ratio,
    recentLosses: recent.length,
  };
}
