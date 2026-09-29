"use client";

import { useState } from "react";
import Link from "next/link";
import ChangeBadge from "./ChangeBadge";
import Sparkline, { type SparklinePoint } from "./Sparkline";

export default function KpiCard({
  label,
  value,
  sublabel,
  perPeriod,
  delta,
  deltaInvert,
  deltaUnit = "pct",
  deltaSecondary,
  rawDelta,
  tone = "default",
  staticDelta = false,
  href,
  sparklinePoints,
  sparklineFormatValue,
  popover,
}: {
  label: string;
  value: string;
  sublabel?: string;
  // "≈14/día", "≈98/semana" — contexto ambiental, no un dato a desglosar.
  // Se muestra aparte de sublabel (que ya se usa para otra cosa en algunos
  // call-sites, ej. "12 de 40 partidos") para no pisarlo.
  perPeriod?: string;
  delta?: number | null;
  deltaInvert?: boolean;
  deltaUnit?: "pct" | "pts";
  deltaSecondary?: string;
  // Variación cruda, en la misma unidad que `value` (ej. +0.22 de rating en
  // escala 1-5) — NO pasa por ChangeBadge, que multiplica todo ×100
  // asumiendo %/puntos porcentuales. Para métricas que no son ni % ni una
  // tasa (como un rating 1-5), esa lógica da un número sin sentido; esto
  // muestra la diferencia real con flecha/color, sin reinterpretarla.
  // undefined = sin dato para mostrar, null = sin período anterior.
  rawDelta?: number | null;
  tone?: "default" | "brand" | "danger";
  staticDelta?: boolean;
  // Si se pasa, toda la card es un link (Resumen de Overview: cada KPI
  // lleva a la pestaña/página que la explica en detalle).
  href?: string;
  // Últimos N puntos (mismo período, buckets recientes) para la mini
  // tendencia — mismo componente Sparkline que ya usaba Trends. Puede ser
  // números sueltos o {label, value} para que el tooltip nativo muestre
  // "período: valor" al pasar el mouse.
  sparklinePoints?: SparklinePoint[];
  sparklineFormatValue?: (v: number) => string;
  // Contenido a mostrar al pasar el mouse sobre la tarjeta (ej. top 5
  // facilities que más aportan) — para KPIs que hoy no tienen a dónde
  // llevar al hacer click (nivel red/región, sin market elegido).
  popover?: React.ReactNode;
}) {
  const [showDelta, setShowDelta] = useState(false);
  // Regla: los valores siempre en el mismo color — solo la variación % es
  // verde o rojo según corresponda (eso lo resuelve ChangeBadge).
  const hasComparison = delta !== undefined;
  const deltaVisible = staticDelta || showDelta;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-sm text-ink-muted">{label}</div>
        {hasComparison && !staticDelta && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowDelta((v) => !v);
            }}
            title="Comparar vs. período anterior"
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showDelta ? "bg-brand text-white" : "bg-surface-sunken text-ink-faint hover:text-ink-muted"
            }`}
          >
            vs. anterior
          </button>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <div className="font-display text-4xl font-bold text-ink tracking-tight">{value}</div>
            {deltaVisible && hasComparison && (
              <ChangeBadge value={delta ?? null} invert={deltaInvert} unit={deltaUnit} secondary={deltaSecondary} />
            )}
            {rawDelta !== undefined &&
              (rawDelta === null ? (
                <span className="text-xs text-ink-faint">sin dato anterior</span>
              ) : (
                <span className={`font-semibold text-sm ${rawDelta === 0 ? "text-ink-muted" : rawDelta > 0 ? "text-brand" : "text-danger"}`}>
                  {rawDelta === 0 ? "→" : rawDelta > 0 ? "↑" : "↓"} {rawDelta > 0 ? "+" : ""}
                  {rawDelta.toFixed(2)}
                </span>
              ))}
          </div>
          {(sublabel || perPeriod) && (
            <div className="text-xs text-ink-faint mt-1">
              {sublabel}
              {sublabel && perPeriod ? " · " : ""}
              {perPeriod}
            </div>
          )}
        </div>
        {sparklinePoints && sparklinePoints.length >= 2 && (
          <Sparkline points={sparklinePoints} width={64} height={28} formatValue={sparklineFormatValue} />
        )}
      </div>
    </>
  );

  const toneRing = tone === "danger" ? "ring-1 ring-danger/15" : tone === "brand" ? "ring-1 ring-brand/15" : "";
  const className = `rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5 ${toneRing} relative group/card`;

  const popoverEl = popover && (
    <div className="absolute z-10 hidden group-hover/card:block top-full left-0 mt-1 w-64 rounded-xl bg-surface shadow-lg border border-border p-3">
      {popover}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={`${className} block group`}>
        <div className="group-hover:opacity-90 transition-opacity">{body}</div>
        {popoverEl}
      </Link>
    );
  }

  return (
    <div className={className}>
      {body}
      {popoverEl}
    </div>
  );
}
