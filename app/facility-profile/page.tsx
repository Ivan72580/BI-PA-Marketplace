import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listFacilityProfileStatus } from "../lib/db/queries";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { hasLevel } from "../lib/module";
import PageHeader from "../components/PageHeader";

// El acceso (módulo Equipo) se valida en layout.tsx.
export default async function FacilityProfilesPage() {
  const [rows, t, current] = await Promise.all([listFacilityProfileStatus(), getTranslations("FacilityProfile"), getCurrentUserWithAccess()]);
  const canEdit = hasLevel(current?.access.TEAM, "EDIT");

  return (
    <div>
      <PageHeader title={t("listTitle")} subtitle={t("listSubtitle")} />

      <div className="rounded-2xl bg-surface shadow-sm overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th className="py-2 px-4 font-normal">{t("table.facility")}</th>
              <th className="py-2 px-4 font-normal">{t("table.market")}</th>
              <th className="py-2 px-4 font-normal">{t("table.region")}</th>
              <th className="py-2 px-4 font-normal">{t("table.completion")}</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.facilityId} className="border-b border-surface-sunken">
                <td className="py-2 px-4 text-ink font-medium">{r.facilityName}</td>
                <td className="py-2 px-4 text-ink-muted">{r.marketName}</td>
                <td className="py-2 px-4 text-ink-muted">{r.regionName}</td>
                <td className="py-2 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${(r.coreFieldsFilled / r.coreFieldsTotal) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-faint">
                      {r.coreFieldsFilled}/{r.coreFieldsTotal}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-4 text-right">
                  <Link href={`/facility-profile/${r.facilityId}`} className="text-xs text-brand hover:underline">
                    {canEdit ? (r.hasProfile ? t("table.edit") : t("table.complete")) : t("table.view")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
