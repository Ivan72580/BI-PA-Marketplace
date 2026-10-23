// Tema para Chart.js. Chart.js dibuja en <canvas> y no entiende variables CSS,
// así que los colores de un dataset se escriben como token — tc("series-positive"),
// o tc("series-positive", 0.2) con opacidad — y este plugin los resuelve contra
// globals.css cada vez que el gráfico se actualiza. Al cambiar el tema (selector,
// sistema operativo, impresión) se re-actualizan todas las instancias.
//
// Importar este módulo alcanza para activarlo: registra el plugin y los
// listeners una sola vez. Lo importan los wrappers de app/components/charts.

import { Chart as ChartJS, type Plugin } from "chart.js";
import { onThemeChange, themeColor } from "./themeClient";

import { isToken, TOKEN_PREFIX as PREFIX } from "./themeTokens";

export { tc } from "./themeTokens";

/** Resuelve un color que puede ser token; cualquier otro valor pasa tal cual. */
export function resolveColor(value: string, el?: Element | null): string {
  if (!isToken(value)) return value;
  const [name, alpha] = value.slice(PREFIX.length).split("@");
  return themeColor(name, alpha === undefined ? undefined : Number(alpha), el) || value;
}

const COLOR_KEYS = [
  "borderColor",
  "backgroundColor",
  "pointBackgroundColor",
  "pointBorderColor",
  "pointHoverBackgroundColor",
  "pointHoverBorderColor",
  "hoverBackgroundColor",
  "hoverBorderColor",
] as const;

type Src = Partial<Record<(typeof COLOR_KEYS)[number], { token: unknown; resolved: unknown }>>;
const sources = new WeakMap<object, Src>();

function resolveValue(v: unknown, el: Element): unknown {
  if (isToken(v)) return resolveColor(v, el);
  if (Array.isArray(v) && v.some(isToken)) return v.map((x) => (isToken(x) ? resolveColor(x, el) : x));
  return v;
}

function hasToken(v: unknown): boolean {
  return isToken(v) || (Array.isArray(v) && v.some(isToken));
}

const themeTokenPlugin: Plugin = {
  id: "themeTokens",
  beforeUpdate(chart) {
    const el = chart.canvas;
    for (const ds of chart.data.datasets as unknown as Record<string, unknown>[]) {
      let src = sources.get(ds);
      if (!src) {
        src = {};
        sources.set(ds, src);
      }
      for (const key of COLOR_KEYS) {
        const current = ds[key];
        const known = src[key];
        if (hasToken(current)) {
          // Token nuevo (primer render o props nuevas de React).
          const resolved = resolveValue(current, el);
          src[key] = { token: current, resolved };
          ds[key] = resolved;
        } else if (known && current === known.resolved) {
          // Ya resuelto antes: se vuelve a resolver por si cambió el tema.
          const resolved = resolveValue(known.token, el);
          known.resolved = resolved;
          ds[key] = resolved;
        } else if (known) {
          // El caller pasó un color literal nuevo: deja de ser token.
          delete src[key];
        }
      }
    }
  },
};

function applyDefaults() {
  ChartJS.defaults.color = themeColor("chart-text") || ChartJS.defaults.color;
  ChartJS.defaults.borderColor = themeColor("chart-grid") || ChartJS.defaults.borderColor;
}

function refreshAll() {
  applyDefaults();
  for (const chart of Object.values(ChartJS.instances)) chart.update("none");
}

let installed = false;
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  ChartJS.register(themeTokenPlugin);
  applyDefaults();
  onThemeChange(refreshAll);

  // Impresión: @media print fuerza las variables a claro, pero el canvas ya
  // está dibujado con los colores de pantalla. Se fuerza claro en la raíz
  // durante la impresión y se redibuja de forma sincrónica antes del snapshot.
  let previous: string | null = null;
  let forced = false;
  window.addEventListener("beforeprint", () => {
    previous = document.documentElement.getAttribute("data-theme");
    forced = previous !== "light";
    if (!forced) return;
    document.documentElement.setAttribute("data-theme", "light");
    refreshAll();
  });
  window.addEventListener("afterprint", () => {
    if (!forced) return;
    if (previous) document.documentElement.setAttribute("data-theme", previous);
    else document.documentElement.removeAttribute("data-theme");
    forced = false;
    refreshAll();
  });
}

install();
