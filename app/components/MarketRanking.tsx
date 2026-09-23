import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("Market.ranking");
  const pareto = await getParetoGroups(filters);
  const target = group === "top80" ? pareto.top80 : pareto.others;
  const rows = await getMonthlyFacilityRanking(target.facilityIds, month);

  return (
    <div>
      <Link href={buildQuery({ view: undefined, group: undefined, month: undefined })} className="text-sm text-brand mb-4 inline-block">
        {t("backToMarket")}
      </Link>

      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {group === "top80" ? t("groupTitleTop80") : t("groupTitleOthers")}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-faint">{t("monthLabel")}</span>
          <MonthPicker paramName="month" value={month} />
        </div>
      </div>
      <div className="text-sm text-ink-faint mb-5">{t("facilitiesInGroup", { n: target.facilityIds.length })}</div>

      <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">{t("headers.facility")}</th>
                <th className="py-1.5 px-2 font-normal">{t("headers.confirmed")}</th>
                <th className="py-1.5 px-2 font-normal">{t("headers.cancelled")}</th>
                <th className="py-1.5 px-2 font-normal">{t("headers.conversion")}</th>
                <th className="py-1.5 px-2 font-normal">{t("headers.leadTime")}</th>
                <th className="py-1.5 px-2 font-normal">{t("headers.avgWaitlist")}</th>
                <th className="py-1.5 px-2 font-normal">{t("headers.occupancy")}</th>
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
                  <td className="py-1.5 px-2 text-ink">{r.confirmedGames}</td>
                  <td className="py-1.5 px-2 text-ink">{r.cancelledGames}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(r.conversionRate)}</td>
                  <td className="py-1.5 px-2 text-ink">{r.medianLeadTime !== null ? r.medianLeadTime.toFixed(1) : "—"}</td>
                  <td className="py-1.5 px-2 text-ink">{r.avgWaitlist !== null ? r.avgWaitlist.toFixed(1) : "—"}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(r.occupancyRate)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-ink-faint">{t("empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Glossary
          items={[
            { term: t("glossary.conversion.term"), def: t("glossary.conversion.def") },
            { term: t("glossary.leadTime.term"), def: t("glossary.leadTime.def") },
            { term: t("glossary.avgWaitlist.term"), def: t("glossary.avgWaitlist.def") },
          ]}
        />
      </div>
    </div>
  );
}
