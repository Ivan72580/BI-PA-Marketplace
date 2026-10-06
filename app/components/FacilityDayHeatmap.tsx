"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

export type FacilityDayHeatmapCell = {
  occurrences: number;
  avgGames: number;
  avgConfirmed: number;
  avgCancelled: number;
  confirmationRate: number;
  cancellationRate: number;
};

export type FacilityDayHeatmapRow = {
  facilityId: string;
  facilityName: string;
  totalGames: number;
  // Link ya resuelto en el servidor: una función no se puede pasar de un Server
  // Component a este Client Component (rompe el render al filtrar por Market).
  href: string;
  cells: Partial<Record<string, FacilityDayHeatmapCell>>;
};

// Mismo umbral que MIN_SAMPLE_FOR_DAY_SUMMARY en /daily (buildDayOfWeekSummaries):
// con menos de 3 fechas distintas registradas, el promedio de esa celda es
// demasiado ruidoso para mostrarlo con color/confianza.
const MIN_OCCURRENCES = 3;

// Mismo esquema verde/rojo con 2 niveles (fuerte a partir de 75%) que ya usa
// SlotCalendarView — no se comparte el módulo porque ahí vive acoplado a su
// propio grid de día×hora, pero el criterio visual es el mismo.
const COLOR = {
  green: { strong: "bg-brand text-white", soft: "bg-brand-soft text-brand" },
  red: { strong: "bg-danger text-white", soft: "bg-danger-soft text-danger" },
} as const;
const HIGHLIGHT_THRESHOLD = 0.75;

function formatPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

export default function FacilityDayHeatmap({
  rows,
  columns,
}: {
  rows: FacilityDayHeatmapRow[];
  // Orden de columnas (Lunes -> Domingo) con su label ya traducido/abreviado.
  columns: { key: string; label: string }[];
}) {
  const t = useTranslations("Trends.facilityHeatmap");
  const [mode, setMode] = useState<"confirmed" | "cancelled">("confirmed");
  const colors = mode === "confirmed" ? COLOR.green : COLOR.red;

  if (rows.length === 0) {
    return <div className="text-sm text-ink-faint">{t("empty")}</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs text-ink-faint max-w-md">{t("hint")}</p>
        <div className="flex items-center rounded-lg bg-surface-sunken p-0.5 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setMode("confirmed")}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === "confirmed" ? "bg-brand text-white" : "text-ink-muted hover:text-ink"}`}
          >
            {t("toggleConfirmed")}
          </button>
          <button
            type="button"
            onClick={() => setMode("cancelled")}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === "cancelled" ? "bg-danger text-white" : "text-ink-muted hover:text-ink"}`}
          >
            {t("toggleCancelled")}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <table className="min-w-full text-xs border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-medium text-ink-muted pb-1 pl-1">{t("facilityColumn")}</th>
              {columns.map((c) => (
                <th key={c.key} className="text-center text-[10px] font-medium text-ink-muted pb-1 w-[76px]">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.facilityId}>
                <td className="pr-2 pl-1 whitespace-nowrap">
                  <Link href={r.href} className="text-ink hover:text-brand font-medium truncate block max-w-[160px]">
                    {r.facilityName}
                  </Link>
                </td>
                {columns.map((c) => {
                  const cell = r.cells[c.key];
                  if (!cell || cell.occurrences === 0) {
                    return (
                      <td key={c.key} className="rounded-lg bg-surface-sunken/40 text-center text-ink-faint py-2">—</td>
                    );
                  }
                  const rate = mode === "confirmed" ? cell.confirmationRate : cell.cancellationRate;
                  const lowSample = cell.occurrences < MIN_OCCURRENCES;
                  const bg = lowSample ? "bg-surface-sunken/60" : rate >= HIGHLIGHT_THRESHOLD ? colors.strong : colors.soft;
                  const secondary = mode === "confirmed" ? cell.avgConfirmed : cell.avgCancelled;
                  return (
                    <td key={c.key} className="p-0">
                      <div
                        title={lowSample ? t("lowSampleTooltip", { n: cell.occurrences }) : undefined}
                        className={`rounded-lg text-center py-1.5 ${bg} ${lowSample ? "opacity-60" : ""}`}
                      >
                        <div className="font-semibold text-[13px] leading-tight">≈{cell.avgGames.toFixed(1)}</div>
                        <div className="text-[10px] opacity-90 leading-tight">
                          ≈{secondary.toFixed(1)} · {formatPct(rate)}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-ink-faint mt-2 px-1">{t("legend")}</div>
    </div>
  );
}
