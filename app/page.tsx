import { CancellationCategory } from "@prisma/client";
import { getTranslations, getLocale } from "next-intl/server";
import { resolveFilterNames, getFilterOptions, getMonthProjection, type FacilitySortKey } from "./lib/db/queries";
import { resolvePeriod, resolveComparisonPeriod, shiftAnchor, todayISO, type Granularity, type ResolvedPeriod } from "./lib/period";
import type { Locale } from "@/i18n/config";
import { buildQuery, type SP } from "./lib/searchParams";
import FilterPanel from "./components/FilterPanel";
import NetworkOverview from "./components/NetworkOverview";
import FacilityDetailView from "./components/FacilityDetailView";
import CancellationReasonRanking from "./components/CancellationReasonRanking";
import ChangeBadge from "./components/ChangeBadge";

function isCancellationCategory(value: string | undefined): value is CancellationCategory {
  return !!value && (Object.values(CancellationCategory) as string[]).includes(value);
}

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// null = sin partidos jugados todavía en lo que va del mes (getMonthProjection
// solo divide si totalSoFar > 0) — no hay tasa que mostrar, a propósito no es "0%".
function formatRate(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(0)}%`;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, rawLocale, t] = await Promise.all([searchParams, getLocale(), getTranslations("Overview")]);
  const locale = rawLocale as Locale;
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
      period = { label: t("customRangeLabel"), priorLabel: null };
    }
  } else {
    period = resolvePeriod(granularity, anchor, undefined, undefined, locale);
  }

  // Comparación contra el período INMEDIATAMENTE ANTERIOR (mes anterior si
  // el filtro es mensual, trimestre anterior si es trimestral, etc.) — no
  // contra el mismo período del año pasado.
  //
  // resolveComparisonPeriod ya resuelve el caso especial de un período EN
  // CURSO (todavía no cerrado, p. ej. el mes o la semana por defecto):
  // comparar contra el anterior COMPLETO sería engañoso — un período a
  // mitad de camino siempre "pierde" contra uno entero — así que trunca el
  // anterior al mismo tramo de días ya transcurridos. Antes esto solo
  // pasaba para "month" (parche puntual, duplicado en LeadershipOverview);
  // ahora es agnóstico a la granularidad, así que la vista semanal queda
  // cubierta también.
  const comparePeriod: ResolvedPeriod | null =
    granularity === "all" || granularity === "custom"
      ? null
      : resolveComparisonPeriod({ dateFrom: period.dateFrom!, dateTo: period.dateTo! }, granularity, shiftAnchor(granularity, anchor, -1), locale);
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

  const [names, filterOptions, monthProjection] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getMonthProjection({ regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId }, locale),
  ]);

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6 pb-5 border-b border-border">
        <h1 className="font-display text-3xl font-bold text-ink shrink-0">
          {names.facilityName ?? t("pageTitle")}
        </h1>

        <div className="rounded-2xl bg-brand-soft border border-brand/20 px-5 py-3 shrink-0">
          {monthProjection.available ? (
            <>
              <div className="text-xs font-medium text-brand mb-2">{t("projection.title", { month: monthProjection.monthLabel })}</div>
              <div className="flex items-stretch gap-4">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <div className="font-display text-xl font-bold text-ink">{monthProjection.projectedGames!.toLocaleString("en-US")}</div>
                    {monthProjection.changePctGames !== null && <ChangeBadge value={monthProjection.changePctGames} />}
                  </div>
                  <div className="text-[11px] text-ink-faint mt-0.5">{t("projection.gamesLabel")}</div>
                </div>
                <div className="w-px bg-brand/20" />
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <div className="font-display text-xl font-bold text-ink">{formatUSD(monthProjection.projectedRevenue!)}</div>
                    {monthProjection.changePctRevenue !== null && <ChangeBadge value={monthProjection.changePctRevenue} />}
                  </div>
                  <div className="text-[11px] text-ink-faint mt-0.5">{t("projection.revenueLabel")}</div>
                </div>
              </div>
              <div className="text-[11px] text-ink-faint mt-2 pt-2 border-t border-brand/15 space-y-0.5">
                {/* Detalle real detrás de la proyección (hallazgo 2 del mapeo
                    de lógica no expuesta, 3/10/26): getMonthProjection ya
                    calculaba totalSoFar/cancelledSoFar/confirmationRateSoFar/
                    cancellationRateSoFar/revenueSoFar/priorConfirmedGames/
                    priorRevenue y ninguna pantalla los leía — acá se muestra
                    de qué acumulado real sale la proyección y contra qué
                    base concreta (no solo el %) se compara. */}
                <div>
                  {t("projection.basedOn", {
                    total: monthProjection.totalSoFar.toLocaleString("en-US"),
                    confirmed: monthProjection.confirmedSoFar.toLocaleString("en-US"),
                    confirmedRate: formatRate(monthProjection.confirmationRateSoFar),
                    cancelled: monthProjection.cancelledSoFar.toLocaleString("en-US"),
                    cancelledRate: formatRate(monthProjection.cancellationRateSoFar),
                    revenue: formatUSD(monthProjection.revenueSoFar),
                    elapsed: monthProjection.daysElapsed,
                    daysInMonth: monthProjection.daysInMonth,
                  })}
                </div>
                <div>
                  {t("projection.priorBasis", {
                    priorConfirmed: monthProjection.priorConfirmedGames.toLocaleString("en-US"),
                    priorRevenue: formatUSD(monthProjection.priorRevenue),
                  })}
                </div>
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

      {isCancellationCategory(sp.cancellationReason) ? (
        <CancellationReasonRanking
          sp={sp}
          filters={filters}
          category={sp.cancellationReason}
          period={period}
          comparePeriod={comparePeriod}
          compare={compare}
        />
      ) : sp.facilityId ? (
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
          granularity={granularity}
        />
      )}
    </div>
  );
}
