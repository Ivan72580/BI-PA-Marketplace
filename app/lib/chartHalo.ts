import type { ChartData, ScriptableContext } from "chart.js";
import { resolveColor } from "./chartTheme";
import { tc } from "./themeTokens";
import { toRgba } from "./themeClient";

type LineDatasets = ChartData<"line">["datasets"];
type LineDataset = LineDatasets[number];

/**
 * "Halo": relleno en gradiente que se desvanece desde el color de la línea
 * (arriba, semi-transparente) hasta transparente del todo en la base del
 * gráfico. Se usa como backgroundColor "scriptable" de Chart.js: la librería
 * la vuelve a llamar cada vez que cambia el área de dibujo (resize, etc.).
 */
export function haloFill(colorOrToken: string) {
  return (context: ScriptableContext<"line">) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    // Puede venir como token de tema (tc(...)): se resuelve en cada llamada,
    // así el halo también cambia al cambiar el tema.
    const color = resolveColor(colorOrToken, chart.canvas);
    // Antes del primer layout chartArea no existe todavía: devolvemos un
    // color plano de reserva para que Chart.js no falle al pintar.
    if (!chartArea) return toRgba(color, 0.16);
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, toRgba(color, 0.35));
    gradient.addColorStop(0.55, toRgba(color, 0.1));
    gradient.addColorStop(1, toRgba(color, 0));
    return gradient;
  };
}

/**
 * Aplica el estilo estándar de "halo" (línea suavizada + relleno degradado
 * hacia la base) a todos los datasets de un gráfico de línea, respetando
 * cualquier valor que el caller ya haya definido explícitamente (fill,
 * tension, grosor, radio de puntos, etc.) y usando el borderColor de cada
 * dataset como color base del halo.
 */
export function withHaloStyle(datasets: LineDatasets): LineDatasets {
  return datasets.map((ds: LineDataset) => {
    const color = typeof ds.borderColor === "string" ? ds.borderColor : tc("series-positive");
    return {
      ...ds,
      fill: ds.fill ?? true,
      tension: ds.tension ?? 0.4,
      borderWidth: ds.borderWidth ?? 2.5,
      borderCapStyle: ds.borderCapStyle ?? "round",
      borderJoinStyle: ds.borderJoinStyle ?? "round",
      pointRadius: ds.pointRadius ?? 0,
      pointHoverRadius: ds.pointHoverRadius ?? 5,
      pointHitRadius: ds.pointHitRadius ?? 12,
      pointBackgroundColor: ds.pointBackgroundColor ?? ds.borderColor ?? color,
      pointBorderColor: ds.pointBorderColor ?? tc("chart-point-ring"),
      pointBorderWidth: ds.pointBorderWidth ?? 2,
      backgroundColor: haloFill(color),
    };
  });
}
