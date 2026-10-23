// Referencias a colores de tema para Chart.js, sin depender de chart.js ni del
// DOM: se pueden armar en Server Components (que arman el `data` de un gráfico)
// y se resuelven en el cliente (ver chartTheme.ts).

export const TOKEN_PREFIX = "token:";

/** Color de tema para un dataset de Chart.js: tc("series-positive") o con opacidad tc("series-positive", 0.2). */
export function tc(name: string, alpha?: number): string {
  return alpha === undefined ? `${TOKEN_PREFIX}${name}` : `${TOKEN_PREFIX}${name}@${alpha}`;
}

export function isToken(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(TOKEN_PREFIX);
}

/** Variable CSS de un token, para SVG/HTML (style={{ stroke: cssVar("series-positive") }}). */
export function cssVar(name: string): string {
  return `var(--c-${name})`;
}
