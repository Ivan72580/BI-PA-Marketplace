import { getTranslations } from "next-intl/server";
import { resolveFilterNames, getFilterOptions, getMonthProjection, type FacilitySortKey } from "./lib/db/queries";
import { resolvePeriod, shiftAnchor, todayISO, type Granularity, type ResolvedPeriod } from "./lib/period";
import { buildQuery, type SP } from "./lib/searchParams";
import FilterPanel from "./components/FilterPanel";
import NetworkOverview from "./components/NetworkOverview";
import FacilityDetailView from "./components/FacilityDetailView";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Default: mes en curso, no "todo el histórico" — regla global.
  const granularity = (sp.granularity as Granularity) || "month";
  const anchor = sp.period || todayISO();

  let period: ResolvedPeriod;
  if (granularity === "custom") {
    if (sp.customFrom && sp.customTo) {
      period = {
        dateFrom: new Date(`${sp.customFrom}T00:00:00Z`),
        dateTo: new Date(`${sp.customTo}T23:59:59Z`),
        label: `${sp.customFrom} → ${sp.customTo}`,
        priorLabel: null,
      };
    } else {
      period = { label: "Rango personalizado", priorLabel: null };
    }
  } else {
    period = resolvePeriod(granularity, anchor);
  }

  // Comparación contra el período INMEDIATAMENTE ANTERIOR (mes anterior si
  // el filtro es mensual, trimestre anterior si es trimestral, etc.) — no
  // contra el mismo período del año pasado.
  //
  // Caso especial: si estamos viendo el mes EN CURSO (todavía no cerrado, la
  // vista por defecto), comparar contra el mes anterior COMPLETO sería
  // engañoso — un mes a mitad de camino siempre "pierde" contra un mes
  // entero. Ahí comparamos contra el mismo tramo de días del mes anterior
  // (si estamos al día 15, contra el 1-15 del mes pasado, no el 1-31).
  const isDefaultCurrentMonth = granularity === "month" && anchor.slice(0, 7) === todayISO().slice(0, 7);

  function resolvePartialPriorMonth(): ResolvedPeriod {
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const prevMonthAnchor = shiftAnchor("month", anchor, -1);
    const prevMonthStart = resolvePeriod("month", prevMonthAnchor).dateFrom!;
    const partialEnd = new Date(prevMonthStart);
    partialEnd.setUTCDate(prevMonthStart.getUTCDate() + dayOfMonth - 1);
    partialEnd.setUTCHours(23, 59, 59, 999);
    const monthLabel = prevMonthStart.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" });
    return {
      dateFrom: prevMonthStart,
      dateTo: partialEnd,
      label: `${prevMonthStart.getUTCDate()}–${partialEnd.getUTCDate()} ${monthLabel} (mismo tramo)`,
      priorLabel: null,
    };
  }

  const comparePeriod: ResolvedPeriod | null =
    granularity === "all" || granularity === "custom"
      ? null
      : isDefaultCurrentMonth
      ? resolvePartialPriorMonth()
      : resolvePeriod(granularity, shiftAnchor(granularity, anchor, -1));
  const compare = Boolean(comparePeriod?.dateFrom && comparePeriod?.dateTo);

  const filters = {
    regionId: sp.regionId,
    marketId: sp.marketId,
    facilityId: sp.facilityId,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
  };

  const validSorts: FacilitySortKey[] = ["games", "cancellationRate", "rating", "price"];
  const facilitySort: FacilitySortKey = validSorts.includes(sp.facilitySort as FacilitySortKey)
    ? (sp.facilitySort as FacilitySortKey)
    : "games";
  const facilitySortDir: "asc" | "desc" = sp.facilitySortDir === "asc" ? "asc" : "desc";

  const [names, filterOptions, monthProjection, t] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getMonthProjection({ regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId }),
    getTranslations("Overview"),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6 pb-5 border-b border-border">
        <h1 className="font-display text-3xl font-bold text-ink shrink-0">
          {names.facilityName ?? t("pageTitle")}
        </h1>

        <div className="rounded-xl bg-brand-soft border border-brand/20 px-4 py-2 shrink-0">
          {monthProjection.available ? (
            <>
              <div className="text-sm text-brand font-medium">
                {t("projection.title", { month: monthProjection.monthLabel, n: monthProjection.projectedGames!.toLocaleString("en-US") })}
              </div>
              <div className="text-xs text-ink-faint mt-0.5">
                {t("projection.detail", {
                  revenue: formatUSD(monthProjection.projectedRevenue!),
                  confirmed: monthProjection.confirmedSoFar.toLocaleString("en-US"),
                  elapsed: monthProjection.daysElapsed,
                  total: monthProjection.daysInMonth,
                })}
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-muted">
              {t("projection.notYetAvailable", { month: monthProjection.monthLabel, day: monthProjection.availableFromDay })}
            </div>
          )}
        </div>
      </div>

      <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} hasFilter={hasFilter} clearHref={buildQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })} />

      {compare && comparePeriod?.label && (
        <div className="text-xs text-ink-faint mb-4 -mt-3">{t("comparePeriodAvailable", { period: comparePeriod.label })}</div>
      )}

      {sp.facilityId ? (
        <FacilityDetailView
          facilityId={sp.facilityId}
          filters={filters}
          period={period}
          comparePeriod={comparePeriod}
          granularity={granularity}
          compare={compare}
          monthProjection={monthProjection}
        />
      ) : (
        <NetworkOverview
          sp={sp}
          filters={filters}
          period={period}
          comparePeriod={comparePeriod}
          compare={compare}
          facilitySort={facilitySort}
          facilitySortDir={facilitySortDir}
          regions={filterOptions.regions}
        />
      )}
    </div>
  );
}
