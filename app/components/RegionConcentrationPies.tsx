import Link from "next/link";
import { getParetoGroups, getFilterOptions, type OverviewFilters } from "../lib/db/queries";
import PieChart from "./charts/PieChart";

const PIE_COLORS = [
  "#0d6e4f", "#16a06a", "#2fae7f", "#4fbd94", "#6fccaa", "#8fdbbf", "#afe9d4", "#cff8e9",
  "#0a5940", "#0f8358", "#3bab7c", "#5fbf98", "#83d3b3", "#a7e7cf", "#cbfbea", "#7c8ba1",
];

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function RegionConcentrationPies({
  filters,
  buildHref,
}: {
  filters: Omit<OverviewFilters, "regionId">;
  buildHref: (regionId: string) => string;
}) {
  const filterOptions = await getFilterOptions();
  const results = await Promise.all(
    filterOptions.regions.map(async (r) => ({
      regionId: r.id,
      regionName: r.name,
      pareto: await getParetoGroups({ ...filters, regionId: r.id }),
    }))
  );
  const regionPies = results.filter((r) => r.pareto.total > 0);

  if (regionPies.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 ${regionPies.length > 1 ? "lg:grid-cols-2" : ""} gap-5`}>
      {regionPies.map((r) => (
        <div key={r.regionId} className="rounded-2xl bg-surface border border-border p-5">
          <h3 className="text-sm font-medium text-ink mb-0.5">Concentración de confirmados — {r.regionName}</h3>
          <p className="text-xs text-ink-faint mb-4">Pareto 80/20 — clickeá para ver el detalle completo</p>
          <Link href={buildHref(r.regionId)} className="block">
            <PieChart
              data={{
                labels: [...r.pareto.top80.facilities.map((f) => f.name), "Otros"],
                datasets: [{
                  data: [...r.pareto.top80.facilities.map((f) => f.count), r.pareto.others.count],
                  backgroundColor: PIE_COLORS,
                }],
              }}
              showLegend={false}
            />
          </Link>
          <div className="text-xs text-ink-faint mt-2 text-center">
            {r.pareto.top80.facilityIds.length} facilities concentran el {formatPct(r.pareto.top80.pct)}
          </div>
        </div>
      ))}
    </div>
  );
}
