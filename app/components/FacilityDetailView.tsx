import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getOverviewData,
  getExtendedMetrics,
  getFacilitySeries,
  getFacilityContext,
  getFacilityTable,
  getFormatBreakdown,
  type OverviewFilters,
} from "../lib/db/queries";
import type { Locale } from "@/i18n/config";
import { resolveEvolutionWindow, type ResolvedPeriod, type Granularity } from "../lib/period";
import BarChart from "./charts/BarChart";
import Sparkline from "./Sparkline";
import KpiCard from "./KpiCard";
import GroupSection from "./GroupSection";
import Glossary from "./Glossary";

type OverviewTranslator = (key: string, values?: Record<string, string | number>) => string;

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {action}
      </div>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && action === undefined && <div className="mb-2" />}
      {children}
    </div>
  );
}

function Stat({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="font-display text-xl font-semibold text-ink">{value}</div>
      {sublabel && <div className="text-xs text-ink-faint mt-0.5">{sublabel}</div>}
    </div>
  );
}

function deviationLabel(facilityRate: number, networkRate: number, goodIsHigh: boolean, t: OverviewTranslator): string {
  const diffPoints = (facilityRate - networkRate) * 100;
  const networkPct = (networkRate * 100).toFixed(1);
  if (Math.abs(diffPoints) < 0.5) return t("facility.deviationInLine", { rate: `${networkPct}%` });
  const better = goodIsHigh ? diffPoints > 0 : diffPoints < 0;
  const key = diffPoints > 0 ? "facility.deviationAbove" : "facility.deviationBelow";
  const base = t(key, { points: Math.abs(diffPoints).toFixed(1), rate: `${networkPct}%` });
  return better ? `${base} ✓` : base;
}

export default async function FacilityDetailView({
  facilityId,
  filters,
  period,
  granularity,
  compare,
  comparePeriod,
  monthProjection,
}: {
  facilityId: string;
  filters: OverviewFilters;
  period: ResolvedPeriod;
  granularity: Granularity;
  compare: boolean;
  comparePeriod: ResolvedPeriod | null;
  monthProjection: {
    monthLabel: string;
    totalSoFar: number;
    confirmedSoFar: number;
    cancelledSoFar: number;
    confirmationRateSoFar: number | null;
    cancellationRateSoFar: number | null;
  };
}) {
  const t = await getTranslations("Overview");
  const locale = (await getLocale()) as Locale;

  const context = await getFacilityContext(facilityId);
  const evolutionWindow = resolveEvolutionWindow(granularity, period.dateTo);

  const [data, extended, evolutionSeries, networkBaseline, formatBreakdown] = await Promise.all([
    getOverviewData(filters, locale),
    getExtendedMetrics(filters),
    getFacilitySeries(facilityId, evolutionWindow.unit, evolutionWindow.windowStart, evolutionWindow.windowEnd),
    getOverviewData({ dateFrom: period.dateFrom, dateTo: period.dateTo }, locale), // sin filtros: promedio de toda la red
    getFormatBreakdown(filters),
  ]);

  const compareData =
    compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
      ? await getOverviewData({ ...filters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo }, locale)
      : null;

  const MIN_GAMES_FOR_POSITION = 10;
  const marketPeersRaw = context
    ? await getFacilityTable({ marketId: context.marketId, dateFrom: period.dateFrom, dateTo: period.dateTo }, "cancellationRate")
    : [];
  const marketPeers = marketPeersRaw.filter((f) => f.totalGames >= MIN_GAMES_FOR_POSITION);
  const positionIndex = marketPeers.findIndex((f) => f.facilityId === facilityId);

  const confirmationDelta = compareData ? data.confirmationRate - compareData.confirmationRate : undefined;
  const cancellationDelta = compareData ? data.cancellationRate - compareData.cancellationRate : undefined;

  // Promedio histórico de esta facility (todo el histórico, mes a mes),
  // excluyendo el mes en curso, que todavía está incompleto.
  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const veryEarlyDate = new Date(Date.UTC(2000, 0, 1));
  const fullHistory = await getFacilitySeries(facilityId, "month", veryEarlyDate, now);
  const historicalMonths = fullHistory.filter((m) => m.bucket !== currentMonthKey);
  const historicalAvgConfirmationRate =
    historicalMonths.length > 0
      ? historicalMonths.reduce((s, m) => s + m.confirmationRate, 0) / historicalMonths.length
      : null;

  const cancellationChart = {
    labels: data.cancellationBreakdown.map((c) => c.label),
    datasets: [{ label: t("facility.cancellationsChartLabel"), data: data.cancellationBreakdown.map((c) => c.count), backgroundColor: "#ff4b33" }],
  };

  const evolutionUnitLabel = evolutionWindow.unit === "week" ? t("facility.evolutionTitleWeekly") : t("facility.evolutionTitleMonthly");
  const evolutionWindowLabel =
    granularity === "week" || granularity === "day"
      ? t("facility.window6Weeks")
      : granularity === "all" || granularity === "year"
      ? t("facility.window1Year")
      : t("facility.window6Months");

  let historicalTrendClause: string | null = null;
  if (
    monthProjection.confirmationRateSoFar !== null &&
    historicalAvgConfirmationRate !== null &&
    Math.abs(monthProjection.confirmationRateSoFar - historicalAvgConfirmationRate) * 100 >= 3
  ) {
    historicalTrendClause =
      monthProjection.confirmationRateSoFar > historicalAvgConfirmationRate
        ? t("facility.aboveHistorical", { pct: formatPct(historicalAvgConfirmationRate) })
        : t("facility.belowHistorical", { pct: formatPct(historicalAvgConfirmationRate) });
  } else if (monthProjection.confirmationRateSoFar !== null && historicalAvgConfirmationRate !== null) {
    historicalTrendClause = t("facility.inLineHistorical", { pct: formatPct(historicalAvgConfirmationRate) });
  }

  return (
    <div className="space-y-5">
      {/* Estado actual del mes en curso: introduce y contextualiza el resto de la página */}
      <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
        <h3 className="text-sm font-medium text-ink mb-2">{t("facility.statusTitle", { month: monthProjection.monthLabel })}</h3>
        {monthProjection.totalSoFar > 0 && monthProjection.confirmationRateSoFar !== null && monthProjection.cancellationRateSoFar !== null ? (
          <p className="text-sm text-ink leading-relaxed">
            {t.rich("facility.statusBase", {
              rate: formatPct(monthProjection.confirmationRateSoFar),
              confirmed: monthProjection.confirmedSoFar,
              total: monthProjection.totalSoFar,
              cancelRate: formatPct(monthProjection.cancellationRateSoFar),
              cancelled: monthProjection.cancelledSoFar,
              bold: (chunks) => <span className="font-semibold text-brand">{chunks}</span>,
              bold2: (chunks) => <span className="font-semibold text-ink">{chunks}</span>,
            })}
            {historicalTrendClause && <>{", "}{historicalTrendClause}.</>}
          </p>
        ) : (
          <p className="text-sm text-ink-faint">{t("facility.statusNoGames")}</p>
        )}
      </div>

      <GroupSection title={t("sections.performance")}>
        <SectionCard title={t("autoInsights.title")}>
          <div className="space-y-2">
            {data.insights.map((insight, i) => (
              <div key={i} className="text-sm text-ink font-medium">{insight}</div>
            ))}
          </div>
        </SectionCard>

        {/* KPIs con desviación respecto al promedio de la red */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label={t("kpi.scheduled")} value={data.totalGames.toLocaleString("en-US")} sublabel={t("kpi.scheduledSub")} />
          <KpiCard label={t("kpi.confirmed")} value={data.confirmedGames.toLocaleString("en-US")} tone="brand" />
          <KpiCard label={t("kpi.cancelled")} value={data.cancelledGames.toLocaleString("en-US")} tone="danger" />
          <KpiCard
            label={t("kpi.confirmationRate")}
            value={formatPct(data.confirmationRate)}
            sublabel={deviationLabel(data.confirmationRate, networkBaseline.confirmationRate, true, t)}
            delta={confirmationDelta}
            tone="brand"
          />
          <KpiCard
            label={t("kpi.cancellationRate")}
            value={formatPct(data.cancellationRate)}
            sublabel={deviationLabel(data.cancellationRate, networkBaseline.cancellationRate, false, t)}
            delta={cancellationDelta}
            deltaInvert
            tone="danger"
          />
          <KpiCard label={t("kpi.occupancy")} value={formatPct(data.avgFillRate)} sublabel={t("kpi.occupancySub")} />
        </div>

        {/* Posición relativa dentro de su propio market */}
        {context && positionIndex >= 0 && (
          <div className="rounded-xl bg-surface-panel px-5 py-3 text-sm text-ink shadow-sm">
            {t.rich("facility.positionLabel", {
              rankNum: positionIndex + 1,
              totalNum: marketPeers.length,
              marketName: context.marketName,
              rank: (chunks) => <span className="font-semibold">{chunks}</span>,
              market: (chunks) => <span className="font-medium">{chunks}</span>,
            })}
            {positionIndex < 3 && marketPeers.length > 5 && <span className="text-danger"> {t("facility.amongWorst")}</span>}
            {positionIndex >= marketPeers.length - 3 && marketPeers.length > 5 && <span className="text-brand"> {t("facility.amongBest")}</span>}
          </div>
        )}
      </GroupSection>

      <GroupSection title={t("sections.evolution")}>
        <SectionCard title={evolutionUnitLabel} subtitle={t("facility.evolutionSubtitle", { window: evolutionWindowLabel })}>
          {evolutionSeries.length > 1 ? (
            <div className="flex items-center gap-5 flex-wrap">
              <Sparkline points={evolutionSeries.map((m) => Math.round(m.confirmationRate * 1000) / 10)} />
              <div className="text-sm text-ink">
                <span className="font-semibold text-brand">{formatPct(evolutionSeries[evolutionSeries.length - 1].confirmationRate)}</span>
                <span className="text-ink-faint">{t("facility.evolutionLatestSuffix", { label: evolutionSeries[evolutionSeries.length - 1].label })}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-ink-faint">{t("facility.evolutionEmpty")}</div>
          )}
          {context && (
            <Link
              href={`/trends?regionId=${context.regionId}&marketId=${context.marketId}&facilityId=${facilityId}`}
              className="text-xs text-brand hover:underline inline-block mt-4"
            >
              {t("facility.viewEvolutionTrends")}
            </Link>
          )}
        </SectionCard>
      </GroupSection>

      <GroupSection title={t("sections.cancellations")}>
        <SectionCard title={t("cancellation.title")}>
          <BarChart data={cancellationChart} />
        </SectionCard>
      </GroupSection>

      <GroupSection title={t("sections.demandOperation")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title={t("operation.leadTimeTitle")}>
            <Stat label={t("operation.leadTimeLabel")} value={extended.medianLeadTime !== null ? extended.medianLeadTime.toFixed(1) : "—"} />
            <Glossary items={[{ term: t("operation.glossary.leadTime.term"), def: t("operation.glossary.leadTime.def") }]} />
          </SectionCard>
          <SectionCard title={t("operation.demandTitle")}>
            <div className="flex items-end gap-6 flex-wrap">
              <Stat label={t("facility.glossary.waitlist.term")} value={extended.totalWaitlist.toLocaleString("en-US")} />
              <Stat label={t("facility.glossary.dropped.term")} value={extended.totalDropped.toLocaleString("en-US")} />
              <Stat label={t("operation.deficit")} value={extended.avgPlayersMissing.toFixed(1)} sublabel={t("facility.deficitSub", { n: extended.missingGamesCount })} />
            </div>
            <Glossary
              items={[
                { term: t("facility.glossary.waitlist.term"), def: t("facility.glossary.waitlist.def") },
                { term: t("facility.glossary.dropped.term"), def: t("facility.glossary.dropped.def") },
                { term: t("facility.glossary.deficit.term"), def: t("facility.glossary.deficit.def") },
              ]}
            />
          </SectionCard>
        </div>

        <SectionCard
          title={t("facility.formatTitle")}
          subtitle={t("facility.formatSubtitle")}
        >
          {formatBreakdown.length > 0 ? (
            <div className="space-y-2">
              {formatBreakdown.map((f) => (
                <div key={f.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{f.label}</span>
                  <span className="text-ink-muted">{t("facility.formatRow", { count: f.count, pct: formatPct(f.pct) })}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-ink-faint">{t("facility.formatEmpty")}</div>
          )}
        </SectionCard>
      </GroupSection>

      <GroupSection title={t("sections.priceReputation")}>
        {/* Versión condensada — el desglose completo (ticket, jugadores/partido,
            partidos/mes, tabla de reputación con rank real) vive en Market;
            acá sólo el vistazo rápido para no duplicar esa página. */}
        <SectionCard title={t("facility.quickLookTitle")}>
          <div className="flex items-end gap-6 flex-wrap mb-3">
            <Stat label={t("satisfaction.rating")} value={extended.avgRating !== null ? extended.avgRating.toFixed(2) : "—"} sublabel={t("satisfaction.ratingSub")} />
            <Stat label={t("priceRevenue.avgPrice")} value={extended.avgPrice !== null ? formatUSD(extended.avgPrice) : "—"} sublabel={t("priceRevenue.avgPriceSub")} />
            <Stat label={t("priceRevenue.totalRevenue")} value={formatUSD(data.totalRevenue)} sublabel={t("priceRevenue.totalRevenueSub")} />
          </div>
          {context && (
            <Link
              href={`/market?regionId=${context.regionId}&marketId=${context.marketId}&facilityId=${facilityId}&tab=reputacion`}
              className="text-xs text-brand hover:underline"
            >
              {t("facility.viewPriceReputationMarket")}
            </Link>
          )}
        </SectionCard>
      </GroupSection>

      <GroupSection title={t("sections.seeMore")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {context && (
            <Link
              href={`/daily?regionId=${context.regionId}&marketId=${context.marketId}&facilityId=${facilityId}`}
              className="block rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4"
            >
              <div className="text-sm font-medium text-brand">{t("facility.seeMoreDailyTitle")}</div>
              <div className="text-xs text-ink-faint mt-1">{t("facility.seeMoreDailyDesc")}</div>
            </Link>
          )}
          {context && (
            <Link
              href={`/trends?regionId=${context.regionId}&marketId=${context.marketId}&facilityId=${facilityId}`}
              className="block rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4"
            >
              <div className="text-sm font-medium text-brand">{t("facility.seeMoreTrendsTitle")}</div>
              <div className="text-xs text-ink-faint mt-1">{t("facility.seeMoreTrendsDesc")}</div>
            </Link>
          )}
        </div>
      </GroupSection>
    </div>
  );
}
