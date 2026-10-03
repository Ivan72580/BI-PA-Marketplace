import type { MiniComparison, FocusTrigger } from "../../lib/db/reports";
import type { CompareRow } from "../charts/MiniCompareBars";

type Translator = (key: string, values?: Record<string, string | number>) => string;

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

// Etiquetas de cada comparativa de Foco de la semana según de dónde viene
// el hallazgo — mismo "kind" (ver MiniComparison) significa pares distintos
// según el trigger, así que las etiquetas se arman acá, no en el tipo de
// datos. Compartido entre Ops y Executive (hallazgo 3 del mapeo de lógica
// no expuesta, 3/10/26): antes vivía solo adentro de OpsReportDocument.tsx,
// el único de los dos reportes que leía facilityFocus/opportunitySignals.
export function focusCompareLabels(trigger: FocusTrigger, t: Translator): { first: string; second: string } {
  switch (trigger) {
    case "volumeDrop":
      return { first: t("facilityFocus.compare.prior"), second: t("facilityFocus.compare.current") };
    case "cancellationHigh":
      return { first: t("facilityFocus.compare.facility"), second: t("facilityFocus.compare.network") };
    case "paretoShare":
      return { first: t("facilityFocus.compare.facilityShare"), second: t("facilityFocus.compare.restOfNetwork") };
  }
}
