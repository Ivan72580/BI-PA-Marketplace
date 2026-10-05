import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { getFilterOptions, resolveFilterNames } from "../lib/db/queries";
import { getMapData } from "../lib/db/map";
import { resolvePeriod, todayISO, type Granularity, type ResolvedPeriod } from "../lib/period";
import { type SP } from "../lib/searchParams";
import type { Locale } from "@/i18n/config";
import FilterPanel from "../components/FilterPanel";
import ZoneMap, { type ZoneMapLabels } from "../components/ZoneMap";

function resolve(sp: SP, locale: Locale, customLabel: string): ResolvedPeriod {
  // Mismo criterio que Overview: default = mes en curso, no todo el histórico.
  const granularity = (sp.granularity as Granularity) || "month";
  if (granularity === "custom") {
    if (sp.customFrom && sp.customTo) {
      return { dateFrom: new Date(`${sp.customFrom}T00:00:00Z`), dateTo: new Date(`${sp.customTo}T23:59:59Z`), label: `${sp.customFrom} → ${sp.customTo}`, priorLabel: null };
    }
    return { label: customLabel, priorLabel: null };
  }
  return resolvePeriod(granularity, sp.period || todayISO(), undefined, undefined, locale);
}

function carryQuery(sp: SP): string {
  const params = new URLSearchParams();
  for (const k of ["granularity", "period", "customFrom", "customTo"] as const) if (sp[k]) params.set(k, sp[k]!);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function MapPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, rawLocale, t] = await Promise.all([searchParams, getLocale(), getTranslations("Map")]);
  const locale = rawLocale as Locale;
  const period = resolve(sp, locale, t("customRangeLabel"));
  const filters = { regionId: sp.regionId, marketId: sp.marketId, dateFrom: period.dateFrom, dateTo: period.dateTo };

  const [names, filterOptions, data] = await Promise.all([resolveFilterNames(sp), getFilterOptions(), getMapData(filters)]);
  const hasFilter = Boolean(sp.regionId || sp.marketId);

  const labels: ZoneMapLabels = {
    metricGames: t("metricGames"),
    metricPerField: t("metricPerField"),
    metricHint: t("metricHint"),
    zonesTitle: t("zonesTitle"),
    confirmed: t("confirmed"),
    confirmationRate: t("confirmationRate"),
    revenue: t("revenue"),
    gamesPerField: t("gamesPerField"),
    noFields: t("noFields"),
    approximate: t("approximateNote"),
    facilitiesIn: t("facilitiesIn", { zone: "{zone}" }),
    seeDetail: t("seeDetail"),
    clickHint: t("clickHint"),
    scheduled: t("scheduled"),
  };

  const scope = names.marketName ?? names.regionName ?? t("allNetwork");

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-3xl font-bold text-ink">{t("title")}</h1>
        <div className="text-sm text-ink-faint mt-1">{t("subtitle", { scope, period: period.label })}</div>
      </div>

      <FilterPanel
        regions={filterOptions.regions}
        markets={filterOptions.markets}
        facilities={filterOptions.facilities}
        showFacility={false}
        hasFilter={hasFilter}
        clearHref={`/map${carryQuery(sp)}`}
      />

      {data.zones.length === 0 ? (
        <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted mt-4">{t("empty")}</div>
      ) : (
        <div className="mt-4">
          <ZoneMap zones={data.zones} labels={labels} detailQuery={carryQuery(sp)} />
        </div>
      )}

      {data.unmapped.facilities > 0 && (
        <details className="mt-4 text-xs text-ink-muted">
          <summary className="cursor-pointer">
            {t("unmapped", { facilities: data.unmapped.facilities, games: data.unmapped.confirmedGames.toLocaleString("en-US") })}
          </summary>
          <div className="mt-2 text-ink-faint">{data.unmapped.names.join(" · ")}</div>
          <Link href="/panel-ejecutivo/facilities" className="inline-block mt-1 text-brand">{t("unmappedFix")}</Link>
        </details>
      )}
    </div>
  );
}
