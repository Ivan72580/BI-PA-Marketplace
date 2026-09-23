"use client";

import { useTranslations } from "next-intl";

// "use client" + useTranslations funciona igual desde un padre Server
// Component (daily/page.tsx, trends/page.tsx) que desde uno Client
// (MetricTrendCard.tsx) — mismo patrón ya probado en MustScheduleCalendar/
// MustScheduleBoard (Daily). Compartido por Market/Daily/Trends/Overview;
// se traduce ahora (afecta a las 4 páginas con un solo cambio, decisión
// tomada al arrancar la ronda de Market).
export default function ChangeBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  const t = useTranslations("ChangeBadge");
  if (value === null) {
    return <span className="text-xs text-ink-faint">{t("noPriorData")}</span>;
  }
  const isPositive = invert ? value < 0 : value > 0;
  const colorClass = value === 0 ? "text-ink-muted" : isPositive ? "text-brand" : "text-danger";
  const arrow = value === 0 ? "→" : value > 0 ? "↑" : "↓";
  return (
    <span className={`${colorClass} font-semibold text-sm`}>
      {arrow} {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}
