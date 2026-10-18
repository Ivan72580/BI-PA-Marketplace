import { getTranslations } from "next-intl/server";
import { resolveFilterNames, getFilterOptions, type OverviewFilters } from "../lib/db/queries";
import { nowInBusinessTimeZone } from "../lib/period";
import MarketDashboard from "../components/MarketDashboard";
import MarketRanking from "../components/MarketRanking";
import PageHeader from "../components/PageHeader";
import TabFilters from "../components/TabFilters";

type SP = {
  regionId?: string;
  marketId?: string;
  facilityId?: string;
  view?: string;
  group?: string;
  month?: string;
  shareView?: string; // "map" = vista de mapa del tab Market share
  tab?: string; // deep-link a un tab puntual (ej. desde "ver detalle" en Overview)
};

function buildQuery(current: SP, overrides: Partial<SP>) {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/market?${qs}` : "/market";
}

function todayYearMonth() {
  const now = nowInBusinessTimeZone();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = await getTranslations("Market");
  const filters: OverviewFilters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [names, filterOptions] = await Promise.all([resolveFilterNames(sp), getFilterOptions()]);

  const isRanking = sp.view === "ranking" && (sp.group === "top80" || sp.group === "others");
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayYearMonth();

  return (
    <div>
      {!isRanking && (
        <>
          <PageHeader
            scope={names.facilityName ?? names.marketName ?? names.regionName}
            title={t("title")}
            subtitle={t("subtitle")}
            filter={<TabFilters regions={filterOptions.regions} markets={filterOptions.markets} monthValue={month} />}
          />
        </>
      )}

      {isRanking ? (
        <MarketRanking
          filters={filters}
          group={sp.group as "top80" | "others"}
          month={month}
          buildQuery={(overrides) => buildQuery(sp, overrides)}
        />
      ) : (
        <MarketDashboard sp={sp} filterOptions={filterOptions} month={month} buildQuery={(overrides) => buildQuery(sp, overrides)} activeTab={sp.tab} />
      )}
    </div>
  );
}
