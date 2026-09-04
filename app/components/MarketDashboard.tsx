import Link from "next/link";
import {
  getMarketFacilitySummary,
  getParetoGroups,
  getMarketRanking,
  type OverviewFilters,
  type ReputationTier,
} from "../lib/db/queries";
import PieChart from "./charts/PieChart";
import Glossary from "./Glossary";
import ChangeBadge from "./ChangeBadge";
import Tabs from "./Tabs";
import TabFilters from "./TabFilters";
import RegionConcentrationPies from "./RegionConcentrationPies";

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
    <div className="rounded-2xl bg-surface border border-border p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </div>
  );
}

const TIER_LABEL: Record<ReputationTier, string> = {
  platinum: "Platinum", bueno: "Bueno", intermedio: "Intermedio", a_revisar: "A revisar", sin_datos: "Sin datos suficientes",
};
const TIER_CLASS: Record<ReputationTier, string> = {
  platinum: "bg-[#e0e7ff] text-[#4338ca]",
  bueno: "bg-brand-soft text-brand",
  intermedio: "bg-warning-soft text-warning",
  a_revisar: "bg-danger-soft text-danger",
  sin_datos: "bg-surface-sunken text-ink-faint",
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthRange(month: string): { dateFrom: Date; dateTo: Date } {
  const [y, m] = month.split("-").map(Number);
  return { dateFrom: new Date(Date.UTC(y, m - 1, 1)), dateTo: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
}

const PIE_COLORS = ["#0d6e4f","#16a06a","#2fae7f","#4fbd94","#6fccaa","#8fdbbf","#afe9d4","#cff8e9","#0a5940","#0f8358","#3bab7c","#5fbf98","#83d3b3","#a7e7cf","#cbfbea","#7c8ba1"];

export default async function MarketDashboard({
  sp,
  filterOptions,
  month,
  buildQuery,
}: {
  sp: { regionId?: string; marketId?: string; facilityId?: string };
  filterOptions: { regions: { id: string; name: string }[]; markets: { id: string; name: string; regionId: string }[] };
  month: string;
  buildQuery: (overrides: Record<string, string | undefined>) => string;
}) {
  const baseFilters: Omit<OverviewFilters, "dateFrom" | "dateTo"> = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };
  const { dateFrom, dateTo } = monthRange(month);
  const monthFilters: OverviewFilters = { ...baseFilters, dateFrom, dateTo };

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
    labels: [...pareto.top80.facilities.map((f) => f.name), "Otros"],
    datasets: [{ data: [...pareto.top80.facilities.map((f) => f.count), pareto.others.count], backgroundColor: PIE_COLORS }],
  };

  const reputationRows = [...summary].sort((a, b) => (b.reputationScore ?? -1) - (a.reputationScore ?? -1));
  const priceRows = [...summary].filter((f) => f.avgPrice !== null).sort((a, b) => (b.avgPrice ?? 0) - (a.avgPrice ?? 0));
  const engagementRows = [...summary].sort((a, b) => b.nearMissCancelledCount - a.nearMissCancelledCount);
  const totalNearMiss = summary.reduce((s, f) => s + f.nearMissCancelledCount, 0);
  const totalCancelled = summary.reduce((s, f) => s + f.cancelledGames, 0);

  // ---------- Concentración ----------
  const concentracionContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      {!sp.regionId ? (
        <SectionCard title="Concentración de confirmados por región" subtitle={`${month} — pantallazo general. Clickeá una torta para ver el detalle de esa región`}>
          <RegionConcentrationPies filters={monthFilters} buildHref={(regionId) => buildQuery({ regionId })} />
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Concentración de confirmados (Pareto 80/20)"
            subtitle={`${month} — facilities individuales hasta cubrir el 80% de los partidos confirmados; el resto agrupado en «Otros»`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <PieChart data={paretoChart} showLegend={false} />
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {pareto.top80.facilities.map((f) => (
                  <div key={f.facilityId} className="flex items-center justify-between text-sm">
                    <span className="text-ink truncate mr-2">{f.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-ink-muted">{f.count.toLocaleString("en-US")}</span>
                      {f.changePct !== null && <ChangeBadge value={f.changePct} />}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-1 border-t border-surface-sunken">
                  <span className="text-ink-faint">Otros ({pareto.others.facilityIds.length} facilities)</span>
                  <span className="text-ink-muted">{pareto.others.count.toLocaleString("en-US")}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href={buildQuery({ view: "ranking", group: "top80", month })} className="block rounded-xl border border-border p-4 hover:border-brand transition-colors">
              <div className="text-sm font-medium text-brand">Ver detalle del grupo 80%</div>
              <div className="text-xs text-ink-faint mt-1">{pareto.top80.facilityIds.length} facilities · {formatPct(pareto.top80.pct)} de los confirmados</div>
            </Link>
            <Link href={buildQuery({ view: "ranking", group: "others", month })} className="block rounded-xl border border-border p-4 hover:border-brand transition-colors">
              <div className="text-sm font-medium text-ink-muted">Ver detalle del grupo «Otros» (20%)</div>
              <div className="text-xs text-ink-faint mt-1">{pareto.others.facilityIds.length} facilities · {formatPct(pareto.others.pct)} de los confirmados</div>
            </Link>
          </div>
          <Glossary items={[{ term: "vs. anterior", def: "variación contra el mismo mes del año pasado." }]} />
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
        <SectionCard title="Markets por partidos confirmados" subtitle={`${month} — clickeá un market para ver la participación de sus facilities`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {marketRanking.map((m) => (
              <Link key={m.marketId} href={buildQuery({ marketId: m.marketId })} className="block rounded-2xl bg-surface border border-border p-4 hover:border-brand transition-colors">
                <div className="text-sm font-medium text-brand">{m.marketName}</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="font-display text-xl font-semibold text-ink">{m.confirmedGames.toLocaleString("en-US")}</div>
                  <ChangeBadge value={m.changePct} />
                </div>
                <div className="text-xs text-ink-faint mt-0.5">partidos confirmados</div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {sp.marketId && (
        <SectionCard title="Participación por facility" subtitle={`${month} — % de los partidos confirmados de este market que representa cada facility. Clickeá una facility para ver su consistencia de horarios en Trends`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {marketShareTarget.map((f) => {
              const priorShare = facilityShareCompare?.get(f.facilityId) ?? null;
              const shareChange = priorShare !== null && priorShare > 0 ? (f.marketSharePct - priorShare) / priorShare : null;
              const trendsHref = `/trends?${new URLSearchParams({ facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId }).toString()}`;
              return (
                <Link key={f.facilityId} href={trendsHref} className="block rounded-2xl bg-surface border border-border p-4 hover:border-brand transition-colors">
                  <div className="text-sm font-medium text-brand">{f.name}</div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div className="font-display text-xl font-semibold text-ink">{formatPct(f.marketSharePct)}</div>
                    <ChangeBadge value={shareChange} />
                  </div>
                  <div className="text-xs text-ink-faint mt-0.5">{f.confirmedGames.toLocaleString("en-US")} confirmados</div>
                </Link>
              );
            })}
            {marketShareTarget.length === 0 && <div className="text-sm text-ink-faint">Sin partidos confirmados en este market para el mes elegido.</div>}
          </div>
        </SectionCard>
      )}
      <Glossary items={[{ term: "vs. anterior", def: "variación contra el mes calendario inmediatamente anterior (no año anterior)." }]} />
    </div>
  );

  // ---------- Reputación ----------
  const reputacionContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      <SectionCard title="Reputación y ranking" subtitle={`${month} — score compuesto de confirmación + ocupación + conversión. Ranking por región/market: solo cantidad de partidos confirmados`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">Facility</th>
                <th className="py-1.5 px-2 font-normal">Nivel</th>
                <th className="py-1.5 px-2 font-normal">Confirmados</th>
                <th className="py-1.5 px-2 font-normal">Rank en región</th>
                <th className="py-1.5 px-2 font-normal">Rank en market</th>
              </tr>
            </thead>
            <tbody>
              {reputationRows.slice(0, 50).map((f) => (
                <tr key={f.facilityId} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2">
                    <Link href={buildQuery({ facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId, view: undefined, group: undefined })} className="text-brand hover:underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="py-1.5 px-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${TIER_CLASS[f.reputationTier]}`}>{TIER_LABEL[f.reputationTier]}</span></td>
                  <td className="py-1.5 px-2 text-ink">{f.confirmedGames}</td>
                  <td className="py-1.5 px-2 text-ink-muted">{f.regionRank ? `#${f.regionRank} de ${f.regionTotal}` : "—"}</td>
                  <td className="py-1.5 px-2 text-ink-muted">{f.marketRank ? `#${f.marketRank} de ${f.marketTotal}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Glossary
          items={[
            { term: "Platinum", def: "más de 1.5 desvíos estándar sobre el promedio de la red — solo aparece si existe ese grupo." },
            { term: "Bueno / Intermedio / A revisar", def: "posición relativa contra el promedio de la red." },
            { term: "Sin datos suficientes", def: "menos de 10 partidos en el mes — no alcanza para un score confiable." },
          ]}
        />
      </SectionCard>
    </div>
  );

  // ---------- Precio ----------
  const precioContent = (
    <div className="space-y-5">
      <TabFilters regions={filterOptions.regions} markets={filterOptions.markets} />
      <SectionCard title="Ticket promedio, jugadores por día y gross profit estimado" subtitle={`${month} — gross profit = ticket promedio × jugadores promedio por día × días del mes`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">Facility</th>
                <th className="py-1.5 px-2 font-normal">Ticket promedio</th>
                <th className="py-1.5 px-2 font-normal">Jugadores/día</th>
                <th className="py-1.5 px-2 font-normal">Gross profit estimado</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.slice(0, 30).map((f) => (
                <tr key={f.facilityId} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2 text-ink">{f.name}</td>
                  <td className="py-1.5 px-2 text-ink">{formatUSD2(f.avgPrice ?? 0)}</td>
                  <td className="py-1.5 px-2 text-ink">{f.avgDailyPlayers !== null ? f.avgDailyPlayers.toFixed(1) : "—"}</td>
                  <td className="py-1.5 px-2 text-ink">{f.grossProfitEstimate !== null ? formatUSD(f.grossProfitEstimate) : "—"}</td>
                </tr>
              ))}
              {priceRows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-ink-faint">Sin datos de precio en este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        <Glossary
          items={[
            { term: "Ticket promedio", def: "precio promedio cobrado por jugador, sin redondear." },
            { term: "Jugadores/día", def: "jugadores confirmados totales del mes / cantidad de días del mes." },
            { term: "Gross profit estimado", def: "ticket promedio × jugadores/día × días del mes — cálculo simple, no contempla costos de la facility (no disponibles en esta base)." },
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
        <span className="font-semibold">{totalNearMiss.toLocaleString("en-US")}</span> de {totalCancelled.toLocaleString("en-US")} partidos cancelados en {month} ({totalCancelled > 0 ? formatPct(totalNearMiss / totalCancelled) : "0%"}) habían llegado a la mitad o más del mínimo de jugadores necesario.
      </div>
      <SectionCard title="Engagement y abandono por facility">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">Facility</th>
                <th className="py-1.5 px-2 font-normal">Conversión</th>
                <th className="py-1.5 px-2 font-normal">Abandono</th>
                <th className="py-1.5 px-2 font-normal">Cancelados &quot;casi llegan&quot;</th>
              </tr>
            </thead>
            <tbody>
              {engagementRows.slice(0, 30).map((f) => (
                <tr key={f.facilityId} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2 text-ink">{f.name}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(f.conversionRate)}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(f.abandonmentRate)}</td>
                  <td className="py-1.5 px-2 text-ink-muted">{f.nearMissCancelledCount} ({f.cancelledGames > 0 ? formatPct(f.nearMissCancelledPct) : "—"})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-3 border-t border-surface-sunken space-y-1.5">
          <div className="text-[11px] text-ink-faint"><span className="font-medium text-ink-muted">Conversión:</span> jugadores finales / (finales + abandonos) — proxy a nivel partido, no seguimiento de jugador individual.</div>
          <div className="text-[11px] text-ink-faint"><span className="font-medium text-ink-muted">Abandono:</span> de los jugadores que se anotaron, qué % se bajó antes del partido.</div>
          <div className="text-[11px] text-ink-faint"><span className="font-medium text-ink-muted">Cancelados &quot;casi llegan&quot;:</span> partidos cancelados que habían llegado al 50% o más del mínimo de jugadores necesario — señal de que podría convenir consolidar horarios en vez de ofrecer tantos en paralelo.</div>
        </div>
      </SectionCard>
    </div>
  );

  return (
    <Tabs
      tabs={[
        { id: "concentracion", label: "Concentración", content: concentracionContent },
        { id: "share", label: "Market share", content: marketShareContent },
        { id: "reputacion", label: "Reputación", content: reputacionContent },
        { id: "precio", label: "Precio", content: precioContent },
        { id: "engagement", label: "Engagement", content: engagementContent },
      ]}
    />
  );
}
