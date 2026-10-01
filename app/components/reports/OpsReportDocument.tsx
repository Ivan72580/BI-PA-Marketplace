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
  const { current, kpis, periods, breakdown, actions, facilityFocus } = core;

  // "Foco de la semana" (abajo) ya cubre, con mucho más detalle, la misma
  // cancha que dispararía actions.worstFacility (mismo umbral, mismo dato:
  // current.worstCancellationRate[0]) — se saca de la lista general acá
  // para no decir lo mismo dos veces en el mismo reporte. El Ejecutivo y el
  // mail siguen mostrando la lista completa, sin este filtro: todavía no
  // tienen el reemplazo.
  const generalActions = actions.filter((a) => a.textKey !== "actions.worstFacility");

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

      <ReportSection title={t("facilityFocus.title")}>
        {facilityFocus.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("facilityFocus.empty")}</div>
        ) : (
          <ul className="space-y-3">
            {facilityFocus.map((item, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface-sunken/40 p-3 print:rounded-none print:border-0 print:border-b print:pb-2">
                <div className="font-display text-sm font-semibold text-ink mb-1 print:text-[9.5pt]">{item.entityLabel}</div>
                <p className="text-sm text-ink-muted print:text-[9pt]">
                  {t(item.findingTextKey, item.findingValues)}
                  {item.reasonTextKey ? ` ${t(item.reasonTextKey, item.reasonValues)}` : ""}
                </p>
                <p className="text-sm text-ink font-medium mt-1.5 print:text-[9pt]">
                  <span className="text-brand">{t("facilityFocus.actionLabel")}</span> {t(item.actionTextKey)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={t("actions.title")}>
        {generalActions.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("actions.empty")}</div>
        ) : (
          <ol className="space-y-1.5 list-decimal list-inside">
            {generalActions.map((a, i) => (
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
