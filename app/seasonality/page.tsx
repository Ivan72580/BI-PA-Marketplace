import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getFilterOptions, resolveFilterNames, getSeasonalityData, getMonthProjection, type SeasonalityMonthPoint } from "../lib/db/queries";
import { nowInBusinessTimeZone } from "../lib/period";
import type { Locale } from "@/i18n/config";
import FilterPanel from "../components/FilterPanel";
import ChangeBadge from "../components/ChangeBadge";
import Glossary from "../components/Glossary";
import GroupSection from "../components/GroupSection";
import LineChart from "../components/charts/LineChart";
import InsightsPanel, { type PanelInsight } from "../components/InsightsPanel";
import SeasonalityCalendar, { type SeasonalityMonthCardVM } from "../components/SeasonalityCalendar";

type MetricKey = "confirmedGames" | "revenue" | "cumulativeGames" | "cumulativeRevenue";
const METRIC_KEYS: MetricKey[] = ["confirmedGames", "revenue", "cumulativeGames", "cumulativeRevenue"];
function isMetricKey(value: string | undefined): value is MetricKey {
  return !!value && (METRIC_KEYS as string[]).includes(value);
}

type SP = { regionId?: string; marketId?: string; facilityId?: string; year?: string; compare?: string; metric?: string; cardCompare?: string };

// Tipo mínimo del traductor — mismo criterio que Daily/Trends/Market/Forecast.
type Translator = (key: string, values?: Record<string, string | number>) => string;

function buildSeasonalityQuery(current: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/seasonality?${qs}` : "/seasonality";
}

// Link de "ver el detalle de este mes" — reusa Overview, que ya soporta
// granularity=month + period=YYYY-MM-01 + región/market/facility: la vista
// de un mes puntual ya existe ahí, no hace falta construir una nueva.
function monthDrilldownHref(y: number, monthIndex: number, filters: { regionId?: string; marketId?: string; facilityId?: string }): string {
  const params = new URLSearchParams();
  params.set("granularity", "month");
  params.set("period", `${y}-${String(monthIndex + 1).padStart(2, "0")}-01`);
  if (filters.regionId) params.set("regionId", filters.regionId);
  if (filters.marketId) params.set("marketId", filters.marketId);
  if (filters.facilityId) params.set("facilityId", filters.facilityId);
  return `/?${params.toString()}`;
}

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// null = sin partidos/revenue en el mismo mes (o año) anterior — no hay
// base válida para dividir, no es "-100%" (ChangeBadge ya sabe mostrar
// "sin dato del período anterior" para este caso).
function pctChange(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return (current - prior) / prior;
}

function cumulativeSum(values: number[]): number[] {
  let running = 0;
  return values.map((v) => (running += v));
}

function monthStatus(year: number, monthIndex: number, currentYear: number, currentMonthIndex: number): "past" | "current" | "future" {
  if (year > currentYear) return "future";
  if (year < currentYear) return "past";
  if (monthIndex > currentMonthIndex) return "future";
  if (monthIndex === currentMonthIndex) return "current";
  return "past";
}

// "max === min" => sin variación real en la serie (todos los meses iguales,
// típicamente todos en 0 por falta de dato) — ahí no hay un extremo real
// que destacar, así que no se dispara ningún insight.
function historicalExtreme(values: number[], index: number): "low" | "high" | null {
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return null;
  if (values[index] === max) return "high";
  if (values[index] === min) return "low";
  return null;
}

// Insights determinísticos sobre datos ya calculados — mismo criterio que
// buildForecastInsights/buildDayInsights: texto sobre números que la página
// ya trajo, sin queries nuevas ni IA.
function buildSeasonalityInsights(
  totals: { games: number; gamesPrior: number; revenue: number; revenuePrior: number },
  cards: SeasonalityMonthCardVM[],
  year: number,
  t: Translator
): PanelInsight[] {
  const lines: PanelInsight[] = [];
  const gamesYoyPct = pctChange(totals.games, totals.gamesPrior);
  const revenueYoyPct = pctChange(totals.revenue, totals.revenuePrior);

  if (totals.gamesPrior === 0) {
    lines.push({ text: t("insights.noPriorYearData", { priorYear: year - 1 }), severity: "info" });
  } else if (gamesYoyPct !== null) {
    lines.push({
      text: t(gamesYoyPct >= 0 ? "insights.yearGamesUp" : "insights.yearGamesDown", {
        year,
        priorYear: year - 1,
        pct: Math.abs(gamesYoyPct * 100).toFixed(0),
      }),
      severity: gamesYoyPct >= 0 ? "notable" : "critical",
    });
  }

  if (revenueYoyPct !== null) {
    lines.push({
      text: t(revenueYoyPct >= 0 ? "insights.yearRevenueUp" : "insights.yearRevenueDown", {
        year,
        priorYear: year - 1,
        pct: Math.abs(revenueYoyPct * 100).toFixed(0),
      }),
      severity: "info",
    });
  }

  const pastCards = cards.filter((c) => c.status !== "future");
  const best = pastCards.reduce<SeasonalityMonthCardVM | null>(
    (acc, c) => (!acc || c.confirmedGames > acc.confirmedGames ? c : acc),
    null
  );
  if (best && best.confirmedGames > 0) {
    lines.push({ text: t("insights.bestMonth", { month: best.monthLabel, year, n: best.confirmedGames }), severity: "info" });
  }

  const current = cards.find((c) => c.status === "current");
  if (current) {
    lines.push({ text: t("insights.currentMonthCaveat", { month: current.monthLabel }), severity: "info" });
  }

  lines.push({ text: t("insights.revenueCaveat"), severity: "info" });

  return lines;
}

// Insights "hacia adelante": no describen lo que ya pasó, sino lo que el
// mismo tramo del año pasado sugiere para el mes que viene — pedido
// explícito del usuario ("tipo pronóstico... basado en la evolución del año
// anterior"). Solo tiene sentido mirando el año en curso (si no, "el mes que
// viene" no es un mes real todavía por llegar) y si diciembre es el mes
// actual, "el mes que viene" cae en enero del año siguiente, fuera de esta
// serie — ahí no se genera nada en vez de inventar un dato de otro año.
function buildForwardLookingInsights(
  priorMonths: SeasonalityMonthPoint[],
  monthLabels: string[],
  year: number,
  currentYear: number,
  currentMonthIndex: number,
  t: Translator
): PanelInsight[] {
  if (year !== currentYear) return [];
  const nextIndex = currentMonthIndex + 1;
  if (nextIndex > 11) return [];

  const lines: PanelInsight[] = [];
  const curPrior = priorMonths[currentMonthIndex];
  const nextPrior = priorMonths[nextIndex];
  const nextMonthLabel = monthLabels[nextIndex];

  const momDelta = pctChange(nextPrior.confirmedGames, curPrior.confirmedGames);
  if (momDelta !== null && Math.abs(momDelta) >= 0.05) {
    lines.push({
      text: t(momDelta >= 0 ? "insights.nextMonthVolumeUp" : "insights.nextMonthVolumeDown", {
        month: nextMonthLabel,
        pct: Math.abs(momDelta * 100).toFixed(0),
      }),
      severity: momDelta >= 0 ? "notable" : "critical",
    });
  }

  const gamesExtreme = historicalExtreme(priorMonths.map((m) => m.confirmedGames), nextIndex);
  if (gamesExtreme === "low") lines.push({ text: t("insights.nextMonthGamesLow", { month: nextMonthLabel }), severity: "critical" });
  if (gamesExtreme === "high") lines.push({ text: t("insights.nextMonthGamesHigh", { month: nextMonthLabel }), severity: "notable" });

  const revenueExtreme = historicalExtreme(priorMonths.map((m) => m.revenue), nextIndex);
  if (revenueExtreme === "low") lines.push({ text: t("insights.nextMonthRevenueLow", { month: nextMonthLabel }), severity: "critical" });
  if (revenueExtreme === "high") lines.push({ text: t("insights.nextMonthRevenueHigh", { month: nextMonthLabel }), severity: "notable" });

  return lines;
}

export default async function SeasonalityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [t, rawLocale] = await Promise.all([getTranslations("Seasonality"), getLocale()]);
  const locale = rawLocale as Locale;

  const businessNow = nowInBusinessTimeZone();
  const currentYear = businessNow.getUTCFullYear();
  const currentMonthIndex = businessNow.getUTCMonth();

  const parsedYear = sp.year ? parseInt(sp.year, 10) : currentYear;
  const year = Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : currentYear;
  const showCompare = sp.compare !== "0";
  const cardCompare = sp.cardCompare === "1";
  const metric: MetricKey = isMetricKey(sp.metric) ? sp.metric : "confirmedGames";
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [names, filterOptions, data, monthProjection] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getSeasonalityData(filters, year),
    // La predicción de Overview siempre mira el mes en curso de HOY, así que
    // solo tiene sentido traerla cuando el año elegido es el actual — en
    // cualquier otro año no hay "mes en curso" que proyectar.
    year === currentYear ? getMonthProjection(filters, locale) : Promise.resolve(null),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "short", timeZone: "UTC" })
  );

  const cards: SeasonalityMonthCardVM[] = data.months.map((m, i) => {
    const prior = data.priorMonths[i];
    const status = monthStatus(year, i, currentYear, currentMonthIndex);
    return {
      monthIndex: i,
      monthLabel: monthLabels[i],
      confirmedGames: m.confirmedGames,
      priorConfirmedGames: prior.confirmedGames,
      revenue: m.revenue,
      priorRevenue: prior.revenue,
      gamesYoyPct: pctChange(m.confirmedGames, prior.confirmedGames),
      revenueYoyPct: pctChange(m.revenue, prior.revenue),
      status,
      href: status === "future" ? null : monthDrilldownHref(year, i, filters),
      projection:
        status === "current" && monthProjection
          ? {
              available: monthProjection.available,
              monthLabel: monthProjection.monthLabel,
              projectedGames: monthProjection.projectedGames,
              projectedRevenue: monthProjection.projectedRevenue,
              changePctGames: monthProjection.changePctGames,
              changePctRevenue: monthProjection.changePctRevenue,
              confirmedSoFar: monthProjection.confirmedSoFar,
              daysElapsed: monthProjection.daysElapsed,
              daysInMonth: monthProjection.daysInMonth,
              availableFromDay: monthProjection.availableFromDay,
            }
          : undefined,
    };
  });

  const totalGamesYoyPct = pctChange(data.totalConfirmedGames, data.totalConfirmedGamesPrior);
  const totalRevenueYoyPct = pctChange(data.totalRevenue, data.totalRevenuePrior);

  const gamesValues = data.months.map((m) => m.confirmedGames);
  const revenueValues = data.months.map((m) => m.revenue);
  const priorGamesValues = data.priorMonths.map((m) => m.confirmedGames);
  const priorRevenueValues = data.priorMonths.map((m) => m.revenue);

  const metricSeries: Record<MetricKey, { current: number[]; prior: number[] }> = {
    confirmedGames: { current: gamesValues, prior: priorGamesValues },
    revenue: { current: revenueValues, prior: priorRevenueValues },
    cumulativeGames: { current: cumulativeSum(gamesValues), prior: cumulativeSum(priorGamesValues) },
    cumulativeRevenue: { current: cumulativeSum(revenueValues), prior: cumulativeSum(priorRevenueValues) },
  };
  const activeSeries = metricSeries[metric];

  const lineChartData = {
    labels: monthLabels,
    datasets: [
      { label: t("chart.legend", { year }), data: activeSeries.current, borderColor: "#16755c" },
      ...(showCompare
        ? [{ label: t("chart.legend", { year: year - 1 }), data: activeSeries.prior, borderColor: "#9ca3af", borderDash: [6, 4], fill: false }]
        : []),
    ],
  };

  const chartIsEmpty =
    data.totalConfirmedGames === 0 && data.totalConfirmedGamesPrior === 0 && data.totalRevenue === 0 && data.totalRevenuePrior === 0;

  const insights = [
    ...buildSeasonalityInsights(
      { games: data.totalConfirmedGames, gamesPrior: data.totalConfirmedGamesPrior, revenue: data.totalRevenue, revenuePrior: data.totalRevenuePrior },
      cards,
      year,
      t
    ),
    ...buildForwardLookingInsights(data.priorMonths, monthLabels, year, currentYear, currentMonthIndex, t),
  ];

  return (
    <div className="space-y-5">
      <div>
        {/* Mismo patrón de breadcrumb que Forecast/Market: región > market >
            facility, cada nivel clickeable para "subir" un escalón. */}
        <div className="flex flex-wrap gap-1.5 text-sm mb-2">
          <Link
            href={buildSeasonalityQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })}
            className={sp.regionId ? "text-brand" : "text-ink font-medium"}
          >
            {t("allNetwork")}
          </Link>
          {names.regionName && (
            <>
              <span className="text-ink-faint">›</span>
              <Link href={buildSeasonalityQuery(sp, { marketId: undefined, facilityId: undefined })} className={sp.marketId ? "text-brand" : "text-ink font-medium"}>
                {names.regionName}
              </Link>
            </>
          )}
          {names.marketName && (
            <>
              <span className="text-ink-faint">›</span>
              <Link href={buildSeasonalityQuery(sp, { facilityId: undefined })} className={sp.facilityId ? "text-brand" : "text-ink font-medium"}>
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
        clearHref={buildSeasonalityQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })}
      />

      {/* Selector de año — reemplaza el selector de granularidad/período
          habitual de FilterPanel (deshabilitado acá vía showTimeControls):
          esta página siempre mira un año calendario completo (Ene-Dic),
          nunca una ventana rolling, así que el eje temporal es "qué año" en
          vez de "qué período". */}
      <div className="flex items-center gap-1">
        <Link
          href={buildSeasonalityQuery(sp, { year: String(year - 1) })}
          aria-label={t("year.prev")}
          className="text-ink-faint hover:text-brand text-base px-1 leading-none"
        >
          ‹
        </Link>
        <span className="font-display text-lg font-bold text-ink min-w-[64px] text-center">{year}</span>
        <Link
          href={buildSeasonalityQuery(sp, { year: String(year + 1) })}
          aria-label={t("year.next")}
          className="text-ink-faint hover:text-brand text-base px-1 leading-none"
        >
          ›
        </Link>
        {year !== currentYear && (
          <Link href={buildSeasonalityQuery(sp, { year: undefined })} className="text-[11px] text-ink-faint hover:text-brand ml-2">
            {t("year.current")}
          </Link>
        )}
      </div>

      <GroupSection title={t("chart.sectionTitle")}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 -mt-1">
          <div className="rounded-xl bg-surface-sunken/40 p-3">
            <div className="text-xs text-ink-faint mb-1">{t("totals.games")}</div>
            <div className="font-display text-lg font-bold text-ink">{formatNum(data.totalConfirmedGames)}</div>
            <div className="mt-1"><ChangeBadge value={totalGamesYoyPct} /></div>
          </div>
          <div className="rounded-xl bg-surface-sunken/40 p-3">
            <div className="text-xs text-ink-faint mb-1">{t("totals.revenue")}</div>
            <div className="font-display text-lg font-bold text-ink">{formatUSD(data.totalRevenue)}</div>
            <div className="mt-1"><ChangeBadge value={totalRevenueYoyPct} /></div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {METRIC_KEYS.map((m) => (
              <Link
                key={m}
                href={buildSeasonalityQuery(sp, { metric: m === "confirmedGames" ? undefined : m })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  metric === m ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"
                }`}
              >
                {t(`chart.metric.${m}`)}
              </Link>
            ))}
          </div>
          <Link
            href={buildSeasonalityQuery(sp, { compare: showCompare ? "0" : undefined })}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 ${
              showCompare ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"
            }`}
          >
            {t(showCompare ? "compare.hide" : "compare.show")}
          </Link>
        </div>

        {chartIsEmpty ? <div className="text-sm text-ink-faint">{t("chart.empty")}</div> : <LineChart data={lineChartData} />}
      </GroupSection>

      <SeasonalityCalendar
        months={cards}
        year={year}
        cardCompare={cardCompare}
        cardCompareHref={buildSeasonalityQuery(sp, { cardCompare: cardCompare ? undefined : "1" })}
      />

      <Glossary
        items={[
          { term: t("glossary.yoy.term"), def: t("glossary.yoy.def") },
          { term: t("glossary.revenue.term"), def: t("glossary.revenue.def") },
          { term: t("glossary.currentMonth.term"), def: t("glossary.currentMonth.def") },
        ]}
      />

      <InsightsPanel title={t("insights.panelTitle")} insights={insights} />
    </div>
  );
}
