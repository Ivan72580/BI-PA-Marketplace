import Link from "next/link";
import {
  getFilterOptions,
  getMetricSeriesInWindow,
  getSeasonalWindowPattern,
  getQuarterClimate,
  getOverviewData,
  getDayOfWeekPattern,
  getHourPattern,
  getFormatPattern,
  getNetworkFormatLeaderboard,
  getSlotConsistency,
  getSlotRecentPerformance,
  getGameList,
  getMarketConfirmationRanking,
  type OverviewFilters,
} from "../lib/db/queries";
import { resolvePeriod, shiftAnchor, todayISO, type Granularity, type ResolvedPeriod } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import LineChart from "../components/charts/LineChart";
import BarChart from "../components/charts/BarChart";
import MetricTrendCard from "../components/MetricTrendCard";
import SlotCalendarView from "../components/SlotCalendarView";
import SlotSummaryTable, { type SlotSummaryRow } from "../components/SlotSummaryTable";
import MonthPicker from "../components/MonthPicker";
import DatePicker from "../components/DatePicker";
import LinkSelect from "../components/LinkSelect";
import Tabs from "../components/Tabs";
import GroupSection from "../components/GroupSection";
import Glossary from "../components/Glossary";
import DetalleTable from "../components/DetalleTable";
import ChangeBadge from "../components/ChangeBadge";
import QuarterClimate from "../components/QuarterClimate";

type SP = {
  regionId?: string; marketId?: string; facilityId?: string;
  granularity?: string; period?: string; compare?: string;
  slotMonth?: string; detalleGranularity?: string; detallePeriod?: string;
  mustHoldWindow?: string; avoidWindow?: string;
};

const TREND_GRANULARITIES: Granularity[] = ["year", "semester", "quarter", "month"];
const GRANULARITY_LABEL: Record<string, string> = { year: "Año", semester: "Semestre", quarter: "Trimestre", month: "Mes" };
const METRIC_COLORS = { confirmation: "#16755c", cancellation: "#ff4b33", occupancy: "#4ade80", conversion: "#0b3b2e" };

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function buildTrendsQuery(current: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/trends?${qs}` : "/trends";
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {action}
      </div>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && action === undefined && <div className="mb-2" />}
      {children}
    </div>
  );
}

function Stat({ label, value, sublabel, delta, deltaInvert }: { label: string; value: string; sublabel?: string; delta?: number | null; deltaInvert?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-display text-xl font-semibold text-ink">{value}</div>
        {delta !== undefined && <ChangeBadge value={delta} invert={deltaInvert} />}
      </div>
      {sublabel && <div className="text-xs text-ink-faint mt-0.5">{sublabel}</div>}
    </div>
  );
}

function bucketForGranularity(g: Granularity): "week" | "month" {
  return g === "year" || g === "semester" ? "month" : "week";
}

const MIN_SAMPLE_FOR_RATE_BAR = 10;

function RateBarList({
  rows,
}: {
  rows: { key: string; label: string; confirmationRate: number; cancellationRate: number; totalGames: number }[];
}) {
  if (rows.length === 0) return <div className="text-sm text-ink-faint">Sin datos suficientes.</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-xs mb-1 gap-2">
            <span className="text-ink truncate">{r.label}</span>
            <span className="text-ink-faint shrink-0">
              {formatPct(r.confirmationRate)} <span className="text-ink-faint/70">· {r.totalGames.toLocaleString("en-US")}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-surface-sunken">
            <div className="h-1.5 bg-brand" style={{ width: `${r.confirmationRate * 100}%` }} />
            <div className="h-1.5 bg-danger" style={{ width: `${r.cancellationRate * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildQuarterInsights(points: { quarter: number; label: string; confirmationRate: number; totalGames: number }[]): string[] {
  const totalGames = points.reduce((s, p) => s + p.totalGames, 0);
  if (totalGames === 0) return [];
  const avgRate = points.reduce((s, p) => s + p.confirmationRate * p.totalGames, 0) / totalGames;
  const best = points.reduce((a, b) => (b.confirmationRate > a.confirmationRate ? b : a), points[0]);
  const worst = points.reduce((a, b) => (b.confirmationRate < a.confirmationRate ? b : a), points[0]);

  return points.map((p) => {
    if (best.quarter === worst.quarter) return `${p.label}: sin variación relevante entre trimestres.`;
    if (p.quarter === best.quarter) return `${p.label}: el trimestre más fuerte del año.`;
    if (p.quarter === worst.quarter) return `${p.label}: el trimestre más flojo del año.`;
    const rel = p.confirmationRate >= avgRate ? "por encima" : "por debajo";
    return `${p.label}: ${rel} del promedio anual.`;
  });
}

export default async function TrendsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filterOptions = await getFilterOptions();

  // ---------- Pantalla de selección obligatoria ----------
  if (!sp.regionId || !sp.marketId) {
    const landingMonth = todayISO().slice(0, 7);
    const [marketMovers, networkClimate, networkDayPattern, networkHourPattern, networkFormatLeaderboard] = await Promise.all([
      getMarketConfirmationRanking({}, landingMonth),
      getQuarterClimate({}),
      getDayOfWeekPattern({}),
      getHourPattern({}),
      getNetworkFormatLeaderboard(),
    ]);
    type MarketMeta = { id: string; name: string; regionId: string };
    const marketMeta = new Map<string, MarketMeta>(
      filterOptions.markets.map((m: MarketMeta): [string, MarketMeta] => [m.id, m])
    );
    type RegionMeta = { id: string; name: string };
    const regionMeta = new Map<string, RegionMeta>(
      filterOptions.regions.map((r: RegionMeta): [string, RegionMeta] => [r.id, r])
    );
    const topMovers = marketMovers.filter((m: { marketId: string }) => marketMeta.has(m.marketId)).slice(0, 10);
    const hourRows = [...networkHourPattern]
      .filter((h) => h.totalGames >= MIN_SAMPLE_FOR_RATE_BAR)
      .sort((a, b) => b.confirmationRate - a.confirmationRate)
      .slice(0, 10);
    const formatRows = [...networkFormatLeaderboard]
      .filter((f) => f.totalGames >= MIN_SAMPLE_FOR_RATE_BAR)
      .sort((a, b) => b.confirmationRate - a.confirmationRate)
      .slice(0, 10)
      .map((f) => ({ ...f, label: f.facilityName ? `${f.label} · ${f.facilityName}` : f.label }));
    const quarterInsights = buildQuarterInsights(networkClimate);

    return (
      <div>
        <h1 className="font-display text-3xl font-bold text-ink mb-1">Trends</h1>
        <div className="text-sm text-ink-faint mb-4 max-w-2xl">
          Tendencias, consistencia de horarios y patrones estacionales — pensado para responder &quot;¿qué esperar?&quot; en cada market y cada facility, no solo &quot;qué pasó&quot;.
        </div>

        <div className="rounded-2xl bg-brand-soft/50 border border-brand/25 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">Elegí una región y un market para ver el detalle</div>
            <div className="text-xs text-ink-muted">Mezclar mercados muy distintos entre sí no aporta información accionable.</div>
          </div>
          <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} showTimeControls={false} showFacility={false} bare />
        </div>

        <div className="mt-6">
          <GroupSection title="Mientras elegís: así viene la red en general">
            <p className="text-xs text-ink-faint -mt-1">
              No reemplaza el detalle por market — es contexto de red completa para ayudarte a decidir dónde mirar primero.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
              <SectionCard
                title="Markets que más se movieron este mes"
                subtitle="Variación de tasa de confirmación vs. mes anterior — hacé clic para ver el detalle"
              >
                {topMovers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {topMovers.map((m) => {
                      const market = marketMeta.get(m.marketId)!;
                      const region = regionMeta.get(market.regionId);
                      const href = buildTrendsQuery(sp, { regionId: market.regionId, marketId: m.marketId });
                      return (
                        <Link
                          key={m.marketId}
                          href={href}
                          className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 -mx-2 hover:bg-surface-sunken transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">
                              {market.name} {region && <span className="text-ink-faint font-normal">· {region.name}</span>}
                            </div>
                            <div className="text-xs text-ink-faint">
                              {formatPct(m.confirmationRate)} de confirmación · {m.totalGames.toLocaleString("en-US")} partidos
                            </div>
                          </div>
                          <ChangeBadge value={m.changePts} />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-ink-faint">Sin datos suficientes este mes.</div>
                )}
              </SectionCard>

              <div className="space-y-3">
                <div className="flex justify-center">
                  <QuarterClimate points={networkClimate} />
                </div>
                {quarterInsights.length > 0 && (
                  <ul className="text-[11px] text-ink-faint space-y-1 max-w-[220px] mx-auto list-disc pl-4">
                    {quarterInsights.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <SectionCard title="Mejor día para confirmar" subtitle="Toda la red, todo el histórico">
                <RateBarList rows={networkDayPattern} />
              </SectionCard>
              <SectionCard title="Mejor horario para confirmar" subtitle={`Toda la red · mínimo ${MIN_SAMPLE_FOR_RATE_BAR} partidos por horario`}>
                <RateBarList rows={hourRows} />
              </SectionCard>
              <SectionCard title="Formatos más consistentes" subtitle={`Toda la red · mínimo ${MIN_SAMPLE_FOR_RATE_BAR} partidos por formato`}>
                <RateBarList rows={formatRows} />
              </SectionCard>
            </div>
          </GroupSection>
        </div>
      </div>
    );
  }

  const granularity: Granularity = TREND_GRANULARITIES.includes(sp.granularity as Granularity) ? (sp.granularity as Granularity) : "quarter";
  const anchor = sp.period || todayISO();
  const period: ResolvedPeriod = resolvePeriod(granularity, anchor);

  const compareAnchor = shiftAnchor(granularity, anchor, -1);
  const comparePeriod: ResolvedPeriod = resolvePeriod(granularity, compareAnchor);

  const prevAnchor = shiftAnchor(granularity, anchor, -1);
  const nextAnchor = shiftAnchor(granularity, anchor, 1);

  const marketFilters: OverviewFilters = { regionId: sp.regionId, marketId: sp.marketId };
  const unit = bucketForGranularity(granularity);

  // El "clima" histórico responde a Región/Market/Facility, nunca al filtro
  // de tiempo (año/trimestre/etc.) — por eso no le pasamos period acá.
  const climateFilters: OverviewFilters = sp.facilityId ? { ...marketFilters, facilityId: sp.facilityId } : marketFilters;

  // Patrón estacional: la unidad de bucket y la ventana dependen de la
  // granularidad elegida arriba — año→meses de ese año, semestre/trimestre→
  // meses de ese semestre/trimestre (aunque no hayan pasado todavía), mes→
  // semanas de ese mes.
  const seasonalBucketUnit: "month" | "week" = granularity === "month" ? "week" : "month";

  const [series, seasonal, quarterClimate] = await Promise.all([
    getMetricSeriesInWindow(marketFilters, unit, period.dateFrom!, period.dateTo!),
    getSeasonalWindowPattern(marketFilters, period.dateFrom!, period.dateTo!, seasonalBucketUnit),
    getQuarterClimate(climateFilters),
  ]);

  let priorSummary: { confirmationRate: number; cancellationRate: number; occupancyRate: number; conversionRate: number } | null = null;
  if (comparePeriod.dateFrom && comparePeriod.dateTo) {
    const priorSeries = await getMetricSeriesInWindow(marketFilters, unit, comparePeriod.dateFrom, comparePeriod.dateTo);
    if (priorSeries.length > 0) {
      const avg = (f: (p: (typeof priorSeries)[number]) => number) => priorSeries.reduce((s, p) => s + f(p), 0) / priorSeries.length;
      priorSummary = {
        confirmationRate: avg((p) => p.confirmationRate),
        cancellationRate: avg((p) => p.cancellationRate),
        occupancyRate: avg((p) => p.occupancyRate),
        conversionRate: avg((p) => p.conversionRate),
      };
    }
  }
  const currentAvg = (f: (p: (typeof series)[number]) => number) => (series.length > 0 ? series.reduce((s, p) => s + f(p), 0) / series.length : 0);
  const currentSummary = {
    confirmationRate: currentAvg((p) => p.confirmationRate),
    cancellationRate: currentAvg((p) => p.cancellationRate),
    occupancyRate: currentAvg((p) => p.occupancyRate),
    conversionRate: currentAvg((p) => p.conversionRate),
  };

  const seriesChart = (field: "confirmationRate" | "cancellationRate" | "occupancyRate" | "conversionRate", color: string) => ({
    labels: series.map((p) => p.label),
    datasets: [{ label: "", data: series.map((p) => Math.round(p[field] * 1000) / 10), borderColor: color, backgroundColor: `${color}22`, tension: 0.3 }],
  });

  const seasonalLabels = seasonal.map((p) => p.monthLabel);
  const singleLineChart = (data: number[], color: string) => ({
    labels: seasonalLabels,
    datasets: [{ label: "", data, borderColor: color, backgroundColor: `${color}22`, tension: 0.3 }],
  });

  const periodNav = (
    <div className="flex flex-wrap items-center gap-2">
      <LinkSelect paramName="granularity" value={granularity} options={TREND_GRANULARITIES.map((g) => ({ value: g, label: GRANULARITY_LABEL[g] }))} />
      <div className="flex items-center gap-1.5">
        <Link href={buildTrendsQuery(sp, { period: prevAnchor })} className="text-brand text-lg leading-none px-1">‹</Link>
        <span className="text-sm text-ink min-w-[120px] text-center">{period.label}</span>
        <Link href={buildTrendsQuery(sp, { period: nextAnchor })} className="text-brand text-lg leading-none px-1">›</Link>
      </div>
    </div>
  );

  // ---------- Tab: Panorama (nivel market) ----------
  const panoramaContent = (
    <div className="space-y-5">
      {periodNav}

      <GroupSection title="Tendencia del market">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MetricTrendCard title="Tasa de confirmación" chartData={seriesChart("confirmationRate", METRIC_COLORS.confirmation)} currentValue={currentSummary.confirmationRate} priorValue={priorSummary?.confirmationRate ?? null} comparePeriodLabel={comparePeriod.label} />
          <MetricTrendCard title="Tasa de cancelación" chartData={seriesChart("cancellationRate", METRIC_COLORS.cancellation)} currentValue={currentSummary.cancellationRate} priorValue={priorSummary?.cancellationRate ?? null} comparePeriodLabel={comparePeriod.label} />
          <MetricTrendCard title="Ocupación" chartData={seriesChart("occupancyRate", METRIC_COLORS.occupancy)} currentValue={currentSummary.occupancyRate} priorValue={priorSummary?.occupancyRate ?? null} comparePeriodLabel={comparePeriod.label} />
          <MetricTrendCard title="Conversión" chartData={seriesChart("conversionRate", METRIC_COLORS.conversion)} currentValue={currentSummary.conversionRate} priorValue={priorSummary?.conversionRate ?? null} comparePeriodLabel={comparePeriod.label} />
        </div>
        {series.length <= 1 && <div className="text-sm text-ink-faint px-1">No hay suficiente historial en este período.</div>}
      </GroupSection>

      <GroupSection title="Patrón estacional reciente del market">
        <p className="text-xs text-ink-faint -mt-1 mb-1 px-1">
          {granularity === "year" && `Evolución mes a mes de ${period.label} — cada variable por separado.`}
          {granularity === "semester" && `Meses del semestre en curso (${period.label}) — el eje llega hasta el final del semestre aunque todavía no haya datos de todos los meses.`}
          {granularity === "quarter" && `Meses del trimestre en curso (${period.label}) — el eje llega hasta el final del trimestre aunque todavía no haya datos de todos los meses.`}
          {granularity === "month" && `Semanas de ${period.label}, desglosado — no una vista mensual agregada.`}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Tasa de confirmación"><LineChart data={singleLineChart(seasonal.map((p) => Math.round(p.confirmationRate * 1000) / 10), METRIC_COLORS.confirmation)} /></SectionCard>
          <SectionCard title="Tasa de cancelación"><LineChart data={singleLineChart(seasonal.map((p) => Math.round(p.cancellationRate * 1000) / 10), METRIC_COLORS.cancellation)} /></SectionCard>
          <SectionCard title="Ocupación"><LineChart data={singleLineChart(seasonal.map((p) => Math.round(p.occupancyRate * 1000) / 10), METRIC_COLORS.occupancy)} /></SectionCard>
          <SectionCard title="Conversión"><LineChart data={singleLineChart(seasonal.map((p) => Math.round(p.conversionRate * 1000) / 10), METRIC_COLORS.conversion)} /></SectionCard>
          <SectionCard title="Waitlist promedio"><LineChart data={singleLineChart(seasonal.map((p) => Math.round(p.avgWaitlist * 10) / 10), "#6b7280")} /></SectionCard>
          <SectionCard title="Lead time (mediana)"><LineChart data={singleLineChart(seasonal.map((p) => Math.round((p.medianLeadTime ?? 0) * 10) / 10), "#9ca3af")} /></SectionCard>
        </div>
      </GroupSection>
    </div>
  );

  // ---------- Tab: Por facility ----------
  const porFacilityContent = !sp.facilityId ? (
    await (async () => {
      const marketTotals = await getOverviewData({ ...marketFilters, dateFrom: period.dateFrom, dateTo: period.dateTo });
      const marketPriorTotals = comparePeriod.dateFrom && comparePeriod.dateTo
        ? await getOverviewData({ ...marketFilters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo })
        : null;
      const confirmDelta = marketPriorTotals ? marketTotals.confirmationRate - marketPriorTotals.confirmationRate : undefined;
      const cancelDelta = marketPriorTotals ? marketTotals.cancellationRate - marketPriorTotals.cancellationRate : undefined;
      const occDelta = marketPriorTotals ? marketTotals.avgFillRate - marketPriorTotals.avgFillRate : undefined;

      return (
        <div className="space-y-5">
          {periodNav}
          <SectionCard title={`Panorama de ${filterOptions.markets.find((m) => m.id === sp.marketId)?.name ?? "este market"}`} subtitle={`${period.label} — elegí una facility abajo para ver su tendencia en detalle`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Stat label="Confirmación" value={formatPct(marketTotals.confirmationRate)} sublabel={`${marketTotals.confirmedGames.toLocaleString("en-US")} de ${marketTotals.totalGames.toLocaleString("en-US")} partidos`} delta={confirmDelta} />
              <Stat label="Cancelación" value={formatPct(marketTotals.cancellationRate)} sublabel={`${marketTotals.cancelledGames.toLocaleString("en-US")} de ${marketTotals.totalGames.toLocaleString("en-US")} partidos`} delta={cancelDelta} deltaInvert />
              <Stat label="Ocupación" value={formatPct(marketTotals.avgFillRate)} delta={occDelta} />
            </div>
            {marketPriorTotals && <div className="text-[11px] text-ink-faint mt-3 px-1">Variación vs. {comparePeriod.label}</div>}
          </SectionCard>
          <div className="rounded-2xl bg-surface-panel p-8 text-center shadow-sm">
            <div className="text-sm text-ink font-medium mb-3">Elegí una facility para ver el detalle pormenorizado</div>
            <div className="flex justify-center">
              <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} showTimeControls={false} />
            </div>
          </div>
        </div>
      );
    })()
  ) : (
    await (async () => {
      const facilityFilters: OverviewFilters = { ...marketFilters, facilityId: sp.facilityId, dateFrom: period.dateFrom, dateTo: period.dateTo };
      const slotFilters: OverviewFilters = { ...marketFilters, facilityId: sp.facilityId };
      const slotMonth = sp.slotMonth && /^\d{4}-\d{2}$/.test(sp.slotMonth) ? sp.slotMonth : todayISO().slice(0, 7);

      const detalleGranularity: "month" | "day" = sp.detalleGranularity === "day" ? "day" : "month";
      const detalleAnchor = sp.detallePeriod || todayISO();
      const detallePeriod = resolvePeriod(detalleGranularity, detalleAnchor);
      const detalleFilters: OverviewFilters = { ...marketFilters, facilityId: sp.facilityId, dateFrom: detallePeriod.dateFrom, dateTo: detallePeriod.dateTo };

      const mustHoldWindow = sp.mustHoldWindow === "3" ? 3 : 6;
      const avoidWindow = sp.avoidWindow === "3" ? 3 : 6;

      const [dayPattern, hourPattern, formatPattern, mustHave, avoid, mustHaveRecent, avoidRecent, recentPerf, gameList, facilitySeries] = await Promise.all([
        getDayOfWeekPattern(facilityFilters),
        getHourPattern(facilityFilters),
        getFormatPattern(facilityFilters),
        getSlotConsistency(slotFilters, slotMonth, "confirmed"),
        getSlotConsistency(slotFilters, slotMonth, "cancelled"),
        getSlotConsistency(slotFilters, slotMonth, "confirmed", mustHoldWindow),
        getSlotConsistency(slotFilters, slotMonth, "cancelled", avoidWindow),
        getSlotRecentPerformance(slotFilters, 8),
        getGameList(detalleFilters, 100),
        getMetricSeriesInWindow(facilityFilters, unit, period.dateFrom!, period.dateTo!),
      ]);

      let facilityPriorSummary: { confirmationRate: number; cancellationRate: number; occupancyRate: number; conversionRate: number } | null = null;
      if (comparePeriod.dateFrom && comparePeriod.dateTo) {
        const priorFacilitySeries = await getMetricSeriesInWindow({ ...marketFilters, facilityId: sp.facilityId }, unit, comparePeriod.dateFrom, comparePeriod.dateTo);
        if (priorFacilitySeries.length > 0) {
          const avg = (f: (p: (typeof priorFacilitySeries)[number]) => number) => priorFacilitySeries.reduce((s, p) => s + f(p), 0) / priorFacilitySeries.length;
          facilityPriorSummary = {
            confirmationRate: avg((p) => p.confirmationRate),
            cancellationRate: avg((p) => p.cancellationRate),
            occupancyRate: avg((p) => p.occupancyRate),
            conversionRate: avg((p) => p.conversionRate),
          };
        }
      }
      const facilityCurrentAvg = (f: (p: (typeof facilitySeries)[number]) => number) => (facilitySeries.length > 0 ? facilitySeries.reduce((s, p) => s + f(p), 0) / facilitySeries.length : 0);
      const facilityCurrentSummary = {
        confirmationRate: facilityCurrentAvg((p) => p.confirmationRate),
        cancellationRate: facilityCurrentAvg((p) => p.cancellationRate),
        occupancyRate: facilityCurrentAvg((p) => p.occupancyRate),
        conversionRate: facilityCurrentAvg((p) => p.conversionRate),
      };
      const facilityDeltas = facilityPriorSummary
        ? {
            confirmationRate: facilityCurrentSummary.confirmationRate - facilityPriorSummary.confirmationRate,
            cancellationRate: facilityCurrentSummary.cancellationRate - facilityPriorSummary.cancellationRate,
            occupancyRate: facilityCurrentSummary.occupancyRate - facilityPriorSummary.occupancyRate,
            conversionRate: facilityCurrentSummary.conversionRate - facilityPriorSummary.conversionRate,
          }
        : null;

      const fourSeriesDatasets = (rows: { label: string; confirmationRate: number; cancellationRate: number; occupancyRate: number; conversionRate: number }[]) => ({
        labels: rows.map((r) => r.label),
        datasets: [
          { label: "Confirmación", data: rows.map((r) => Math.round(r.confirmationRate * 1000) / 10), backgroundColor: METRIC_COLORS.confirmation },
          { label: "Cancelación", data: rows.map((r) => Math.round(r.cancellationRate * 1000) / 10), backgroundColor: METRIC_COLORS.cancellation },
          { label: "Ocupación", data: rows.map((r) => Math.round(r.occupancyRate * 1000) / 10), backgroundColor: METRIC_COLORS.occupancy },
          { label: "Conversión", data: rows.map((r) => Math.round(r.conversionRate * 1000) / 10), backgroundColor: METRIC_COLORS.conversion },
        ],
      });

      // Slots que deben sostenerse sí o sí: alta consistencia histórica (≥75%).
      const mustHoldSlots = [...mustHave.cells].filter((c) => c.consistencyPct >= 0.75).sort((a, b) => b.consistencyPct - a.consistencyPct);
      // Espejo para cancelados: slots que consistentemente cancelan (≥75%).
      const avoidHoldSlots = [...avoid.cells].filter((c) => c.consistencyPct >= 0.75).sort((a, b) => b.consistencyPct - a.consistencyPct);
      // Para que "remover o evitar" no resalte lo mismo que "no puede faltar":
      // se suprime cualquier slot (día+hora+formato exacto) que ya esté
      // establecido como confiable en la ventana correspondiente.
      const establishedHistorical = new Set(mustHave.cells.filter((c) => c.consistencyPct >= 0.75).map((c) => `${c.day}|${c.hour}|${c.formatLabel}`));
      const establishedRecent = new Set(mustHaveRecent.cells.filter((c) => c.consistencyPct >= 0.75).map((c) => `${c.day}|${c.hour}|${c.formatLabel}`));
      // Slots emergentes: no llegan todavía al umbral histórico, pero vienen
      // funcionando bien (o mal, para cancelados) en las últimas 8 semanas.
      const establishedKeys = new Set(mustHoldSlots.map((c) => `${c.day}|${c.hour}|${c.formatLabel}`));
      const avoidEstablishedKeys = new Set(avoidHoldSlots.map((c) => `${c.day}|${c.hour}|${c.formatLabel}`));
      const emergingSlots = recentPerf
        .filter((s) => s.confirmationRate > 0.45 && s.totalGames >= 3 && !establishedKeys.has(`${s.day}|${s.hour}|${s.formatLabel}`))
        .sort((a, b) => b.confirmationRate - a.confirmationRate)
        .slice(0, 8);
      const avoidEmergingSlots = recentPerf
        .filter((s) => s.cancellationRate > 0.45 && s.totalGames >= 3 && !avoidEstablishedKeys.has(`${s.day}|${s.hour}|${s.formatLabel}`))
        .sort((a, b) => b.cancellationRate - a.cancellationRate)
        .slice(0, 8);

      const mustHoldRows: SlotSummaryRow[] = mustHoldSlots.map((c) => ({
        key: `${c.day}-${c.hour}-${c.formatLabel}`, day: c.day, dayLabel: c.dayLabel, hour: c.hour, formatLabel: c.formatLabel,
        pct: c.consistencyPct, detail: `${c.selectedMonthCount} este mes · ${c.priorMonthCount} el mes pasado`,
      }));
      const avoidHoldRows: SlotSummaryRow[] = avoidHoldSlots.map((c) => ({
        key: `${c.day}-${c.hour}-${c.formatLabel}`, day: c.day, dayLabel: c.dayLabel, hour: c.hour, formatLabel: c.formatLabel,
        pct: c.consistencyPct, detail: `${c.selectedMonthCount} este mes · ${c.priorMonthCount} el mes pasado`,
      }));
      const emergingRows: SlotSummaryRow[] = emergingSlots.map((s) => ({
        key: `${s.day}-${s.hour}-${s.formatLabel}`, day: s.day, dayLabel: s.dayLabel, hour: s.hour, formatLabel: s.formatLabel,
        pct: s.confirmationRate, detail: `${s.confirmedCount} confirmados de ${s.totalGames} en 8 semanas`,
      }));
      const avoidEmergingRows: SlotSummaryRow[] = avoidEmergingSlots.map((s) => ({
        key: `${s.day}-${s.hour}-${s.formatLabel}`, day: s.day, dayLabel: s.dayLabel, hour: s.hour, formatLabel: s.formatLabel,
        pct: s.cancellationRate, detail: `${s.cancelledCount} cancelados de ${s.totalGames} en 8 semanas`,
      }));

      return (
        <div className="space-y-5">
          {periodNav}
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-faint">Facility:</span>
            <LinkSelect paramName="facilityId" value={sp.facilityId ?? ""} options={filterOptions.facilities.filter((f) => f.marketId === sp.marketId).map((f) => ({ value: f.id, label: f.name }))} />
            <Link href={buildTrendsQuery(sp, { facilityId: undefined })} className="text-xs text-ink-faint hover:text-ink">volver al panorama del market</Link>
          </div>

          {facilityDeltas && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat label="Confirmación" value={formatPct(facilityCurrentSummary.confirmationRate)} delta={facilityDeltas.confirmationRate} />
              <Stat label="Cancelación" value={formatPct(facilityCurrentSummary.cancellationRate)} delta={facilityDeltas.cancellationRate} deltaInvert />
              <Stat label="Ocupación" value={formatPct(facilityCurrentSummary.occupancyRate)} delta={facilityDeltas.occupancyRate} />
              <Stat label="Conversión" value={formatPct(facilityCurrentSummary.conversionRate)} delta={facilityDeltas.conversionRate} />
            </div>
          )}

          <GroupSection title="Consistencia de horarios">
            <div className="flex items-center gap-3 -mb-1">
              <span className="text-xs text-ink-faint">Mes de referencia:</span>
              <MonthPicker paramName="slotMonth" value={slotMonth} />
            </div>

            <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
              <Tabs
                tabs={[
                  {
                    id: "confirmed",
                    label: "Confirmados",
                    content: (
                      <div className="space-y-4">
                        <p className="text-xs text-ink-faint">Verde — clickeá cualquier slot para ver el insight. Cada slot es facility + día + hora + tipo de cancha + tamaño</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          <div>
                            <div className="text-xs text-ink-faint mb-2">Histórico completo</div>
                            {mustHave.totalMonthsObserved >= 2 ? (
                              <SlotCalendarView days={mustHave.days} hours={mustHave.hours} cells={mustHave.cells} colorScheme="green" />
                            ) : (
                              <div className="text-sm text-ink-faint">No hay suficiente historial mensual todavía.</div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-ink-faint">Ventana reciente</span>
                              <LinkSelect paramName="mustHoldWindow" value={String(mustHoldWindow)} options={[{ value: "3", label: "3 meses" }, { value: "6", label: "6 meses" }]} />
                            </div>
                            {mustHaveRecent.totalMonthsObserved >= 2 ? (
                              <SlotCalendarView days={mustHave.days} hours={mustHave.hours} cells={mustHaveRecent.cells} colorScheme="green" />
                            ) : (
                              <div className="text-sm text-ink-faint">No hay suficiente historial en esta ventana todavía.</div>
                            )}
                          </div>
                        </div>
                        <div className="pt-3 border-t border-surface-sunken space-y-1.5">
                          {mustHave.insights.map((insight, i) => <div key={i} className="text-sm text-ink font-medium">{insight}</div>)}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
                          <div>
                            <div className="text-sm font-medium text-ink mb-0.5">Slots que hay que sostener sí o sí</div>
                            <div className="text-xs text-ink-faint mb-2">Consistencia histórica ≥75% — ordenable por columna</div>
                            <SlotSummaryTable rows={mustHoldRows} colorScheme="green" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-ink mb-0.5">Slots a evaluar</div>
                            <div className="text-xs text-ink-faint mb-2">Sin consolidar históricamente, pero &gt;45% de confirmación en las últimas 8 semanas</div>
                            <SlotSummaryTable rows={emergingRows} colorScheme="green" />
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "cancelled",
                    label: "Cancelados",
                    content: (
                      <div className="space-y-4">
                        <p className="text-xs text-ink-faint">Rojo — misma lógica, mirando qué slots cancelan de forma consistente. Los slots ya destacados como &quot;no pueden faltar&quot; se muestran apagados acá, para no confundir</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          <div>
                            <div className="text-xs text-ink-faint mb-2">Histórico completo</div>
                            {avoid.totalMonthsObserved >= 2 ? (
                              <SlotCalendarView days={mustHave.days} hours={mustHave.hours} cells={avoid.cells} colorScheme="red" suppressedKeys={establishedHistorical} />
                            ) : (
                              <div className="text-sm text-ink-faint">No hay suficiente historial mensual todavía.</div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-ink-faint">Ventana reciente</span>
                              <LinkSelect paramName="avoidWindow" value={String(avoidWindow)} options={[{ value: "3", label: "3 meses" }, { value: "6", label: "6 meses" }]} />
                            </div>
                            {avoidRecent.totalMonthsObserved >= 2 ? (
                              <SlotCalendarView days={mustHave.days} hours={mustHave.hours} cells={avoidRecent.cells} colorScheme="red" suppressedKeys={establishedRecent} />
                            ) : (
                              <div className="text-sm text-ink-faint">No hay suficiente historial en esta ventana todavía.</div>
                            )}
                          </div>
                        </div>
                        <div className="pt-3 border-t border-surface-sunken space-y-1.5">
                          {avoid.insights.map((insight, i) => <div key={i} className="text-sm text-ink font-medium">{insight}</div>)}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
                          <div>
                            <div className="text-sm font-medium text-ink mb-0.5">Slots que hay que evitar consistentemente</div>
                            <div className="text-xs text-ink-faint mb-2">Consistencia histórica de cancelación ≥75% — ordenable por columna</div>
                            <SlotSummaryTable rows={avoidHoldRows} colorScheme="red" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-ink mb-0.5">Slots problemáticos a evaluar</div>
                            <div className="text-xs text-ink-faint mb-2">Sin consolidar históricamente, pero &gt;45% de cancelación en las últimas 8 semanas</div>
                            <SlotSummaryTable rows={avoidEmergingRows} colorScheme="red" />
                          </div>
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <Glossary items={[{ term: "Consistencia", def: "% de los meses observados en los que ese día+hora tuvo al menos un partido del status correspondiente." }]} />
          </GroupSection>

          <GroupSection title="Por día de la semana">
            <SectionCard title="Las 4 métricas por día" subtitle={period.label}>
              <BarChart data={fourSeriesDatasets(dayPattern)} />
            </SectionCard>
          </GroupSection>

          <GroupSection title="Por horario">
            <SectionCard title="Las 4 métricas por hora" subtitle={period.label}>
              <BarChart data={fourSeriesDatasets(hourPattern)} />
            </SectionCard>
          </GroupSection>

          <GroupSection title="Por formato">
            <SectionCard title="Las 4 métricas por formato de partido" subtitle="Tamaño real + tipo de cancha cuando está especificado — ej: «Turf Field 6v6»">
              <BarChart data={fourSeriesDatasets(formatPattern)} />
            </SectionCard>
          </GroupSection>

          <GroupSection title="Detalle">
            <SectionCard
              title="Partidos individuales"
              subtitle="Filtrable y ordenable por Día, Estado y Motivo de cancelación"
              action={
                <div className="flex items-center gap-2">
                  <LinkSelect paramName="detalleGranularity" value={detalleGranularity} options={[{ value: "month", label: "Mes" }, { value: "day", label: "Día" }]} />
                  {detalleGranularity === "month" ? (
                    <MonthPicker paramName="detallePeriod" value={detalleAnchor.slice(0, 7)} />
                  ) : (
                    <DatePicker paramName="detallePeriod" value={detalleAnchor} />
                  )}
                </div>
              }
            >
              <DetalleTable items={gameList.items} total={gameList.total} />
            </SectionCard>
          </GroupSection>
        </div>
      );
    })()
  );

  const marketsInRegion = filterOptions.markets.filter((m) => m.regionId === sp.regionId);

  return (
    <div>
      <div className="flex items-start justify-between gap-6 flex-wrap mb-2">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink mb-1">Trends</h1>
          <div className="text-sm text-ink-faint mb-2 max-w-xl">
            Tendencias, consistencia de horarios y patrones estacionales — &quot;¿qué esperar?&quot;, no solo &quot;qué pasó&quot;.
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-ink-faint">{filterOptions.regions.find((r) => r.id === sp.regionId)?.name}</span>
            <span className="text-ink-faint">›</span>
            <LinkSelect paramName="marketId" value={sp.marketId ?? ""} options={marketsInRegion.map((m) => ({ value: m.id, label: m.name }))} />
            <Link href="/trends" className="text-xs text-ink-faint hover:text-ink ml-2">cambiar región</Link>
          </div>
        </div>
        <QuarterClimate points={quarterClimate} />
      </div>

      <Tabs
        defaultActiveId={sp.facilityId ? "facility" : "panorama"}
        tabs={[
          { id: "panorama", label: "Panorama", content: panoramaContent },
          { id: "facility", label: "Por facility", content: porFacilityContent },
        ]}
      />
    </div>
  );
}
