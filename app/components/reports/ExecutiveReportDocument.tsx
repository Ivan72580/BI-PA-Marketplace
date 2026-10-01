import type { ReportCore } from "../../lib/db/reports";
import { MIN_GAMES_FOR_RANKING } from "../../lib/db/shared";
import ReportSection from "./ReportSection";
import ReportKpiStrip from "./ReportKpiStrip";
import { normalizeBreakdownRows } from "./ScopeBreakdownTable";
import LineChart from "../charts/LineChart";

type Translator = (key: string, values?: Record<string, string | number>) => string;

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatDelta(pct: number | null) {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

export default function ExecutiveReportDocument({ core, t, scopeLabel }: { core: ReportCore; t: Translator; scopeLabel: string }) {
  const { current, kpis, periods, breakdown, evolution, granularity, actions } = core;

  const breakdownRows = normalizeBreakdownRows(breakdown);
  const ranked = [...breakdownRows].sort((a, b) => (b.changePts ?? -Infinity) - (a.changePts ?? -Infinity));
  const withComparison = ranked.filter((r) => r.changePts !== null);
  const best = withComparison.slice(0, 2);
  const critical = withComparison.slice(-2).reverse().filter((r) => !best.includes(r));

  const breakdownScopeLabel =
    breakdown.kind === "region" ? t("breakdown.scopeRegion") : breakdown.kind === "market" ? t("breakdown.scopeMarket") : t("breakdown.scopeFacility");

  const worstFacilities = current.worstCancellationRate.slice(0, 3);

  const chartData = {
    labels: evolution.map((p) => p.label),
    datasets: [{ label: t("evolution.legend"), data: evolution.map((p) => p.confirmedGames), borderColor: "#16755c" }],
  };

  return (
    <article className="space-y-4 print:space-y-3">
      <header className="rounded-2xl bg-ink text-white p-4 print:rounded-none print:p-0 print:pb-2 print:border-b-2 print:border-ink print:bg-transparent print:text-ink">
        <div className="text-[11px] uppercase tracking-wide text-white/70 print:text-ink-muted mb-0.5 print:text-[8pt]">
          Plei Marketplace Intelligence
        </div>
        <h1 className="font-display text-2xl font-bold print:text-[17pt]">{t("execTitle")}</h1>
        <div className="text-sm text-white/80 print:text-ink-muted mt-1 print:text-[9pt]">
          {periods.current.label} · {scopeLabel}
        </div>
      </header>

      <ReportKpiStrip
        tiles={[
          { label: t("kpi.confirmedGames"), formattedValue: formatNum(kpis.confirmedGames.value), changeValue: kpis.confirmedGames.changePct },
          { label: t("kpi.totalRevenue"), formattedValue: formatUSD(kpis.totalRevenue.value), changeValue: kpis.totalRevenue.changePct },
          { label: t("kpi.confirmationRate"), formattedValue: formatPct(kpis.confirmationRate.value), changeValue: kpis.confirmationRate.changePts, unit: "pts" },
          { label: t("kpi.avgFillRate"), formattedValue: formatPct(kpis.avgFillRate.value), changeValue: kpis.avgFillRate.changePts, unit: "pts" },
        ]}
      />

      <ReportSection title={t("evolution.title", { count: evolution.length, granularity })}>
        {evolution.length === 0 ? (
          <div className="text-sm text-ink-faint">—</div>
        ) : (
          <div className="print:h-[110px] print:overflow-hidden">
            <LineChart data={chartData} />
          </div>
        )}
      </ReportSection>

      {breakdown.kind !== "none" && (
        <ReportSection title={t("marketHighlights.title", { scopeLabel: breakdownScopeLabel })}>
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1.5 print:text-[7.3pt]">
                {t("marketHighlights.best")}
              </div>
              <div className="space-y-1.5">
                {best.length === 0 && <div className="text-sm text-ink-faint">{t("marketHighlights.empty")}</div>}
                {best.map((row) => (
                  <div key={row.name} className="rounded-lg bg-brand-soft border-l-[3px] border-brand px-2.5 py-1.5 print:rounded-none print:bg-transparent print:border print:border-brand">
                    <div className="text-sm font-semibold text-ink print:text-[9pt]">{row.name}</div>
                    <div className="text-xs text-ink-muted print:text-[7.8pt]">
                      {t("breakdown.confirmationRateCol")}: {formatPct(row.confirmationRate)} ({formatDelta(row.changePts !== null ? row.changePts : null)} pts)
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1.5 print:text-[7.3pt]">
                {t("marketHighlights.critical")}
              </div>
              <div className="space-y-1.5">
                {critical.length === 0 && <div className="text-sm text-ink-faint">{t("marketHighlights.empty")}</div>}
                {critical.map((row) => (
                  <div key={row.name} className="rounded-lg bg-danger-soft border-l-[3px] border-danger px-2.5 py-1.5 print:rounded-none print:bg-transparent print:border print:border-danger">
                    <div className="text-sm font-semibold text-ink print:text-[9pt]">{row.name}</div>
                    <div className="text-xs text-ink-muted print:text-[7.8pt]">
                      {t("breakdown.confirmationRateCol")}: {formatPct(row.confirmationRate)} ({formatDelta(row.changePts !== null ? row.changePts : null)} pts)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ReportSection>
      )}

      <ReportSection title={t("facilityRanking.title")}>
        <div className="text-xs text-ink-faint mb-1.5 print:text-[7.5pt]">{t("facilityRanking.subtitle", { min: MIN_GAMES_FOR_RANKING })}</div>
        {worstFacilities.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("facilityRanking.empty")}</div>
        ) : (
          <ul className="divide-y divide-border">
            {worstFacilities.map((f, i) => (
              <li key={f.facilityId} className="flex items-center gap-2.5 py-1.5">
                <span className="w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center shrink-0 print:text-[8pt]">
                  {i + 1}
                </span>
                <span className="font-semibold text-ink text-sm flex-1 print:text-[9pt]">{f.label}</span>
                <span className="text-danger font-semibold text-sm print:text-[8.8pt]">{formatPct(f.rate)}</span>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={t("kpiTable.title")}>
        <table className="w-full text-sm print:text-[8.5pt]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-ink-muted border-b-2 border-ink print:text-[7.3pt]">
              <th className="py-1 pr-2 font-semibold">{t("kpiTable.kpi")}</th>
              <th className="py-1 px-2 font-semibold text-right">{t("kpiTable.current")}</th>
              <th className="py-1 px-2 font-semibold text-right">{t("kpiTable.prior")}</th>
              <th className="py-1 pl-2 font-semibold text-right">{t("kpiTable.variation")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-2 text-ink">{t("kpi.confirmedGames")}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatNum(kpis.confirmedGames.value)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatNum(kpis.confirmedGames.priorValue)}</td>
              <td className="py-1.5 pl-2 text-right font-semibold text-ink">{formatDelta(kpis.confirmedGames.changePct)}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-2 text-ink">{t("kpi.totalRevenue")}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatUSD(kpis.totalRevenue.value)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatUSD(kpis.totalRevenue.priorValue)}</td>
              <td className="py-1.5 pl-2 text-right font-semibold text-ink">{formatDelta(kpis.totalRevenue.changePct)}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-2 text-ink">{t("kpi.confirmationRate")}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatPct(kpis.confirmationRate.value)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatPct(kpis.confirmationRate.priorValue)}</td>
              <td className="py-1.5 pl-2 text-right font-semibold text-ink">{kpis.confirmationRate.changePts !== null ? `${kpis.confirmationRate.changePts >= 0 ? "+" : ""}${(kpis.confirmationRate.changePts * 100).toFixed(1)} pts` : "—"}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-2 text-ink">{t("kpi.avgFillRate")}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatPct(kpis.avgFillRate.value)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{formatPct(kpis.avgFillRate.priorValue)}</td>
              <td className="py-1.5 pl-2 text-right font-semibold text-ink">{kpis.avgFillRate.changePts !== null ? `${kpis.avgFillRate.changePts >= 0 ? "+" : ""}${(kpis.avgFillRate.changePts * 100).toFixed(1)} pts` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </ReportSection>

      <ReportSection title={t("actions.title")}>
        {actions.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("actions.empty")}</div>
        ) : (
          <ol className="space-y-1.5 list-decimal list-inside">
            {actions.map((a, i) => (
              <li key={i} className="text-sm text-ink print:text-[9pt]">
                {t(a.textKey, a.values)}
              </li>
            ))}
          </ol>
        )}
      </ReportSection>

      <footer className="pt-2 border-t border-border text-[10px] text-ink-faint flex justify-between print:text-[6.8pt]">
        <span>Plei Marketplace Intelligence — {t("execTitle")}</span>
        <span>{new Date().toLocaleDateString("es-AR")}</span>
      </footer>
    </article>
  );
}
