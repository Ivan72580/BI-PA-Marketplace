import Link from "next/link";
import {
  getOverviewData,
  getDayHourHeatmap,
  getGameList,
  getExtendedMetrics,
  getFacilitySeries,
  getFacilityContext,
  getFacilityTable,
  getFormatBreakdown,
  type OverviewFilters,
} from "../lib/db/queries";
import { resolveEvolutionWindow, type ResolvedPeriod, type Granularity } from "../lib/period";
import BarChart from "./charts/BarChart";
import EvolutionChart from "./charts/EvolutionChart";
import Heatmap from "./Heatmap";
import GameList from "./GameList";
import KpiCard from "./KpiCard";
import GroupSection from "./GroupSection";
import Glossary from "./Glossary";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
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

function deviationLabel(facilityRate: number, networkRate: number, goodIsHigh: boolean): string {
  const diffPoints = (facilityRate - networkRate) * 100;
  if (Math.abs(diffPoints) < 0.5) return `en línea con el promedio de la red (${(networkRate * 100).toFixed(1)}%)`;
  const better = goodIsHigh ? diffPoints > 0 : diffPoints < 0;
  const dir = diffPoints > 0 ? "por encima" : "por debajo";
  return `${Math.abs(diffPoints).toFixed(1)} puntos ${dir} del promedio de la red (${(networkRate * 100).toFixed(1)}%)${better ? " ✓" : ""}`;
}

export default async function FacilityDetailView({
  facilityId,
  filters,
  period,
  granularity,
  compare,
  comparePeriod,
  heatmapMetric,
  monthProjection,
  buildHref,
}: {
  facilityId: string;
  filters: OverviewFilters;
  period: ResolvedPeriod;
  granularity: Granularity;
  compare: boolean;
  comparePeriod: ResolvedPeriod | null;
  heatmapMetric: "count" | "rate" | "confirmed";
  monthProjection: {
    monthLabel: string;
    totalSoFar: number;
    confirmedSoFar: number;
    cancelledSoFar: number;
    confirmationRateSoFar: number | null;
    cancellationRateSoFar: number | null;
  };
  buildHref: (overrides: Record<string, string | undefined>) => string;
}) {
  const context = await getFacilityContext(facilityId);
  const evolutionWindow = resolveEvolutionWindow(granularity, period.dateTo);

  const [data, heatmap, gameList, extended, evolutionSeries, networkBaseline, formatBreakdown] = await Promise.all([
    getOverviewData(filters),
    getDayHourHeatmap(filters),
    getGameList(filters, 100),
    getExtendedMetrics(filters),
    getFacilitySeries(facilityId, evolutionWindow.unit, evolutionWindow.windowStart, evolutionWindow.windowEnd),
    getOverviewData({ dateFrom: period.dateFrom, dateTo: period.dateTo }), // sin filtros: promedio de toda la red
    getFormatBreakdown(filters),
  ]);

  const compareData =
    compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
      ? await getOverviewData({ ...filters, dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo })
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
    datasets: [{ label: "Cancelaciones", data: data.cancellationBreakdown.map((c) => c.count), backgroundColor: "#b91c1c" }],
  };

  const evolutionChartData = {
    labels: evolutionSeries.map((m) => m.label),
    datasets: [
      { label: "Tasa de confirmación", data: evolutionSeries.map((m) => Math.round(m.confirmationRate * 1000) / 10), borderColor: "#0d6e4f", backgroundColor: "rgba(13,110,79,0.1)", tension: 0.3 },
      { label: "Tasa de cancelación", data: evolutionSeries.map((m) => Math.round(m.cancellationRate * 1000) / 10), borderColor: "#b91c1c", backgroundColor: "rgba(185,28,28,0.1)", tension: 0.3 },
    ],
  };
  const evolutionUnitLabel = evolutionWindow.unit === "week" ? "semanal" : "mensual";
  const evolutionWindowLabel =
    granularity === "week" || granularity === "day"
      ? "últimas 6 semanas"
      : granularity === "all" || granularity === "year"
      ? "último año"
      : "últimos 6 meses";

  return (
    <div className="space-y-5">
      {/* Estado actual del mes en curso: introduce y contextualiza el resto de la página */}
      <div className="rounded-2xl bg-surface border border-border p-5">
        <h3 className="text-sm font-medium text-ink mb-2">Estado actual — {monthProjection.monthLabel}</h3>
        {monthProjection.totalSoFar > 0 && monthProjection.confirmationRateSoFar !== null && monthProjection.cancellationRateSoFar !== null ? (
          <p className="text-sm text-ink leading-relaxed">
            Este mes lleva una <span className="font-semibold text-brand">tasa de confirmación del {formatPct(monthProjection.confirmationRateSoFar)}</span>
            {" "}({monthProjection.confirmedSoFar} de {monthProjection.totalSoFar} partidos programados), con{" "}
            <span className="font-semibold text-ink">{formatPct(monthProjection.cancellationRateSoFar)} de cancelación</span>
            {" "}({monthProjection.cancelledSoFar} partidos)
            {historicalAvgConfirmationRate !== null && (
              <>
                {", "}
                {Math.abs(monthProjection.confirmationRateSoFar - historicalAvgConfirmationRate) * 100 >= 3
                  ? monthProjection.confirmationRateSoFar > historicalAvgConfirmationRate
                    ? `por encima de su promedio histórico de confirmación (${formatPct(historicalAvgConfirmationRate)})`
                    : `por debajo de su promedio histórico de confirmación (${formatPct(historicalAvgConfirmationRate)})`
                  : `en línea con su promedio histórico (${formatPct(historicalAvgConfirmationRate)})`}
                .
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-ink-faint">Todavía no hay partidos registrados este mes para esta facility.</p>
        )}
      </div>

      <GroupSection title="Rendimiento">
        <SectionCard title="Insights automáticos">
          <div className="space-y-2">
            {data.insights.map((insight, i) => (
              <div key={i} className="text-sm text-ink font-medium">{insight}</div>
            ))}
          </div>
        </SectionCard>

        {/* KPIs con desviación respecto al promedio de la red */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label="Partidos agendados" value={data.totalGames.toLocaleString("en-US")} sublabel="confirmados + cancelados, en el período" />
          <KpiCard label="Partidos confirmados" value={data.confirmedGames.toLocaleString("en-US")} tone="brand" />
          <KpiCard label="Partidos cancelados" value={data.cancelledGames.toLocaleString("en-US")} tone="danger" />
          <KpiCard
            label="Tasa de confirmación"
            value={formatPct(data.confirmationRate)}
            sublabel={deviationLabel(data.confirmationRate, networkBaseline.confirmationRate, true)}
            delta={confirmationDelta}
            tone="brand"
          />
          <KpiCard
            label="Tasa de cancelación"
            value={formatPct(data.cancellationRate)}
            sublabel={deviationLabel(data.cancellationRate, networkBaseline.cancellationRate, false)}
            delta={cancellationDelta}
            deltaInvert
            tone="danger"
          />
          <KpiCard label="Ocupación (confirmados)" value={formatPct(data.avgFillRate)} sublabel="jugadores finales / cupo máximo" />
        </div>

        {/* Posición relativa dentro de su propio market */}
        {context && positionIndex >= 0 && (
          <div className="rounded-xl bg-surface-panel border border-border px-5 py-3 text-sm text-ink">
            Es la <span className="font-semibold">#{positionIndex + 1} de {marketPeers.length}</span> facilities de <span className="font-medium">{context.marketName}</span> por tasa de cancelación
            {positionIndex < 3 && marketPeers.length > 5 && <span className="text-danger"> — entre las peores de su market</span>}
            {positionIndex >= marketPeers.length - 3 && marketPeers.length > 5 && <span className="text-brand"> — entre las mejores de su market</span>}
          </div>
        )}
      </GroupSection>

      <GroupSection title="Evolución en el tiempo">
        <SectionCard title={`Evolución ${evolutionUnitLabel}`} subtitle={`Confirmación y cancelación, ${evolutionWindowLabel} — se adapta según el filtro de tiempo activo`}>
          {evolutionSeries.length > 1 ? (
            <EvolutionChart data={evolutionChartData} />
          ) : (
            <div className="text-sm text-ink-faint">No hay suficiente historial todavía para graficar una evolución.</div>
          )}
        </SectionCard>
      </GroupSection>

      <GroupSection title="Cancelaciones">
        <SectionCard title="Motivos de cancelación">
          <BarChart data={cancellationChart} />
        </SectionCard>

        <SectionCard
          title="Demanda y cancelación por día y horario"
          subtitle="Pasá el mouse por una celda de cancelación para ver el desglose de motivos"
          action={
            <div className="flex gap-1.5 text-xs">
              <Link href={buildHref({ heatmapMetric: undefined })} className={`px-2.5 py-1 rounded-md ${heatmapMetric === "rate" ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted"}`}>Cancelación</Link>
              <Link href={buildHref({ heatmapMetric: "confirmed" })} className={`px-2.5 py-1 rounded-md ${heatmapMetric === "confirmed" ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted"}`}>Confirmados</Link>
              <Link href={buildHref({ heatmapMetric: "count" })} className={`px-2.5 py-1 rounded-md ${heatmapMetric === "count" ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted"}`}>Volumen total</Link>
            </div>
          }
        >
          <Heatmap days={heatmap.days} hours={heatmap.hours} cells={heatmap.cells} maxCount={heatmap.maxCount} metric={heatmapMetric} />
        </SectionCard>
      </GroupSection>

      <GroupSection title="Demanda y operación">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Tiempo de confirmación">
            <Stat label="Lead time típico" value={extended.medianLeadTime !== null ? extended.medianLeadTime.toFixed(1) : "—"} />
            <Glossary items={[{ term: "Lead time típico", def: "mediana (no promedio) del tiempo entre la confirmación y el partido — el dato tiene valores atípicos extremos que distorsionan un promedio simple, en unidades del dataset original." }]} />
          </SectionCard>
          <SectionCard title="Dinámica de demanda">
            <div className="flex items-end gap-6 flex-wrap">
              <Stat label="En lista de espera" value={extended.totalWaitlist.toLocaleString("en-US")} />
              <Stat label="Abandonaron" value={extended.totalDropped.toLocaleString("en-US")} />
              <Stat label="Déficit promedio" value={extended.avgPlayersMissing.toFixed(1)} sublabel={`en ${extended.missingGamesCount} partidos con faltantes`} />
            </div>
            <Glossary
              items={[
                { term: "En lista de espera", def: "jugadores que quedaron esperando cupo en partidos de este filtro." },
                { term: "Abandonaron", def: "jugadores que se anotaron y luego se bajaron antes del partido." },
                { term: "Déficit promedio", def: "cuántos jugadores faltaban en promedio, solo contando partidos donde faltó gente." },
              ]}
            />
          </SectionCard>
        </div>

        <SectionCard
          title="Formato de partidos"
          subtitle="Formatos fijos (4v4 a 12v12) según Max Players — el resto se agrupa en «Otros»"
        >
          {formatBreakdown.length > 0 ? (
            <div className="space-y-2">
              {formatBreakdown.map((f) => (
                <div key={f.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{f.label}</span>
                  <span className="text-ink-muted">{f.count} partidos · {formatPct(f.pct)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-ink-faint">Sin datos suficientes en este filtro.</div>
          )}
        </SectionCard>
      </GroupSection>

      <GroupSection title="Satisfacción y precio">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Satisfacción">
            {extended.avgRating !== null ? (
              <>
                <div className="flex items-end gap-6">
                  <Stat label="Rating promedio" value={extended.avgRating.toFixed(2)} sublabel="de 5" />
                  <Stat label="Reviews" value={extended.totalRatingCount.toLocaleString("en-US")} />
                  <Stat label="Cobertura" value={formatPct(extended.ratingsCoveragePct)} />
                </div>
                <Glossary
                  items={[
                    { term: "Rating promedio", def: "promedio ponderado por cantidad de reviews de cada partido." },
                    { term: "Cobertura", def: "% de los partidos de este filtro que tiene al menos un rating cargado." },
                  ]}
                />
              </>
            ) : (
              <div className="text-sm text-ink-faint">Sin datos de rating en este filtro.</div>
            )}
          </SectionCard>
          <SectionCard title="Precio y revenue">
            <div className="flex items-end gap-6">
              <Stat label="Precio promedio" value={extended.avgPrice !== null ? formatUSD(extended.avgPrice) : "—"} sublabel="por jugador" />
              <Stat label="Revenue total" value={formatUSD(data.totalRevenue)} />
            </div>
            <Glossary
              items={[
                { term: "Precio promedio", def: "precio cobrado por jugador, promediado sobre los partidos con ese dato cargado." },
                { term: "Revenue total", def: "dato secundario — la base mezcla distintos esquemas de precio, confiabilidad limitada." },
              ]}
            />
          </SectionCard>
        </div>
      </GroupSection>

      <GroupSection title="Detalle">
        <GameList items={gameList.items} total={gameList.total} showFacility={false} />
      </GroupSection>
    </div>
  );
}
