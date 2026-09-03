import Link from "next/link";
import {
  getOverviewData,
  getContributionRanking,
  generateContributionInsights,
  getHourPattern,
  getExtendedMetrics,
  getFacilityTable,
  getConfirmedComposition,
  type FacilitySortKey,
  type OverviewFilters,
} from "../lib/db/queries";
import type { ResolvedPeriod } from "../lib/period";
import { buildQuery, type SP } from "../lib/searchParams";
import BarChart from "./charts/BarChart";
import KpiCard from "./KpiCard";
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

export default async function NetworkOverview({
  sp,
  filters,
  period,
  compare,
  facilitySort,
}: {
  sp: SP;
  filters: OverviewFilters;
  period: ResolvedPeriod;
  compare: boolean;
  facilitySort: FacilitySortKey;
}) {
  const [data, hourPattern, extended, facilityTable, confirmedComposition] = await Promise.all([
    getOverviewData(filters),
    getHourPattern(filters),
    getExtendedMetrics(filters),
    getFacilityTable(filters, facilitySort),
    getConfirmedComposition(filters),
  ]);

  const compareData =
    compare && period.priorDateFrom && period.priorDateTo
      ? await getOverviewData({ ...filters, dateFrom: period.priorDateFrom, dateTo: period.priorDateTo })
      : null;

  const contribution =
    compareData && period.priorDateFrom && period.priorDateTo
      ? await getContributionRanking(
          { regionId: sp.regionId, marketId: sp.marketId },
          { dateFrom: period.dateFrom!, dateTo: period.dateTo! },
          { dateFrom: period.priorDateFrom, dateTo: period.priorDateTo }
        )
      : [];

  const allInsights = [...generateContributionInsights(contribution), ...data.insights];

  const confirmationDelta = compareData ? data.confirmationRate - compareData.confirmationRate : undefined;
  const cancellationDelta = compareData ? data.cancellationRate - compareData.cancellationRate : undefined;

  const gamesByHourChart = {
    labels: data.gamesByHour.map((h) => h.hour),
    datasets: [{ label: "Partidos", data: data.gamesByHour.map((h) => h.count), backgroundColor: "#0d6e4f" }],
  };
  const peakHour = [...data.gamesByHour].sort((a, b) => b.count - a.count)[0];
  const valleyHour = [...data.gamesByHour].sort((a, b) => a.count - b.count)[0];

  // Horarios por tasa: solo tiene sentido comparar horarios entre sí a nivel
  // red (no un heatmap día×hora, que mezclaría canchas muy distintas). No es
  // clickeable como los rankings de facility — un horario no es un destino.
  const MIN_HOUR_SAMPLE = 10;
  const hourRateRows = [...hourPattern]
    .filter((h) => h.totalGames >= MIN_HOUR_SAMPLE)
    .sort((a, b) => b.confirmationRate - a.confirmationRate);
  const maxHourRate = Math.max(1, ...hourRateRows.map((h) => h.confirmationRate));

  const cancellationChart = {
    labels: data.cancellationBreakdown.map((c) => c.label),
    datasets: [{ label: "Cancelaciones", data: data.cancellationBreakdown.map((c) => c.count), backgroundColor: "#b91c1c" }],
  };
  const confirmedCompositionChart = {
    labels: confirmedComposition.segments.map((s) => s.label),
    datasets: [{ label: "Partidos confirmados", data: confirmedComposition.segments.map((s) => s.count), backgroundColor: "#0d6e4f" }],
  };

  // ---------- Tab: Resumen ----------
  const resumenContent = (
    <div className="space-y-5">
      <GroupSection title="Rendimiento">
        <SectionCard title="Insights automáticos">
          <div className="space-y-2">
            {allInsights.map((insight, i) => (
              <div key={i} className="text-sm text-ink font-medium">{insight}</div>
            ))}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label="Partidos agendados" value={data.totalGames.toLocaleString("en-US")} sublabel="confirmados + cancelados, en el período" />
          <KpiCard label="Partidos confirmados" value={data.confirmedGames.toLocaleString("en-US")} tone="brand" />
          <KpiCard label="Partidos cancelados" value={data.cancelledGames.toLocaleString("en-US")} tone="danger" />
          <KpiCard label="Tasa de confirmación" value={formatPct(data.confirmationRate)} delta={confirmationDelta} tone="brand" staticDelta />
          <KpiCard label="Tasa de cancelación" value={formatPct(data.cancellationRate)} delta={cancellationDelta} deltaInvert tone="danger" staticDelta />
          <KpiCard label="Ocupación (confirmados)" value={formatPct(data.avgFillRate)} sublabel="jugadores finales / cupo máximo" />
        </div>
      </GroupSection>

      {!sp.regionId && (
        <GroupSection title="Concentración por región">
          <RegionConcentrationPies filters={filters} buildHref={(regionId) => `/market?regionId=${regionId}`} />
        </GroupSection>
      )}

      <GroupSection title="Composición">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Composición de partidos confirmados" subtitle="Pareto 80/20 por facility: nombradas hasta cubrir el 80%, el resto agrupado en «Otros»">
            <BarChart data={confirmedCompositionChart} />
          </SectionCard>
          <SectionCard title="Motivos de cancelación">
            <BarChart data={cancellationChart} />
          </SectionCard>
        </div>
      </GroupSection>

      <GroupSection title="Satisfacción, precio y organizador">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Satisfacción">
            {extended.avgRating !== null ? (
              <>
                <div className="flex items-end gap-6">
                  <Stat label="Rating promedio" value={extended.avgRating.toFixed(2)} sublabel="de 5" />
                  <Stat label="Reviews" value={extended.totalRatingCount.toLocaleString("en-US")} />
                  <Stat label="Cobertura" value={formatPct(extended.ratingsCoveragePct)} sublabel="de los partidos tiene rating" />
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
              <Stat label="Revenue total" value={formatUSD(data.totalRevenue)} sublabel="dato secundario" />
            </div>
            <Glossary
              items={[
                { term: "Precio promedio", def: "precio cobrado por jugador, promediado sobre los partidos con ese dato cargado." },
                { term: "Revenue total", def: "dato secundario — la base mezcla distintos esquemas de precio, confiabilidad limitada." },
              ]}
            />
          </SectionCard>
        </div>

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
      </GroupSection>
    </div>
  );

  // ---------- Tab: Por horario ----------
  const horarioContent = (
    <div className="space-y-5">
      <GroupSection title="Horario">
        <SectionCard
          title="Horarios por tasa de confirmación"
          subtitle="A nivel red no usamos el heatmap día×hora (mezclaría canchas muy distintas entre sí) — ese detalle queda reservado para cuando filtrás por una facility puntual. Mínimo 10 partidos por horario"
        >
          {hourRateRows.length > 0 ? (
            <div className="space-y-2.5">
              {hourRateRows.map((h) => (
                <div key={h.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ink">{h.label}</span>
                    <span className="text-ink font-medium">
                      {formatPct(h.confirmationRate)} confirmación
                      <span className="text-ink-faint font-normal"> · {formatPct(h.cancellationRate)} cancelación · {h.totalGames} partidos</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                    <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${(h.confirmationRate / maxHourRate) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-ink-faint">Sin datos suficientes.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Partidos por hora"
          subtitle={peakHour && valleyHour ? `Pico: ${peakHour.hour} (${peakHour.count} partidos) · Valle: ${valleyHour.hour} (${valleyHour.count} partidos)` : undefined}
        >
          <BarChart data={gamesByHourChart} />
        </SectionCard>
      </GroupSection>

      <GroupSection title="Operación">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Tiempo de confirmación">
            <Stat label="Lead time típico" value={extended.medianLeadTime !== null ? extended.medianLeadTime.toFixed(1) : "—"} />
            <Glossary items={[{ term: "Lead time típico", def: "mediana (no promedio) del tiempo entre la confirmación y el partido — el dato tiene valores atípicos extremos, en unidades del dataset original." }]} />
          </SectionCard>
          <SectionCard title="Dinámica de demanda">
            <div className="flex items-end gap-6 flex-wrap">
              <Stat label="En lista de espera" value={extended.totalWaitlist.toLocaleString("en-US")} />
              <Stat label="Abandonaron" value={extended.totalDropped.toLocaleString("en-US")} />
              <Stat label="Déficit promedio" value={extended.avgPlayersMissing.toFixed(1)} sublabel={`en ${extended.missingGamesCount.toLocaleString("en-US")} partidos con faltantes`} />
            </div>
            <Glossary
              items={[
                { term: "En lista de espera", def: "jugadores que quedaron esperando cupo." },
                { term: "Abandonaron", def: "jugadores que se anotaron y se bajaron antes del partido." },
                { term: "Déficit promedio", def: "jugadores que faltaban en promedio, solo en partidos con faltantes." },
              ]}
            />
          </SectionCard>
        </div>
      </GroupSection>
    </div>
  );

  // ---------- Tab: Por facility ----------
  const paretoRows: RankingRow[] = data.paretoCancellations.map((f) => ({
    facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
    value: f.value, extra: `${formatPct(f.cumulativePct)} acum.`,
  }));
  const paretoConfirmedRows: RankingRow[] = data.paretoConfirmations.map((f) => ({
    facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
    value: f.value, extra: `${formatPct(f.cumulativePct)} acum.`,
  }));
  const worstRateRows: RankingRow[] = data.worstCancellationRate.map((f) => ({
    facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
    value: Math.round(f.rate * 100), extra: `${f.totalGames} partidos`,
  }));
  const contributionRows: RankingRow[] = contribution.map((f) => ({
    facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, label: f.label,
    value: Math.abs(f.excessCancellations),
    displayValue: `${f.excessCancellations > 0 ? "+" : ""}${f.excessCancellations.toFixed(1)} vs. esperado`,
    extra: `${formatPct(f.priorRate)} → ${formatPct(f.curRate)}`,
  }));

  const sortLink = (key: FacilitySortKey, label: string) => (
    <Link
      href={buildQuery(sp, { facilitySort: key === "games" ? undefined : key })}
      className={`hover:underline ${facilitySort === key ? "text-ink font-medium" : "text-ink-muted"}`}
    >
      {label}
    </Link>
  );

  const facilityContent = (
    <div className="space-y-5">
      <GroupSection title="Rankings">
        {contributionRows.length > 0 && (
          <>
            <RankingCard
              title="Contribución al cambio"
              subtitle={`Cada facility comparada contra su propio comportamiento en ${period.priorLabel} — no contra el promedio de otras`}
              rows={contributionRows}
              buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
              formatValue={(v) => `${v}`}
            />
            <Glossary
              items={[
                { term: "Valor mostrado", def: "cancelaciones de más (o de menos) respecto a lo esperado si esa facility hubiese mantenido su propia tasa histórica — no un ranking contra otras facilities." },
                { term: "% (ej: 24% → 31%)", def: "tasa de cancelación de esa facility en el período anterior vs. en el período actual." },
              ]}
            />
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RankingCard
            title="Concentración de negocio confirmado (Pareto)"
            subtitle={`Estos ${paretoConfirmedRows.length} facilities concentran el ${formatPct(data.paretoConfirmedCoveragePct)} de todos los partidos confirmados`}
            rows={paretoConfirmedRows}
            buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
            formatValue={(v) => `${v} confirmados`}
          />
          <RankingCard
            title="Concentración de cancelaciones (Pareto)"
            subtitle={`Estos ${paretoRows.length} facilities concentran el ${formatPct(data.paretoCoveragePct)} de todas las cancelaciones`}
            rows={paretoRows}
            buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
            formatValue={(v) => `${v} cancelados`}
            tone="danger"
          />
        </div>

        <RankingCard
          title="Peor tasa de cancelación"
          subtitle="Mínimo 10 partidos en el período, para que la tasa sea representativa"
          rows={worstRateRows}
          buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId })}
          formatValue={(v) => `${v}%`}
          tone="danger"
        />
      </GroupSection>

      <GroupSection title="Tabla completa">
        <details className="rounded-2xl bg-surface border border-border p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Todas las facilities <span className="text-ink-faint font-normal">({facilityTable.length} en este filtro — click para desplegar)</span>
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
                      <td className="py-1.5 px-2 text-brand">{f.confirmedGames}</td>
                      <td className="py-1.5 px-2 text-danger">{f.totalGames - f.confirmedGames}</td>
                      <td className="py-1.5 px-2">
                        <span className={f.cancellationRate > 0.35 ? "text-danger" : "text-ink"}>{formatPct(f.cancellationRate)}</span>
                      </td>
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
              ]}
            />
          </div>
        </details>
      </GroupSection>
    </div>
  );

  return (
    <Tabs
      tabs={[
        { id: "resumen", label: "Resumen", content: resumenContent },
        { id: "horario", label: "Por horario", content: horarioContent },
        { id: "facility", label: "Por facility", content: facilityContent },
      ]}
    />
  );
}
