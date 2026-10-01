import type { ReportCore } from "../../lib/db/reports";
import ReportSection from "./ReportSection";
import ReportKpiStrip from "./ReportKpiStrip";
import ScopeBreakdownTable from "./ScopeBreakdownTable";

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

export default function OpsReportDocument({ core, t, scopeLabel }: { core: ReportCore; t: Translator; scopeLabel: string }) {
  const { current, kpis, periods, breakdown, actions } = core;

  return (
    <article className="space-y-4 print:space-y-3">
      <header className="border-b-2 border-ink pb-3 print:pb-2">
        <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-0.5 print:text-[8pt]">Plei Marketplace Intelligence</div>
        <h1 className="font-display text-2xl font-bold text-ink print:text-[17pt]">{t("opsTitle")}</h1>
        <div className="text-sm text-ink-muted mt-1 print:text-[9pt]">
          {periods.current.label} · {scopeLabel}
        </div>
      </header>

      <ReportKpiStrip
        tiles={[
          {
            label: t("kpi.confirmedGames"),
            formattedValue: formatNum(kpis.confirmedGames.value),
            changeValue: kpis.confirmedGames.changePct,
            priorLabel: t("kpi.vsPrior", { label: periods.prior.label }),
          },
          {
            label: t("kpi.confirmationRate"),
            formattedValue: formatPct(kpis.confirmationRate.value),
            changeValue: kpis.confirmationRate.changePts,
            unit: "pts",
          },
          {
            label: t("kpi.cancellationRate"),
            formattedValue: formatPct(kpis.cancellationRate.value),
            changeValue: kpis.cancellationRate.changePts,
            unit: "pts",
            invert: true,
          },
          {
            label: t("kpi.avgFillRate"),
            formattedValue: formatPct(kpis.avgFillRate.value),
            changeValue: kpis.avgFillRate.changePts,
            unit: "pts",
          },
          {
            label: t("kpi.totalRevenue"),
            formattedValue: formatUSD(kpis.totalRevenue.value),
            changeValue: kpis.totalRevenue.changePct,
          },
        ]}
      />

      <ReportSection title={t("criticalPoints.title")}>
        {current.insights.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("criticalPoints.empty")}</div>
        ) : (
          <ul className="space-y-1.5">
            {current.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm print:text-[9pt]">
                <span className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 shrink-0 print:bg-black" aria-hidden="true" />
                <span className="text-ink">{insight}</span>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={t("breakdown.title")}>
        <ScopeBreakdownTable breakdown={breakdown} t={t} />
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
        <span>Plei Marketplace Intelligence — {t("opsTitle")}</span>
        <span>{new Date().toLocaleDateString("es-AR")}</span>
      </footer>
    </article>
  );
}
