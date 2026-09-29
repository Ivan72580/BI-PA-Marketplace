import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getMarketFacilitySummary,
  getParetoGroups,
  getMarketRanking,
  TIER_CLASS,
  type OverviewFilters,
  type ReputationTier,
  type MarketFacilityRow,
  type ParetoFacility,
  type MarketRankingRow,
} from "../lib/db/queries";
import { MIN_GAMES_FOR_RANKING } from "../lib/db/shared";
import { gamesPerPeriodAverage, formatPerPeriod } from "../lib/period";
import type { Locale } from "@/i18n/config";
import PieChart from "./charts/PieChart";
import Glossary from "./Glossary";
import ChangeBadge from "./ChangeBadge";
import Tabs from "./Tabs";
import TabFilters from "./TabFilters";
import RegionConcentrationPies from "./RegionConcentrationPies";
import PriceTable from "./PriceTable";
import EngagementTable from "./EngagementTable";
import ReputationTable, { type ReputationRow } from "./ReputationTable";
import InsightsPanel, { type PanelInsight, type PanelInsightGroup } from "./InsightsPanel";

// ---------- Insights (panel flotante, ver InsightsPanel.tsx) ----------
// Todo lo de abajo reusa exclusivamente datos ya calculados más arriba
// (summary/pareto/marketRanking/facilityShareCompare) — sin queries nuevas,
// mismo criterio que Trends. Umbrales elegidos para no generar ruido con
// variaciones chicas: 15% de volumen, 1 punto de share, 30% de "casi llegan".

type MarketTranslator = (key: string, values?: Record<string, string | number>) => string;

const MIN_VOLUME_CHANGE_PCT = 0.15;
const MIN_SHARE_CHANGE_PTS = 0.01;
const MIN_NEAR_MISS_RATIO = 0.3;

function buildParetoInsights(top80: ParetoFacility[], t: MarketTranslator): PanelInsight[] {
  const withChange = top80.filter((f) => f.changePct !== null);
  if (withChange.length === 0) return [];
  const worst = withChange.reduce((a, b) => (a.changePct! < b.changePct! ? a : b));
  const best = withChange.reduce((a, b) => (a.changePct! > b.changePct! ? a : b));
  const lines: PanelInsight[] = [];
  if (worst.changePct! <= -MIN_VOLUME_CHANGE_PCT) {
    lines.push({ text: t("insights.top80Drop", { name: worst.name, pts: Math.abs(worst.changePct! * 100).toFixed(0) }), severity: "critical" });
  }
  if (best.changePct! >= MIN_VOLUME_CHANGE_PCT && best.facilityId !== worst.facilityId) {
    lines.push({ text: t("insights.top80Rise", { name: best.name, pts: (best.changePct! * 100).toFixed(0) }), severity: "notable" });
  }
  if (lines.length === 0) lines.push({ text: t("insights.top80Stable"), severity: "info" });
  return lines;
}

function buildMarketRankingInsights(rows: MarketRankingRow[], t: MarketTranslator): PanelInsight[] {
  const withChange = rows.filter((m) => m.changePct !== null);
  if (withChange.length === 0) return [];
  const worst = withChange.reduce((a, b) => (a.changePct! < b.changePct! ? a : b));
  const best = withChange.reduce((a, b) => (a.changePct! > b.changePct! ? a : b));
  const lines: PanelInsight[] = [];
  if (worst.changePct! <= -MIN_VOLUME_CHANGE_PCT) {
    lines.push({ text: t("insights.marketDrop", { market: worst.marketName, pts: Math.abs(worst.changePct! * 100).toFixed(0) }), severity: "critical" });
  }
  if (best.changePct! >= MIN_VOLUME_CHANGE_PCT && best.marketId !== worst.marketId) {
    lines.push({ text: t("insights.marketRise", { market: best.marketName, pts: (best.changePct! * 100).toFixed(0) }), severity: "notable" });
  }
  if (lines.length === 0) lines.push({ text: t("insights.marketStable"), severity: "info" });
  return lines;
}

function buildShareChangeInsights(
  rows: { facilityId: string; name: string; marketSharePct: number }[],
  priorShare: Map<string, number>,
  t: MarketTranslator
): PanelInsight[] {
  const withChange = rows
    .map((f) => {
      const prior = priorShare.get(f.facilityId);
      return prior === undefined ? null : { ...f, changePts: f.marketSharePct - prior };
    })
    .filter((f): f is { facilityId: string; name: string; marketSharePct: number; changePts: number } => f !== null);
  if (withChange.length === 0) return [];
  const worst = withChange.reduce((a, b) => (a.changePts < b.changePts ? a : b));
  const best = withChange.reduce((a, b) => (a.changePts > b.changePts ? a : b));
  const lines: PanelInsight[] = [];
  if (best.changePts >= MIN_SHARE_CHANGE_PTS) {
    lines.push({ text: t("insights.shareGain", { name: best.name, pts: (best.changePts * 100).toFixed(1), current: (best.marketSharePct * 100).toFixed(1) }), severity: "notable" });
  }
  if (worst.changePts <= -MIN_SHARE_CHANGE_PTS && worst.facilityId !== best.facilityId) {
    lines.push({ text: t("insights.shareLoss", { name: worst.name, pts: Math.abs(worst.changePts * 100).toFixed(1), current: (worst.marketSharePct * 100).toFixed(1) }), severity: "critical" });
  }
  if (lines.length === 0) lines.push({ text: t("insights.shareStable"), severity: "info" });
  return lines;
}

function buildReputationInsights(rows: MarketFacilityRow[], t: MarketTranslator): PanelInsight[] {
  const eligible = rows.filter((r) => r.reputationTier !== "sin_datos");
  const reviewCount = eligible.filter((r) => r.reputationTier === "a_revisar").length;
  const platinumCount = eligible.filter((r) => r.reputationTier === "platinum").length;
  const lines: PanelInsight[] = [];
  if (reviewCount > 0) lines.push({ text: t("insights.reviewCount", { count: reviewCount }), severity: "critical" });
  if (platinumCount > 0) lines.push({ text: t("insights.platinumCount", { count: platinumCount }), severity: "notable" });
  return lines;
}

function buildEngagementInsights(
  rows: MarketFacilityRow[],
  totalNearMiss: number,
  totalCancelled: number,
  facilityHref: (r: MarketFacilityRow) => string,
  t: MarketTranslator
): PanelInsight[] {
  const lines: PanelInsight[] = [];
  if (totalCancelled > 0 && totalNearMiss / totalCancelled >= MIN_NEAR_MISS_RATIO) {
    lines.push({ text: t("insights.nearMissOpportunity", { pct: ((totalNearMiss / totalCancelled) * 100).toFixed(0) }), severity: "critical" });
  }
  const top = [...rows].sort((a, b) => b.nearMissCancelledCount - a.nearMissCancelledCount)[0];
  if (top && top.nearMissCancelledCount > 0) {
    lines.push({ text: t("insights.topNearMissFacility", { name: top.name, count: top.nearMissCancelledCount }), href: facilityHref(top), severity: "notable" });
  }
  return lines;
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatUSD2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </div>
  );
}

// Destino canónico de "detalle por facility" en toda la app: la vista de
// Overview con el filtro puesto en esa facility (FacilityDetailView), que
// a su vez linkea a "/daily?..." para el detalle día por día. Todo link a
// una facility puntual en esta página (Pareto, Market share, Reputación)
// debería terminar acá — antes algunos se quedaban en /market (filtro
// degenerado, sin vista real de detalle) o iban a /trends (destino
// distinto al resto de la app).
function facilityDetailHref(facilityId: string, marketId: string, regionId: string): string {
  return `/?${new URLSearchParams({ facilityId, marketId, regionId }).toString()}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthRange(month: string): { dateFrom: Date; dateTo: Date } {
  const [y, m] = month.split("-").map(Number);
  return { dateFrom: new Date(Date.UTC(y, m - 1, 1)), dateTo: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
}

const PIE_COLORS = ["#0b3b2e","#104834","#15543b","#1a6141","#1e6d47","#237a4e","#288654","#2d935a","#329f60","#37ac67","#3bb86d","#40c573","#45d17a","#4ade80","#a7e7cf","#7c8ba1"];

export default async function MarketDashboard({
  sp,
  filterOptions,
  month,
  buildQuery,
  activeTab,
}: {
  sp: { regionId?: string; marketId?: string; facilityId?: string };
  filterOptions: { regions: { id: string; name: string }[]; markets: { id: string; name: string; regionId: string }[] };
  month: string;
  buildQuery: (overrides: Record<string, string | undefined>) => string;
  // Permite entrar directo a un tab (ej. desde un link "ver detalle" en
  // Overview hacia Market?...&tab=precio) en vez de siempre aterrizar en
  // "Concentración". Ver Tabs.tsx (defaultActiveId).
  activeTab?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("Market"), getLocale()]);
  const TIER_LABEL: Record<ReputationTier, string> = {
    platinum: t("tier.platinum"), bueno: t("tier.bueno"), intermedio: t("tier.intermedio"), a_revisar: t("tier.aRevisar"), sin_datos: t("tier.sinDatos"),
  };
  const baseFilters: Omit<OverviewFilters, "dateFrom" | "dateTo"> = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };
  const { dateFrom, dateTo } = monthRange(month);
  const monthFilters: OverviewFilters = { ...baseFilters, dateFrom, dateTo };
  // Contexto ambiente ("≈X/semana") a partir del total del mes seleccionado
  // — no es un desglose nuevo, solo ayuda a leer un total mensual sin tener
  // que ir a Trends. Mismo helper que ya usa Overview.
  const perPeriod = (n: number) => {
    const avg = gamesPerPeriodAverage(n, dateFrom, dateTo);
    return avg ? formatPerPeriod(avg, locale as Locale) : undefined;
  };

  const [summary, pareto, marketRanking] = await Promise.all([
    getMarketFacilitySummary(monthFilters),
    getParetoGroups(monthFilters),
    getMarketRanking(baseFilters, month),
  ]);

  // Precio: mercado activo vs. red completa para "vs anterior" facility-level de market share
  let facilityShareCompare: Map<string, number> | null = null;
  if (sp.marketId) {
    const priorMonth = shiftMonth(month, -1);
    const priorRange = monthRange(priorMonth);
    const priorSummary = await getMarketFacilitySummary({ ...baseFilters, dateFrom: priorRange.dateFrom, dateTo: priorRange.dateTo });
    facilityShareCompare = new Map(priorSummary.map((f) => [f.facilityId, f.marketSharePct]));
  }

  const paretoChart = {
    labels: [...pareto.top80.facilities.map((f) => f.name), t("othersChartLabel")],
    datasets: [{ data: [...pareto.top80.facilities.map((f) => f.count), pareto.others.count], backgroundColor: PIE_COLORS }],
  };

  const reputationRows = [...summary].sort((a, b) => (b.reputationScore ?? -1) - (a.reputationScore ?? -1));
  const priceRows = summary.filter((f) => f.avgPrice !== null);
  const engagementRows = [...summary].sort((a, b) => b.nearMissCancelledCount - a.nearMissCancelledCount);
  const totalNearMiss = summary.reduce((s, f) => s + f.nearMissCancelledCount, 0);
  const totalCancelled = summary.reduce((s, f) => s + f.cancelledGames, 0);

  // ---------- Concentración ----------
  const concentracionContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      {!sp.regionId ? (
        <SectionCard title={t("concentration.byRegionTitle")} subtitle={t("concentration.byRegionSubtitle", { month })}>
          <RegionConcentrationPies filters={monthFilters} buildHref={(regionId) => buildQuery({ regionId })} />
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title={t("concentration.paretoTitle")}
            subtitle={t("concentration.paretoSubtitle", { month })}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <PieChart data={paretoChart} showLegend={false} />
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {pareto.top80.facilities.map((f) => (
                  <Link
                    key={f.facilityId}
                    href={facilityDetailHref(f.facilityId, f.marketId, f.regionId)}
                    className="flex items-center justify-between text-sm group"
                  >
                    <span className="text-brand group-hover:underline truncate mr-2">{f.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-ink-muted">{f.count.toLocaleString("en-US")}</span>
                      {f.changePct !== null && (
                        <ChangeBadge
                          value={f.changePct}
                          secondary={f.priorYearCount !== null ? `${f.count - f.priorYearCount >= 0 ? "+" : ""}${f.count - f.priorYearCount}` : undefined}
                        />
                      )}
                    </span>
                  </Link>
                ))}
                <div className="flex items-center justify-between text-sm pt-1 border-t border-surface-sunken">
                  <span className="text-ink-faint">{t("concentration.othersLabel", { n: pareto.others.facilityIds.length })}</span>
                  <span className="text-ink-muted">{pareto.others.count.toLocaleString("en-US")}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href={buildQuery({ view: "ranking", group: "top80", month })} className="block rounded-xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4">
              <div className="text-sm font-medium text-brand">{t("concentration.viewTop80")}</div>
              <div className="text-xs text-ink-faint mt-1">{t("concentration.facilitiesShare", { n: pareto.top80.facilityIds.length, pct: formatPct(pareto.top80.pct) })}</div>
            </Link>
            <Link href={buildQuery({ view: "ranking", group: "others", month })} className="block rounded-xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4">
              <div className="text-sm font-medium text-ink-muted">{t("concentration.viewOthers")}</div>
              <div className="text-xs text-ink-faint mt-1">{t("concentration.facilitiesShare", { n: pareto.others.facilityIds.length, pct: formatPct(pareto.others.pct) })}</div>
            </Link>
          </div>
          <Glossary items={[{ term: t("glossary.vsAnteriorYear.term"), def: t("glossary.vsAnteriorYear.def") }]} />
        </>
      )}
    </div>
  );

  // ---------- Market share ----------
  const marketShareTarget = sp.marketId ? summary.filter((f) => f.marketId === sp.marketId).sort((a, b) => b.marketSharePct - a.marketSharePct) : [];

  const marketShareContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />

      {!sp.marketId && (
        <SectionCard title={t("share.byMarketTitle")} subtitle={t("share.byMarketSubtitle", { month })}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {marketRanking.map((m) => (
              <Link key={m.marketId} href={buildQuery({ marketId: m.marketId })} className="block rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4">
                <div className="text-sm font-medium text-brand">{m.marketName}</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="font-display text-xl font-semibold text-ink">{m.confirmedGames.toLocaleString("en-US")}</div>
                  <ChangeBadge
                    value={m.changePct}
                    secondary={
                      m.priorMonthConfirmedGames !== null
                        ? `${m.confirmedGames - m.priorMonthConfirmedGames >= 0 ? "+" : ""}${m.confirmedGames - m.priorMonthConfirmedGames}`
                        : undefined
                    }
                  />
                </div>
                <div className="text-xs text-ink-faint mt-0.5">
                  {t("share.confirmedGamesLabel")}
                  {perPeriod(m.confirmedGames) ? ` · ${perPeriod(m.confirmedGames)}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {sp.marketId && (
        <SectionCard title={t("share.byFacilityTitle")} subtitle={t("share.byFacilitySubtitle", { month })}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {marketShareTarget.map((f) => {
              const priorShare = facilityShareCompare?.get(f.facilityId) ?? null;
              // Puntos de share ganados/perdidos, no un "%-del-%" (una
              // facility que pasó de 2% a 3% de share ganó 1 punto, no
              // "50% más de share" — esa segunda lectura es la que estaba
              // antes y confundía variación relativa con puntos).
              const shareChangePts = priorShare !== null ? f.marketSharePct - priorShare : null;
              return (
                <Link key={f.facilityId} href={facilityDetailHref(f.facilityId, f.marketId, f.regionId)} className="block rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4">
                  <div className="text-sm font-medium text-brand">{f.name}</div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div className="font-display text-xl font-semibold text-ink">{formatPct(f.marketSharePct)}</div>
                    <ChangeBadge value={shareChangePts} unit="pts" />
                  </div>
                  <div className="text-xs text-ink-faint mt-0.5">
                    {t("share.confirmedCount", { n: f.confirmedGames.toLocaleString("en-US") })}
                    {perPeriod(f.confirmedGames) ? ` · ${perPeriod(f.confirmedGames)}` : ""}
                  </div>
                </Link>
              );
            })}
            {marketShareTarget.length === 0 && <div className="text-sm text-ink-faint">{t("share.empty")}</div>}
          </div>
        </SectionCard>
      )}
      <Glossary items={[{ term: t("glossary.vsAnteriorMonth.term"), def: t("glossary.vsAnteriorMonth.def") }]} />
    </div>
  );

  // ---------- Reputación ----------
  const reputationTableRows: ReputationRow[] = reputationRows.map((f) => ({
    facilityId: f.facilityId,
    name: f.name,
    marketId: f.marketId,
    regionId: f.regionId,
    tierLabel: TIER_LABEL[f.reputationTier],
    tierClass: TIER_CLASS[f.reputationTier],
    confirmedGames: f.confirmedGames,
    regionRank: f.regionRank,
    regionTotal: f.regionTotal,
    marketRank: f.marketRank,
    marketTotal: f.marketTotal,
  }));
  const reputacionContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      <SectionCard title={t("reputation.title")} subtitle={t("reputation.subtitle", { month })}>
        <ReputationTable rows={reputationTableRows} />
        <Glossary
          items={[
            { term: t("reputation.glossary.platinum.term"), def: t("reputation.glossary.platinum.def") },
            { term: t("reputation.glossary.tierRange.term"), def: t("reputation.glossary.tierRange.def") },
            { term: t("reputation.glossary.noData.term"), def: t("reputation.glossary.noData.def", { min: MIN_GAMES_FOR_RANKING }) },
          ]}
        />
      </SectionCard>
    </div>
  );

  // ---------- Precio ----------
  const precioContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      <SectionCard title={t("price.title")} subtitle={t("price.subtitle", { month })}>
        <PriceTable rows={priceRows} />
        <Glossary
          items={[
            { term: t("price.glossary.avgTicket.term"), def: t("price.glossary.avgTicket.def") },
            { term: t("price.glossary.playersPerGame.term"), def: t("price.glossary.playersPerGame.def") },
            { term: t("price.glossary.gamesPerMonth.term"), def: t("price.glossary.gamesPerMonth.def") },
            { term: t("price.glossary.revenue.term"), def: t("price.glossary.revenue.def") },
          ]}
        />
      </SectionCard>
    </div>
  );

  // ---------- Engagement ----------
  const engagementContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      <div className="rounded-xl bg-surface-panel border border-border px-5 py-3 text-sm text-ink">
        {t.rich("engagement.nearMissSummary", {
          totalNearMiss: totalNearMiss.toLocaleString("en-US"),
          totalCancelled: totalCancelled.toLocaleString("en-US"),
          month,
          pct: totalCancelled > 0 ? formatPct(totalNearMiss / totalCancelled) : "0%",
          bold: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </div>
      <SectionCard title={t("engagement.title")}>
        <EngagementTable rows={engagementRows} />
        <div className="mt-4 pt-3 border-t border-surface-sunken space-y-1.5">
          <div className="text-[11px] text-ink-faint"><span className="font-medium text-ink-muted">{t("engagement.conversionLabel")}</span> {t("engagement.conversionDef")}</div>
          <div className="text-[11px] text-ink-faint"><span className="font-medium text-ink-muted">{t("engagement.abandonmentLabel")}</span> {t("engagement.abandonmentDef")}</div>
          <div className="text-[11px] text-ink-faint"><span className="font-medium text-ink-muted">{t("engagement.nearMissLabel")}</span> {t("engagement.nearMissDef")}</div>
        </div>
      </SectionCard>
    </div>
  );

  // ---------- Insights (panel flotante) ----------
  const concentracionInsights = sp.regionId ? buildParetoInsights(pareto.top80.facilities, t) : [];
  const shareInsights = !sp.marketId
    ? buildMarketRankingInsights(marketRanking, t)
    : facilityShareCompare
      ? buildShareChangeInsights(marketShareTarget, facilityShareCompare, t)
      : [];
  const reputacionInsights = buildReputationInsights(summary, t);
  const engagementInsights = buildEngagementInsights(
    summary,
    totalNearMiss,
    totalCancelled,
    (r) => facilityDetailHref(r.facilityId, r.marketId, r.regionId),
    t
  );

  const insightGroups: PanelInsightGroup[] = [
    { label: t("tabs.concentration"), insights: concentracionInsights },
    { label: t("tabs.share"), insights: shareInsights },
    { label: t("tabs.reputation"), insights: reputacionInsights },
    { label: t("tabs.engagement"), insights: engagementInsights },
  ];

  return (
    <>
      <Tabs
        defaultActiveId={activeTab}
        tabs={[
          { id: "concentracion", label: t("tabs.concentration"), content: concentracionContent },
          { id: "share", label: t("tabs.share"), content: marketShareContent },
          { id: "reputacion", label: t("tabs.reputation"), content: reputacionContent },
          { id: "precio", label: t("tabs.price"), content: precioContent },
          { id: "engagement", label: t("tabs.engagement"), content: engagementContent },
        ]}
      />
      <InsightsPanel title={t("insights.panelTitle")} groups={insightGroups} />
    </>
  );
}
