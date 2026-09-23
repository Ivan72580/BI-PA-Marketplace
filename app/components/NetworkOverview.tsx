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
  TIER_CLASS,
  type FacilitySortKey,
  type OverviewFilters,
  type OverviewData,
  type ReputationTier,
} from "../lib/db/queries";
import type { Locale } from "@/i18n/config";
import type { ResolvedPeriod } from "../lib/period";
import { buildQuery, type SP } from "../lib/searchParams";
import Heatmap from "./Heatmap";
import KpiCard from "./KpiCard";
import ChangeBadge from "./ChangeBadge";
import RankingCard, { type RankingRow } from "./RankingCard";
import Tabs from "./Tabs";
import GroupSection from "./GroupSection";
import Glossary from "./Glossary";
import RegionConcentrationPies from "./RegionConcentrationPies";

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

export default async function NetworkOverview({
  sp,
  filters,
  period,
  comparePeriod,
  compare,
  facilitySort,
  facilitySortDir,
  regions,
}: {
  sp: SP;
  filters: OverviewFilters;
  period: ResolvedPeriod;
  comparePeriod: ResolvedPeriod | null;
  compare: boolean;
  facilitySort: FacilitySortKey;
  facilitySortDir: SortDir;
  regions: { id: string; name: string }[];
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

      const insights = [...generateContributionInsights(contribution, comparePeriodLabel, t), ...current.insights];
      // Insight dedicado a volumen de confirmados, con variación vs. período anterior.
      if (prior) {
        const delta = pctDelta(current.confirmedGames, prior.confirmedGames);
        if (delta !== undefined && Math.abs(delta) >= 0.05) {
          const key = delta > 0 ? "insights.confirmedUp" : "insights.confirmedDown";
          insights.push(
            t(key, { pct: Math.abs(delta * 100).toFixed(1), period: comparePeriodLabel, prior: prior.confirmedGames, current: current.confirmedGames })
          );
        }
      }

      // Se muestran sólo las Top 5 en el resumen (el ranking completo, con
      // más filas y filtros de mes, vive en Market — ver link "Ver ranking
      // completo" más abajo). El resto de la lista completa (facilitySummary)
      // se sigue usando para el teaser de precio/engagement de este market.
      const top5Sorted = [...facilitySummary].sort((a, b) => b.confirmedGames - a.confirmedGames).slice(0, 5);
      const priorTop5Order = priorFacilitySummary ? [...priorFacilitySummary].sort((a, b) => b.confirmedGames - a.confirmedGames).map((f) => f.facilityId) : null;

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

      return {
        scope,
        current,
        prior,
        contribution,
        insights,
        extended,
        dayHourHeatmap,
        demandLeaders,
        facilityTable,
        top5: withRankChange(top5Sorted, priorTop5Order),
        marketTeaser,
        topReasonFacility,
      };
    })
  );

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
  const resumenContent = (
    <div className="space-y-5">
      <GroupSection title={t("sections.performance")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, current, prior, insights }) => (
            <div key={scope.regionId} className="space-y-4">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard title={t("autoInsights.title")}>
                <div className="space-y-2">
                  {insights.map((insight, i) => (
                    <div key={i} className="text-sm text-ink font-medium">{insight}</div>
                  ))}
                </div>
              </SectionCard>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard label={t("kpi.scheduled")} value={current.totalGames.toLocaleString("en-US")} delta={pctDelta(current.totalGames, prior?.totalGames)} staticDelta />
                <KpiCard label={t("kpi.confirmed")} value={current.confirmedGames.toLocaleString("en-US")} delta={pctDelta(current.confirmedGames, prior?.confirmedGames)} staticDelta />
                <KpiCard label={t("kpi.cancelled")} value={current.cancelledGames.toLocaleString("en-US")} delta={pctDelta(current.cancelledGames, prior?.cancelledGames)} deltaInvert staticDelta />
                <KpiCard label={t("kpi.confirmationRate")} value={formatPct(current.confirmationRate)} delta={prior ? current.confirmationRate - prior.confirmationRate : undefined} staticDelta />
                <KpiCard label={t("kpi.cancellationRate")} value={formatPct(current.cancellationRate)} delta={prior ? current.cancellationRate - prior.cancellationRate : undefined} deltaInvert staticDelta />
                <KpiCard label={t("kpi.occupancy")} value={formatPct(current.avgFillRate)} delta={prior ? current.avgFillRate - prior.avgFillRate : undefined} staticDelta />
              </div>
            </div>
          ))}
        </div>
        {comparePeriod?.label && (
          <div className="text-[11px] text-ink-faint px-1">{t("varianceVs", { period: comparePeriod.label })}</div>
        )}
      </GroupSection>

      {!sp.regionId && (
        <GroupSection title={t("sections.regionConcentration")}>
          <RegionConcentrationPies filters={filters} buildHref={(regionId) => `/market?regionId=${regionId}`} />
        </GroupSection>
      )}

      <GroupSection title={t("sections.composition")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, top5, marketTeaser }) => (
            <div key={scope.regionId} className="space-y-3">
              <SectionCard
                title={isMultiScope ? t("composition.top5TitleRegion", { region: scope.regionName }) : t("composition.top5Title")}
                subtitle={t("composition.subtitle")}
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted">
                        <th className="py-1.5 px-2 font-normal">{t("composition.headers.facility")}</th>
                        <th className="py-1.5 px-2 font-normal">{t("composition.headers.confirmed")}</th>
                        <th className="py-1.5 px-2 font-normal">{t("composition.headers.cancellation")}</th>
                        <th className="py-1.5 px-2 font-normal">{t("composition.headers.level")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top5.map((f, i) => (
                        <tr key={f.facilityId} className="border-b border-surface-sunken">
                          <td className="py-1.5 px-2">
                            <span className="flex items-center gap-1.5">
                              <span className="text-ink-faint text-xs w-4">{i + 1}.</span>
                              {f.rankChange === undefined ? null : f.rankChange === null ? (
                                <span className="text-[9px] text-ink-faint">{t("composition.newBadge")}</span>
                              ) : f.rankChange === 0 ? (
                                <span className="text-ink-faint text-xs">—</span>
                              ) : f.rankChange > 0 ? (
                                <span className="text-brand text-[10px]">▲{f.rankChange}</span>
                              ) : (
                                <span className="text-danger text-[10px]">▼{Math.abs(f.rankChange)}</span>
                              )}
                              <Link href={buildQuery(sp, { facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId })} className="text-brand hover:underline">
                                {f.name}
                              </Link>
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-ink">{f.confirmedGames}</td>
                          <td className="py-1.5 px-2 text-ink">{formatPct(f.cancellationRate)}</td>
                          <td className="py-1.5 px-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${TIER_CLASS[f.reputationTier]}`}>{TIER_LABEL[f.reputationTier]}</span>
                          </td>
                        </tr>
                      ))}
                      {top5.length === 0 && (
                        <tr><td colSpan={4} className="py-3 text-center text-ink-faint">{t("composition.empty")}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Link href={`/market?regionId=${scope.regionId}${sp.marketId ? `&marketId=${sp.marketId}` : ""}&tab=reputacion`} className="text-xs text-brand inline-block mt-3">
                  {t("composition.viewFullRanking")}
                </Link>
              </SectionCard>

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
          ))}
        </div>
      </GroupSection>

      <GroupSection title={t("sections.cancellationReasons")}>
        {isMultiScope ? (
          <>
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
                    {scopeData.map(({ scope, current }) => (
                      <tr key={scope.regionId} className="border-b border-surface-sunken">
                        <td className="py-1.5 px-2 text-ink font-medium">{scope.regionName}</td>
                        <td className="py-1.5 px-2 text-ink">{current.cancelledGames.toLocaleString("en-US")}</td>
                        <td className="py-1.5 px-2 text-ink">{formatPct(current.cancellationRate)}</td>
                        <td className="py-1.5 px-2 text-ink-muted">
                          {current.cancellationBreakdown[0] ? `${current.cancellationBreakdown[0].label} (${formatPct(current.cancellationBreakdown[0].pct)})` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {scopeData.map(({ scope, current, prior, topReasonFacility }) => (
                <div key={scope.regionId}>
                  <SectionCard title={t("cancellation.rankingTitleRegion", { region: scope.regionName })}>
                    <div className="space-y-2">
                      {current.cancellationBreakdown.map((reason) => {
                        const priorReason = prior?.cancellationBreakdown.find((r) => r.category === reason.category);
                        const delta = priorReason ? pctDelta(reason.count, priorReason.count) ?? null : null;
                        return (
                          <div key={reason.category} className="flex items-center justify-between text-sm">
                            <span className="text-ink">{reason.label}</span>
                            <span className="flex items-center gap-2 text-ink-muted">
                              {reason.count} · {formatPct(reason.pct)}
                              {compare && <ChangeBadge value={delta} invert />}
                            </span>
                          </div>
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
                </div>
              ))}
            </div>
          </>
        ) : (
          scopeData.map(({ scope, current, prior }) => {
            const top3Facilities = current.paretoCancellations.slice(0, 3);
            return (
              <div key={scope.regionId}>
              <SectionCard title={t("cancellation.title")} subtitle={t("cancellation.subtitleSingle", { cancelled: current.cancelledGames.toLocaleString("en-US"), rate: formatPct(current.cancellationRate) })}>
                <div className="space-y-2 mb-4">
                  {current.cancellationBreakdown.map((reason) => {
                    const priorReason = prior?.cancellationBreakdown.find((r) => r.category === reason.category);
                    const delta = priorReason ? pctDelta(reason.count, priorReason.count) ?? null : null;
                    return (
                      <div key={reason.category} className="flex items-center justify-between text-sm">
                        <span className="text-ink">{reason.label}</span>
                        <span className="flex items-center gap-2 text-ink-muted">
                          {reason.count} · {formatPct(reason.pct)}
                          {compare && <ChangeBadge value={delta} invert />}
                        </span>
                      </div>
                    );
                  })}
                  {current.cancellationBreakdown.length === 0 && <div className="text-sm text-ink-faint">{t("cancellation.empty")}</div>}
                </div>
                {top3Facilities.length > 0 && (
                  <div className="pt-3 border-t border-surface-sunken">
                    <div className="text-xs text-ink-faint mb-2">{t("cancellation.topContributorsTitle")}</div>
                    <div className="space-y-1.5">
                      {top3Facilities.map((f, i) => (
                        <div key={f.facilityId} className="flex items-center justify-between text-sm">
                          <span className="text-ink-muted">{i + 1}. <Link href={buildQuery(sp, { facilityId: f.facilityId })} className="text-brand hover:underline">{f.label}</Link></span>
                          <span className="text-ink">{t("cancellation.gamesCancelledCount", { n: f.value })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
              </div>
            );
          })
        )}
      </GroupSection>

      <GroupSection title={t("sections.satisfactionPriceOrganizer")}>
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, current, extended }) => (
            <div key={scope.regionId} className="space-y-4">
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
            { term: t("satisfactionGlossary.rating.term"), def: t("satisfactionGlossary.rating.def") },
            { term: t("satisfactionGlossary.coverage.term"), def: t("satisfactionGlossary.coverage.def") },
            { term: t("satisfactionGlossary.avgPrice.term"), def: t("satisfactionGlossary.avgPrice.def") },
            { term: t("satisfactionGlossary.totalRevenue.term"), def: t("satisfactionGlossary.totalRevenue.def") },
          ]}
        />
      </GroupSection>
    </div>
  );

  // ---------- Tab: Por facility ----------
  const facilityContent = (
    <div className="space-y-6">
      {scopeData.map(({ scope, current, prior, contribution, facilityTable }) => {
        const priorParetoConfirmedOrder = prior?.paretoConfirmations.map((f) => f.facilityId) ?? null;
        const priorParetoCancelledOrder = prior?.paretoCancellations.map((f) => f.facilityId) ?? null;
        const priorWorstRateOrder = prior?.worstCancellationRate.map((f) => f.facilityId) ?? null;

        const priorConfirmedValue = new Map((prior?.paretoConfirmations ?? []).map((f): [string, number] => [f.facilityId, f.value]));
        const priorCancelledValue = new Map((prior?.paretoCancellations ?? []).map((f): [string, number] => [f.facilityId, f.value]));

        const paretoConfirmedRows: RankingRow[] = withRankChange(current.paretoConfirmations, priorParetoConfirmedOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: f.value, extra: t("rankings.cumulativeSuffix", { pct: formatPct(f.cumulativePct) }), rankChange: f.rankChange,
          delta: prior ? pctDelta(f.value, priorConfirmedValue.get(f.facilityId)) ?? null : undefined,
        }));
        const paretoCancelledRows: RankingRow[] = withRankChange(current.paretoCancellations, priorParetoCancelledOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: f.value, extra: t("rankings.cumulativeSuffix", { pct: formatPct(f.cumulativePct) }), rankChange: f.rankChange,
          delta: prior ? pctDelta(f.value, priorCancelledValue.get(f.facilityId)) ?? null : undefined,
        }));
        const worstRateRows: RankingRow[] = withRankChange(current.worstCancellationRate, priorWorstRateOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: Math.round(f.rate * 100), extra: t("rankings.gamesSuffix", { n: f.totalGames }), rankChange: f.rankChange,
        }));

        const confirmContribRows: RankingRow[] = [...contribution]
          .sort((a, b) => b.excessConfirmations - a.excessConfirmations)
          .slice(0, 10)
          .map((f) => ({
            facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
            value: Math.abs(f.excessConfirmations),
            displayValue: `${f.excessConfirmations > 0 ? "+" : ""}${f.excessConfirmations.toFixed(1)} ${t("rankings.vsExpected")}`,
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <RankingCard
                    title={t("rankings.contribConfirmTitle")}
                    subtitle={t("rankings.contribConfirmSubtitle", { period: comparePeriodLabel })}
                    rows={confirmContribRows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                  />
                  <RankingCard
                    title={t("rankings.contribCancelTitle")}
                    subtitle={t("rankings.contribCancelSubtitle", { period: comparePeriodLabel })}
                    rows={cancelContribRows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                    tone="danger"
                  />
                </div>
                <Glossary
                  items={[
                    { term: t("rankings.contribGlossary.whatShows.term"), def: t("rankings.contribGlossary.whatShows.def") },
                    { term: t("rankings.contribGlossary.barLength.term"), def: t("rankings.contribGlossary.barLength.def") },
                  ]}
                />
              </>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <RankingCard
                title={t("rankings.paretoConfirmedTitle")}
                subtitle={t("rankings.paretoConfirmedSubtitle", { n: paretoConfirmedRows.length, pct: formatPct(current.paretoConfirmedCoveragePct) })}
                rows={paretoConfirmedRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => t("rankings.confirmedSuffix", { n: v })}
              />
              <RankingCard
                title={t("rankings.paretoCancelledTitle")}
                subtitle={t("rankings.paretoCancelledSubtitle", { n: paretoCancelledRows.length, pct: formatPct(current.paretoCoveragePct) })}
                rows={paretoCancelledRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => t("rankings.cancelledSuffix", { n: v })}
                tone="danger"
              />
            </div>
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
            <details className="rounded-2xl bg-surface shadow-sm p-5">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                {isMultiScope ? t("rankings.allFacilitiesRegion", { region: scope.regionName }) : t("rankings.allFacilities")} <span className="text-ink-faint font-normal">{t("rankings.clickToExpand", { n: facilityTable.length })}</span>
              </summary>
              <div className="mt-4">
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
              </div>
            </details>
          </div>
          </div>
        );
      })}
    </div>
  );

  // ---------- Tab: Por horario ----------
  // La lista de barras "horarios por tasa de confirmación" que vivía acá se
  // sacó: es el mismo dato que ya se ve en el heatmap de abajo (mismo
  // getDayHourHeatmap), sólo que menos legible como lista larga de horas. El
  // heatmap queda como única vista rápida de día×hora, con links hacia las
  // dos páginas que sí profundizan el patrón horario a nivel de slot
  // individual (Daily y Trends) en vez de duplicar ese análisis acá.
  const horarioContent = (
    <div className="space-y-5">
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

  return (
    <Tabs
      tabs={[
        { id: "resumen", label: t("tabs.summary"), content: resumenContent },
        { id: "facility", label: t("tabs.byFacility"), content: facilityContent },
        { id: "horario", label: t("tabs.bySchedule"), content: horarioContent },
      ]}
    />
  );
}
