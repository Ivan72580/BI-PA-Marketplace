import type { MiniComparison } from "../../lib/db/reports";
import type { CompareRow } from "../charts/MiniCompareBars";

// Adaptador entre MiniComparison (app/lib/db/reports.ts — números crudos,
// sin saber nada de i18n ni de qué tarjeta los usa) y MiniCompareBars (solo
// sabe dibujar {label, value}[]). Las etiquetas se pasan desde cada lugar
// que lo llama porque el mismo "kind" significa cosas distintas según la
// sección (p.ej. "vsBaseline" es "cancha vs. red" en Foco de la semana pero
// "franja vs. promedio de la cancha" en Oportunidades).
export function rowsForComparison(
  comparison: MiniComparison,
  labels: { first: string; second: string }
): { rows: CompareRow[]; isPct: boolean } {
  switch (comparison.kind) {
    case "beforeAfter":
      return {
        rows: [
          { label: labels.first, value: comparison.before },
          { label: labels.second, value: comparison.after },
        ],
        isPct: false,
      };
    case "vsBaseline":
      return {
        rows: [
          { label: labels.first, value: comparison.value },
          { label: labels.second, value: comparison.baseline },
        ],
        isPct: true,
      };
    case "shareOfTotal":
      return {
        rows: [
          { label: labels.first, value: comparison.share },
          { label: labels.second, value: 1 - comparison.share },
        ],
        isPct: true,
      };
  }
}
