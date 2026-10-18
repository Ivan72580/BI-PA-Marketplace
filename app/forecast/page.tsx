import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getFilterOptions,
  resolveFilterNames,
  getNetworkForecast,
  getForecastWatch,
  getFacilityPlan,
  getSeasonPlan,
  LOOKBACK_BLOCKS,
  MIN_BLOCKS_FOR_PREDICTION,
  type ForecastRange,
  type NetworkForecast,
  type ForecastWatch,
  type WatchItem,
  type FacilityPlan,
  type SeasonPlanData,
} from "../lib/db/queries";
import { levelOf } from "../lib/seasonPlanCalc";
import { addDaysISO, PLAN_FILTERS, type PlanFilter } from "../lib/slotPlanCalc";
import { weekdayLabel, weekdayPlural } from "../lib/db/weekday";
import type { Locale } from "@/i18n/config";
import { todayISO } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import PageHeader from "../components/PageHeader";
import GroupSection from "../components/GroupSection";
import ForecastWatchlist from "../components/ForecastWatchlist";
import Glossary from "../components/Glossary";
import InsightsPanel, { type PanelInsight } from "../components/InsightsPanel";
import FacilityWeekPlan from "../components/FacilityWeekPlan";
import FacilityMonthPlan, { type SeasonContext } from "../components/FacilityMonthPlan";

type SP = { regionId?: string; marketId?: string; facilityId?: string; range?: string; filter?: string };

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

// Un valor proyectado se muestra como número absoluto (la tarjeta y la página ya dicen que es una
// proyección) y sus extremos como alertas: el piso es el escenario a revisar y el techo el que conviene
// sostener. Los extremos son ± 1 desvío estándar del historial (ver glosario), no una garantía.
function ForecastTile({ label, value, low, high, t, note }: { label: string; value: string; low?: string; high?: string; t: Translator; note?: string }) {
  return (
    <div className="rounded-xl bg-surface-sunken p-3">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="font-display text-lg font-bold text-ink">{value}</div>
      {low !== undefined && high !== undefined && (
        <div className="mt-1.5 space-y-0.5 text-[11px] leading-tight">
          <div className="flex items-baseline gap-1 text-danger" title={t("bands.lowHint")}>
            <span aria-hidden="true">▼</span>
            <span className="font-semibold tabular-nums">{low}</span>
            <span className="text-ink-muted">{t("bands.low")}</span>
          </div>
          <div className="flex items-baseline gap-1 text-brand" title={t("bands.highHint")}>
            <span aria-hidden="true">▲</span>
            <span className="font-semibold tabular-nums">{high}</span>
            <span className="text-ink-muted">{t("bands.high")}</span>
          </div>
        </div>
      )}
      {note && <div className="text-[10px] text-warning mt-1.5 leading-snug">{note}</div>}
    </div>
  );
}

// Insights determinísticos para el panel flotante — mismo criterio que el
// resto de la app (Daily/Trends/Market): texto sobre datos ya calculados,
// sin queries nuevas ni IA. "critical" es una señal de deterioro proyectado
// (confirmación esperada a la baja, radar de riesgo con resultados);
// "notable" es una señal positiva; "info" es contexto (método usado,
// comparación YoY, advertencia de revenue).
function buildForecastInsights(forecast: NetworkForecast, watch: ForecastWatch | null, t: Translator): PanelInsight[] {
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

  if (watch && watch.downCount > 0 && watch.topDownName) {
    lines.push({ text: t("insights.riskTop", { n: watch.downCount, name: watch.topDownName }), severity: "critical" });
  }
  if (watch && watch.scope !== "network" && watch.upCount > 0) {
    lines.push({ text: t("insights.upCount", { n: watch.upCount }), severity: "notable" });
  }

  lines.push({ text: t("insights.revenueCaveat"), severity: "info" });

  return lines;
}

// Contexto estacional de los meses que toca la ventana de 30 días (hoy y hoy + 29), tomado de
// la misma lectura de Estacionalidad pero acotada al facility.
function buildSeasonContext(plan: SeasonPlanData | null, today: string): SeasonContext | null {
  if (!plan) return null;
  const months = [...new Set([0, 29].map((n) => new Date(`${addDaysISO(today, n)}T00:00:00Z`).getUTCMonth()))];
  return {
    provisional: plan.method === "provisional",
    completeMonths: plan.completeMonths,
    hasIndex: plan.method !== null,
    items: months.map((month) => {
      const idx = plan.index.find((i) => i.month === month)?.index ?? null;
      const av = plan.availability.find((a) => a.month === month);
      return { month, index: idx, level: idx !== null ? levelOf(idx) : null, unavailRate: av?.rate ?? null, unavailTrendPp: av?.trendPp ?? null };
    }),
  };
}

// Insights del plan por facility: mismo criterio determinístico que el resto (texto sobre datos
// ya calculados). Para la semana resumen los grupos; para el mes, días, estacionalidad y oferta.
function buildFacilityInsights(plan: FacilityPlan, season: SeasonContext | null, range: ForecastRange, t: Translator, locale: Locale): PanelInsight[] {
  const out: PanelInsight[] = [];
  const pct0 = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
  const green = plan.slots.filter((s) => s.light === "green");
  const amber = plan.slots.filter((s) => s.light === "amber");
  const red = plan.slots.filter((s) => s.light === "red");
  const secure = plan.slots.filter((s) => s.secure);

  if (range === "week") {
    if (secure.length > 0) out.push({ text: t("plan.insights.secure", { n: secure.length }), severity: "critical" });
    if (amber.length > 0) out.push({ text: t("plan.insights.amber", { n: amber.length }), severity: "info" });
    if (red.length > 0) out.push({ text: t("plan.insights.red", { n: red.length }), severity: "critical" });
    out.push({ text: t("plan.insights.green", { n: green.length }), severity: "notable" });
    return out;
  }

  const m = plan.month;
  const better = m.weekdays.filter((d) => d.tier === "better").sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const weaker = m.weekdays.filter((d) => d.tier === "weaker").sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1));
  if (better.length > 0 && weaker.length > 0) {
    out.push({ text: t("plan.insights.days", { best: weekdayPlural(better[0].dayOfWeek, locale), bestRate: pct0(better[0].rate), worst: weekdayPlural(weaker[0].dayOfWeek, locale), worstRate: pct0(weaker[0].rate), avg: pct0(m.overallRate) }), severity: "info" });
  } else if (weaker.length > 0) {
    out.push({ text: t("plan.insights.weakDay", { worst: weekdayPlural(weaker[0].dayOfWeek, locale), worstRate: pct0(weaker[0].rate), avg: pct0(m.overallRate) }), severity: "critical" });
  }
  const riskCells = m.riskByDay.reduce((a, r) => a + r.cells.length, 0);
  if (riskCells > 0) {
    const first = m.riskByDay[0];
    out.push({ text: t("plan.insights.risk", { n: riskCells, day: weekdayLabel(first.dayOfWeek, locale), time: first.cells[0].time }), severity: "critical" });
  }
  if (m.publishedTotal > 0 && m.fieldLostTotal > 0) {
    out.push({ text: t("plan.insights.supply", { n: m.fieldLostTotal, total: m.publishedTotal, pct: pct0(m.fieldLostTotal / m.publishedTotal) }), severity: m.fieldLostTotal / m.publishedTotal >= 0.1 ? "critical" : "info" });
  }
  const first = season?.items[0];
  if (season && first && first.index !== null && first.level) {
    out.push({ text: t(`plan.insights.season.${first.level}`, { month: new Date(Date.UTC(2026, first.month, 1)).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "long", timeZone: "UTC" }), index: first.index.toFixed(2) }), severity: "info" });
  } else if (season && !season.hasIndex) {
    out.push({ text: t("plan.insights.noSeason", { n: season.completeMonths }), severity: "info" });
  }
  return out;
}

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [t, localeRaw] = await Promise.all([getTranslations("Forecast"), getLocale()]);
  const locale = localeRaw as Locale;
  const range: ForecastRange = sp.range === "month" ? "month" : "week";
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };
  const today = todayISO();

  const planFilter = PLAN_FILTERS.find((f) => f === sp.filter);

  const [names, filterOptions, forecast, watch, facilityPlan, seasonRaw] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getNetworkForecast(filters, range, today),
    getForecastWatch(filters, range, today),
    // Plan por facility: solo cuando hay un facility elegido. Estacionalidad solo para la vista de 30 días.
    sp.facilityId ? getFacilityPlan(sp.facilityId) : Promise.resolve(null),
    sp.facilityId && range === "month" ? getSeasonPlan({ facilityId: sp.facilityId }) : Promise.resolve(null),
  ]);
  const seasonContext = buildSeasonContext(seasonRaw, today);
  // Los links del plan conservan el facility y vuelven siempre a la vista de 7 días.
  const weekHrefFor = (f: PlanFilter | undefined) => buildForecastQuery(sp, { range: undefined, filter: f });

  const facilityHref = (i: WatchItem) => buildForecastQuery(sp, { regionId: i.regionId, marketId: i.marketId, facilityId: i.facilityId });

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);
  const rangeLabelKey = range === "week" ? "rangeWeek" : "rangeMonth";

  return (
    <div className="space-y-5">
      <PageHeader
        scope={names.facilityName ?? names.marketName ?? names.regionName}
        title={t("pageTitle")}
        subtitle={t("subtitle")}
        filter={
          <FilterPanel
            regions={filterOptions.regions}
            markets={filterOptions.markets}
            facilities={filterOptions.facilities}
            showTimeControls={false}
            hasFilter={hasFilter}
            clearHref={buildForecastQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })}
          />
        }
      />

      <div className="inline-flex gap-0.5 rounded-full bg-surface-panel p-1 self-start">
        {(["week", "month"] as ForecastRange[]).map((r) => (
          <Link
            key={r}
            href={buildForecastQuery(sp, { range: r === "week" ? undefined : r })}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              range === r ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted font-medium hover:text-ink"
            }`}
          >
            {t(r === "week" ? "rangeWeek" : "rangeMonth")}
          </Link>
        ))}
      </div>

      {/* Bloque de predicción: una GroupSection más (mismo fondo y borde que el resto de la app, sin
          línea punteada). El matiz "esto es una estimación" queda en el puntito y la etiqueta
          Predicción en warning, igual que en Diario. */}
      <GroupSection title={`🔮 ${t("windowLabel", { n: forecast.windowDays })}`} accent="warning" badge={t("badge")}>
        <p className="text-xs text-ink-muted max-w-3xl -mt-1">{t("disclaimer", { n: forecast.occurrences, lookback: LOOKBACK_BLOCKS })}</p>

        {forecast.method === "insufficient" ? (
          <div className="text-sm text-ink-faint">{t("methodInsufficient", { min: MIN_BLOCKS_FOR_PREDICTION, n: forecast.occurrences })}</div>
        ) : (
          <>
            {forecast.method === "average" && <div className="text-xs text-ink-faint">{t("methodAverage", { n: forecast.occurrences })}</div>}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ForecastTile
                t={t}
                label={t("games.label")}
                value={forecast.games.predicted !== null ? formatNum(forecast.games.predicted) : "—"}
                low={forecast.games.low !== null ? formatNum(forecast.games.low) : undefined}
                high={forecast.games.high !== null ? formatNum(forecast.games.high) : undefined}
              />
              <ForecastTile
                t={t}
                label={t("confirmation.label")}
                value={forecast.confirmationRate.predicted !== null ? formatPct(forecast.confirmationRate.predicted) : "—"}
                low={forecast.confirmationRate.low !== null ? formatPct(forecast.confirmationRate.low) : undefined}
                high={forecast.confirmationRate.high !== null ? formatPct(forecast.confirmationRate.high) : undefined}
              />
              <ForecastTile
                t={t}
                label={t("occupancy.label")}
                value={forecast.occupancyRate.predicted !== null ? formatPct(forecast.occupancyRate.predicted) : "—"}
                low={forecast.occupancyRate.low !== null ? formatPct(forecast.occupancyRate.low) : undefined}
                high={forecast.occupancyRate.high !== null ? formatPct(forecast.occupancyRate.high) : undefined}
              />
              <ForecastTile
                t={t}
                label={t("revenue.label")}
                value={forecast.revenue.predicted !== null ? formatUSD(forecast.revenue.predicted) : "—"}
                low={forecast.revenue.low !== null ? formatUSD(forecast.revenue.low) : undefined}
                high={forecast.revenue.high !== null ? formatUSD(forecast.revenue.high) : undefined}
                note={t("revenue.lowConfidence")}
              />
            </div>

            <div className="pt-4 border-t border-border">
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
              <div className="text-xs text-ink-faint">
                {t("yoy.value", { games: formatNum(forecast.sameWindowLastYear.totalGames), pct: formatPct(forecast.sameWindowLastYear.confirmationRate) })}
              </div>
            )}
          </>
        )}
      </GroupSection>

      {sp.facilityId && (
        facilityPlan ? (
          range === "week" ? (
            <FacilityWeekPlan plan={facilityPlan} t={t} locale={locale} filter={planFilter} hrefFor={weekHrefFor} />
          ) : (
            <FacilityMonthPlan plan={facilityPlan} season={seasonContext} t={t} locale={locale} weekHrefFor={weekHrefFor} />
          )
        ) : (
          <div className="rounded-2xl bg-surface shadow-sm p-5 text-sm text-ink-faint">{t("plan.noData")}</div>
        )
      )}

      {watch && <ForecastWatchlist watch={watch} t={t} locale={locale} rangeLabel={t(rangeLabelKey)} hrefFor={facilityHref} />}

      <Glossary
        items={[
          { term: t("glossary.regression.term"), def: t("glossary.regression.def") },
          { term: t("glossary.range.term"), def: t("glossary.range.def") },
        ]}
      />

      <InsightsPanel
        title={t("insights.panelTitle")}
        insights={[...buildForecastInsights(forecast, watch, t), ...(facilityPlan ? buildFacilityInsights(facilityPlan, seasonContext, range, t, locale) : [])]}
      />
    </div>
  );
}
