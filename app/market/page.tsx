import Link from "next/link";
import { resolveFilterNames, getFilterOptions, type OverviewFilters } from "../lib/db/queries";
import MarketDashboard from "../components/MarketDashboard";
import MarketRanking from "../components/MarketRanking";

type SP = {
  regionId?: string;
  marketId?: string;
  facilityId?: string;
  view?: string;
  group?: string;
  month?: string;
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
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: OverviewFilters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [names, filterOptions] = await Promise.all([resolveFilterNames(sp), getFilterOptions()]);

  const isRanking = sp.view === "ranking" && (sp.group === "top80" || sp.group === "others");
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayYearMonth();

  return (
    <div>
      {!isRanking && (
        <>
          <div className="flex flex-wrap gap-1.5 text-sm mb-2">
            <Link href={buildQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })} className={sp.regionId ? "text-brand" : "text-ink font-medium"}>
              Todas las regiones
            </Link>
            {names.regionName && (
              <>
                <span className="text-ink-faint">›</span>
                <Link href={buildQuery(sp, { marketId: undefined, facilityId: undefined })} className={sp.marketId ? "text-brand" : "text-ink font-medium"}>
                  {names.regionName}
                </Link>
              </>
            )}
            {names.marketName && (
              <>
                <span className="text-ink-faint">›</span>
                <Link href={buildQuery(sp, { facilityId: undefined })} className={sp.facilityId ? "text-brand" : "text-ink font-medium"}>
                  {names.marketName}
                </Link>
              </>
            )}
            {names.facilityName && (
              <>
                <span className="text-ink-faint">›</span>
                <span className="text-ink font-medium">{names.facilityName}</span>
              </>
            )}
          </div>

          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Market</h1>
          <div className="text-sm text-ink-faint mb-5">Concentración, participación, reputación, precio y engagement por facility</div>
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
        <MarketDashboard sp={sp} filterOptions={filterOptions} month={month} buildQuery={(overrides) => buildQuery(sp, overrides)} />
      )}
    </div>
  );
}
