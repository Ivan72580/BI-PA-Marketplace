import Link from "next/link";
import {
  getFilterOptions,
  getMetricSeriesInWindow,
  getRecentMonthlyPattern,
  getQuarterClimate,
  getDayOfWeekPattern,
  getHourPattern,
  getFormatPattern,
  getSlotConsistency,
  getGameList,
  type OverviewFilters,
} from "../lib/db/queries";
import { resolvePeriod, shiftAnchor, todayISO, type Granularity, type ResolvedPeriod } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import LineChart from "../components/charts/LineChart";
import BarChart from "../components/charts/BarChart";
import SlotConsistencyHeatmap from "../components/SlotConsistencyHeatmap";
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
};

const TREND_GRANULARITIES: Granularity[] = ["year", "semester", "quarter", "month"];
const GRANULARITY_LABEL: Record<string, string> = { year: "Año", semester: "Semestre", quarter: "Trimestre", month: "Mes" };
const METRIC_COLORS = { confirmation: "#0d6e4f", cancellation: "#b91c1c", occupancy: "#2563eb", conversion: "#9333ea" };

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
    <div className="rounded-2xl bg-surface border border-border p-5">
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

function Stat({ label, value, delta, deltaInvert }: { label: string; value: string; delta?: number | null; deltaInvert?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-display text-xl font-semibold text-ink">{value}</div>
        {delta !== undefined && <ChangeBadge value={delta} invert={deltaInvert} />}
      </div>
    </div>
  );
}

function bucketForGranularity(g: Granularity): "week" | "month" {
  return g === "year" || g === "semester" ? "month" : "week";
}

export default async function TrendsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filterOptions = await getFilterOptions();

  // ---------- Pantalla de selección obligatoria ----------
  if (!sp.regionId || !sp.marketId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Trends</h1>
        <div className="text-sm text-ink-faint mb-2 max-w-2xl">
          Tendencias, consistencia de horarios y patrones estacionales — pensado para responder "¿qué esperar?" en cada market y cada facility, no solo "qué pasó".
        </div>
        <div className="max-w-2xl mx-auto mt-12">
          <div className="rounded-3xl bg-gradient-to-br from-brand-soft to-surface-panel border-2 border-brand/30 p-12 text-center shadow-sm">
            <div className="text-2xl font-display font-semibold text-ink mb-3">Elegí una región y un market para empezar</div>
            <div className="text-sm text-ink-muted mb-8 max-w-md mx-auto">
              Las tendencias solo dicen algo útil comparando dentro de un mismo market — mezclar mercados muy distintos entre sí no aporta información accionable.
            </div>
            <div className="flex justify-center">
              <div className="rounded-2xl bg-surface border-2 border-brand p-1 shadow-md">
                <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} showTimeControls={false} showFacility={false} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const granularity: Granularity = TREND_GRANULARITIES.includes(sp.granularity as Granularity) ? (sp.granularity as Granularity) : "quarter";
  const anchor = sp.period || todayISO();
  const period: ResolvedPeriod = resolvePeriod(granularity, anchor);
  const compare = sp.compare === "1";

  // Comparación contra el período INMEDIATAMENTE ANTERIOR (mismo trimestre
  // anterior, no el mismo trimestre del año pasado) — reusa shiftAnchor +
  // resolvePeriod para calcular el período completo anterior, cualquiera
  // sea la granularidad elegida.
  const compareAnchor = shiftAnchor(granularity, anchor, -1);
  const comparePeriod: ResolvedPeriod = resolvePeriod(granularity, compareAnchor);

  const prevAnchor = shiftAnchor(granularity, anchor, -1);
  const nextAnchor = shiftAnchor(granularity, anchor, 1);

  const marketFilters: OverviewFilters = { regionId: sp.regionId, marketId: sp.marketId };
  const unit = bucketForGranularity(granularity);

  const [series, recentMonthly, quarterClimate] = await Promise.all([
    getMetricSeriesInWindow(marketFilters, unit, period.dateFrom!, period.dateTo!),
    getRecentMonthlyPattern(marketFilters, 12),
    getQuarterClimate(marketFilters),
  ]);

  let priorSummary: { confirmationRate: number; cancellationRate: number; occupancyRate: number; conversionRate: number } | null = null;
  if (compare && comparePeriod.dateFrom && comparePeriod.dateTo) {
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
  const deltas = priorSummary
    ? {
        confirmationRate: currentSummary.confirmationRate - priorSummary.confirmationRate,
        cancellationRate: currentSummary.cancellationRate - priorSummary.cancellationRate,
        occupancyRate: currentSummary.occupancyRate - priorSummary.occupancyRate,
        conversionRate: currentSummary.conversionRate - priorSummary.conversionRate,
      }
    : null;

  const combinedChart = {
    labels: series.map((p) => p.label),
    datasets: [
      { label: "Confirmación", data: series.map((p) => Math.round(p.confirmationRate * 1000) / 10), borderColor: METRIC_COLORS.confirmation, backgroundColor: `${METRIC_COLORS.confirmation}22`, tension: 0.3 },
      { label: "Cancelación", data: series.map((p) => Math.round(p.cancellationRate * 1000) / 10), borderColor: METRIC_COLORS.cancellation, backgroundColor: `${METRIC_COLORS.cancellation}22`, tension: 0.3 },
      { label: "Ocupación", data: series.map((p) => Math.round(p.occupancyRate * 1000) / 10), borderColor: METRIC_COLORS.occupancy, backgroundColor: `${METRIC_COLORS.occupancy}22`, tension: 0.3 },
      { label: "Conversión", data: series.map((p) => Math.round(p.conversionRate * 1000) / 10), borderColor: METRIC_COLORS.conversion, backgroundColor: `${METRIC_COLORS.conversion}22`, tension: 0.3 },
    ],
  };

  const recentLabels = recentMonthly.map((p) => p.monthLabel);
  const singleLineChart = (data: number[], color: string) => ({
    labels: recentLabels,
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
      <Link
        href={buildTrendsQuery(sp, { compare: compare ? undefined : "1" })}
        className={`text-sm px-3 py-1 rounded-lg border transition-colors ${compare ? "bg-brand text-white border-brand" : "bg-surface text-ink-muted border-border-strong hover:text-ink"}`}
      >
        Comparar vs. {comparePeriod.label}
      </Link>
    </div>
  );

  // ---------- Tab: Panorama (nivel market) ----------
  const panoramaContent = (
    <div className="space-y-5">
      {periodNav}

      <GroupSection title="Tendencia del market">
        <SectionCard title="Confirmación, cancelación, ocupación y conversión — juntas" subtitle={`Por ${GRANULARITY_LABEL[granularity].toLowerCase()}, en ${period.label}`}>
          {series.length > 1 ? <LineChart data={combinedChart} /> : <div className="text-sm text-ink-faint">No hay suficiente historial en este período.</div>}
        </SectionCard>

        {compare && deltas && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Confirmación" value={formatPct(currentSummary.confirmationRate)} delta={deltas.confirmationRate} />
            <Stat label="Cancelación" value={formatPct(currentSummary.cancellationRate)} delta={deltas.cancellationRate} deltaInvert />
            <Stat label="Ocupación" value={formatPct(currentSummary.occupancyRate)} delta={deltas.occupancyRate} />
            <Stat label="Conversión" value={formatPct(currentSummary.conversionRate)} delta={deltas.conversionRate} />
          </div>
        )}
      </GroupSection>

      <GroupSection title="Patrón estacional reciente del market">
        <p className="text-xs text-ink-faint -mt-1 mb-1 px-1">
          Últimos 12 meses reales (no agregado histórico) — cada variable por separado, para ver la evolución concreta más allá del patrón general que ya muestra el "clima" de arriba a la derecha.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Tasa de confirmación"><LineChart data={singleLineChart(recentMonthly.map((p) => Math.round(p.confirmationRate * 1000) / 10), METRIC_COLORS.confirmation)} /></SectionCard>
          <SectionCard title="Tasa de cancelación"><LineChart data={singleLineChart(recentMonthly.map((p) => Math.round(p.cancellationRate * 1000) / 10), METRIC_COLORS.cancellation)} /></SectionCard>
          <SectionCard title="Ocupación"><LineChart data={singleLineChart(recentMonthly.map((p) => Math.round(p.occupancyRate * 1000) / 10), METRIC_COLORS.occupancy)} /></SectionCard>
          <SectionCard title="Conversión"><LineChart data={singleLineChart(recentMonthly.map((p) => Math.round(p.conversionRate * 1000) / 10), METRIC_COLORS.conversion)} /></SectionCard>
          <SectionCard title="Waitlist promedio"><LineChart data={singleLineChart(recentMonthly.map((p) => Math.round(p.avgWaitlist * 10) / 10), "#f59e0b")} /></SectionCard>
          <SectionCard title="Lead time (mediana)"><LineChart data={singleLineChart(recentMonthly.map((p) => Math.round((p.medianLeadTime ?? 0) * 10) / 10), "#64748b")} /></SectionCard>
        </div>
      </GroupSection>
    </div>
  );

  // ---------- Tab: Por facility ----------
  const porFacilityContent = !sp.facilityId ? (
    <div className="space-y-5">
      {periodNav}
      <SectionCard title={`Panorama de ${filterOptions.markets.find((m) => m.id === sp.marketId)?.name ?? "este market"}`} subtitle={`${period.label} — elegí una facility abajo para ver su tendencia en detalle`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Confirmación" value={formatPct(currentSummary.confirmationRate)} />
          <Stat label="Cancelación" value={formatPct(currentSummary.cancellationRate)} />
          <Stat label="Ocupación" value={formatPct(currentSummary.occupancyRate)} />
          <Stat label="Conversión" value={formatPct(currentSummary.conversionRate)} />
        </div>
      </SectionCard>
      <div className="rounded-2xl bg-surface-panel border border-border p-8 text-center">
        <div className="text-sm text-ink font-medium mb-3">Elegí una facility para ver el detalle pormenorizado</div>
        <div className="flex justify-center">
          <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} showTimeControls={false} />
        </div>
      </div>
    </div>
  ) : (
    await (async () => {
      const facilityFilters: OverviewFilters = { ...marketFilters, facilityId: sp.facilityId, dateFrom: period.dateFrom, dateTo: period.dateTo };
      const slotMonth = sp.slotMonth && /^\d{4}-\d{2}$/.test(sp.slotMonth) ? sp.slotMonth : todayISO().slice(0, 7);

      // Detalle: período propio, solo Mes/Día, independiente del período de arriba
      const detalleGranularity: "month" | "day" = sp.detalleGranularity === "day" ? "day" : "month";
      const detalleAnchor = sp.detallePeriod || todayISO();
      const detallePeriod = resolvePeriod(detalleGranularity, detalleAnchor);
      const detalleFilters: OverviewFilters = { ...marketFilters, facilityId: sp.facilityId, dateFrom: detallePeriod.dateFrom, dateTo: detallePeriod.dateTo };

      const [dayPattern, hourPattern, formatPattern, mustHave, avoid, gameList, facilitySeries] = await Promise.all([
        getDayOfWeekPattern(facilityFilters),
        getHourPattern(facilityFilters),
        getFormatPattern(facilityFilters),
        getSlotConsistency({ ...marketFilters, facilityId: sp.facilityId }, slotMonth, "confirmed"),
        getSlotConsistency({ ...marketFilters, facilityId: sp.facilityId }, slotMonth, "cancelled"),
        getGameList(detalleFilters, 100),
        getMetricSeriesInWindow(facilityFilters, unit, period.dateFrom!, period.dateTo!),
      ]);

      let facilityPriorSummary: { confirmationRate: number; cancellationRate: number; occupancyRate: number; conversionRate: number } | null = null;
      if (compare && comparePeriod.dateFrom && comparePeriod.dateTo) {
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

      return (
        <div className="space-y-5">
          {periodNav}
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-faint">Facility:</span>
            <LinkSelect paramName="facilityId" value={sp.facilityId ?? ""} options={filterOptions.facilities.filter((f) => f.marketId === sp.marketId).map((f) => ({ value: f.id, label: f.name }))} />
            <Link href={buildTrendsQuery(sp, { facilityId: undefined })} className="text-xs text-ink-faint hover:text-ink">volver al panorama del market</Link>
          </div>

          {compare && facilityDeltas && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat label="Confirmación" value={formatPct(facilityCurrentSummary.confirmationRate)} delta={facilityDeltas.confirmationRate} />
              <Stat label="Cancelación" value={formatPct(facilityCurrentSummary.cancellationRate)} delta={facilityDeltas.cancellationRate} deltaInvert />
              <Stat label="Ocupación" value={formatPct(facilityCurrentSummary.occupancyRate)} delta={facilityDeltas.occupancyRate} />
              <Stat label="Conversión" value={formatPct(facilityCurrentSummary.conversionRate)} delta={facilityDeltas.conversionRate} />
            </div>
          )}

          <GroupSection title="Consistencia de horarios">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title="Qué partidos no pueden faltar" subtitle="Slots con 75%+ de consistencia se destacan con más color">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-ink-faint">Mes:</span>
                  <MonthPicker paramName="slotMonth" value={slotMonth} />
                </div>
                {mustHave.totalMonthsObserved >= 2 ? (
                  <SlotConsistencyHeatmap days={mustHave.days} hours={mustHave.hours} cells={mustHave.cells} selectedMonthLabel={slotMonth} priorYearLabel={mustHave.priorYearMonth} />
                ) : (
                  <div className="text-sm text-ink-faint">No hay suficiente historial mensual todavía.</div>
                )}
                <div className="mt-4 pt-3 border-t border-surface-sunken space-y-1.5">
                  {mustHave.insights.map((insight, i) => <div key={i} className="text-sm text-ink font-medium">{insight}</div>)}
                </div>
              </SectionCard>

              <SectionCard title="Qué partidos remover o evitar agendar" subtitle="Misma lógica, mirando qué slots cancelan de forma consistente">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-ink-faint">Mes:</span>
                  <MonthPicker paramName="slotMonth" value={slotMonth} />
                </div>
                {avoid.totalMonthsObserved >= 2 ? (
                  <SlotConsistencyHeatmap days={avoid.days} hours={avoid.hours} cells={avoid.cells} selectedMonthLabel={slotMonth} priorYearLabel={avoid.priorYearMonth} />
                ) : (
                  <div className="text-sm text-ink-faint">No hay suficiente historial mensual todavía.</div>
                )}
                <div className="mt-4 pt-3 border-t border-surface-sunken space-y-1.5">
                  {avoid.insights.map((insight, i) => <div key={i} className="text-sm text-ink font-medium">{insight}</div>)}
                </div>
              </SectionCard>
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
            <SectionCard title="Las 4 métricas por formato de partido" subtitle="Formatos fijos (4v4 a 12v12) — el resto agrupado en «Otros»">
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

  const marketName = filterOptions.markets.find((m) => m.id === sp.marketId)?.name ?? "";
  const marketsInRegion = filterOptions.markets.filter((m) => m.regionId === sp.regionId);

  return (
    <div>
      <div className="flex items-start justify-between gap-6 flex-wrap mb-2">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Trends</h1>
          <div className="text-sm text-ink-faint mb-2 max-w-xl">
            Tendencias, consistencia de horarios y patrones estacionales — "¿qué esperar?", no solo "qué pasó".
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
