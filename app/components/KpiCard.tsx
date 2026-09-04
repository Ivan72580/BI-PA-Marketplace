"use client";

import { useState } from "react";
import ChangeBadge from "./ChangeBadge";

export default function KpiCard({
  label,
  value,
  sublabel,
  delta,
  deltaInvert,
  tone = "default",
  staticDelta = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  delta?: number | null;
  deltaInvert?: boolean;
  tone?: "default" | "brand" | "danger";
  staticDelta?: boolean;
}) {
  const [showDelta, setShowDelta] = useState(false);
  // Regla: los valores siempre en el mismo color — solo la variación % es
  // verde o rojo según corresponda (eso lo resuelve ChangeBadge).
  const hasComparison = delta !== undefined;
  const deltaVisible = staticDelta || showDelta;

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-sm text-ink-muted">{label}</div>
        {hasComparison && !staticDelta && (
          <button
            type="button"
            onClick={() => setShowDelta((v) => !v)}
            title="Comparar vs. período anterior"
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showDelta ? "bg-brand text-white" : "bg-surface-sunken text-ink-faint hover:text-ink-muted"
            }`}
          >
            vs. anterior
          </button>
        )}
      </div>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <div className="font-display text-3xl font-semibold text-ink">{value}</div>
        {deltaVisible && hasComparison && <ChangeBadge value={delta ?? null} invert={deltaInvert} />}
      </div>
      {sublabel && <div className="text-xs text-ink-faint mt-1">{sublabel}</div>}
    </div>
  );
}
