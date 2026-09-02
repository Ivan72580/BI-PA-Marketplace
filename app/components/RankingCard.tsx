import Link from "next/link";

export type RankingRow = {
  facilityId: string;
  marketId: string;
  regionId: string;
  label: string;
  value: number;
  extra?: string;
  displayValue?: string;
};

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
        {rows.map((item) => (
          <Link
            key={item.facilityId}
            href={buildHref(item.facilityId, item.marketId, item.regionId)}
            className="block group"
          >
            <div className="flex justify-between text-sm mb-1">
              <span className="text-brand group-hover:underline">{item.label}</span>
              <span className="text-ink font-medium">
                {item.displayValue ?? formatValue(item.value)}
                {item.extra && <span className="text-ink-faint font-normal"> · {item.extra}</span>}
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
