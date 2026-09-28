"use client";

import { useTranslations } from "next-intl";

// "use client" + useTranslations funciona igual desde un padre Server
// Component (daily/page.tsx, trends/page.tsx) que desde uno Client
// (MetricTrendCard.tsx) — mismo patrón ya probado en MustScheduleCalendar/
// MustScheduleBoard (Daily). Compartido por Market/Daily/Trends/Overview;
// se traduce ahora (afecta a las 4 páginas con un solo cambio, decisión
// tomada al arrancar la ronda de Market).
//
// `unit` distingue dos cosas que este componente mezclaba antes bajo el
// mismo "%": una variación RELATIVA (pctDelta: (actual-previo)/previo,
// ej. "+12% más partidos confirmados") vs. una diferencia de PUNTOS entre
// dos tasas (ej. confirmationRate 62% vs. 58% anterior = "+4 pts", no
// "+4%" — decirlo en "%" ahí es ambiguo/incorrecto porque no queda claro
// si esos 4 puntos son 4% de 58% o una diferencia absoluta). Default
// "pct" para no romper ningún call-site existente.
//
// `secondary` opcionalmente muestra el número real/absoluto al lado del
// badge (ej. "+18" partidos), cuando el caller ya lo tiene a mano — así
// se ve la variación relativa Y el valor concreto, sin forzar a todos los
// call-sites a rediseñar su layout.
export default function ChangeBadge({
  value,
  invert = false,
  unit = "pct",
  secondary,
}: {
  value: number | null;
  invert?: boolean;
  unit?: "pct" | "pts";
  secondary?: string;
}) {
  const t = useTranslations("ChangeBadge");
  if (value === null) {
    return <span className="text-xs text-ink-faint">{t("noPriorData")}</span>;
  }
  const isPositive = invert ? value < 0 : value > 0;
  const colorClass = value === 0 ? "text-ink-muted" : isPositive ? "text-brand" : "text-danger";
  const arrow = value === 0 ? "→" : value > 0 ? "↑" : "↓";
  const magnitude = Math.abs(value * 100).toFixed(1);
  return (
    <span className={`${colorClass} font-semibold text-sm`}>
      {arrow} {magnitude}
      {unit === "pts" ? ` ${t("ptsSuffix")}` : "%"}
      {secondary && <span className="text-ink-faint font-normal"> ({secondary})</span>}
    </span>
  );
}
