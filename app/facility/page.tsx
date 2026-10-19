import { getTranslations } from "next-intl/server";
import { getFilterOptions, getFacilityNow } from "../lib/db/queries";
import Facility360Landing from "../components/Facility360Landing";
import Facility360Header from "../components/Facility360Header";
import Facility360Now from "../components/Facility360Now";

type SP = { facilityId?: string; regionId?: string; marketId?: string; date?: string };

// Análisis de facility: una sola página con todas las capas (de lo más reciente a lo más profundo). Sin
// facility elegida muestra la entrada (buscador, facilities a revisar y recorrido por zona).
export default async function FacilityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filterOptions = await getFilterOptions();

  if (!sp.facilityId) {
    return <Facility360Landing sp={sp} regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} />;
  }

  const [data, t] = await Promise.all([getFacilityNow(sp.facilityId, sp.date), getTranslations("Facility360")]);
  if (!data) {
    return (
      <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted">
        {t("header.notFound")}
      </div>
    );
  }

  return (
    <div>
      <Facility360Header data={data} dateParam={sp.date} facilities={filterOptions.facilities} markets={filterOptions.markets} />
      <div className="space-y-8">
        <Facility360Now data={data} />
      </div>
    </div>
  );
}
