import { getTranslations } from "next-intl/server";
import { getFilterOptions } from "../lib/db/queries";
import { getGameReviewSatisfaction, computePlayerComplaintsSummary } from "../lib/db/satisfaction";
import FilterPanel from "../components/FilterPanel";
import PageHeader from "../components/PageHeader";
import GameReviewsPanel from "../components/GameReviewsPanel";

type SP = { regionId?: string; marketId?: string; facilityId?: string };

// Satisfacción de jugadores: reviews de los partidos (rating y tags), por alcance. Las reviews de la app en las
// tiendas quedaron fuera de esta vista (siguen en el Panel Ejecutivo). Sin período: son sobre todo el historial
// disponible, como en el resto de Satisfacción.
export default async function SatisfactionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const scope = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };
  const [t, filterOptions, data] = await Promise.all([
    getTranslations("SatisfactionPage"),
    getFilterOptions(),
    getGameReviewSatisfaction(scope),
  ]);
  const complaints = computePlayerComplaintsSummary(data.summary);

  const regionName = sp.regionId ? filterOptions.regions.find((r) => r.id === sp.regionId)?.name : undefined;
  const marketName = sp.marketId ? filterOptions.markets.find((m) => m.id === sp.marketId)?.name : undefined;
  const facilityName = sp.facilityId ? filterOptions.facilities.find((f) => f.id === sp.facilityId)?.name : undefined;
  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        scope={facilityName ?? marketName ?? regionName}
        title={t("title")}
        subtitle={t("subtitle")}
        filter={
          <FilterPanel
            regions={filterOptions.regions}
            markets={filterOptions.markets}
            facilities={filterOptions.facilities}
            showTimeControls={false}
            hasFilter={hasFilter}
            clearHref="/satisfaction"
          />
        }
      />
      <GameReviewsPanel
        summary={data.summary}
        complaints={complaints}
        facilityFieldQuality={data.facilityFieldQuality}
        recentReviews={data.recentReviews}
        showRanking={!sp.facilityId}
      />
    </div>
  );
}
