import { getLocale, getTranslations } from "next-intl/server";
import { getFilterOptions, resolveFilterNames, getOpsReportData, type ReportGranularity } from "../lib/db/queries";
import { todayISO } from "../lib/period";
import type { Locale } from "@/i18n/config";
import FilterPanel from "../components/FilterPanel";
import DownloadPdfButton from "../components/reports/DownloadPdfButton";
import OpsReportDocument from "../components/reports/OpsReportDocument";

export type ReportsSP = { regionId?: string; marketId?: string; facilityId?: string; granularity?: string; period?: string };

// Mismo contrato que el resto de la app (Overview/Trends/Market/Leadership):
// "month" es el default implícito cuando no hay `granularity` en la URL —
// FilterPanel ya asume ese default internamente (ver su propio fallback
// `|| "month"`), así que esta página lo respeta en vez de inventar otro
// default (ej. "week") que dejaría el selector mostrando algo distinto de
// lo que el reporte en realidad está mirando.
function isReportGranularity(value: string | undefined): value is ReportGranularity {
  return value === "week" || value === "month";
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSP> }) {
  const sp = await searchParams;
  const [t, rawLocale] = await Promise.all([getTranslations("Reports"), getLocale()]);
  const locale = rawLocale as Locale;

  const granularity: ReportGranularity = isReportGranularity(sp.granularity) ? sp.granularity : "month";
  const anchorISO = sp.period || todayISO();
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [names, filterOptions, core] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getOpsReportData(filters, granularity, anchorISO, locale),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId || sp.granularity || sp.period);
  const scopeLabel = names.facilityName ?? names.marketName ?? names.regionName ?? t("scopeNetwork");

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <h1 className="font-display text-3xl font-bold text-ink mb-1">{t("opsTitle")}</h1>
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
        <OpsReportDocument core={core} t={t} scopeLabel={scopeLabel} />
      </div>
    </div>
  );
}
