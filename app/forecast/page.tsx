import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getFilterOptions,
  resolveFilterNames,
  getNetworkForecast,
  getForecastRiskFacilities,
  LOOKBACK_BLOCKS,
  MIN_BLOCKS_FOR_PREDICTION,
  type ForecastRange,
  type NetworkForecast,
  type ForecastRiskFacility,
} from "../lib/db/queries";
import { todayISO } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import ChangeBadge from "../components/ChangeBadge";
import Glossary from "../components/Glossary";
import InsightsPanel, { type PanelInsight } from "../components/InsightsPanel";

type SP = { regionId?: string; marketId?: string; facilityId?: string; range?: string };

// Tipo mínimo del traductor — mismo criterio que Daily/Trends/Market.
type Translator = (key: string, values?: Record<string, string | number>) => string;

function buildForecastQuery(current: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/forecast?${qs}` : "/forecast";
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatGamesRange(low: number | null, high: number | null): string | undefined {
  if (low === null || high === null) return undefined;
  return `${formatNum(low)}–${formatNum(high)}`;
}
function formatPctRange(low: number | null, high: number | null): string | undefined {
  if (low === null || high === null) return undefined;
  return `${formatPct(low)}–${formatPct(high)}`;
}
function formatUSDRange(low: number | null, high: number | null): string | undefined {
  if (low === null || high === null) return undefined;
  return `${formatUSD(low)}–${formatUSD(high)}`;
}

function ForecastTile({ label, value, rangeText, note }: { label: string; value: string; rangeText?: string; note?: string }) {
  return (
    <div className="rounded-xl bg-surface border border-warning/20 p-3">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="font-display text-lg font-bold text-ink">{value}</div>
      {rangeText && <div className="text-[11px] text-ink-muted mt-0.5">{rangeText}</div>}
      {note && <div className="text-[10px] text-warning mt-1 leading-snug">{note}</div>}
    </div>
  );
}

// Insights determinísticos para el panel flotante — mismo criterio que el
// resto de la app (Daily/Trends/Market): texto sobre datos ya calculados,
// sin queries nuevas ni IA. "critical" es una señal de deterioro proyectado
// (confirmación esperada a la baja, radar de riesgo con resultados);
// "notable" es una señal positiva; "info" es contexto (método usado,
// comparación YoY, advertencia de revenue).
function buildForecastInsights(forecast: NetworkForecast, risk: ForecastRiskFacility[], t: Translator): PanelInsight[] {
  const lines: PanelInsight[] = [];

  if (forecast.method === "insufficient") {
    lines.push({ text: t("insights.insufficient", { min: MIN_BLOCKS_FOR_PREDICTION, n: forecast.occurrences }), severity: "info" });
    return lines;
  }
  if (forecast.method === "average") {
    lines.push({ text: t("insights.average", { n: forecast.occurrences }), severity: "info" });
  }

  if (forecast.confirmationRate.predicted !== null && forecast.confirmationRate.avg !== null) {
    const diff = forecast.confirmationRate.predicted - forecast.confirmationRate.avg;
    if (Math.abs(diff) >= 0.03) {
      lines.push({
        text: diff > 0 ? t("insights.confirmationUp", { pct: formatPct(forecast.confirmationRate.predicted) }) : t("insights.confirmationDown", { pct: formatPct(forecast.confirmationRate.predicted) }),
        severity: diff > 0 ? "notable" : "critical",
      });
    }
  }

  if (forecast.games.predicted !== null && forecast.games.avg !== null && forecast.games.avg > 0) {
    const pct = (forecast.games.predicted - forecast.games.avg) / forecast.games.avg;
    if (Math.abs(pct) >= 0.15) {
      lines.push({
        text: pct > 0 ? t("insights.gamesUp", { n: formatNum(forecast.games.predicted) }) : t("insights.gamesDown", { n: formatNum(forecast.games.predicted) }),
        severity: pct > 0 ? "notable" : "critical",
      });
    }
  }

  if (forecast.sameWindowLastYear && forecast.games.predicted !== null && forecast.sameWindowLastYear.totalGames > 0) {
    const pct = (forecast.games.predicted - forecast.sameWindowLastYear.totalGames) / forecast.sameWindowLastYear.totalGames;
    lines.push({
      text: t(pct >= 0 ? "insights.yoyUp" : "insights.yoyDown", { pct: Math.abs(pct * 100).toFixed(0) }),
      severity: "info",
    });
  }

  if (risk.length > 0) {
    lines.push({ text: t("insights.riskTop", { n: risk.length, name: risk[0].facilityName }), severity: "critical" });
  }

  lines.push({ text: t("insights.revenueCaveat"), severity: "info" });

  return lines;
}

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [t] = await Promise.all([getTranslations("Forecast"), getLocale()]);
  const range: ForecastRange = sp.range === "month" ? "month" : "week";
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };
  const today = todayISO();

  const [names, filterOptions, forecast, riskFacilities] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getNetworkForecast(filters, range, today),
    getForecastRiskFacilities(filters, range, today),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);
  const rangeLabelKey = range === "week" ? "rangeWeek" : "rangeMonth";

  return (
    <div className="space-y-5">
      <div>
        {/* Mismo patrón de breadcrumb que /market: recorre región > market >
            facility, cada nivel clickeable para "subir" un escalón. */}
        <div className="flex flex-wrap gap-1.5 text-sm mb-2">
          <Link href={buildForecastQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })} className={sp.regionId ? "text-brand" : "text-ink font-medium"}>
            {t("allNetwork")}
          </Link>
          {names.regionName && (
            <>
              <span className="text-ink-faint">›</span>
              <Link href={buildForecastQuery(sp, { marketId: undefined, facilityId: undefined })} className={sp.marketId ? "text-brand" : "text-ink font-medium"}>
                {names.regionName}
              </Link>
            </>
          )}
          {names.marketName && (
            <>
              <span className="text-ink-faint">›</span>
              <Link href={buildForecastQuery(sp, { facilityId: undefined })} className={sp.facilityId ? "text-brand" : "text-ink font-medium"}>
                {names.marketName}
              </Link>
            </>
          )}
          {names.facilityName && (
            <>
              <span className="text-ink-faint">›</span>
              <span className="text-ink font-medium">{names.facilityName}</span>
            </>
          )}
        </div>

        <h1 className="font-display text-3xl font-bold text-ink mb-1">{t("pageTitle")}</h1>
        <div className="text-sm text-ink-faint max-w-2xl">{t("subtitle")}</div>
      </div>

      <FilterPanel
        regions={filterOptions.regions}
        markets={filterOptions.markets}
        facilities={filterOptions.facilities}
        showTimeControls={false}
        hasFilter={hasFilter}
        clearHref={buildForecastQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })}
      />

      <div className="flex items-center gap-2">
        {(["week", "month"] as ForecastRange[]).map((r) => (
          <Link
            key={r}
            href={buildForecastQuery(sp, { range: r === "week" ? undefined : r })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              range === r ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"
            }`}
          >
            {t(r === "week" ? "rangeWeek" : "rangeMonth")}
          </Link>
        ))}
      </div>

      {/* Bloque de predicción — mismo lenguaje visual que la sección de
          Diario (borde punteado + badge "Predicción"), a propósito: es la
          misma naturaleza de dato (estimado, no real) en toda la app, así
          que se ve igual en toda la app. */}
      <div className="rounded-2xl border-2 border-dashed border-warning/40 bg-warning-soft/40 p-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-base leading-none" aria-hidden="true">🔮</span>
          <h3 className="text-sm font-semibold text-ink">{t("windowLabel", { n: forecast.windowDays })}</h3>
          <span className="text-[10px] font-bold uppercase tracking-wide bg-warning text-white px-1.5 py-0.5 rounded-full">{t("badge")}</span>
        </div>
        <p className="text-xs text-ink-muted mb-4 max-w-3xl">{t("disclaimer", { n: forecast.occurrences, lookback: LOOKBACK_BLOCKS })}</p>

        {forecast.method === "insufficient" ? (
          <div className="text-sm text-ink-faint">{t("methodInsufficient", { min: MIN_BLOCKS_FOR_PREDICTION, n: forecast.occurrences })}</div>
        ) : (
          <>
            {forecast.method === "average" && <div className="text-xs text-ink-faint mb-3">{t("methodAverage", { n: forecast.occurrences })}</div>}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ForecastTile
                label={t("games.label")}
                value={forecast.games.predicted !== null ? `~${formatNum(forecast.games.predicted)}` : "—"}
                rangeText={formatGamesRange(forecast.games.low, forecast.games.high)}
              />
              <ForecastTile
                label={t("confirmation.label")}
                value={forecast.confirmationRate.predicted !== null ? `~${formatPct(forecast.confirmationRate.predicted)}` : "—"}
                rangeText={formatPctRange(forecast.confirmationRate.low, forecast.confirmationRate.high)}
              />
              <ForecastTile
                label={t("occupancy.label")}
                value={forecast.occupancyRate.predicted !== null ? `~${formatPct(forecast.occupancyRate.predicted)}` : "—"}
                rangeText={formatPctRange(forecast.occupancyRate.low, forecast.occupancyRate.high)}
              />
              <ForecastTile
                label={t("revenue.label")}
                value={forecast.revenue.predicted !== null ? `~${formatUSD(forecast.revenue.predicted)}` : "—"}
                rangeText={formatUSDRange(forecast.revenue.low, forecast.revenue.high)}
                note={t("revenue.lowConfidence")}
              />
            </div>

            <div className="mt-4 pt-4 border-t border-warning/20">
              <div className="text-xs font-medium text-ink mb-2">{t("breakdown.title")}</div>
              {forecast.predictedConfirmedGames !== null && forecast.predictedCancelledGames !== null && forecast.predictedConfirmedGames + forecast.predictedCancelledGames > 0 ? (
                <div>
                  <div className="h-2.5 rounded-full overflow-hidden bg-surface-sunken flex">
                    <div
                      className="h-2.5 bg-brand"
                      style={{ width: `${(forecast.predictedConfirmedGames / (forecast.predictedConfirmedGames + forecast.predictedCancelledGames)) * 100}%` }}
                    />
                    <div
                      className="h-2.5 bg-danger"
                      style={{ width: `${(forecast.predictedCancelledGames / (forecast.predictedConfirmedGames + forecast.predictedCancelledGames)) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-ink-muted">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-brand mr-1" />{t("breakdown.confirmed")}: {formatNum(forecast.predictedConfirmedGames)}</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-danger mr-1" />{t("breakdown.cancelled")}: {formatNum(forecast.predictedCancelledGames)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-faint">—</div>
              )}
            </div>

            {forecast.sameWindowLastYear && (
              <div className="mt-3 text-xs text-ink-faint">
                {t("yoy.value", { games: formatNum(forecast.sameWindowLastYear.totalGames), pct: formatPct(forecast.sameWindowLastYear.confirmationRate) })}
              </div>
            )}
          </>
        )}
      </div>

      {!sp.facilityId && (
        <div className="rounded-2xl bg-surface shadow-sm p-5">
          <h3 className="text-sm font-medium text-ink mb-0.5">{t("risk.title")}</h3>
          <p className="text-xs text-ink-faint mb-4">{t("risk.subtitle", { range: t(rangeLabelKey) })}</p>
          {riskFacilities.length === 0 ? (
            <div className="text-sm text-ink-faint">{t("risk.empty")}</div>
          ) : (
            <div className="space-y-3">
              {riskFacilities.map((r) => (
                <div key={r.facilityId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink font-medium truncate">{r.facilityName}</span>
                  <span className="flex items-center gap-2 shrink-0 text-ink-faint text-xs">
                    {r.predictedCancelledGames !== null && <span>{t("risk.cancelledLabel", { n: r.predictedCancelledGames })}</span>}
                    {r.confirmationRateDelta !== null && <ChangeBadge value={r.confirmationRateDelta} unit="pts" />}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Glossary items={[{ term: t("glossary.risk.term"), def: t("glossary.risk.def") }]} />
        </div>
      )}

      <Glossary
        items={[
          { term: t("glossary.regression.term"), def: t("glossary.regression.def") },
          { term: t("glossary.range.term"), def: t("glossary.range.def") },
        ]}
      />

      <InsightsPanel title={t("insights.panelTitle")} insights={buildForecastInsights(forecast, riskFacilities, t)} />
    </div>
  );
}
