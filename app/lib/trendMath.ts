export type TrendStats = {
  mean: number;
  stdDev: number;
  coefficientOfVariation: number | null; // null si no hay suficiente data o el promedio es 0
  variabilityLabel: "Muy estable" | "Moderadamente variable" | "Muy variable" | "Sin datos suficientes";
  slope: number; // cambio por bucket, en la escala del valor original
  direction: "alza" | "baja" | "estable";
  changeFromFirstToLast: number | null; // % de cambio entre el primer y el último punto
  forecastNext: number | null; // proyección lineal simple (mínimos cuadrados) para el próximo bucket
};

// Estadística simple y transparente a propósito: nada de modelos de caja
// negra. Regresión lineal por mínimos cuadrados sobre el índice de cada
// bucket, y coeficiente de variación (desvío / promedio) para variabilidad.
export function computeTrendStats(values: number[]): TrendStats {
  const n = values.length;

  if (n === 0) {
    return {
      mean: 0,
      stdDev: 0,
      coefficientOfVariation: null,
      variabilityLabel: "Sin datos suficientes",
      slope: 0,
      direction: "estable",
      changeFromFirstToLast: null,
      forecastNext: null,
    };
  }

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = n >= 3 && mean !== 0 ? stdDev / Math.abs(mean) : null;

  let variabilityLabel: TrendStats["variabilityLabel"] = "Sin datos suficientes";
  if (coefficientOfVariation !== null) {
    if (coefficientOfVariation < 0.1) variabilityLabel = "Muy estable";
    else if (coefficientOfVariation < 0.25) variabilityLabel = "Moderadamente variable";
    else variabilityLabel = "Muy variable";
  }

  // Regresión lineal simple: value = intercept + slope * bucketIndex
  let slope = 0;
  let intercept = mean;
  if (n >= 2) {
    const xMean = (n - 1) / 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - mean);
      den += (i - xMean) ** 2;
    }
    slope = den !== 0 ? num / den : 0;
    intercept = mean - slope * xMean;
  }

  const direction: TrendStats["direction"] =
    n < 3 || Math.abs(slope) < Math.abs(mean) * 0.02 ? "estable" : slope > 0 ? "alza" : "baja";

  const changeFromFirstToLast =
    n >= 2 && values[0] !== 0 ? (values[n - 1] - values[0]) / Math.abs(values[0]) : null;

  const forecastNext = n >= 2 ? intercept + slope * n : null;

  return { mean, stdDev, coefficientOfVariation, variabilityLabel, slope, direction, changeFromFirstToLast, forecastNext };
}
