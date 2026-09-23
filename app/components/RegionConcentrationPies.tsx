import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getParetoGroups, getFilterOptions, type OverviewFilters } from "../lib/db/queries";
import PieChart from "./charts/PieChart";

const PIE_COLORS = [
  "#0b3b2e", "#104834", "#15543b", "#1a6141", "#1e6d47", "#237a4e", "#288654", "#2d935a",
  "#329f60", "#37ac67", "#3bb86d", "#40c573", "#45d17a", "#4ade80", "#a7e7cf", "#7c8ba1",
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
  const t = await getTranslations("Market");
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
        <div key={r.regionId} className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
          <h3 className="text-sm font-medium text-ink mb-0.5">{t("regionPies.title", { region: r.regionName })}</h3>
          <p className="text-xs text-ink-faint mb-4">{t("regionPies.subtitle")}</p>
          <Link href={buildHref(r.regionId)} className="block">
            <PieChart
              data={{
                labels: [...r.pareto.top80.facilities.map((f) => f.name), t("othersChartLabel")],
                datasets: [{
                  data: [...r.pareto.top80.facilities.map((f) => f.count), r.pareto.others.count],
                  backgroundColor: PIE_COLORS,
                }],
              }}
              showLegend={false}
            />
          </Link>
          <div className="text-xs text-ink-faint mt-2 text-center">
            {t("regionPies.summary", { total: r.pareto.total.toLocaleString("en-US"), n: r.pareto.top80.facilityIds.length, pct: formatPct(r.pareto.top80.pct) })}
          </div>
        </div>
      ))}
    </div>
  );
}
