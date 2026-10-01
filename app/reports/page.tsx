import { getLocale, getTranslations } from "next-intl/server";
import { getFilterOptions, resolveFilterNames, getOpsReportData, getExecutiveReportData, type ReportGranularity } from "../lib/db/queries";
import { requireLeadershipAccess } from "../lib/db/users";
import { todayISO } from "../lib/period";
import type { Locale } from "@/i18n/config";
import FilterPanel from "../components/FilterPanel";
import DownloadPdfButton from "../components/reports/DownloadPdfButton";
import ReportTypeTabs from "../components/reports/ReportTypeTabs";
import OpsReportDocument from "../components/reports/OpsReportDocument";
import ExecutiveReportDocument from "../components/reports/ExecutiveReportDocument";

// Página única para los dos reportes descargables (antes eran dos rutas:
// /reports para Ops, /panel-ejecutivo/reports para Executive) — ver
// ReportTypeTabs para el selector. El acceso a Executive Summary se
// resuelve acá mismo vía requireLeadershipAccess (no redirige: a
// diferencia de app/panel-ejecutivo/layout.tsx, esta página SÍ debe seguir
// sirviendo el Ops Report a cuentas sin leadership) en vez de heredar el
// gate del layout de Panel Ejecutivo, porque esta ruta ya no vive debajo
// de /panel-ejecutivo.
export type ReportsSP = {
  type?: string;
  regionId?: string;
  marketId?: string;
  facilityId?: string;
  granularity?: string;
  period?: string;
};

function isReportGranularity(value: string | undefined): value is ReportGranularity {
  return value === "week" || value === "month";
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSP> }) {
  const sp = await searchParams;
  const [t, rawLocale, leadershipUser] = await Promise.all([
    getTranslations("Reports"),
    getLocale(),
    requireLeadershipAccess(),
  ]);
  const locale = rawLocale as Locale;

  const hasExecutiveAccess = Boolean(leadershipUser);
  // Si se pide ?type=executive sin acceso, se degrada en silencio a Ops en
  // vez de redirigir o mostrar un error — mismo criterio de no revelar de
  // más que ya usa el resto de la app (ReportTypeTabs ni siquiera ofrece
  // la pestaña en ese caso).
  const type: "ops" | "executive" = sp.type === "executive" && hasExecutiveAccess ? "executive" : "ops";

  const granularity: ReportGranularity = isReportGranularity(sp.granularity) ? sp.granularity : "month";
  const anchorISO = sp.period || todayISO();
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [names, filterOptions, core] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    type === "executive"
      ? getExecutiveReportData(filters, granularity, anchorISO, locale)
      : getOpsReportData(filters, granularity, anchorISO, locale),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId || sp.granularity || sp.period);
  const scopeLabel = names.facilityName ?? names.marketName ?? names.regionName ?? t("scopeNetwork");
  const title = type === "executive" ? t("execTitle") : t("opsTitle");

  return (
    <div className="space-y-5">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold text-ink mb-1">{title}</h1>
        <ReportTypeTabs hasExecutiveAccess={hasExecutiveAccess} />
      </div>

      <div className="print:hidden flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-border">
        <FilterPanel
          regions={filterOptions.regions}
          markets={filterOptions.markets}
          facilities={filterOptions.facilities}
          granularityOptions={["month", "week"]}
          hasFilter={hasFilter}
          clearHref="/reports"
        />
        <DownloadPdfButton />
      </div>

      <div className="max-w-[860px] mx-auto bg-white rounded-2xl p-6 shadow-md print:shadow-none print:rounded-none print:p-0 print:max-w-none print:mx-0">
        {type === "executive" ? (
          <ExecutiveReportDocument core={core} t={t} scopeLabel={scopeLabel} />
        ) : (
          <OpsReportDocument core={core} t={t} scopeLabel={scopeLabel} />
        )}
      </div>
    </div>
  );
}
