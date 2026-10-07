import type { Prisma } from "@prisma/client";

// =====================================================================================
// Definición única de "tasa de demanda" (decisión de Ivan, 7/10/26).
//
// El objetivo de la herramienta es operar en base a la DEMANDA, no a la oferta. Por eso el
// % de confirmación que se muestra como principal en todas las páginas cuenta solo las
// cancelaciones que hablan de demanda:
//
//   tasa de demanda = confirmados / (confirmados + cancelados por falta de jugadores [+ sin motivo])
//
// Todo lo demás se saca del denominador y se reporta aparte, en tres grupos:
//
//   fieldUnavailable  "Field time no longer available" y pedidos/cierres de la facility
//                     (FACILITY_UNAVAILABLE). Es el indicador operativo accionable: mide qué
//                     tan confiable es la oferta que publican las facilities.
//   operational       OTHER, WEATHER, MAINTENANCE, HOLIDAY. Arreglos de agenda forzados por
//                     decisiones operativas o factores externos, más allá del motivo (ej. una
//                     facility avisa el mismo día que cierra por feriado). No son demanda, y
//                     son tema de negociación con la facility más que de operación diaria.
//   plugin            PLUGIN. Cancelaciones de facilities manejadas por agentes externos a
//                     Operaciones; se excluyen también de la planificación.
//
// Una cancelación SIN motivo cargado se deja dentro del denominador (criterio conservador:
// si no se sabe por qué, no se la saca de la cuenta).
//
// La tasa "cruda" (confirmados / publicados) se sigue calculando y se muestra al lado,
// etiquetada, para que nadie tenga que adivinar de dónde sale cada número.
//
// Este archivo no importa el cliente de Prisma en runtime (solo tipos) a propósito: las
// categorías se manejan como strings, igual que en shared.ts.
// =====================================================================================

export type CancellationBucket = "demand" | "fieldUnavailable" | "operational" | "plugin";

const BUCKET_BY_CATEGORY: Record<string, CancellationBucket> = {
  NOT_ENOUGH_PLAYERS: "demand",
  FACILITY_UNAVAILABLE: "fieldUnavailable",
  OTHER: "operational",
  WEATHER: "operational",
  MAINTENANCE: "operational",
  HOLIDAY: "operational",
  PLUGIN: "plugin",
};

/** Grupo de una cancelación según su categoría. Sin categoría (sin motivo) cuenta como demanda. */
export function bucketOf(category: string | null | undefined): CancellationBucket {
  if (!category) return "demand";
  // Una categoría nueva que todavía no está mapeada se trata como operativa: más seguro no
  // atribuirla a demanda que inflar la cancelación por demanda.
  return BUCKET_BY_CATEGORY[category] ?? "operational";
}

/** ¿Este partido entra al denominador de la tasa de demanda? Confirmados siempre; cancelados solo si hablan de demanda. */
export function countsForDemand(status: string, category: string | null | undefined): boolean {
  return status === "CONFIRMED" || bucketOf(category) === "demand";
}

/**
 * Filtro de Prisma equivalente a countsForDemand. Ojo: se arma con OR explícito y no con NOT,
 * porque `NOT { cancellationCategory: x }` excluye las filas con categoría NULL en SQL.
 */
export const COUNTS_FOR_DEMAND_WHERE: Prisma.GameWhereInput = {
  OR: [{ status: "CONFIRMED" }, { cancellationCategory: null }, { cancellationCategory: "NOT_ENOUGH_PLAYERS" }],
};

/** Combina un where existente con el filtro de demanda sin pisar ninguna clave. */
export function withDemandOnly(where: Prisma.GameWhereInput): Prisma.GameWhereInput {
  return { AND: [where, COUNTS_FOR_DEMAND_WHERE] };
}

/** Conteos de una cancelación por grupo, a partir de filas {categoría -> cantidad}. */
export type CancellationBuckets = Record<CancellationBucket, number>;
export function emptyBuckets(): CancellationBuckets {
  return { demand: 0, fieldUnavailable: 0, operational: 0, plugin: 0 };
}
export function addToBuckets(b: CancellationBuckets, category: string | null | undefined, count: number): void {
  b[bucketOf(category)] += count;
}

/** Tasa de demanda: confirmados / (confirmados + cancelados por demanda). 0 si no hay base. */
export function demandRate(confirmed: number, demandCancelled: number): number {
  const base = confirmed + demandCancelled;
  return base > 0 ? confirmed / base : 0;
}

/** Tasa cruda: confirmados / publicados (todas las cancelaciones cuentan). */
export function rawRate(confirmed: number, cancelledAll: number): number {
  const base = confirmed + cancelledAll;
  return base > 0 ? confirmed / base : 0;
}
