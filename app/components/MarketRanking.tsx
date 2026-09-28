import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getParetoGroups, getMonthlyFacilityRanking, type OverviewFilters } from "../lib/db/queries";
import MonthPicker from "./MonthPicker";
import Glossary from "./Glossary";
import MonthlyRankingTable from "./MonthlyRankingTable";

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
        <MonthlyRankingTable rows={rows} />
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
