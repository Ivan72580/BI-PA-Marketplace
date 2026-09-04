import Link from "next/link";
import {
  getOverviewData,
  getContributionRanking,
  generateContributionInsights,
  getHourPattern,
  getDayHourHeatmap,
  getExtendedMetrics,
  getDemandLeaders,
  getFacilityTable,
  getMarketFacilitySummary,
  getTopCancellationFacilityForReason,
  type FacilitySortKey,
  type OverviewFilters,
  type OverviewData,
  type ReputationTier,
} from "../lib/db/queries";
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
    <div className="rounded-2xl bg-surface border border-border p-5">
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

const TIER_LABEL: Record<ReputationTier, string> = {
  platinum: "Platinum", bueno: "Bueno", intermedio: "Intermedio", a_revisar: "A revisar", sin_datos: "—",
};
const TIER_CLASS: Record<ReputationTier, string> = {
  platinum: "bg-[#e0e7ff] text-[#4338ca]",
  bueno: "bg-brand-soft text-brand",
  intermedio: "bg-warning-soft text-warning",
  a_revisar: "bg-danger-soft text-danger",
  sin_datos: "bg-surface-sunken text-ink-faint",
};

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
  const scopes: RegionScope[] = sp.regionId
    ? [{ regionId: sp.regionId, regionName: "" }]
    : regions.map((r) => ({ regionId: r.id, regionName: r.name }));
  const isMultiScope = scopes.length > 1;
  const comparePeriodLabel = comparePeriod?.label ?? "el período anterior";

  const scopeData = await Promise.all(
    scopes.map(async (scope) => {
      const scopeFilters: OverviewFilters = { ...filters, regionId: scope.regionId };

      const [current, extended, hourPattern, dayHourHeatmap, demandLeaders, facilityTable, top10] = await Promise.all([
        getOverviewData(scopeFilters),
        getExtendedMetrics(scopeFilters),
        getHourPattern(scopeFilters),
        getDayHourHeatmap(scopeFilters),
        getDemandLeaders(scopeFilters),
        getFacilityTable(scopeFilters, facilitySort, facilitySortDir),
        getMarketFacilitySummary(scopeFilters),
      ]);

      const prior: OverviewData | null =
        compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
          ? await getOverviewData({ ...scopeFilters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo })
          : null;

      const priorTop10 =
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

      const insights = [...generateContributionInsights(contribution, comparePeriodLabel), ...current.insights];
      // Insight dedicado a volumen de confirmados, con variación vs. período anterior.
      if (prior) {
        const delta = pctDelta(current.confirmedGames, prior.confirmedGames);
        if (delta !== undefined && Math.abs(delta) >= 0.05) {
          const dir = delta > 0 ? "subieron" : "bajaron";
          insights.push(`${delta > 0 ? "✓" : "⚠"} Los partidos confirmados ${dir} ${Math.abs(delta * 100).toFixed(1)}% respecto a ${comparePeriodLabel} (${prior.confirmedGames} → ${current.confirmedGames}).`);
        }
      }

      const top10Sorted = [...top10].sort((a, b) => b.confirmedGames - a.confirmedGames).slice(0, 10);
      const priorTop10Order = priorTop10 ? [...priorTop10].sort((a, b) => b.confirmedGames - a.confirmedGames).map((f) => f.facilityId) : null;

      return {
        scope,
        current,
        prior,
        contribution,
        insights,
        extended,
        hourPattern,
        dayHourHeatmap,
        demandLeaders,
        facilityTable,
        top10: withRankChange(top10Sorted, priorTop10Order),
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
      <GroupSection title="Rendimiento">
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, current, prior, insights }) => (
            <div key={scope.regionId} className="space-y-4">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard title="Insights automáticos">
                <div className="space-y-2">
                  {insights.map((insight, i) => (
                    <div key={i} className="text-sm text-ink font-medium">{insight}</div>
                  ))}
                </div>
              </SectionCard>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard label="Partidos agendados" value={current.totalGames.toLocaleString("en-US")} delta={pctDelta(current.totalGames, prior?.totalGames)} staticDelta />
                <KpiCard label="Partidos confirmados" value={current.confirmedGames.toLocaleString("en-US")} delta={pctDelta(current.confirmedGames, prior?.confirmedGames)} staticDelta />
                <KpiCard label="Partidos cancelados" value={current.cancelledGames.toLocaleString("en-US")} delta={pctDelta(current.cancelledGames, prior?.cancelledGames)} deltaInvert staticDelta />
                <KpiCard label="Tasa de confirmación" value={formatPct(current.confirmationRate)} delta={prior ? current.confirmationRate - prior.confirmationRate : undefined} staticDelta />
                <KpiCard label="Tasa de cancelación" value={formatPct(current.cancellationRate)} delta={prior ? current.cancellationRate - prior.cancellationRate : undefined} deltaInvert staticDelta />
                <KpiCard label="Ocupación (confirmados)" value={formatPct(current.avgFillRate)} delta={prior ? current.avgFillRate - prior.avgFillRate : undefined} staticDelta />
              </div>
            </div>
          ))}
        </div>
        {comparePeriod?.label && (
          <div className="text-[11px] text-ink-faint px-1">Variación vs. {comparePeriod.label}</div>
        )}
      </GroupSection>

      {!sp.regionId && (
        <GroupSection title="Concentración por región">
          <RegionConcentrationPies filters={filters} buildHref={(regionId) => `/market?regionId=${regionId}`} />
        </GroupSection>
      )}

      <GroupSection title="Composición">
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, top10 }) => (
            <div key={scope.regionId}>
              <SectionCard
                title={isMultiScope ? `Top 10 facilities — ${scope.regionName}` : "Top 10 facilities"}
                subtitle="Por partidos confirmados — mismo resumen que la página Market"
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted">
                        <th className="py-1.5 px-2 font-normal">Facility</th>
                        <th className="py-1.5 px-2 font-normal">Confirmados</th>
                        <th className="py-1.5 px-2 font-normal">Cancelación</th>
                        <th className="py-1.5 px-2 font-normal">Nivel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10.map((f, i) => (
                        <tr key={f.facilityId} className="border-b border-surface-sunken">
                          <td className="py-1.5 px-2">
                            <span className="flex items-center gap-1.5">
                              <span className="text-ink-faint text-xs w-4">{i + 1}.</span>
                              {f.rankChange === undefined ? null : f.rankChange === null ? (
                                <span className="text-[9px] text-ink-faint">nuevo</span>
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
                      {top10.length === 0 && (
                        <tr><td colSpan={4} className="py-3 text-center text-ink-faint">Sin datos en este filtro.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
        <Link href="/market" className="text-xs text-brand inline-block px-1">Ver el detalle completo en Market →</Link>
      </GroupSection>

      <GroupSection title="Motivos de cancelación">
        {isMultiScope ? (
          <>
            <SectionCard title="Comparativa por región" subtitle="Motivo principal y volumen total de cada región">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-ink-muted">
                      <th className="py-1.5 px-2 font-normal">Región</th>
                      <th className="py-1.5 px-2 font-normal">Cancelados</th>
                      <th className="py-1.5 px-2 font-normal">Tasa</th>
                      <th className="py-1.5 px-2 font-normal">Motivo principal</th>
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
                  <SectionCard title={`Ranking de motivos — ${scope.regionName}`}>
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
                      {current.cancellationBreakdown.length === 0 && <div className="text-sm text-ink-faint">Sin cancelaciones en este filtro.</div>}
                    </div>
                    {topReasonFacility && current.cancellationBreakdown[0] && (
                      <div className="mt-4 pt-3 border-t border-surface-sunken text-sm text-ink">
                        ⚠ <Link href={buildQuery(sp, { facilityId: topReasonFacility.facilityId, regionId: scope.regionId })} className="text-brand hover:underline font-medium">{topReasonFacility.name}</Link> es la que más aporta a &quot;{current.cancellationBreakdown[0].label}&quot; en {scope.regionName} ({topReasonFacility.count} de {current.cancellationBreakdown[0].count}) — vale la pena revisarla.
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
              <SectionCard title="Motivos de cancelación" subtitle={`${current.cancelledGames.toLocaleString("en-US")} partidos cancelados · ${formatPct(current.cancellationRate)} de tasa`}>
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
                  {current.cancellationBreakdown.length === 0 && <div className="text-sm text-ink-faint">Sin cancelaciones en este filtro.</div>}
                </div>
                {top3Facilities.length > 0 && (
                  <div className="pt-3 border-t border-surface-sunken">
                    <div className="text-xs text-ink-faint mb-2">Facilities que más aportaron a las cancelaciones</div>
                    <div className="space-y-1.5">
                      {top3Facilities.map((f, i) => (
                        <div key={f.facilityId} className="flex items-center justify-between text-sm">
                          <span className="text-ink-muted">{i + 1}. <Link href={buildQuery(sp, { facilityId: f.facilityId })} className="text-brand hover:underline">{f.label}</Link></span>
                          <span className="text-ink">{f.value} cancelados</span>
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

      <GroupSection title="Satisfacción, precio y organizador">
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, current, extended }) => (
            <div key={scope.regionId} className="space-y-4">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard title="Satisfacción">
                {extended.avgRating !== null ? (
                  <div className="flex items-end gap-6 flex-wrap">
                    <Stat label="Rating" value={extended.avgRating.toFixed(2)} sublabel="de 5" />
                    <Stat label="Reviews" value={extended.totalRatingCount.toLocaleString("en-US")} />
                    <Stat label="Cobertura" value={formatPct(extended.ratingsCoveragePct)} />
                  </div>
                ) : (
                  <div className="text-sm text-ink-faint">Sin datos de rating.</div>
                )}
              </SectionCard>
              <SectionCard title="Precio y revenue">
                <div className="flex items-end gap-6">
                  <Stat label="Precio promedio" value={extended.avgPrice !== null ? formatUSD(extended.avgPrice) : "—"} sublabel="por jugador" />
                  <Stat label="Revenue total" value={formatUSD(current.totalRevenue)} sublabel="dato secundario" />
                </div>
              </SectionCard>
              <div className="rounded-xl border border-border px-5 py-3.5">
                <div className="text-xs text-ink-faint mb-2">Por organizador</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                  {extended.organizerBreakdown.map((o) => (
                    <span key={o.organizer} className="text-xs text-ink-muted">
                      <span className="text-ink-faint">{o.organizer}:</span> {o.confirmedCount.toLocaleString("en-US")} confirmados, {(o.count - o.confirmedCount).toLocaleString("en-US")} cancelados · {formatPct(o.cancellationRate)} cancelación
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Glossary
          items={[
            { term: "Rating", def: "promedio ponderado por cantidad de reviews de cada partido." },
            { term: "Cobertura", def: "% de los partidos que tiene al menos un rating cargado." },
            { term: "Precio promedio", def: "precio cobrado por jugador, promediado sobre los partidos con ese dato cargado." },
            { term: "Revenue total", def: "dato secundario — la base mezcla distintos esquemas de precio, confiabilidad limitada." },
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
          value: f.value, extra: `${formatPct(f.cumulativePct)} acum.`, rankChange: f.rankChange,
          delta: prior ? pctDelta(f.value, priorConfirmedValue.get(f.facilityId)) ?? null : undefined,
        }));
        const paretoCancelledRows: RankingRow[] = withRankChange(current.paretoCancellations, priorParetoCancelledOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: f.value, extra: `${formatPct(f.cumulativePct)} acum.`, rankChange: f.rankChange,
          delta: prior ? pctDelta(f.value, priorCancelledValue.get(f.facilityId)) ?? null : undefined,
        }));
        const worstRateRows: RankingRow[] = withRankChange(current.worstCancellationRate, priorWorstRateOrder).map((f) => ({
          facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
          value: Math.round(f.rate * 100), extra: `${f.totalGames} partidos`, rankChange: f.rankChange,
        }));

        const confirmContribRows: RankingRow[] = [...contribution]
          .sort((a, b) => b.excessConfirmations - a.excessConfirmations)
          .slice(0, 10)
          .map((f) => ({
            facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
            value: Math.abs(f.excessConfirmations),
            displayValue: `${f.excessConfirmations > 0 ? "+" : ""}${f.excessConfirmations.toFixed(1)} vs. esperado`,
          }));
        const cancelContribRows: RankingRow[] = [...contribution]
          .sort((a, b) => b.excessCancellations - a.excessCancellations)
          .slice(0, 10)
          .map((f) => ({
            facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
            value: Math.abs(f.excessCancellations),
            displayValue: `${f.excessCancellations > 0 ? "+" : ""}${f.excessCancellations.toFixed(1)} vs. esperado`,
          }));

        return (
          <div key={scope.regionId}>
          <GroupSection title={isMultiScope ? `Rankings — ${scope.regionName}` : "Rankings"}>
            {contribution.length > 0 && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <RankingCard
                    title="Contribución al cambio — Confirmación"
                    subtitle={`Confirmaciones de más (barra más larga = mayor desvío) respecto a lo esperado si esa facility mantenía su propia tasa de ${comparePeriodLabel}`}
                    rows={confirmContribRows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                  />
                  <RankingCard
                    title="Contribución al cambio — Cancelación"
                    subtitle={`Cancelaciones de más (barra más larga = mayor desvío) respecto a lo esperado si esa facility mantenía su propia tasa de ${comparePeriodLabel}`}
                    rows={cancelContribRows}
                    buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                    formatValue={(v) => `${v}`}
                    tone="danger"
                  />
                </div>
                <Glossary
                  items={[
                    { term: "Qué muestra", def: "cada facility comparada contra su propio comportamiento en el período anterior — no contra el promedio de otras." },
                    { term: "Largo de la barra", def: "proporcional a la magnitud del desvío — cuánto más larga, más se alejó esa facility de lo que era esperable según su propia historia reciente." },
                  ]}
                />
              </>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <RankingCard
                title="Concentración de negocio confirmado (Pareto)"
                subtitle={`Estos ${paretoConfirmedRows.length} facilities concentran el ${formatPct(current.paretoConfirmedCoveragePct)} de los confirmados`}
                rows={paretoConfirmedRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => `${v} confirmados`}
              />
              <RankingCard
                title="Concentración de cancelaciones (Pareto)"
                subtitle={`Estos ${paretoCancelledRows.length} facilities concentran el ${formatPct(current.paretoCoveragePct)} de las cancelaciones`}
                rows={paretoCancelledRows}
                buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
                formatValue={(v) => `${v} cancelados`}
                tone="danger"
              />
            </div>
            <Glossary items={[{ term: "% acumulado", def: "porcentaje del total de confirmados (o cancelados) que representa esa facility sumada a todas las de arriba en la lista — así se ve cuántas facilities hacen falta para explicar el 80% del negocio." }]} />

            <RankingCard
              title="Peor tasa de cancelación"
              subtitle="Mínimo 7 partidos en el período (1 por día en una semana), para que la tasa sea representativa"
              rows={worstRateRows}
              buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
              formatValue={(v) => `${v}%`}
              tone="danger"
            />
          </GroupSection>

          <div className="mt-5">
            <details className="rounded-2xl bg-surface border border-border p-5">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                Todas las facilities {isMultiScope ? `— ${scope.regionName}` : ""} <span className="text-ink-faint font-normal">({facilityTable.length} — click para desplegar)</span>
              </summary>
              <div className="mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-ink-muted">
                        <th className="py-1.5 px-2 font-normal">Facility</th>
                        <th className="py-1.5 px-2 font-normal">{sortLink("games", "Partidos")}</th>
                        <th className="py-1.5 px-2 font-normal">Confirmados</th>
                        <th className="py-1.5 px-2 font-normal">Cancelados</th>
                        <th className="py-1.5 px-2 font-normal">{sortLink("cancellationRate", "Cancelación")}</th>
                        <th className="py-1.5 px-2 font-normal">{sortLink("rating", "Rating")}</th>
                        <th className="py-1.5 px-2 font-normal">{sortLink("price", "Precio")}</th>
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
                    { term: "Confirmados / Cancelados", def: "recuento real de cada uno, no derivado de la tasa." },
                    { term: "Rating", def: "promedio ponderado por cantidad de reviews, sobre 5." },
                    { term: "Precio", def: "precio promedio cobrado por jugador." },
                    { term: "Columnas con ▲▼", def: "clickeables para ordenar — click de nuevo invierte el orden." },
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
  const MIN_HOUR_SAMPLE = 10;
  const horarioContent = (
    <div className="space-y-5">
      <GroupSection title="Horario">
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, hourPattern, dayHourHeatmap }) => {
            const hourRateRows = [...hourPattern].filter((h) => h.totalGames >= MIN_HOUR_SAMPLE).sort((a, b) => b.confirmationRate - a.confirmationRate);
            const totalConsidered = hourRateRows.reduce((s, h) => s + h.totalGames, 0);

            return (
              <div key={scope.regionId} className="space-y-4">
                {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
                <SectionCard
                  title="Horarios por tasa de confirmación"
                  subtitle={`${totalConsidered.toLocaleString("en-US")} partidos considerados (mínimo 10 por horario) — verde = confirmación, rojo = cancelación, en la misma barra`}
                >
                  {hourRateRows.length > 0 ? (
                    <div className="space-y-2.5">
                      {hourRateRows.map((h) => (
                        <div key={h.key}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-ink">{h.label}</span>
                            <span className="text-ink font-medium">
                              {formatPct(h.confirmationRate)} / {formatPct(h.cancellationRate)}
                              <span className="text-ink-faint font-normal"> · {h.totalGames} partidos</span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden flex bg-surface-sunken">
                            <div className="h-2 bg-brand" style={{ width: `${h.confirmationRate * 100}%` }} />
                            <div className="h-2 bg-danger" style={{ width: `${h.cancellationRate * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-ink-faint">Sin datos suficientes.</div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Partidos por hora, por día de la semana"
                  subtitle="Volumen — sin discriminar por día, el dato pierde confiabilidad. Esto sí es válido a nivel red (no mezcla tasas de facilities distintas, solo cuenta cuándo pasan los partidos)"
                >
                  <Heatmap days={dayHourHeatmap.days} hours={dayHourHeatmap.hours} cells={dayHourHeatmap.cells} maxCount={dayHourHeatmap.maxCount} metric="count" />
                </SectionCard>
              </div>
            );
          })}
        </div>
      </GroupSection>

      <GroupSection title="Operación">
        <div className={`grid grid-cols-1 ${isMultiScope ? "lg:grid-cols-2" : ""} gap-5`}>
          {scopeData.map(({ scope, extended, demandLeaders }) => (
            <div key={scope.regionId} className="space-y-4">
              {isMultiScope && <div className="text-xs font-medium text-ink-muted px-1">{scope.regionName}</div>}
              <SectionCard title="Tiempo de confirmación">
                <Stat label="Lead time típico" value={extended.medianLeadTime !== null ? extended.medianLeadTime.toFixed(1) : "—"} />
                {extended.medianLeadTime !== null && extended.medianLeadTime > 5 && (
                  <div className="mt-2 text-xs text-ink-faint">⚠ El tiempo típico entre confirmación y partido es alto — podría valer la pena revisar el proceso de confirmación.</div>
                )}
              </SectionCard>
              <SectionCard title="Dinámica de demanda">
                <div className="flex items-end gap-6 flex-wrap mb-4">
                  <Stat label="En lista de espera" value={extended.totalWaitlist.toLocaleString("en-US")} />
                  <Stat label="Abandonaron" value={extended.totalDropped.toLocaleString("en-US")} />
                  <Stat label="Déficit promedio" value={extended.avgPlayersMissing.toFixed(1)} sublabel={`en ${extended.missingGamesCount.toLocaleString("en-US")} con faltantes`} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-surface-sunken">
                  <div>
                    <div className="text-xs text-ink-faint mb-1.5">Top 3 — más lista de espera</div>
                    <div className="space-y-1">
                      {demandLeaders.waitlist.map((f, i) => (
                        <div key={f.facilityId} className="flex justify-between text-xs">
                          <span className="text-ink-muted">{i + 1}. <Link href={buildQuery(sp, { facilityId: f.facilityId })} className="text-brand hover:underline">{f.name}</Link></span>
                          <span className="text-ink">{f.value}</span>
                        </div>
                      ))}
                      {demandLeaders.waitlist.length === 0 && <div className="text-xs text-ink-faint">Sin datos.</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint mb-1.5">Top 3 — más abandono</div>
                    <div className="space-y-1">
                      {demandLeaders.dropped.map((f, i) => (
                        <div key={f.facilityId} className="flex justify-between text-xs">
                          <span className="text-ink-muted">{i + 1}. <Link href={buildQuery(sp, { facilityId: f.facilityId })} className="text-brand hover:underline">{f.name}</Link></span>
                          <span className="text-ink">{f.value}</span>
                        </div>
                      ))}
                      {demandLeaders.dropped.length === 0 && <div className="text-xs text-ink-faint">Sin datos.</div>}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
        <Glossary
          items={[
            { term: "Lead time típico", def: "mediana (no promedio) del tiempo entre la confirmación y el partido — el dato tiene valores atípicos extremos." },
            { term: "En lista de espera / Abandonaron", def: "jugadores que quedaron esperando cupo, o que se anotaron y se bajaron antes del partido." },
            { term: "Déficit promedio", def: "jugadores que faltaban en promedio, solo en partidos con faltantes." },
          ]}
        />
      </GroupSection>
    </div>
  );

  return (
    <Tabs
      tabs={[
        { id: "resumen", label: "Resumen", content: resumenContent },
        { id: "facility", label: "Por facility", content: facilityContent },
        { id: "horario", label: "Por horario", content: horarioContent },
      ]}
    />
  );
}
