import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getFilterOptions, resolveFilterNames, getSeasonalityData } from "../lib/db/queries";
import { nowInBusinessTimeZone } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import ChangeBadge from "../components/ChangeBadge";
import Glossary from "../components/Glossary";
import GroupSection from "../components/GroupSection";
import LineChart from "../components/charts/LineChart";
import InsightsPanel, { type PanelInsight } from "../components/InsightsPanel";
import SeasonalityCalendar, { type SeasonalityMonthCardVM } from "../components/SeasonalityCalendar";

type SP = { regionId?: string; marketId?: string; facilityId?: string; year?: string; compare?: string };

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

function monthStatus(year: number, monthIndex: number, currentYear: number, currentMonthIndex: number): "past" | "current" | "future" {
  if (year > currentYear) return "future";
  if (year < currentYear) return "past";
  if (monthIndex > currentMonthIndex) return "future";
  if (monthIndex === currentMonthIndex) return "current";
  return "past";
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

export default async function SeasonalityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("Seasonality"), getLocale()]);

  const businessNow = nowInBusinessTimeZone();
  const currentYear = businessNow.getUTCFullYear();
  const currentMonthIndex = businessNow.getUTCMonth();

  const parsedYear = sp.year ? parseInt(sp.year, 10) : currentYear;
  const year = Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : currentYear;
  const showCompare = sp.compare !== "0";
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [names, filterOptions, data] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getSeasonalityData(filters, year),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "short", timeZone: "UTC" })
  );

  const cards: SeasonalityMonthCardVM[] = data.months.map((m, i) => {
    const prior = data.priorMonths[i];
    return {
      monthIndex: i,
      monthLabel: monthLabels[i],
      confirmedGames: m.confirmedGames,
      revenue: m.revenue,
      gamesYoyPct: pctChange(m.confirmedGames, prior.confirmedGames),
      revenueYoyPct: pctChange(m.revenue, prior.revenue),
      status: monthStatus(year, i, currentYear, currentMonthIndex),
    };
  });

  const totalGamesYoyPct = pctChange(data.totalConfirmedGames, data.totalConfirmedGamesPrior);
  const totalRevenueYoyPct = pctChange(data.totalRevenue, data.totalRevenuePrior);

  const lineChartData = {
    labels: monthLabels,
    datasets: [
      {
        label: t("chart.legend", { year }),
        data: data.months.map((m) => m.confirmedGames),
        borderColor: "#16755c",
      },
      ...(showCompare
        ? [
            {
              label: t("chart.legend", { year: year - 1 }),
              data: data.priorMonths.map((m) => m.confirmedGames),
              borderColor: "#9ca3af",
              borderDash: [6, 4],
              fill: false,
            },
          ]
        : []),
    ],
  };

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
      <div className="flex items-center gap-3 flex-wrap">
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
        </div>
        {year !== currentYear && (
          <Link href={buildSeasonalityQuery(sp, { year: undefined })} className="text-[11px] text-ink-faint hover:text-brand">
            {t("year.current")}
          </Link>
        )}

        <span className="w-px h-3.5 bg-border mx-1" />

        <Link
          href={buildSeasonalityQuery(sp, { compare: showCompare ? "0" : undefined })}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            showCompare ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"
          }`}
        >
          {t(showCompare ? "compare.hide" : "compare.show")}
        </Link>
      </div>

      <GroupSection title={t("chart.title")}>
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

        {data.totalConfirmedGames === 0 && data.totalConfirmedGamesPrior === 0 ? (
          <div className="text-sm text-ink-faint">{t("chart.empty")}</div>
        ) : (
          <LineChart data={lineChartData} />
        )}
      </GroupSection>

      <SeasonalityCalendar months={cards} />

      <Glossary
        items={[
          { term: t("glossary.yoy.term"), def: t("glossary.yoy.def") },
          { term: t("glossary.revenue.term"), def: t("glossary.revenue.def") },
          { term: t("glossary.currentMonth.term"), def: t("glossary.currentMonth.def") },
        ]}
      />

      <InsightsPanel
        title={t("insights.panelTitle")}
        insights={buildSeasonalityInsights(
          { games: data.totalConfirmedGames, gamesPrior: data.totalConfirmedGamesPrior, revenue: data.totalRevenue, revenuePrior: data.totalRevenuePrior },
          cards,
          year,
          t
        )}
      />
    </div>
  );
}
