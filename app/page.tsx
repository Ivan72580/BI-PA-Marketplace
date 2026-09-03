import Link from "next/link";
import { resolveFilterNames, getFilterOptions, getMonthProjection, type FacilitySortKey } from "./lib/db/queries";
import { resolvePeriod, todayISO, type Granularity, type ResolvedPeriod } from "./lib/period";
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

  // La comparación está siempre disponible cuando hay un período anterior
  // definido — cada tarjeta decide individualmente si mostrarla.
  const compare = Boolean(period.priorDateFrom && period.priorDateTo);

  const filters = {
    regionId: sp.regionId,
    marketId: sp.marketId,
    facilityId: sp.facilityId,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
  };

  const heatmapMetric: "count" | "rate" | "confirmed" =
    sp.heatmapMetric === "count" ? "count" : sp.heatmapMetric === "confirmed" ? "confirmed" : "rate";
  const validSorts: FacilitySortKey[] = ["games", "cancellationRate", "rating", "price"];
  const facilitySort: FacilitySortKey = validSorts.includes(sp.facilitySort as FacilitySortKey)
    ? (sp.facilitySort as FacilitySortKey)
    : "games";

  const [names, filterOptions, monthProjection] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getMonthProjection({ regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId }),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  return (
    <div>
      {/* Breadcrumb: solo aparece si hay algo filtrado — el estado "sin filtro"
          ya lo comunica el propio panel de filtros, no hace falta repetirlo. */}
      {hasFilter && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm mb-2">
          <Link href={buildQuery(sp, { regionId: undefined, marketId: undefined, facilityId: undefined })} className="text-brand">
            ‹ Limpiar filtros
          </Link>
          {names.regionName && (
            <>
              <span className="text-ink-faint">›</span>
              <Link href={buildQuery(sp, { marketId: undefined, facilityId: undefined })} className={sp.marketId ? "text-brand" : "text-ink font-medium"}>
                {names.regionName}
              </Link>
            </>
          )}
          {names.marketName && (
            <>
              <span className="text-ink-faint">›</span>
              <Link href={buildQuery(sp, { facilityId: undefined })} className={sp.facilityId ? "text-brand" : "text-ink font-medium"}>
                {names.marketName}
              </Link>
            </>
          )}
          {names.facilityName && (
            <>
              <span className="text-ink-faint">›</span>
              <span className="text-ink font-medium">{names.facilityName}</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap mb-5">
        <h1 className="font-display text-2xl font-semibold text-ink shrink-0">
          {names.facilityName ?? "Overview"}
        </h1>

        <div className="rounded-xl bg-brand-soft border border-brand/20 px-4 py-2 shrink-0">
          {monthProjection.available ? (
            <>
              <div className="text-sm text-brand font-medium">
                Proyección de {monthProjection.monthLabel}: ~{monthProjection.projectedGames!.toLocaleString("en-US")} partidos confirmados
              </div>
              <div className="text-xs text-ink-faint mt-0.5">
                Revenue proyectado: ~{formatUSD(monthProjection.projectedRevenue!)} · en base a {monthProjection.confirmedSoFar.toLocaleString("en-US")} confirmados en {monthProjection.daysElapsed} de {monthProjection.daysInMonth} días
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-muted">
              Proyección de {monthProjection.monthLabel} disponible desde el día {monthProjection.availableFromDay}
            </div>
          )}
        </div>
      </div>

      <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} />

      {compare && period.priorLabel && (
        <div className="text-xs text-ink-faint mb-4 -mt-3">Período anterior disponible para comparar: {period.priorLabel}</div>
      )}

      {sp.facilityId ? (
        <FacilityDetailView
          facilityId={sp.facilityId}
          filters={filters}
          period={period}
          granularity={granularity}
          compare={compare}
          heatmapMetric={heatmapMetric}
          monthProjection={monthProjection}
          buildHref={(overrides) => buildQuery(sp, overrides)}
        />
      ) : (
        <NetworkOverview
          sp={sp}
          filters={filters}
          period={period}
          compare={compare}
          facilitySort={facilitySort}
        />
      )}
    </div>
  );
}
