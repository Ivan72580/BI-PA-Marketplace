import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listFacilityProfileStatus } from "../../lib/db/queries";

// El chequeo de acceso ahora vive una sola vez en layout.tsx. El link "volver"
// también se sacó de acá: la barra de pestañas del layout ya cubre esa
// navegación.
export default async function FacilityProfilesPage() {
  const [rows, t] = await Promise.all([listFacilityProfileStatus(), getTranslations("FacilityProfile")]);

  return (
    <div>
      <div className="mb-6 pb-5 border-b border-border">
        <h1 className="font-display text-2xl font-bold text-ink">{t("listTitle")}</h1>
        <div className="text-sm text-ink-faint mt-1">{t("listSubtitle")}</div>
      </div>

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
                  <Link href={`/panel-ejecutivo/facilities/${r.facilityId}`} className="text-xs text-brand hover:underline">
                    {r.hasProfile ? t("table.edit") : t("table.complete")}
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
