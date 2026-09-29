"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

export type PanelInsightSeverity = "critical" | "notable" | "info";
export type PanelInsight = { text: string; href?: string; severity?: PanelInsightSeverity };
export type PanelInsightGroup = { label?: string; insights: PanelInsight[] };

const SEVERITY_DOT: Record<PanelInsightSeverity, string> = {
  critical: "bg-danger",
  notable: "bg-brand",
  info: "bg-ink-faint",
};

function Bubble({ insight }: { insight: PanelInsight }) {
  const severity = insight.severity ?? "info";
  const content = (
    <div
      className={`flex items-start gap-2 rounded-xl rounded-tl-sm px-3 py-2 text-[13px] leading-snug transition-colors ${
        severity === "critical" ? "bg-danger-soft text-ink" : "bg-surface-sunken text-ink"
      } ${insight.href ? "hover:brightness-95" : ""}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[severity]}`} aria-hidden="true" />
      <span>{insight.text}</span>
    </div>
  );
  return insight.href ? (
    <Link href={insight.href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

// Panel de insights determinísticos (no es un chat con IA — ver decisión con
// el usuario) con estética de burbujas de chat: una "pestaña" flotante fija
// abajo a la derecha que se despliega/colapsa, presente en cualquier página
// que la use, reactiva a los filtros de esa página porque el `insights`/
// `groups` que recibe ya viene calculado con el scope (región/market/
// facility/período) vigente — este componente no sabe nada de filtros, solo
// pinta lo que le llega.
export default function InsightsPanel({
  title,
  insights,
  groups,
  defaultOpen = false,
}: {
  title: string;
  // Lista plana (la mayoría de los casos), o agrupada (Overview multi-región)
  // — se pasa una de las dos, no ambas.
  insights?: PanelInsight[];
  groups?: PanelInsightGroup[];
  defaultOpen?: boolean;
}) {
  const t = useTranslations("InsightsPanel");
  const [open, setOpen] = useState(defaultOpen);

  const flatInsights = groups ? groups.flatMap((g) => g.insights) : insights ?? [];
  const criticalCount = flatInsights.filter((i) => (i.severity ?? "info") === "critical").length;
  const isEmpty = flatInsights.length === 0;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[min(92vw,380px)] max-h-[70vh] rounded-2xl bg-surface shadow-xl border border-border flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-sunken shrink-0">
            <div className="font-display text-sm font-semibold text-ink truncate">{title}</div>
            <button type="button" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink text-sm shrink-0" aria-label={t("close")}>
              ✕
            </button>
          </div>
          <div className="overflow-y-auto p-3 space-y-3">
            {isEmpty && <div className="text-sm text-ink-faint px-1 py-2">{t("empty")}</div>}
            {groups
              ? groups.map((g, gi) => (
                  <div key={gi} className="space-y-2">
                    {g.label && <div className="text-[11px] font-medium text-ink-muted px-1">{g.label}</div>}
                    {g.insights.map((insight, i) => (
                      <Bubble key={i} insight={insight} />
                    ))}
                  </div>
                ))
              : flatInsights.map((insight, i) => <Bubble key={i} insight={insight} />)}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-brand text-white shadow-lg px-4 py-2.5 hover:brightness-95 transition-[filter]"
      >
        <span className="text-base leading-none" aria-hidden="true">💬</span>
        <span className="text-sm font-medium">{t("toggleLabel")}</span>
        {criticalCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold px-1">
            {criticalCount}
          </span>
        )}
      </button>
    </div>
  );
}
