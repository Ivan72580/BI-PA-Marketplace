import RankRowView, { RankGrid } from "./RankRowView";

export type RankingRow = {
  facilityId: string;
  marketId: string;
  regionId: string;
  label: string;
  value: number;
  extra?: string;
  displayValue?: string;
  // Posiciones que subió (+) o bajó (-) respecto al mismo ranking en el
  // período anterior. 0 = se mantuvo. null = no estaba en el ranking anterior
  // (entrada nueva). undefined = no calculado para este ranking todavía.
  rankChange?: number | null;
  // Variación % del valor (no de la posición) vs. período anterior.
  delta?: number | null;
};

export default function RankingCard({
  title,
  subtitle,
  rows,
  buildHref,
  formatValue,
  tone = "brand",
  invertDelta = false,
}: {
  title: string;
  subtitle?: string;
  rows: RankingRow[];
  buildHref: (facilityId: string, marketId: string, regionId: string) => string;
  formatValue: (v: number) => string;
  tone?: "brand" | "danger";
  // Para métricas donde SUBIR es malo (ej. cancelaciones) — invierte el color/flecha de ChangeBadge.
  invertDelta?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {rows.length === 0 && <div className="text-sm text-ink-faint">Sin datos suficientes.</div>}
      <RankGrid>
        {rows.map((item, i) => (
          <RankRowView
            key={item.facilityId}
            rank={i + 1}
            label={item.label}
            valueText={item.displayValue ?? formatValue(item.value)}
            extra={item.extra}
            rankChange={item.rankChange}
            delta={item.delta}
            invertDelta={invertDelta}
            fraction={item.value / max}
            tone={tone}
            href={buildHref(item.facilityId, item.marketId, item.regionId)}
          />
        ))}
      </RankGrid>
    </div>
  );
}
