import type { ChartData, ScriptableContext } from "chart.js";

type LineDatasets = ChartData<"line">["datasets"];
type LineDataset = LineDatasets[number];

/** Convierte un color (hex #rrggbb/#rgb o rgb/rgba(...)) en rgba(...) con la opacidad indicada. */
function toRgba(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const nums = color.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
  }
  return color;
}

/**
 * "Halo": relleno en gradiente que se desvanece desde el color de la línea
 * (arriba, semi-transparente) hasta transparente del todo en la base del
 * gráfico. Se usa como backgroundColor "scriptable" de Chart.js: la librería
 * la vuelve a llamar cada vez que cambia el área de dibujo (resize, etc.).
 */
export function haloFill(color: string) {
  return (context: ScriptableContext<"line">) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
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
    const color = typeof ds.borderColor === "string" ? ds.borderColor : "#16755c";
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
      pointBackgroundColor: ds.pointBackgroundColor ?? ds.borderColor,
      pointBorderColor: ds.pointBorderColor ?? "#ffffff",
      pointBorderWidth: ds.pointBorderWidth ?? 2,
      backgroundColor: haloFill(color),
    };
  });
}
