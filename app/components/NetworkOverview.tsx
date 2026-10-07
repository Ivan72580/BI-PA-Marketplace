import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getOverviewData,
  getContributionRanking,
  generateContributionInsights,
  getDayHourHeatmap,
  getExtendedMetrics,
  getDemandLeaders,
  getFacilityTable,
  getMarketFacilitySummary,
  getTopCancellationFacilityForReason,
  getMetricSeriesInWindow,
  getRegionComparison,
  MIN_GAMES_FOR_RANKING,
  type FacilitySortKey,
  type OverviewFilters,
  type OverviewData,
  type ReputationTier,
} from "../lib/db/queries";
import type { Locale } from "@/i18n/config";
import { resolveEvolutionWindow, gamesPerPeriodAverage, formatPerPeriod, type ResolvedPeriod, type Granularity } from "../lib/period";
import { buildQuery, type SP } from "../lib/searchParams";
import Heatmap from "./Heatmap";
import KpiCard from "./KpiCard";
import ChangeBadge from "./ChangeBadge";
import RankingCard, { type RankingRow } from "./RankingCard";
import Tabs from "./Tabs";
import GroupSection from "./GroupSection";
import Glossary from "./Glossary";
import RegionConcentrationPies from "./RegionConcentrationPies";
import RegionComparisonCards from "./RegionComparisonCards";
import InsightsPanel, { type PanelInsight, type PanelInsightGroup } from "./InsightsPanel";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function pctDelta(current: number, prior: number | undefined): number | undefined {
  if (prior === undefined) return undefined;
  return prior !== 0 ? (current - prior) / Math.abs(prior) : undefined;
}
function withRankChange<T extends { facilityId: string }>(rows: T[], priorOrder: string[] | null): (T & { rankChange: number | null | undefined })[] {
  if (!priorOrder) return rows.map((r) => ({ ...r, rankChange: undefined }));
  return rows.map((r, i) => {
    const priorIndex = priorOrder.indexOf(r.facilityId);
    return { ...r, rankChange: priorIndex === -1 ? null : priorIndex - i };
  });
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

type RegionScope = { regionId: string; regionName: string };
type SortDir = "asc" | "desc";
// Insight del panel flotante de Insights (InsightsPanel — "qué mirar hoy"):
// texto + link opcional + severidad. Los insights "propios" (contribución,
// variación de confirmados) no llevan link porque ya hablan del período/
// scope actual; los de cross-tab (aviso de la peor tasa de cancelación, la
// peor calificación, etc.) sí, porque apuntan a un dato puntual de otra
// pestaña. Alias local para no repetir el import en cada firma de función.
type InsightItem = PanelInsight;

export default async function NetworkOverview({
  sp,
  filters,
  period,
  comparePeriod,
  compare,
  facilitySort,
  facilitySortDir,
  regions,
  granularity,
}: {
  sp: SP;
  filters: OverviewFilters;
  period: ResolvedPeriod;
  comparePeriod: ResolvedPeriod | null;
  compare: boolean;
  facilitySort: FacilitySortKey;
  facilitySortDir: SortDir;
  regions: { id: string; name: string }[];
  granularity: Granularity;
}) {
  const t = await getTranslations("Overview");
  const locale = (await getLocale()) as Locale;

  const TIER_LABEL: Record<ReputationTier, string> = {
    platinum: t("tier.platinum"),
    bueno: t("tier.bueno"),
    intermedio: t("tier.intermedio"),
    a_revisar: t("tier.aRevisar"),
    sin_datos: t("tier.sinDatos"),
  };

  const scopes: RegionScope[] = sp.regionId
    ? [{ regionId: sp.regionId, regionName: "" }]
    : regions.map((r) => ({ regionId: r.id, regionName: r.name }));
  const isMultiScope = scopes.length > 1;
  const comparePeriodLabel = comparePeriod?.label ?? t("comparePeriodFallback");

  const scopeData = await Promise.all(
    scopes.map(async (scope) => {
      const scopeFilters: OverviewFilters = { ...filters, regionId: scope.regionId };

      const [current, extended, dayHourHeatmap, demandLeaders, facilityTable, facilitySummary] = await Promise.all([
        getOverviewData(scopeFilters, locale),
        getExtendedMetrics(scopeFilters),
        getDayHourHeatmap(scopeFilters, locale),
        getDemandLeaders(scopeFilters),
        getFacilityTable(scopeFilters, facilitySort, facilitySortDir),
        getMarketFacilitySummary(scopeFilters),
      ]);

      const prior: OverviewData | null =
        compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
          ? await getOverviewData({ ...scopeFilters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo }, locale)
          : null;

      const priorFacilitySummary =
        compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
          ? await getMarketFacilitySummary({ ...scopeFilters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo })
          : null;

      const contribution =
        prior && comparePeriod?.dateFrom && comparePeriod?.dateTo
          ? await getContributionRanking(
              { regionId: scope.regionId, marketId: sp.marketId },
              { dateFrom: period.dateFrom!, dateTo: period.dateTo! },
              { dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo }
            )
          : [];

      const topReason = current.cancellationBreakdown[0] ?? null;
      const topReasonFacility = topReason ? await getTopCancellationFacilityForReason(scopeFilters, topReason.category) : null;

      // Severidad: los insights "propios" (generateOverviewInsights/
      // contribution) describen el período en curso, sin alarma puntual —
      // "notable" por defecto. Los cross-tab de abajo SÍ son alarmas
      // puntuales sobre un peor performer (cancelación, abandono, rating) —
      // "critical" — salvo "facility con más volumen", que es descriptivo,
      // no un problema — "info".
      const insights: InsightItem[] = [...generateContributionInsights(contribution, comparePeriodLabel, t), ...current.insights].map((text) => ({
        text,
        severity: "notable" as const,
      }));
      // Insight dedicado a volumen de confirmados, con variación vs. período anterior.
      if (prior) {
        const delta = pctDelta(current.confirmedGames, prior.confirmedGames);
        if (delta !== undefined && Math.abs(delta) >= 0.05) {
          const key = delta > 0 ? "insights.confirmedUp" : "insights.confirmedDown";
          insights.push({
            text: t(key, { pct: Math.abs(delta * 100).toFixed(1), period: comparePeriodLabel, prior: prior.confirmedGames, current: current.confirmedGames }),
            severity: delta > 0 ? "notable" : "critical",
          });
        }
      }

      // ---------- Highlights cross-tab ----------
      // "Qué mirar hoy" no debería limitarse a lo que ya se ve en las
      // tarjetas hero — acá se suma, por cada una de las otras pestañas de
      // Overview, el dato más crítico o destacable que tiene, con link
      // directo a la facility (mismo destino canónico que usa el resto de
      // la app) en vez de quedar como texto suelto.
      const worstCancel = current.worstCancellationRate[0];
      if (worstCancel) {
        insights.push({
          text: t("insights.crossTab.worstCancellation", {
            facility: worstCancel.label,
            rate: formatPct(worstCancel.rate),
            games: worstCancel.totalGames,
          }),
          href: buildQuery(sp, { facilityId: worstCancel.facilityId, marketId: worstCancel.marketId, regionId: worstCancel.regionId }),
          severity: "critical",
        });
      }

      const topDropped = demandLeaders.dropped[0];
      if (topDropped && topDropped.value > 0) {
        insights.push({
          text: t("insights.crossTab.topDropped", { facility: topDropped.name, n: topDropped.value }),
          href: buildQuery(sp, { facilityId: topDropped.facilityId }),
          severity: "critical",
        });
      }

      const ratedFacilities = facilityTable.filter((f) => f.avgRating !== null && f.totalGames >= MIN_GAMES_FOR_RANKING);
      const worstRated = [...ratedFacilities].sort((a, b) => (a.avgRating as number) - (b.avgRating as number))[0];
      if (worstRated) {
        insights.push({
          text: t("insights.crossTab.worstRating", {
            facility: worstRated.name,
            rating: (worstRated.avgRating as number).toFixed(2),
            n: MIN_GAMES_FOR_RANKING,
          }),
          href: buildQuery(sp, { facilityId: worstRated.facilityId, marketId: worstRated.marketId, regionId: worstRated.regionId }),
          severity: "critical",
        });
      }

      const busiest = [...facilityTable].sort((a, b) => b.totalGames - a.totalGames)[0];
      if (busiest) {
        insights.push({
          text: t("insights.crossTab.busiestFacility", { facility: busiest.name, n: busiest.totalGames }),
          href: buildQuery(sp, { facilityId: busiest.facilityId, marketId: busiest.marketId, regionId: busiest.regionId }),
          severity: "info",
        });
      }

      // Se muestran sólo las Top 5 en el resumen (el ranking completo, con
      // más filas y filtros de mes, vive en Market — ver link "Ver ranking
      // completo" más abajo). El resto de la lista completa (facilitySummary)
      // se sigue usando para el teaser de precio/engagement de este market.
      const top5Sorted = [...facilitySummary].sort((a, b) => b.confirmedGames - a.confirmedGames).slice(0, 5);
      const priorTop5Order = priorFacilitySummary ? [...priorFacilitySummary].sort((a, b) => b.confirmedGames - a.confirmedGames).map((f) => f.facilityId) : null;
      const priorConfirmedByFacility = new Map((priorFacilitySummary ?? []).map((f): [string, number] => [f.facilityId, f.confirmedGames]));

      // Teaser de "Precio" y "Engagement" de Market — contenido que hoy no
      // tiene ningún resumen en Overview (ver auditoría). Sólo tiene sentido
      // una vez que se filtró hasta un market puntual; a nivel red/región
      // mezclaría facilities de negocios muy distintos en un solo promedio.
      const marketTeaser = sp.marketId && facilitySummary.length > 0
        ? (() => {
            const priced = facilitySummary.filter((f) => f.avgPrice !== null);
            const avgPrice = priced.length > 0 ? priced.reduce((s, f) => s + (f.avgPrice ?? 0), 0) / priced.length : null;
            const totalGames = facilitySummary.reduce((s, f) => s + f.totalGames, 0);
            const weightedConversion = totalGames > 0
              ? facilitySummary.reduce((s, f) => s + f.conversionRate * f.totalGames, 0) / totalGames
              : null;
            const totalNearMiss = facilitySummary.reduce((s, f) => s + f.nearMissCancelledCount, 0);
            const totalCancelled = facilitySummary.reduce((s, f) => s + f.cancelledGames, 0);
            return { avgPrice, weightedConversion, totalNearMiss, totalCancelled };
          })()
        : null;

      const top5WithRank = withRankChange(top5Sorted, priorTop5Order).map((f) => ({
        ...f,
        confirmedDelta: priorFacilitySummary ? pctDelta(f.confirmedGames, priorConfirmedByFacility.get(f.facilityId)) ?? null : undefined,
      }));

      return {
        scope,
        current,
        prior,
        extended,
        contribution,
        insights,
        dayHourHeatmap,
        demandLeaders,
        facilityTable,
        top5: top5WithRank,
        marketTeaser,
        topReasonFacility,
      };
    })
  );

  // ---------- KPIs "hero" del Resumen ----------
  // Siempre al nivel del filtro activo (red completa si no hay región
  // elegida, esa región si se eligió una, ese market/facility si se afinó
  // más) — igual que el resto de la app (Market/Trends/Daily muestran un
  // solo nivel, nunca duplicado por sub-scope). La comparación región-vs-
  // región de abajo es un widget aparte, no una repetición de estos mismos
  // KPIs por cada región.
  const heroWindow = resolveEvolutionWindow(granularity, period.dateTo);
  const [heroCurrent, heroPrior, heroExtended, heroPriorExtended, heroSeries, regionComparison] = await Promise.all([
    isMultiScope ? getOverviewData(filters, locale) : Promise.resolve(scopeData[0].current),
    isMultiScope
      ? compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
        ? getOverviewData({ ...filters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo }, locale)
        : Promise.resolve(null)
      : Promise.resolve(scopeData[0].prior),
    isMultiScope ? getExtendedMetrics(filters) : Promise.resolve(scopeData[0].extended),
    // Solo para el delta crudo del KPI de Rating (no pasa por ChangeBadge).
    compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
      ? getExtendedMetrics({ ...filters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo })
      : Promise.resolve(null),
    getMetricSeriesInWindow(filters, heroWindow.unit, heroWindow.windowStart, heroWindow.windowEnd, locale),
    isMultiScope && period.dateFrom && period.dateTo
      ? getRegionComparison(
          { marketId: sp.marketId, facilityId: sp.facilityId },
          period.dateFrom,
          period.dateTo,
          comparePeriod?.dateFrom,
          comparePeriod?.dateTo
        )
      : Promise.resolve([]),
  ]);

  // Mismo orden de regiones que el panel "Qué mirar hoy" (que sigue el
  // orden de `scopes`, es decir de `regions`) — antes esta tarjeta se
  // ordenaba por volumen de confirmados y podía quedar en un orden distinto
  // al de los insights de al lado.
  const regionComparisonOrdered = scopes
    .map((s) => regionComparison.find((r) => r.regionId === s.regionId))
    .filter((r): r is (typeof regionComparison)[number] => r !== undefined);

  const perPeriod = (n: number) => {
    const avg = gamesPerPeriodAverage(n, period.dateFrom, period.dateTo);
    return avg ? formatPerPeriod(avg, locale) : undefined;
  };
  const heroHref = (tab: string) => buildQuery(sp, { tab });

  // Delta "crudo" del KPI de Rating (ej. "+0.22") — a propósito NO pasa por
  // ChangeBadge, que multiplica todo ×100 asumiendo %/puntos porcentuales;
  // un rating 1-5 no es ninguna de las dos cosas.
  const ratingRawDelta: number | null | undefined =
    heroExtended.avgRating === null
      ? undefined
      : heroPriorExtended && heroPriorExtended.avgRating !== null
      ? heroExtended.avgRating - heroPriorExtended.avgRating
      : compare
      ? null
      : undefined;

  // Popover del KPI de Revenue cuando no hay un market puntual elegido (ahí
  // ya se linkea directo a "Precio" de Market) — sin esto, hoy el KPI no
  // tiene a dónde llevar al hacer click a nivel red/región.
  const topRevenueRows = heroCurrent.topRevenueFacilities;
  const revenuePopover = !sp.marketId && topRevenueRows.length > 0 ? (
    <>
      <div className="text-xs font-medium text-ink-muted mb-2">{t("priceRevenue.topContributorsTitle")}</div>
      <div className="space-y-1">
        {topRevenueRows.map((f, i) => (
          <div key={f.facilityId} className="flex justify-between gap-2 text-xs">
            <span className="text-ink truncate">{i + 1}. {f.label}</span>
            <span className="text-ink-faint shrink-0">{formatUSD(f.value)}</span>
          </div>
        ))}
      </div>
    </>
  ) : undefined;
  const marketTabHref = (tab: string) => {
    const params = new URLSearchParams();
    if (sp.regionId) params.set("regionId", sp.regionId);
    if (sp.marketId) params.set("marketId", sp.marketId);
    params.set("tab", tab);
    return `/market?${params.toString()}`;
  };

  const sortLink = (key: FacilitySortKey, label: string) => {
    const isActive = facilitySort === key;
    const nextDir: SortDir = isActive && facilitySortDir === "desc" ? "asc" : "desc";
    const arrow = isActive ? (facilitySortDir === "desc" ? "▼" : "▲") : "";
    return (
      <Link
        href={buildQuery(sp, { facilitySort: key === "games" && nextDir === "desc" ? undefined : key, facilitySortDir: key === "games" && nextDir === "desc" ? undefined : nextDir })}
        className={`hover:underline inline-flex items-center gap-1 ${isActive ? "text-ink font-medium" : "text-ink-muted"}`}
      >
        {label} <span className="text-[10px]">{arrow}</span>
      </Link>
    );
  };

  // ---------- Tab: Resumen ----------
  // Fila de 8 KPIs "hero", siempre al nivel del filtro activo (ver el
  // Promise.all de arriba) — clickeables hacia la pestaña donde vive el
  // detalle de cada métrica, en vez de repetir texto explicativo acá. Debajo,
  // si no hay región filtrada, la comparación región-vs-región (antes
  // exclusiva de Panel Ejecutivo); los insights automáticos quedan en un
  // panel colapsado por defecto, separado de las tarjetas.
  const heroKpis = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard
        label={t("kpi.scheduled")}
        value={heroCurrent.totalGames.toLocaleString("en-US")}
        perPeriod={perPeriod(heroCurrent.totalGames)}
        delta={pctDelta(heroCurrent.totalGames, heroPrior?.totalGames)}
        staticDelta
        href={heroHref("facilities")}
        sparklinePoints={heroSeries.map((p) => ({ label: p.label, value: p.totalGames }))}
        sparklineFormat="count"
      />
      <KpiCard
        label={t("kpi.confirmed")}
        value={heroCurrent.confirmedGames.toLocaleString("en-US")}
        perPeriod={perPeriod(heroCurrent.confirmedGames)}
        delta={pctDelta(heroCurrent.confirmedGames, heroPrior?.confirmedGames)}
        staticDelta
        href={heroHref("confirmations")}
        sparklinePoints={heroSeries.map((p) => ({ label: p.label, value: p.confirmedGames }))}
        sparklineFormat="count"
      />
      <KpiCard
        label={t("kpi.cancelled")}
        value={heroCurrent.cancelledGames.toLocaleString("en-US")}
        perPeriod={perPeriod(heroCurrent.cancelledGames)}
        delta={pctDelta(heroCurrent.cancelledGames, heroPrior?.cancelledGames)}
        deltaInvert
        staticDelta
        href={heroHref("cancellations")}
        sparklinePoints={heroSeries.map((p) => ({ label: p.label, value: p.cancelledGames }))}
        sparklineFormat="count"
      />
      <KpiCard
        label={t("kpi.confirmationRate")}
        value={formatPct(heroCurrent.confirmationRate)}
        sublabel={t("kpi.demandNote", {
          raw: formatPct(heroCurrent.rawConfirmationRate),
          n: (heroCurrent.cancelledGames - heroCurrent.demandCancelledGames).toLocaleString("en-US"),
        })}
        delta={heroPrior ? heroCurrent.confirmationRate - heroPrior.confirmationRate : undefined}
        deltaUnit="pts"
        staticDelta
        href={heroHref("confirmations")}
        sparklinePoints={heroSeries.map((p) => ({ label: p.label, value: p.confirmationRate }))}
        sparklineFormat="pct"
      />
      <KpiCard
        label={t("kpi.cancellationRate")}
        sublabel={t("kpi.demandCancelNote", { n: heroCurrent.fieldUnavailableGames.toLocaleString("en-US") })}
        value={formatPct(heroCurrent.cancellationRate)}
        delta={heroPrior ? heroCurrent.cancellationRate - heroPrior.cancellationRate : undefined}
        deltaUnit="pts"
        deltaInvert
        staticDelta
        href={heroHref("cancellations")}
        sparklinePoints={heroSeries.map((p) => ({ label: p.label, value: p.cancellationRate }))}
        sparklineFormat="pct"
      />
      <KpiCard
        label={t("kpi.occupancy")}
        value={formatPct(heroCurrent.avgFillRate)}
        delta={heroPrior ? heroCurrent.avgFillRate - heroPrior.avgFillRate : undefined}
        deltaUnit="pts"
        staticDelta
        href={heroHref("confirmations")}
        sparklinePoints={heroSeries.map((p) => ({ label: p.label, value: p.occupancyRate }))}
        sparklineFormat="pct"
      />
      <KpiCard
        label={t("kpi.revenue")}
        value={formatUSD(heroCurrent.totalRevenue)}
        delta={pctDelta(heroCurrent.totalRevenue, heroPrior?.totalRevenue)}
        staticDelta
        href={sp.marketId ? marketTabHref("precio") : undefined}
        popover={revenuePopover}
      />
      <KpiCard
        label={t("kpi.rating")}
        value={heroExtended.avgRating !== null ? heroExtended.avgRating.toFixed(2) : "—"}
        sublabel={t("satisfaction.ratingSub")}
        rawDelta={ratingRawDelta}
        href={heroHref("gameRating")}
      />
    </div>
  );

  const resumenContent = (
    <div className="space-y-5">
      {heroKpis}
      {comparePeriod?.label && (
        <div className="text-[11px] text-ink-faint px-1 -mt-2">{t("varianceVs", { period: comparePeriod.label })}</div>
      )}

      {isMultiScope && regionComparisonOrdered.length >= 2 && (
        <GroupSection title={t("sections.regionComparison")}>
          <RegionComparisonCards rows={regionComparisonOrdered} buildHref={(regionId) => buildQuery(sp, { regionId })} />
        </GroupSection>
      )}

      {!sp.regionId && (
        <GroupSection title={t("sections.regionConcentration")}>
          <RegionConcentrationPies filters={filters} buildHref={(regionId) => `/market?regionId=${regionId}`} />
        </GroupSection>
      )}

      <GroupSection title={t("sections.composition")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, top5, marketTeaser }) => {
            const top5Rows: RankingRow[] = top5.map((f) => ({
              facilityId: f.facilityId,
              marketId: f.marketId,
              regionId: f.regionId,
              label: f.name,
              value: f.confirmedGames,
              extra: t("composition.rankingExtra", { tier: TIER_LABEL[f.reputationTier], rate: formatPct(f.cancellationRate) }),
              rankChange: f.rankChange,
              delta: f.confirmedDelta,
            }));
            return (
              <div key={scope.regionId} className="space-y-3">
                <div className="space-y-2">
                  <RankingCard
                    title={isMultiScope ? t("composition.top5TitleRegion", { region: scope.regionName }) : t("composition.top5Title")}
                    subtitle={t("composition.subtitle")}
                    rows={top5Rows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                  />
                  <Link href={`/market?regionId=${scope.regionId}${sp.marketId ? `&marketId=${sp.marketId}` : ""}&tab=reputacion`} className="text-xs text-brand inline-block px-1">
                    {t("composition.viewFullRanking")}
                  </Link>
                </div>

                {marketTeaser && (
                  <SectionCard title={t("marketTeaser.title")} subtitle={t("marketTeaser.subtitle")}>
                    <div className="flex items-end gap-6 flex-wrap mb-2">
                      <Stat label={t("marketTeaser.avgTicket")} value={marketTeaser.avgPrice !== null ? formatUSD(marketTeaser.avgPrice) : "—"} sublabel={t("marketTeaser.avgTicketSub")} />
                      <Stat label={t("marketTeaser.conversion")} value={marketTeaser.weightedConversion !== null ? formatPct(marketTeaser.weightedConversion) : "—"} sublabel={t("marketTeaser.conversionSub")} />
                      <Stat
                        label={t("marketTeaser.nearMiss")}
                        value={marketTeaser.totalNearMiss.toLocaleString("en-US")}
                        sublabel={marketTeaser.totalCancelled > 0 ? t("marketTeaser.nearMissSub", { pct: formatPct(marketTeaser.totalNearMiss / marketTeaser.totalCancelled) }) : undefined}
                      />
                    </div>
                    <div className="flex gap-4 text-xs pt-2 border-t border-surface-sunken">
                      <Link href={`/market?regionId=${scope.regionId}&marketId=${sp.marketId}&tab=precio`} className="text-brand hover:underline">{t("marketTeaser.viewPrice")}</Link>
                      <Link href={`/market?regionId=${scope.regionId}&marketId=${sp.marketId}&tab=engagement`} className="text-brand hover:underline">{t("marketTeaser.viewEngagement")}</Link>
                    </div>
                  </SectionCard>
                )}
              </div>
            );
          })}
        </div>
      </GroupSection>

      <GroupSection title={t("sections.cancellationReasons")}>
        {isMultiScope ? (
          <SectionCard title={t("cancellation.compareTitle")} subtitle={t("cancellation.compareSubtitle")}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-1.5 px-2 font-normal">{t("cancellation.headers.region")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("cancellation.headers.cancelled")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("cancellation.headers.rate")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("cancellation.headers.topReason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeData.map(({ scope, current }) => {
                    const cancellationsTabHref = buildQuery(sp, { regionId: scope.regionId, tab: "cancellations" });
                    const topReason = current.cancellationBreakdown[0] ?? null;
                    return (
                      <tr key={scope.regionId} className="border-b border-surface-sunken">
                        <td className="py-1.5 px-2 text-ink font-medium">
                          <Link href={buildQuery(sp, { regionId: scope.regionId })} className="hover:text-brand hover:underline">
                            {scope.regionName}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-ink">
                          <Link href={cancellationsTabHref} className="hover:text-brand hover:underline">
                            {current.cancelledGames.toLocaleString("en-US")}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-ink">
                          <Link href={cancellationsTabHref} className="hover:text-brand hover:underline">
                            {formatPct(current.cancellationRate)}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-ink-muted">
                          {topReason ? (
                            <Link href={buildQuery(sp, { cancellationReason: topReason.category, regionId: scope.regionId })} className="hover:text-brand hover:underline">
                              {`${topReason.label} (${formatPct(topReason.pct)})`}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ) : (
          scopeData.map(({ scope, current }) => {
            const topReason = current.cancellationBreakdown[0] ?? null;
            return (
              <SectionCard key={scope.regionId} title={t("cancellation.title")}>
                <Link
                  href={buildQuery(sp, { regionId: scope.regionId, tab: "cancellations" })}
                  className="text-sm text-ink-muted hover:text-brand hover:underline block mb-1"
                >
                  {t("cancellation.subtitleSingle", { cancelled: current.cancelledGames.toLocaleString("en-US"), rate: formatPct(current.cancellationRate) })}
                </Link>
                <div className="text-sm text-ink-muted">
                  {topReason ? (
                    <Link
                      href={buildQuery(sp, { cancellationReason: topReason.category, regionId: scope.regionId })}
                      className="hover:text-brand hover:underline"
                    >
                      {t("cancellation.topReasonInline", { reason: topReason.label, pct: formatPct(topReason.pct) })}
                    </Link>
                  ) : (
                    t("cancellation.empty")
                  )}
                </div>
              </SectionCard>
            );
          })
        )}
        {/* El desglose por motivo (con drill-down por facility) y los rankings
            de cancelación se movieron a su propia pestaña — este bloque ahora
            es sólo el pantallazo, no la duplica. */}
        <div className="text-xs text-ink-faint px-1 pt-1">{t("cancellation.viewFullDetail")}</div>
      </GroupSection>

      <GroupSection title={t("sections.satisfactionPriceOrganizer")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, current, extended }) => (
            <div key={scope.regionId} className="space-y-4">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard title={t("priceRevenue.title")}>
                <div className="flex items-end gap-6">
                  <Stat label={t("priceRevenue.avgPrice")} value={extended.avgPrice !== null ? formatUSD(extended.avgPrice) : "—"} sublabel={t("priceRevenue.avgPriceSub")} />
                  <Stat label={t("priceRevenue.totalRevenue")} value={formatUSD(current.totalRevenue)} sublabel={t("priceRevenue.totalRevenueSub")} />
                </div>
              </SectionCard>
              <div className="rounded-xl bg-surface-panel px-5 py-3.5 shadow-sm">
                <div className="text-xs text-ink-faint mb-2">{t("organizer.title")}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                  {extended.organizerBreakdown.map((o) => (
                    <span key={o.organizer} className="text-xs text-ink-muted">
                      {t("organizer.summary", {
                        organizer: o.organizer,
                        confirmed: o.confirmedCount.toLocaleString("en-US"),
                        cancelled: (o.count - o.confirmedCount).toLocaleString("en-US"),
                        rate: formatPct(o.cancellationRate),
                      })}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Glossary
          items={[
            { term: t("satisfactionGlossary.avgPrice.term"), def: t("satisfactionGlossary.avgPrice.def") },
            { term: t("satisfactionGlossary.totalRevenue.term"), def: t("satisfactionGlossary.totalRevenue.def") },
          ]}
        />
      </GroupSection>
    </div>
  );

  // ---------- Tab: Cancellations ----------
  // Consolida lo que antes vivía repartido entre "Resumen" (desglose por
  // motivo + drill-down por facility) y "Por facility" (peor tasa, Pareto de
  // cancelados, contribución) — un solo lugar con todo el detalle de
  // cancelaciones, en vez de dos pestañas que mezclaban confirmación y
  // cancelación sin separar.
  const cancellationsContent = (
    <div className="space-y-6">
      {scopeData.map(({ scope, current, prior, contribution, topReasonFacility }) => {
        const priorParetoCancelledOrder = prior?.paretoCancellations.map((f) => f.facilityId) ?? null;
        const priorWorstRateOrder = prior?.worstCancellationRate.map((f) => f.facilityId) ?? null;
        const priorCancelledValue = new Map((prior?.paretoCancellations ?? []).map((f): [string, number] => [f.facilityId, f.value]));

        const paretoCancelledRows: RankingRow[] = withRankChange(current.paretoCancellations, priorParetoCancelledOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: f.value, extra: t("rankings.cumulativeSuffix", { pct: formatPct(f.cumulativePct) }), rankChange: f.rankChange,
          delta: prior ? pctDelta(f.value, priorCancelledValue.get(f.facilityId)) ?? null : undefined,
        }));
        const worstRateRows: RankingRow[] = withRankChange(current.worstCancellationRate, priorWorstRateOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: Math.round(f.rate * 100), extra: t("rankings.gamesSuffix", { n: f.totalGames }), rankChange: f.rankChange,
        }));
        const cancelContribRows: RankingRow[] = [...contribution]
          .sort((a, b) => b.excessCancellations - a.excessCancellations)
          .slice(0, 10)
          .map((f) => ({
            facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
            value: Math.abs(f.excessCancellations),
            displayValue: `${f.excessCancellations > 0 ? "+" : ""}${f.excessCancellations.toFixed(1)} ${t("rankings.vsExpected")}`,
          }));

        return (
          <div key={scope.regionId}>
            <GroupSection title={isMultiScope ? t("sections.rankingsRegion", { region: scope.regionName }) : t("sections.rankings")}>
              {contribution.length > 0 && (
                <>
                  <RankingCard
                    title={t("rankings.contribCancelTitle")}
                    subtitle={t("rankings.contribCancelSubtitle", { period: comparePeriodLabel })}
                    rows={cancelContribRows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                    tone="danger"
                  />
                  <Glossary
                    items={[
                      { term: t("rankings.contribGlossary.whatShows.term"), def: t("rankings.contribGlossary.whatShows.def") },
                      { term: t("rankings.contribGlossary.barLength.term"), def: t("rankings.contribGlossary.barLength.def") },
                    ]}
                  />
                </>
              )}

              <RankingCard
                title={t("rankings.paretoCancelledTitle")}
                subtitle={t("rankings.paretoCancelledSubtitle", { n: paretoCancelledRows.length, pct: formatPct(current.paretoCoveragePct) })}
                rows={paretoCancelledRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => t("rankings.cancelledSuffix", { n: v })}
                tone="danger"
              />
              <Glossary items={[{ term: t("rankings.cumulativePctGlossary.term"), def: t("rankings.cumulativePctGlossary.def") }]} />

              <RankingCard
                title={t("rankings.worstRateTitle")}
                subtitle={t("rankings.worstRateSubtitle")}
                rows={worstRateRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => `${v}%`}
                tone="danger"
              />
            </GroupSection>

            <div className="mt-5">
              <GroupSection title={t("sections.cancellationReasons")}>
                {isMultiScope ? (
                  <SectionCard title={t("cancellation.rankingTitleRegion", { region: scope.regionName })}>
                    <div className="space-y-2">
                      {current.cancellationBreakdown.map((reason) => {
                        const priorReason = prior?.cancellationBreakdown.find((r) => r.category === reason.category);
                        const delta = priorReason ? pctDelta(reason.count, priorReason.count) ?? null : null;
                        return (
                          <Link
                            key={reason.category}
                            href={buildQuery(sp, { cancellationReason: reason.category, regionId: scope.regionId })}
                            className="flex items-center justify-between text-sm rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-sunken/50 transition-colors group"
                          >
                            <span className="text-ink group-hover:text-brand">{reason.label}</span>
                            <span className="flex items-center gap-2 text-ink-muted">
                              {reason.count} · {formatPct(reason.pct)}
                              {compare && <ChangeBadge value={delta} invert />}
                            </span>
                          </Link>
                        );
                      })}
                      {current.cancellationBreakdown.length === 0 && <div className="text-sm text-ink-faint">{t("cancellation.empty")}</div>}
                    </div>
                    {topReasonFacility && current.cancellationBreakdown[0] && (
                      <div className="mt-4 pt-3 border-t border-surface-sunken text-sm text-ink">
                        {t.rich("cancellation.topContributorWarning", {
                          facility: topReasonFacility.name,
                          reason: current.cancellationBreakdown[0].label,
                          region: scope.regionName,
                          count: topReasonFacility.count,
                          total: current.cancellationBreakdown[0].count,
                          link: (chunks) => (
                            <Link href={buildQuery(sp, { facilityId: topReasonFacility.facilityId, regionId: scope.regionId })} className="text-brand hover:underline font-medium">
                              {chunks}
                            </Link>
                          ),
                        })}
                      </div>
                    )}
                  </SectionCard>
                ) : (
                  <SectionCard title={t("cancellation.title")} subtitle={t("cancellation.subtitleSingle", { cancelled: current.cancelledGames.toLocaleString("en-US"), rate: formatPct(current.cancellationRate) })}>
                    <div className="space-y-2">
                      {current.cancellationBreakdown.map((reason) => {
                        const priorReason = prior?.cancellationBreakdown.find((r) => r.category === reason.category);
                        const delta = priorReason ? pctDelta(reason.count, priorReason.count) ?? null : null;
                        return (
                          <Link
                            key={reason.category}
                            href={buildQuery(sp, { cancellationReason: reason.category, regionId: scope.regionId })}
                            className="flex items-center justify-between text-sm rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-sunken/50 transition-colors group"
                          >
                            <span className="text-ink group-hover:text-brand">{reason.label}</span>
                            <span className="flex items-center gap-2 text-ink-muted">
                              {reason.count} · {formatPct(reason.pct)}
                              {compare && <ChangeBadge value={delta} invert />}
                            </span>
                          </Link>
                        );
                      })}
                      {current.cancellationBreakdown.length === 0 && <div className="text-sm text-ink-faint">{t("cancellation.empty")}</div>}
                    </div>
                  </SectionCard>
                )}
              </GroupSection>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ---------- Tab: Confirmations ----------
  // Junta lo confirmación-céntrico que antes estaba repartido entre "Por
  // facility" (Pareto de confirmados, contribución) y "Por horario" (heatmap
  // día×hora, lead time, demanda/waitlist) — la pregunta que responde esta
  // pestaña es siempre "¿qué está pasando con los partidos que SÍ se
  // confirman?", así que tiene más sentido junta que separada en dos tabs
  // sin nombre claro.
  const confirmationsContent = (
    <div className="space-y-6">
      {scopeData.map(({ scope, current, prior, contribution }) => {
        const priorParetoConfirmedOrder = prior?.paretoConfirmations.map((f) => f.facilityId) ?? null;
        const priorConfirmedValue = new Map((prior?.paretoConfirmations ?? []).map((f): [string, number] => [f.facilityId, f.value]));

        const paretoConfirmedRows: RankingRow[] = withRankChange(current.paretoConfirmations, priorParetoConfirmedOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: f.value, extra: t("rankings.cumulativeSuffix", { pct: formatPct(f.cumulativePct) }), rankChange: f.rankChange,
          delta: prior ? pctDelta(f.value, priorConfirmedValue.get(f.facilityId)) ?? null : undefined,
        }));
        const confirmContribRows: RankingRow[] = [...contribution]
          .sort((a, b) => b.excessConfirmations - a.excessConfirmations)
          .slice(0, 10)
          .map((f) => ({
            facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
            value: Math.abs(f.excessConfirmations),
            displayValue: `${f.excessConfirmations > 0 ? "+" : ""}${f.excessConfirmations.toFixed(1)} ${t("rankings.vsExpected")}`,
          }));

        return (
          <div key={scope.regionId}>
            <GroupSection title={isMultiScope ? t("sections.rankingsRegion", { region: scope.regionName }) : t("sections.rankings")}>
              {contribution.length > 0 && (
                <>
                  <RankingCard
                    title={t("rankings.contribConfirmTitle")}
                    subtitle={t("rankings.contribConfirmSubtitle", { period: comparePeriodLabel })}
                    rows={confirmContribRows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                  />
                  <Glossary
                    items={[
                      { term: t("rankings.contribGlossary.whatShows.term"), def: t("rankings.contribGlossary.whatShows.def") },
                      { term: t("rankings.contribGlossary.barLength.term"), def: t("rankings.contribGlossary.barLength.def") },
                    ]}
                  />
                </>
              )}

              <RankingCard
                title={t("rankings.paretoConfirmedTitle")}
                subtitle={t("rankings.paretoConfirmedSubtitle", { n: paretoConfirmedRows.length, pct: formatPct(current.paretoConfirmedCoveragePct) })}
                rows={paretoConfirmedRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => t("rankings.confirmedSuffix", { n: v })}
              />
              <Glossary items={[{ term: t("rankings.cumulativePctGlossary.term"), def: t("rankings.cumulativePctGlossary.def") }]} />
            </GroupSection>
          </div>
        );
      })}

      <GroupSection title={t("sections.schedule")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, dayHourHeatmap }) => (
            <div key={scope.regionId} className="space-y-2">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard
                title={t("schedule.heatmapTitle")}
                subtitle={t("schedule.heatmapSubtitle")}
              >
                <Heatmap days={dayHourHeatmap.days} hours={dayHourHeatmap.hours} cells={dayHourHeatmap.cells} maxCount={dayHourHeatmap.maxCount} metric="count" />
                <div className="flex gap-4 text-xs pt-3 mt-1 border-t border-surface-sunken">
                  {sp.marketId ? (
                    <Link href={`/trends?regionId=${scope.regionId}&marketId=${sp.marketId}`} className="text-brand hover:underline">
                      {t("schedule.viewTrendsMarket")}
                    </Link>
                  ) : (
                    <Link href={`/trends?regionId=${scope.regionId}`} className="text-brand hover:underline">
                      {t("schedule.viewTrendsRegion")}
                    </Link>
                  )}
                  <Link href="/daily" className="text-brand hover:underline">{t("schedule.viewDailyToday")}</Link>
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
      </GroupSection>

      <GroupSection title={t("sections.operation")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, extended, demandLeaders }) => (
            <div key={scope.regionId} className="space-y-4">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard title={t("operation.leadTimeTitle")}>
                <Stat label={t("operation.leadTimeLabel")} value={extended.medianLeadTime !== null ? extended.medianLeadTime.toFixed(1) : "—"} />
                {extended.medianLeadTime !== null && extended.medianLeadTime > 5 && (
                  <div className="mt-2 text-xs text-ink-faint">{t("operation.leadTimeWarning")}</div>
                )}
              </SectionCard>
              <SectionCard title={t("operation.demandTitle")}>
                <div className="flex items-end gap-6 flex-wrap mb-4">
                  <Stat label={t("operation.waitlist")} value={extended.totalWaitlist.toLocaleString("en-US")} />
                  <Stat label={t("operation.dropped")} value={extended.totalDropped.toLocaleString("en-US")} />
                  <Stat label={t("operation.deficit")} value={extended.avgPlayersMissing.toFixed(1)} sublabel={t("operation.deficitSub", { n: extended.missingGamesCount.toLocaleString("en-US") })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-surface-sunken">
                  <div>
                    <div className="text-xs text-ink-faint mb-1.5">{t("operation.topWaitlist")}</div>
                    <div className="space-y-1">
                      {demandLeaders.waitlist.map((f, i) => (
                        <div key={f.facilityId} className="flex justify-between text-xs">
                          <span className="text-ink-muted">{i + 1}. <Link href={buildQuery(sp, { facilityId: f.facilityId })} className="text-brand hover:underline">{f.name}</Link></span>
                          <span className="text-ink">{f.value}</span>
                        </div>
                      ))}
                      {demandLeaders.waitlist.length === 0 && <div className="text-xs text-ink-faint">{t("operation.noData")}</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint mb-1.5">{t("operation.topDropped")}</div>
                    <div className="space-y-1">
                      {demandLeaders.dropped.map((f, i) => (
                        <div key={f.facilityId} className="flex justify-between text-xs">
                          <span className="text-ink-muted">{i + 1}. <Link href={buildQuery(sp, { facilityId: f.facilityId })} className="text-brand hover:underline">{f.name}</Link></span>
                          <span className="text-ink">{f.value}</span>
                        </div>
                      ))}
                      {demandLeaders.dropped.length === 0 && <div className="text-xs text-ink-faint">{t("operation.noData")}</div>}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
        <Glossary
          items={[
            { term: t("operation.glossary.leadTime.term"), def: t("operation.glossary.leadTime.def") },
            { term: t("operation.glossary.waitlistDropped.term"), def: t("operation.glossary.waitlistDropped.def") },
            { term: t("operation.glossary.deficit.term"), def: t("operation.glossary.deficit.def") },
          ]}
        />
      </GroupSection>
    </div>
  );

  // ---------- Tab: Game Rating ----------
  // El agregado (promedio ponderado, cobertura) ya existía en Resumen; lo que
  // faltaba — y es la razón de tener esta pestaña propia — es el ranking por
  // facility, que hoy ya se puede armar sin datos nuevos: facilityTable trae
  // avgRating por facility (mismo piso MIN_GAMES_FOR_RANKING que el resto de
  // los rankings, para que el promedio no lo domine una facility con 2
  // partidos jugados).
  const gameRatingContent = (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
        {scopeData.map(({ scope, extended }) => (
          <div key={scope.regionId} className="space-y-2">
            {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
            <SectionCard title={t("satisfaction.title")}>
              {extended.avgRating !== null ? (
                <div className="flex items-end gap-6 flex-wrap">
                  <Stat label={t("satisfaction.rating")} value={extended.avgRating.toFixed(2)} sublabel={t("satisfaction.ratingSub")} />
                  <Stat label={t("satisfaction.reviews")} value={extended.totalRatingCount.toLocaleString("en-US")} />
                  <Stat label={t("satisfaction.coverage")} value={formatPct(extended.ratingsCoveragePct)} />
                </div>
              ) : (
                <div className="text-sm text-ink-faint">{t("satisfaction.noData")}</div>
              )}
            </SectionCard>
          </div>
        ))}
      </div>
      <Glossary
        items={[
          { term: t("satisfactionGlossary.rating.term"), def: t("satisfactionGlossary.rating.def") },
          { term: t("satisfactionGlossary.coverage.term"), def: t("satisfactionGlossary.coverage.def") },
        ]}
      />

      {scopeData.map(({ scope, facilityTable }) => {
        const rated = facilityTable.filter((f) => f.avgRating !== null && f.totalGames >= MIN_GAMES_FOR_RANKING);
        const topRatedRows: RankingRow[] = [...rated]
          .sort((a, b) => (b.avgRating as number) - (a.avgRating as number))
          .slice(0, 10)
          .map((f) => ({ facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.name, value: f.avgRating as number }));
        const needsAttentionRows: RankingRow[] = [...rated]
          .sort((a, b) => (a.avgRating as number) - (b.avgRating as number))
          .slice(0, 10)
          .map((f) => ({ facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.name, value: f.avgRating as number }));

        return (
          <div key={scope.regionId}>
            <GroupSection title={isMultiScope ? t("sections.rankingsRegion", { region: scope.regionName }) : t("sections.rankings")}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <RankingCard
                  title={t("gameRating.topRatedTitle")}
                  subtitle={t("gameRating.topRatedSubtitle", { n: MIN_GAMES_FOR_RANKING })}
                  rows={topRatedRows}
                  buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                  formatValue={(v) => v.toFixed(2)}
                />
                <RankingCard
                  title={t("gameRating.needsAttentionTitle")}
                  subtitle={t("gameRating.needsAttentionSubtitle", { n: MIN_GAMES_FOR_RANKING })}
                  rows={needsAttentionRows}
                  buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                  formatValue={(v) => v.toFixed(2)}
                  tone="danger"
                />
              </div>
            </GroupSection>
          </div>
        );
      })}

      <div className="rounded-xl bg-surface-panel px-5 py-3.5 shadow-sm text-sm">
        <Link href="/panel-ejecutivo/satisfaction" className="text-brand hover:underline font-medium">
          {t("gameRating.viewFullReviews")}
        </Link>
        <div className="text-xs text-ink-faint mt-1">{t("gameRating.viewFullReviewsCaveat")}</div>
      </div>
    </div>
  );

  // ---------- Tab: Facilities ----------
  // La lista maestra ordenable — antes vivía colapsada dentro de "Por
  // facility" junto a los rankings (que ahora tienen su propia pestaña); acá
  // es el contenido completo de la pestaña, así que ya no hace falta el
  // <details> para no abrumar la vista.
  const facilitiesContent = (
    <div className="space-y-6">
      {scopeData.map(({ scope, facilityTable }) => (
        <div key={scope.regionId}>
          <GroupSection title={isMultiScope ? t("rankings.allFacilitiesRegion", { region: scope.regionName }) : t("rankings.allFacilities")}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-1.5 px-2 font-normal">{t("facilityTable.headers.facility")}</th>
                    <th className="py-1.5 px-2 font-normal">{sortLink("games", t("facilityTable.headers.games"))}</th>
                    <th className="py-1.5 px-2 font-normal">{t("facilityTable.headers.confirmed")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("facilityTable.headers.cancelled")}</th>
                    <th className="py-1.5 px-2 font-normal">{sortLink("cancellationRate", t("facilityTable.headers.cancellation"))}</th>
                    <th className="py-1.5 px-2 font-normal">{sortLink("rating", t("facilityTable.headers.rating"))}</th>
                    <th className="py-1.5 px-2 font-normal">{sortLink("price", t("facilityTable.headers.price"))}</th>
                  </tr>
                </thead>
                <tbody>
                  {facilityTable.slice(0, 50).map((f) => (
                    <tr key={f.facilityId} className="border-b border-surface-sunken">
                      <td className="py-1.5 px-2">
                        <Link href={buildQuery(sp, { facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId })} className="text-brand hover:underline">
                          {f.name}
                        </Link>
                      </td>
                      <td className="py-1.5 px-2 text-ink">{f.totalGames}</td>
                      <td className="py-1.5 px-2 text-ink">{f.confirmedGames}</td>
                      <td className="py-1.5 px-2 text-ink">{f.totalGames - f.confirmedGames}</td>
                      <td className="py-1.5 px-2 text-ink">{formatPct(f.cancellationRate)}</td>
                      <td className="py-1.5 px-2 text-ink">{f.avgRating !== null ? f.avgRating.toFixed(2) : "—"}</td>
                      <td className="py-1.5 px-2 text-ink">{f.avgPrice !== null ? formatUSD(f.avgPrice) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Glossary
              items={[
                { term: t("facilityTable.glossary.confirmedCancelled.term"), def: t("facilityTable.glossary.confirmedCancelled.def") },
                { term: t("facilityTable.glossary.rating.term"), def: t("facilityTable.glossary.rating.def") },
                { term: t("facilityTable.glossary.price.term"), def: t("facilityTable.glossary.price.def") },
                { term: t("facilityTable.glossary.sortableColumns.term"), def: t("facilityTable.glossary.sortableColumns.def") },
              ]}
            />
          </GroupSection>
        </div>
      ))}
    </div>
  );

  // Antes vivía dentro del tab "Resumen" (GroupSection colapsado) — ahora es
  // el panel flotante compartido (InsightsPanel), a nivel de página: visible
  // desde cualquiera de las 5 pestañas, no solo Resumen (antes ese "qué
  // mirar hoy" no se veía si el usuario ya había navegado a otra pestaña).
  const insightGroups: PanelInsightGroup[] = scopeData.map(({ scope, insights }) => ({
    label: isMultiScope ? scope.regionName : undefined,
    insights,
  }));

  return (
    <>
      <Tabs
        defaultActiveId={sp.tab}
        tabs={[
          { id: "resumen", label: t("tabs.summary"), content: resumenContent },
          { id: "cancellations", label: t("tabs.cancellations"), content: cancellationsContent },
          { id: "confirmations", label: t("tabs.confirmations"), content: confirmationsContent },
          { id: "gameRating", label: t("tabs.gameRating"), content: gameRatingContent },
          { id: "facilities", label: t("tabs.facilities"), content: facilitiesContent },
        ]}
      />
      <InsightsPanel title={t("autoInsights.title")} groups={insightGroups} />
    </>
  );
}
