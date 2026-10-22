import { getTranslations } from "next-intl/server";
import { listFacilityProfileStatus } from "../lib/db/queries";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { hasLevel } from "../lib/module";
import PageHeader from "../components/PageHeader";
import FacilityProfileTable from "./FacilityProfileTable";
import TeamRegionBar from "../components/TeamRegionBar";
import { getTeamRegionIds } from "../lib/db/teamRegions";
import { getFilterOptions } from "../lib/db/queries";

// El acceso (módulo Equipo) se valida en layout.tsx.
export default async function FacilityProfilesPage() {
  const [allRows, t, current, regionIds, { regions }] = await Promise.all([
    listFacilityProfileStatus(), getTranslations("FacilityProfile"), getCurrentUserWithAccess(), getTeamRegionIds(), getFilterOptions(),
  ]);
  const chosen = new Set(regions.filter((r) => regionIds.includes(r.id)).map((r) => r.name));
  const rows = chosen.size ? allRows.filter((r) => chosen.has(r.regionName)) : allRows;
  const canEdit = hasLevel(current?.access.TEAM, "EDIT");

  return (
    <div>
      <PageHeader title={t("listTitle")} subtitle={t("listSubtitle")} />
      <div className="mb-3"><TeamRegionBar regions={regions} selected={regionIds} /></div>
      <FacilityProfileTable rows={rows} canEdit={canEdit} />
    </div>
  );
}
