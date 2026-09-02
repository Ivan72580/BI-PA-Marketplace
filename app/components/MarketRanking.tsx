import Link from "next/link";
import { getParetoGroups, getMonthlyFacilityRanking, type OverviewFilters } from "../lib/db/queries";
import MonthPicker from "./MonthPicker";
import Glossary from "./Glossary";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function MarketRanking({
  filters,
  group,
  month,
  buildQuery,
}: {
  filters: OverviewFilters;
  group: "top80" | "others";
  month: string;
  buildQuery: (overrides: Record<string, string | undefined>) => string;
}) {
  const pareto = await getParetoGroups(filters);
  const target = group === "top80" ? pareto.top80 : pareto.others;
  const rows = await getMonthlyFacilityRanking(target.facilityIds, month);

  return (
    <div>
      <Link href={buildQuery({ view: undefined, group: undefined, month: undefined })} className="text-sm text-brand mb-4 inline-block">
        ‹ Volver a Market
      </Link>

      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {group === "top80" ? "Grupo 80% — facilities que concentran el negocio" : "Grupo «Otros» (20%)"}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-faint">Mes:</span>
          <MonthPicker paramName="month" value={month} />
        </div>
      </div>
      <div className="text-sm text-ink-faint mb-5">{target.facilityIds.length} facilities en este grupo</div>

      <div className="rounded-2xl bg-surface border border-border p-5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">Facility</th>
                <th className="py-1.5 px-2 font-normal">Confirmados</th>
                <th className="py-1.5 px-2 font-normal">Cancelados</th>
                <th className="py-1.5 px-2 font-normal">Conversión</th>
                <th className="py-1.5 px-2 font-normal">Lead time</th>
                <th className="py-1.5 px-2 font-normal">Waitlist prom.</th>
                <th className="py-1.5 px-2 font-normal">Ocupación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.facilityId} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2">
                    <Link href={buildQuery({ facilityId: r.facilityId, view: undefined, group: undefined, month: undefined })} className="text-brand hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-1.5 px-2 text-brand">{r.confirmedGames}</td>
                  <td className="py-1.5 px-2 text-danger">{r.cancelledGames}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(r.conversionRate)}</td>
                  <td className="py-1.5 px-2 text-ink">{r.medianLeadTime !== null ? r.medianLeadTime.toFixed(1) : "—"}</td>
                  <td className="py-1.5 px-2 text-ink">{r.avgWaitlist !== null ? r.avgWaitlist.toFixed(1) : "—"}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(r.occupancyRate)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-ink-faint">Sin partidos en este grupo para el mes elegido.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Glossary
          items={[
            { term: "Conversión", def: "jugadores finales / (finales + abandonos) — proxy a nivel partido, ver detalle completo en Trends." },
            { term: "Lead time", def: "mediana del tiempo entre confirmación y partido, en unidades del dataset original." },
            { term: "Waitlist prom.", def: "promedio de jugadores en lista de espera por partido, en el mes." },
          ]}
        />
      </div>
    </div>
  );
}
