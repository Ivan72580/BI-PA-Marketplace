"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ChangeBadge from "./ChangeBadge";

export type KpiDetailRow = { label: string; value: string; flag?: boolean };
export type KpiDetail = { rows: KpiDetailRow[]; note?: string };

// Misma tarjeta que KpiTile (Server Component, en LeadershipOverview.tsx),
// pero con un desglose plegable opcional — "un pequeño insight/detalle sobre
// cada indicador" sin dejarlo siempre visible como texto permanente. Solo
// los KPIs para los que YA hay un desglose real calculado (motivo de
// cancelación, contribución por facility) reciben esto — no se fabrica un
// desglose donde no hay dato de respaldo.
export default function ExpandableKpiTile({
  label,
  value,
  delta,
  deltaUnit = "pct",
  invert,
  sub,
  detail,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaUnit?: "pct" | "pts";
  invert?: boolean;
  sub?: string;
  detail?: KpiDetail;
}) {
  const t = useTranslations("Leadership");
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(detail && detail.rows.length > 0);

  return (
    <div className="rounded-2xl bg-surface shadow-sm p-4">
      <div className="flex items-start justify-between gap-1">
        <div className="text-xs text-ink-faint">{label}</div>
        {hasDetail && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-ink-faint hover:text-brand text-xs leading-none shrink-0 -mt-0.5"
            aria-expanded={open}
            aria-label={t("detail.toggle")}
          >
            {open ? "▲" : "▾"}
          </button>
        )}
      </div>
      <div className="font-display text-2xl font-semibold text-ink mt-1">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="flex items-center gap-2 mt-1 min-h-[18px] flex-wrap">
          {delta !== undefined && <ChangeBadge value={delta} unit={deltaUnit} invert={invert} />}
          {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
        </div>
      )}
      {hasDetail && open && (
        <div className="mt-3 pt-3 border-t border-surface-sunken space-y-1">
          {detail!.rows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between text-[11px] gap-2 ${r.flag ? "text-danger font-medium" : "text-ink-muted"}`}>
              <span className="truncate">{r.label}</span>
              <span className="shrink-0">{r.value}</span>
            </div>
          ))}
          {detail!.note && <div className="text-[11px] text-ink-faint pt-1">{detail!.note}</div>}
        </div>
      )}
    </div>
  );
}
