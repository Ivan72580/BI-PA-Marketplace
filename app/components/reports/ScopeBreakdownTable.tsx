import type { ScopeBreakdown } from "../../lib/db/reports";

type Translator = (key: string, values?: Record<string, string | number>) => string;

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatDelta(pct: number | null) {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

// Normaliza las 3 formas posibles (región/market/facility — ver
// getScopeBreakdown en app/lib/db/reports.ts) a una sola fila, así el render
// (acá y en ExecutiveReportDocument, para "Markets más destacados") no
// necesita 3 ramas distintas por cada consumidor.
export type NormalizedBreakdownRow = {
  name: string;
  confirmedGames: number;
  changePct: number | null;
  confirmationRate: number;
  changePts: number | null;
};

export function normalizeBreakdownRows(breakdown: ScopeBreakdown): NormalizedBreakdownRow[] {
  if (breakdown.kind === "none") return [];
  return breakdown.rows.map((r) => ({
    name: "regionName" in r ? r.regionName : "marketName" in r ? r.marketName : r.name,
    confirmedGames: r.confirmedGames,
    changePct: r.changePct,
    confirmationRate: r.confirmationRate,
    changePts: r.changePts,
  }));
}

export default function ScopeBreakdownTable({ breakdown, t }: { breakdown: ScopeBreakdown; t: Translator }) {
  if (breakdown.kind === "none") return null;
  const rows = normalizeBreakdownRows(breakdown);
  const scopeLabel = t(`breakdown.scope${breakdown.kind === "region" ? "Region" : breakdown.kind === "market" ? "Market" : "Facility"}`);

  if (rows.length === 0) {
    return <div className="text-sm text-ink-faint">{t("breakdown.empty")}</div>;
  }

  return (
    <table className="w-full text-sm print:text-[8.5pt]">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wide text-ink-muted border-b-2 border-ink print:text-[7.3pt]">
          <th className="py-1 pr-2 font-semibold">{scopeLabel}</th>
          <th className="py-1 px-2 font-semibold text-right">{t("breakdown.confirmed")}</th>
          <th className="py-1 px-2 font-semibold text-right">{t("breakdown.confirmationRateCol")}</th>
          <th className="py-1 pl-2 font-semibold text-right">{t("breakdown.variation")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className="border-b border-border">
            <td className="py-1.5 pr-2 font-medium text-ink">{row.name}</td>
            <td className="py-1.5 px-2 text-right text-ink-muted">{formatNum(row.confirmedGames)}</td>
            <td className="py-1.5 px-2 text-right text-ink-muted">{formatPct(row.confirmationRate)}</td>
            <td className={`py-1.5 pl-2 text-right font-semibold ${row.changePct === null ? "text-ink-faint" : row.changePct < 0 ? "text-danger" : "text-brand"}`}>
              {formatDelta(row.changePct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
