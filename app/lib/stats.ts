// Estadística pura, sin dependencias de la base — se aplica sobre series ya
// calculadas (ej: la tasa de confirmación mes a mes) para medir qué tan
// consistente o errático es un comportamiento en el tiempo.

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Coeficiente de variación: desvío / promedio. Es la forma estándar de
// comparar "qué tan errático" es algo sin importar la escala del número
// (una tasa 0-1 y un recuento de partidos no son comparables en desvío
// absoluto, pero sí en CV).
export function coefficientOfVariation(values: number[]): number | null {
  const m = mean(values);
  if (m === 0) return null;
  return stdDev(values) / Math.abs(m);
}

export type ConsistencyLevel = "muy_consistente" | "consistente" | "variable" | "muy_variable";

export function consistencyLevel(cv: number | null): ConsistencyLevel {
  if (cv === null) return "muy_variable";
  if (cv < 0.1) return "muy_consistente";
  if (cv < 0.25) return "consistente";
  if (cv < 0.5) return "variable";
  return "muy_variable";
}

export const CONSISTENCY_LABEL: Record<ConsistencyLevel, string> = {
  muy_consistente: "Muy consistente",
  consistente: "Consistente",
  variable: "Variable",
  muy_variable: "Muy variable",
};

// Encuentra el índice de mayor y menor valor en un array, ignorando null/undefined.
export function argMaxMin(values: (number | null)[]): { maxIndex: number | null; minIndex: number | null } {
  let maxIndex: number | null = null;
  let minIndex: number | null = null;
  values.forEach((v, i) => {
    if (v === null || v === undefined) return;
    if (maxIndex === null || v > (values[maxIndex] as number)) maxIndex = i;
    if (minIndex === null || v < (values[minIndex] as number)) minIndex = i;
  });
  return { maxIndex, minIndex };
}
