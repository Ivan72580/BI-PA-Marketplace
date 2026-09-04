import Link from "next/link";
import ChangeBadge from "./ChangeBadge";

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

function RankIndicator({ rankChange }: { rankChange: number | null | undefined }) {
  if (rankChange === undefined) return null;
  if (rankChange === null) {
    return <span className="text-[10px] text-ink-faint w-8 shrink-0" title="No estaba en el ranking del período anterior">nuevo</span>;
  }
  if (rankChange === 0) {
    return <span className="text-ink-faint w-4 shrink-0 text-center" title="Se mantuvo en la misma posición">—</span>;
  }
  if (rankChange > 0) {
    return (
      <span className="text-brand text-xs w-6 shrink-0 flex items-center gap-0.5" title={`Subió ${rankChange} posición(es)`}>
        ▲{rankChange}
      </span>
    );
  }
  return (
    <span className="text-danger text-xs w-6 shrink-0 flex items-center gap-0.5" title={`Bajó ${Math.abs(rankChange)} posición(es)`}>
      ▼{Math.abs(rankChange)}
    </span>
  );
}

export default function RankingCard({
  title,
  subtitle,
  rows,
  buildHref,
  formatValue,
  tone = "brand",
}: {
  title: string;
  subtitle?: string;
  rows: RankingRow[];
  buildHref: (facilityId: string, marketId: string, regionId: string) => string;
  formatValue: (v: number) => string;
  tone?: "brand" | "danger";
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const barColor = tone === "danger" ? "bg-danger/70" : "bg-brand/70";

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {rows.length === 0 && <div className="text-sm text-ink-faint">Sin datos suficientes.</div>}
      <div className="space-y-2.5">
        {rows.map((item, i) => (
          <Link
            key={item.facilityId}
            href={buildHref(item.facilityId, item.marketId, item.regionId)}
            className="block group"
          >
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-ink-faint text-xs w-4 shrink-0">{i + 1}.</span>
                <RankIndicator rankChange={item.rankChange} />
                <span className="text-brand group-hover:underline truncate">{item.label}</span>
              </span>
              <span className="text-ink font-medium shrink-0 ml-2 flex items-center gap-1.5">
                {item.displayValue ?? formatValue(item.value)}
                {item.extra && <span className="text-ink-faint font-normal"> · {item.extra}</span>}
                {item.delta !== undefined && <ChangeBadge value={item.delta} />}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
