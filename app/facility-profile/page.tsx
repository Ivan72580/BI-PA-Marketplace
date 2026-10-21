import { getTranslations } from "next-intl/server";
import { listFacilityProfileStatus } from "../lib/db/queries";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { hasLevel } from "../lib/module";
import PageHeader from "../components/PageHeader";
import FacilityProfileTable from "./FacilityProfileTable";

// El acceso (módulo Equipo) se valida en layout.tsx.
export default async function FacilityProfilesPage() {
  const [rows, t, current] = await Promise.all([listFacilityProfileStatus(), getTranslations("FacilityProfile"), getCurrentUserWithAccess()]);
  const canEdit = hasLevel(current?.access.TEAM, "EDIT");

  return (
    <div>
      <PageHeader title={t("listTitle")} subtitle={t("listSubtitle")} />
      <FacilityProfileTable rows={rows} canEdit={canEdit} />
    </div>
  );
}
