import type { CancellationCategory } from "@prisma/client";

/**
 * Clasifica el texto libre del motivo de cancelación del CSV en una categoría.
 * Única fuente de esta regla: la usan el importador y el script de re-clasificación
 * (scripts/recategorize-cancellations.ts), así que cambiar una palabra clave acá y
 * correr ese script actualiza también lo ya cargado.
 *
 * Qué cuenta contra la demanda y qué no lo define app/lib/metrics.ts (por categoría).
 */
// Devuelve literales (no el enum en runtime) para poder probarse sin el cliente generado de Prisma.
export function categorizeCancellation(raw: string | undefined | null): CancellationCategory | null {
  if (!raw) return null;
  const r = raw.trim().toLowerCase();
  if (!r || r === "na" || r === "n/a") return "OTHER";

  // "Cancelled due to plugin": cancelaciones de facilities manejadas por agentes
  // externos a Operaciones. Va primero para que ninguna otra palabra la capture.
  if (/plug[\s-]?in/.test(r)) return "PLUGIN";

  if (r.includes("not enough players") || r.includes("last minute drop")) {
    return "NOT_ENOUGH_PLAYERS";
  }
  if (r.includes("field time") || r.includes("facility") || r.includes("contact with the facility")) {
    return "FACILITY_UNAVAILABLE";
  }
  if (r.includes("weather")) {
    return "WEATHER";
  }
  if (r.includes("maintenance") || r.includes("construction")) {
    return "MAINTENANCE";
  }
  if (r.includes("holiday")) {
    return "HOLIDAY";
  }
  return "OTHER";
}
