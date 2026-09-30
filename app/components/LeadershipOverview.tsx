import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import {
  getOverviewData,
  getMonthProjection,
  getRegionRanking,
  getRegionConfirmationRanking,
  getExtendedMetrics,
  getDailyRiskFacilities,
  getNetworkForecast,
  getForecastRiskFacilities,
  getGameReviewSatisfaction,
  computePlayerComplaintsSummary,
  getAppReviewSatisfaction,
  listFacilityProfileStatus,
  getContributionRanking,
  getFilterOptions,
} from "../lib/db/queries";
import { resolvePeriod, shiftAnchor, todayISO, gamesPerPeriodAverage, formatPerPeriod, type Granularity, type ResolvedPeriod } from "../lib/period";
import ChangeBadge from "./ChangeBadge";
import ExpandableKpiTile, { type KpiDetail } from "./ExpandableKpiTile";
import FilterPanel from "./FilterPanel";

export type LeadershipSP = { granularity?: string; period?: string; regionId?: string; marketId?: string };

type Translator = (key: string, values?: Record<string, string | number>) => string;
type Severity = "critical" | "notable" | "info";
type Alert = { text: string; severity: Severity; href?: string };
// Mismo shape que la fila anónima de cancellationBreakdown en overview.ts —
// se anota explícitamente acá porque el tipo de getOverviewData, al pasar
// por el wrapper cached()/unstable_cache, pierde precisión y cae en el
// mismo cascade de "any" que ya afecta a otros call-sites de la app (ver
// baseline de tsc); sin esto, TS7006 en los callbacks que iteran sobre ella.
type CancellationReasonRow = { category: string; label: string; count: number; pct: number };
type NameOption = { id: string; name: string };

// Motivo de cancelación tratado como el más accionable por decisión de
// negocio (30 sep 2026): "cancha no disponible" suele reflejar fricción u
// organización interna/de la facility, corregible — a diferencia de
// "clima" o "feriado", que no lo son. Se marca distinto tanto en el
// desglose de la tarjeta de cancelación como en Alertas, sin importar si es
// o no el motivo #1 por volumen.
const CRITICAL_CANCELLATION_CATEGORY = "FACILITY_UNAVAILABLE";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

// ---------- Tarjeta KPI simple (sin desglose) ----------
function KpiTile({
  label,
  value,
  delta,
  deltaUnit = "pct",
  invert,
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaUnit?: "pct" | "pts";
  invert?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-4">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="font-display text-2xl font-semibold text-ink mt-1">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="flex items-center gap-2 mt-1 min-h-[18px] flex-wrap">
          {delta !== undefined && <ChangeBadge value={delta} unit={deltaUnit} invert={invert} />}
          {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ---------- Alertas: misma paleta de severidad que InsightsPanel (bubble),
// pero renderizada siempre visible en el cuerpo de la página en vez de un
// panel flotante colapsado — acá la alerta ES el contenido principal, no un
// complemento a algo más detallado, así que esconderla detrás de un click
// no tendría sentido. ----------
const ALERT_BG: Record<Severity, string> = {
  critical: "bg-danger-soft",
  notable: "bg-brand-soft",
  info: "bg-surface-sunken",
};
const ALERT_DOT: Record<Severity, string> = {
  critical: "bg-danger",
  notable: "bg-brand",
  info: "bg-ink-faint",
};
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, notable: 1, info: 2 };

function AlertRow({ alert }: { alert: Alert }) {
  const content = (
    <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm ${ALERT_BG[alert.severity]}`}>
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${ALERT_DOT[alert.severity]}`} aria-hidden="true" />
      <span className="text-ink leading-snug">{alert.text}</span>
    </div>
  );
  return alert.href ? (
    <Link href={alert.href} className="block hover:brightness-95 transition-[filter]">
      {content}
    </Link>
  ) : (
    content
  );
}

// ---------- Construcción de alertas ----------
// Todas se derivan de datos YA calculados por queries que el resto de la app
// ya usa (Overview/Daily/Forecast/región/satisfacción) — ninguna consulta
// nueva salvo getContributionRanking (ya existía, solo no se usaba acá).
// Los umbrales de "Game Health" (confirmación<50%, motivo>35% de las
// cancelaciones, outlier a 15pts) son EXACTAMENTE los mismos que ya usa
// generateOverviewInsights en overview.ts — se duplican acá como número
// (no como import, esa función es privada del módulo) para no divergir en
// silencio si alguno cambia de lado sin el otro.
function buildAlerts(
  data: {
    overview: Awaited<ReturnType<typeof getOverviewData>>;
    networkForecast: Awaited<ReturnType<typeof getNetworkForecast>>;
    dailyRisk: Awaited<ReturnType<typeof getDailyRiskFacilities>>;
    forecastRisk: Awaited<ReturnType<typeof getForecastRiskFacilities>>;
    regionRows: { regionName: string; confirmation: { changePts: number | null } | null }[];
    noScopeFilter: boolean;
    scopedFieldQualityWorst: Awaited<ReturnType<typeof getGameReviewSatisfaction>>["facilityFieldQuality"][number] | undefined;
    scopedProfileLoaded: number;
    scopedProfileTotal: number;
  },
  t: Translator
): Alert[] {
  const { overview, networkForecast: nf, dailyRisk, forecastRisk, regionRows, noScopeFilter, scopedFieldQualityWorst, scopedProfileLoaded, scopedProfileTotal } = data;
  const alerts: Alert[] = [];

  if (overview.confirmationRate < 0.5) {
    alerts.push({ text: t("alerts.lowConfirmation", { pct: formatPct(overview.confirmationRate) }), severity: "critical" });
  }

  const topReason = overview.cancellationBreakdown[0];
  if (topReason && topReason.pct > 0.35) {
    alerts.push({
      text: t("alerts.topReason", { reason: topReason.label, pct: (topReason.pct * 100).toFixed(0), count: topReason.count }),
      severity: topReason.category === CRITICAL_CANCELLATION_CATEGORY ? "critical" : "notable",
    });
  }
  // Caso especial de negocio: aunque no sea el motivo #1, "cancha no
  // disponible" amerita alerta propia a un piso más bajo (la mitad del
  // umbral general) — es friccion accionable, no ruido estacional como
  // clima/feriado.
  const facilityUnavailable = overview.cancellationBreakdown.find((c: CancellationReasonRow) => c.category === CRITICAL_CANCELLATION_CATEGORY);
  if (facilityUnavailable && facilityUnavailable.pct >= 0.15 && topReason?.category !== CRITICAL_CANCELLATION_CATEGORY) {
    alerts.push({
      text: t("alerts.facilityUnavailable", { pct: (facilityUnavailable.pct * 100).toFixed(0), count: facilityUnavailable.count }),
      severity: "notable",
    });
  }

  const worst = overview.worstCancellationRate[0];
  if (worst) {
    const gapPts = (worst.rate - overview.cancellationRate) * 100;
    if (gapPts >= 15) {
      alerts.push({
        text: t("alerts.outlier", { facility: worst.label, rate: (worst.rate * 100).toFixed(0), gap: gapPts.toFixed(0) }),
        severity: "critical",
        href: `/market?regionId=${worst.regionId}&marketId=${worst.marketId}&facilityId=${worst.facilityId}`,
      });
    }
  }

  const topDailyRisk = dailyRisk[0];
  if (topDailyRisk) {
    alerts.push({
      text: t("alerts.dailyRisk", {
        facility: topDailyRisk.facilityName,
        cancelled: topDailyRisk.recentCancelledGames,
        delta: Math.abs(topDailyRisk.confirmationRateDelta * 100).toFixed(0),
      }),
      severity: topDailyRisk.severity === "high" ? "critical" : "notable",
      href: `/daily?facilityId=${topDailyRisk.facilityId}`,
    });
  }

  const topForecastRisk = forecastRisk[0];
  if (topForecastRisk) {
    alerts.push({
      text: t("alerts.forecastRisk", {
        facility: topForecastRisk.facilityName,
        pct: topForecastRisk.predictedConfirmationRate !== null ? formatPct(topForecastRisk.predictedConfirmationRate) : "—",
        delta: Math.abs((topForecastRisk.confirmationRateDelta ?? 0) * 100).toFixed(0),
      }),
      severity: "critical",
      href: `/forecast?facilityId=${topForecastRisk.facilityId}`,
    });
  }

  if (nf.method !== "insufficient" && nf.confirmationRate.predicted !== null && nf.confirmationRate.avg !== null) {
    const diff = nf.confirmationRate.predicted - nf.confirmationRate.avg;
    if (diff <= -0.03) {
      alerts.push({
        text: t("alerts.forecastConfirmationDown", { pct: formatPct(nf.confirmationRate.predicted), delta: Math.abs(diff * 100).toFixed(0) }),
        severity: "critical",
        href: "/forecast",
      });
    } else if (diff >= 0.03) {
      alerts.push({
        text: t("alerts.forecastConfirmationUp", { pct: formatPct(nf.confirmationRate.predicted), delta: (diff * 100).toFixed(0) }),
        severity: "notable",
        href: "/forecast",
      });
    }
  }

  if (nf.method !== "insufficient" && nf.games.predicted !== null && nf.games.avg !== null && nf.games.avg > 0) {
    const pct = (nf.games.predicted - nf.games.avg) / nf.games.avg;
    if (Math.abs(pct) >= 0.15) {
      alerts.push({
        text: t(pct > 0 ? "alerts.forecastGamesUp" : "alerts.forecastGamesDown", { n: formatNum(nf.games.predicted) }),
        severity: pct > 0 ? "notable" : "critical",
        href: "/forecast",
      });
    }
  }

  // Comparar regiones entre sí solo tiene sentido a nivel red completa — con
  // un region/market ya elegido en el filtro no hay nada que comparar.
  if (noScopeFilter) {
    const worstRegion = [...regionRows]
      .filter((r) => r.confirmation?.changePts !== null && r.confirmation !== null)
      .sort((a, b) => (a.confirmation!.changePts as number) - (b.confirmation!.changePts as number))[0];
    if (worstRegion && (worstRegion.confirmation!.changePts as number) <= -0.03) {
      alerts.push({
        text: t("alerts.regionDrop", { region: worstRegion.regionName, pts: Math.abs((worstRegion.confirmation!.changePts as number) * 100).toFixed(0) }),
        severity: "notable",
      });
    }
  }

  if (scopedFieldQualityWorst) {
    alerts.push({
      text: t("alerts.fieldQualityWorst", { facility: scopedFieldQualityWorst.facilityName, pct: (scopedFieldQualityWorst.pctFieldQualityNegative * 100).toFixed(0) }),
      severity: "info",
      href: "/panel-ejecutivo/satisfaction",
    });
  }

  if (scopedProfileTotal > 0 && scopedProfileLoaded === 0) {
    alerts.push({
      text: t("alerts.profileCoverageEmpty", { total: scopedProfileTotal }),
      severity: "info",
      href: "/panel-ejecutivo/facilities",
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// Mismo criterio que app/page.tsx (Overview) para el mes en curso: compararlo
// contra el mes anterior COMPLETO sería engañoso (un mes a mitad de camino
// siempre "pierde"), así que se compara contra el mismo tramo de días. Para
// "semana" no hay caso especial — mismo comportamiento que Overview (semana
// en curso vs. semana anterior completa).
function resolvePartialPriorMonth(anchor: string, locale: Locale, t: Translator): ResolvedPeriod {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const prevMonthAnchor = shiftAnchor("month", anchor, -1);
  const prevMonthStart = resolvePeriod("month", prevMonthAnchor).dateFrom!;
  const partialEnd = new Date(prevMonthStart);
  partialEnd.setUTCDate(prevMonthStart.getUTCDate() + dayOfMonth - 1);
  partialEnd.setUTCHours(23, 59, 59, 999);
  const monthLabel = prevMonthStart.toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "short", timeZone: "UTC" });
  return {
    dateFrom: prevMonthStart,
    dateTo: partialEnd,
    label: t("samePeriodLabel", { from: prevMonthStart.getUTCDate(), to: partialEnd.getUTCDate(), month: monthLabel }),
    priorLabel: null,
  };
}

// Vista de Leadership: red completa por default, con filtro opcional de
// región/market (nunca facility — para eso está el resto de la app) y
// período mes/semana con navegación. Es un monitor: números y alertas son
// el contenido; el porqué de cada uno sigue viviendo en su página propia
// (Overview/Daily/Trends/Market/Forecast/Satisfaction), a la que esta
// página linkea en vez de duplicar — con la excepción de un desglose
// plegable por KPI cuando ya hay un dato de respaldo real (motivo de
// cancelación + quién contribuyó más).
export default async function LeadershipOverview({ sp, locale }: { sp: LeadershipSP; locale: Locale }) {
  const t = await getTranslations("Leadership");

  const granularity: Granularity = sp.granularity === "week" ? "week" : "month";
  const anchor = sp.period || todayISO();
  const isCurrentMonth = granularity === "month" && anchor.slice(0, 7) === todayISO().slice(0, 7);

  const period = resolvePeriod(granularity, anchor, undefined, undefined, locale);
  const comparePeriod = isCurrentMonth
    ? resolvePartialPriorMonth(anchor, locale, t)
    : resolvePeriod(granularity, shiftAnchor(granularity, anchor, -1), undefined, undefined, locale);
  // granularity acá es siempre "month" o "week" (nunca "all"/"custom"), así
  // que resolvePeriod siempre devuelve dateFrom/dateTo reales — el "!" es
  // seguro, no un supuesto sin verificar.
  const currentRange = { dateFrom: period.dateFrom!, dateTo: period.dateTo! };
  const priorRange = { dateFrom: comparePeriod.dateFrom!, dateTo: comparePeriod.dateTo! };

  const filters = { regionId: sp.regionId, marketId: sp.marketId };
  const noScopeFilter = !sp.regionId && !sp.marketId;
  const monthForRegionTable = anchor.slice(0, 7);
  const today = todayISO();

  const [
    overview,
    priorOverview,
    projection,
    filterOptions,
    regionVolume,
    regionConfirmation,
    extended,
    dailyRisk,
    networkForecast,
    forecastRisk,
    gameReviews,
    appReviews,
    profileStatus,
    contribution,
  ] = await Promise.all([
    getOverviewData({ ...filters, ...currentRange }, locale),
    getOverviewData({ ...filters, ...priorRange }, locale),
    getMonthProjection(filters, locale),
    getFilterOptions(),
    getRegionRanking({}, monthForRegionTable),
    getRegionConfirmationRanking({}, monthForRegionTable),
    getExtendedMetrics({ ...filters, ...currentRange }),
    getDailyRiskFacilities(today, 8, filters),
    getNetworkForecast(filters, "week", today),
    getForecastRiskFacilities(filters, "week", today),
    getGameReviewSatisfaction(),
    getAppReviewSatisfaction(),
    listFacilityProfileStatus(),
    getContributionRanking(filters, currentRange, priorRange),
  ]);
  // Derivado en memoria del resumen que ya se pidió arriba — antes era su
  // propia consulta en el Promise.all (getPlayerComplaintsSummary), que
  // internamente volvía a llamar a getGameReviewSatisfaction: con caché
  // fría, la consulta completa de reviews corría dos veces en paralelo en
  // el mismo request. Ver computePlayerComplaintsSummary en satisfaction.ts.
  const complaints = computePlayerComplaintsSummary(gameReviews.summary);

  const confirmationByRegion = new Map(regionConfirmation.map((r) => [r.regionId, r]));
  const regionRows = regionVolume.map((r) => ({
    ...r,
    confirmation: confirmationByRegion.get(r.regionId) ?? null,
  }));

  const perPeriod = (n: number) => {
    const avg = gamesPerPeriodAverage(n, currentRange.dateFrom, currentRange.dateTo);
    return avg ? formatPerPeriod(avg, locale) : undefined;
  };

  // Deltas de la fila hero — null cuando el período anterior no tiene datos
  // (mismo caso que ChangeBadge ya maneja como "sin datos previos").
  const hasPrior = priorOverview.totalGames > 0;
  const gamesDelta = hasPrior && priorOverview.confirmedGames > 0 ? (overview.confirmedGames - priorOverview.confirmedGames) / priorOverview.confirmedGames : null;
  const confirmationDelta = hasPrior ? overview.confirmationRate - priorOverview.confirmationRate : null;
  const cancellationDelta = hasPrior ? overview.cancellationRate - priorOverview.cancellationRate : null;
  const fillRateDelta = hasPrior ? overview.avgFillRate - priorOverview.avgFillRate : null;
  const revenueDelta = hasPrior && priorOverview.totalRevenue > 0 ? (overview.totalRevenue - priorOverview.totalRevenue) / priorOverview.totalRevenue : null;
  const avgRevenueDelta =
    hasPrior && priorOverview.avgRevenuePerGame > 0 ? (overview.avgRevenuePerGame - priorOverview.avgRevenuePerGame) / priorOverview.avgRevenuePerGame : null;

  // Filtro de región/market aplicado a datasets que no lo soportan como
  // argumento de query (Satisfaction/Facility Profile no tienen ese filtro
  // construido en sus consultas) — se filtra acá por nombre, ya que ambos
  // datasets ya traen marketName/regionName por fila.
  const regionNameById = new Map(filterOptions.regions.map((r: NameOption): [string, string] => [r.id, r.name]));
  const marketNameById = new Map(filterOptions.markets.map((m: NameOption): [string, string] => [m.id, m.name]));
  const selectedRegionName = sp.regionId ? regionNameById.get(sp.regionId) : undefined;
  const selectedMarketName = sp.marketId ? marketNameById.get(sp.marketId) : undefined;
  function matchesScope(regionName: string, marketName: string): boolean {
    if (selectedMarketName) return marketName === selectedMarketName;
    if (selectedRegionName) return regionName === selectedRegionName;
    return true;
  }
  const scopedProfileStatus = profileStatus.filter((r) => matchesScope(r.regionName, r.marketName));
  const scopedFieldQuality = gameReviews.facilityFieldQuality.filter((r) => matchesScope(r.regionName, r.marketName));
  const scopedProfileLoaded = scopedProfileStatus.filter((r) => r.hasProfile).length;
  const scopedProfileTotal = scopedProfileStatus.length;

  const alerts = buildAlerts(
    {
      overview,
      networkForecast,
      dailyRisk,
      forecastRisk,
      regionRows,
      noScopeFilter,
      scopedFieldQualityWorst: scopedFieldQuality[0],
      scopedProfileLoaded,
      scopedProfileTotal,
    },
    t
  );

  // ---------- Desglose plegable: cancelación (motivos + mayor contribuyente) ----------
  const MIN_CONTRIBUTION = 3; // mismo piso que generateContributionInsights (contribution.ts)
  const topReasonRows = overview.cancellationBreakdown.slice(0, 4).map((r: CancellationReasonRow) => ({
    label: r.label,
    value: `${(r.pct * 100).toFixed(0)}% (${r.count})`,
    flag: r.category === CRITICAL_CANCELLATION_CATEGORY,
  }));
  const topCancelContributor = [...contribution].filter((c) => c.excessCancellations >= MIN_CONTRIBUTION).sort((a, b) => b.excessCancellations - a.excessCancellations)[0];
  const cancellationDetail: KpiDetail | undefined =
    topReasonRows.length > 0
      ? {
          rows: [
            ...topReasonRows,
            ...(topCancelContributor
              ? [{ label: `↑ ${topCancelContributor.label}`, value: `+${topCancelContributor.excessCancellations.toFixed(1)}` }]
              : []),
          ],
        }
      : undefined;

  // ---------- Desglose plegable: partidos confirmados (mayor/menor contribuyente) ----------
  const bestContributor = [...contribution].filter((c) => c.excessConfirmations >= MIN_CONTRIBUTION).sort((a, b) => b.excessConfirmations - a.excessConfirmations)[0];
  const worstContributor = [...contribution].filter((c) => c.excessConfirmations <= -MIN_CONTRIBUTION).sort((a, b) => a.excessConfirmations - b.excessConfirmations)[0];
  const confirmedDetail: KpiDetail | undefined =
    bestContributor || worstContributor
      ? {
          rows: [
            ...(bestContributor ? [{ label: `↑ ${bestContributor.label}`, value: `+${bestContributor.excessConfirmations.toFixed(1)}` }] : []),
            ...(worstContributor ? [{ label: `↓ ${worstContributor.label}`, value: worstContributor.excessConfirmations.toFixed(1) }] : []),
          ],
        }
      : undefined;

  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.granularity || sp.period);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">{t("pageTitle")}</h1>
          <div className="text-sm text-ink-faint mt-1">{t("subtitle")}</div>
        </div>
        <div className="text-right">
          {projection.available ? (
            <>
              <div className="text-sm text-brand font-semibold">
                {t("projection.title", { month: projection.monthLabel, n: projection.projectedGames!.toLocaleString("en-US") })}
              </div>
              <div className="text-[11px] text-ink-faint mt-0.5">
                {t("projection.detail", { revenue: formatUSD(projection.projectedRevenue!), elapsed: projection.daysElapsed, total: projection.daysInMonth })}
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-muted">{t("projection.notYetAvailable", { month: projection.monthLabel, day: projection.availableFromDay })}</div>
          )}
        </div>
      </div>

      <FilterPanel
        regions={filterOptions.regions}
        markets={filterOptions.markets}
        facilities={[]}
        showFacility={false}
        showTimeControls
        granularityOptions={["month", "week"]}
        hasFilter={hasFilter}
        clearHref="/panel-ejecutivo"
      />

      {/* Alertas: primero en la página a propósito — es lo que Leadership
          quiere ver antes que ningún número suelto. Ya respeta el filtro de
          región/market y el período elegidos arriba. */}
      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">{t("alerts.title")}</h2>
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
          {alerts.length === 0 && <div className="text-sm text-ink-faint px-1">{t("alerts.empty")}</div>}
        </div>
      </div>

      {/* KPIs hero — período elegido vs. el equivalente anterior. Cancelación
          y Confirmados tienen desglose plegable (▾) cuando hay un motivo o
          un contribuyente real detrás del número. */}
      <div className="text-[11px] text-ink-faint -mb-1">{t("kpis.compareCaption", { period: comparePeriod.label })}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <ExpandableKpiTile
          label={t("kpis.confirmedGames")}
          value={formatNum(overview.confirmedGames)}
          delta={gamesDelta}
          sub={perPeriod(overview.confirmedGames)}
          detail={confirmedDetail}
        />
        <KpiTile label={t("kpis.confirmationRate")} value={formatPct(overview.confirmationRate)} delta={confirmationDelta} deltaUnit="pts" />
        <ExpandableKpiTile
          label={t("kpis.cancellationRate")}
          value={formatPct(overview.cancellationRate)}
          delta={cancellationDelta}
          deltaUnit="pts"
          invert
          detail={cancellationDetail}
        />
        <KpiTile label={t("kpis.avgFillRate")} value={formatPct(overview.avgFillRate)} delta={fillRateDelta} deltaUnit="pts" />
        <KpiTile label={t("kpis.totalRevenue")} value={formatUSD(overview.totalRevenue)} delta={revenueDelta} />
        <KpiTile label={t("kpis.avgRevenuePerGame")} value={formatUSD(overview.avgRevenuePerGame)} delta={avgRevenueDelta} />
        <KpiTile
          label={t("kpis.rating")}
          value={extended.avgRating !== null ? extended.avgRating.toFixed(2) : "—"}
          sub={t("kpis.ratingSub", { pct: (extended.ratingsCoveragePct * 100).toFixed(0) })}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Comparación por región — solo tiene sentido a nivel red completa
            (sin región/market ya elegidos) y con granularidad mensual (el
            ranking de región es mes calendario, no semana). */}
        {noScopeFilter && granularity === "month" && (
          <div className="lg:col-span-2 rounded-2xl bg-surface shadow-sm p-5">
            <h2 className="font-display text-base font-semibold text-ink mb-0.5">{t("regionTable.title")}</h2>
            <div className="text-xs text-ink-faint mb-4">{t("regionTable.subtitle")}</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="py-1.5 px-2 font-normal">{t("regionTable.headers.region")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("regionTable.headers.confirmedGames")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("regionTable.headers.changeVsPriorMonth")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("regionTable.headers.confirmationRate")}</th>
                    <th className="py-1.5 px-2 font-normal">{t("regionTable.headers.changePts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {regionRows.map((r) => (
                    <tr key={r.regionId} className="border-b border-surface-sunken">
                      <td className="py-1.5 px-2 text-ink font-medium">{r.regionName}</td>
                      <td className="py-1.5 px-2 text-ink">
                        {r.confirmedGames.toLocaleString("en-US")}
                        {perPeriod(r.confirmedGames) && <span className="text-ink-faint text-[11px] ml-1">({perPeriod(r.confirmedGames)})</span>}
                      </td>
                      <td className="py-1.5 px-2">
                        <ChangeBadge value={r.changePct} />
                      </td>
                      <td className="py-1.5 px-2 text-ink">{r.confirmation ? formatPct(r.confirmation.confirmationRate) : "—"}</td>
                      <td className="py-1.5 px-2">
                        <ChangeBadge value={r.confirmation?.changePts ?? null} unit="pts" />
                      </td>
                    </tr>
                  ))}
                  {regionRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-ink-faint">
                        {t("regionTable.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={`space-y-4 ${noScopeFilter && granularity === "month" ? "" : "lg:col-span-3"}`}>
          <div className={noScopeFilter && granularity === "month" ? "" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
            {/* Pronóstico próxima semana — condensado, el detalle vive en /forecast */}
            <div className="rounded-2xl bg-surface shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base font-semibold text-ink">{t("forecastMini.title")}</h2>
                <Link href="/forecast" className="text-xs text-brand hover:underline shrink-0">
                  {t("viewDetail")}
                </Link>
              </div>
              {networkForecast.method === "insufficient" ? (
                <div className="text-sm text-ink-faint">{t("forecastMini.insufficient")}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-ink-faint">{t("forecastMini.games")}</div>
                    <div className="font-display text-xl font-semibold text-ink mt-0.5">
                      {networkForecast.games.predicted !== null ? `~${formatNum(networkForecast.games.predicted)}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-faint">{t("forecastMini.confirmation")}</div>
                    <div className="font-display text-xl font-semibold text-ink mt-0.5">
                      {networkForecast.confirmationRate.predicted !== null ? `~${formatPct(networkForecast.confirmationRate.predicted)}` : "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Player Satisfaction — rollup, el detalle vive en
                /panel-ejecutivo/satisfaction. App rating y quejas son de red
                completa siempre (AppReview no tiene vínculo a facility/market
                en el dato de origen); perfiles y calidad de campo sí siguen
                el filtro. */}
            <div className="rounded-2xl bg-surface shadow-sm p-5">
              <div className="flex items-center justify-between mb-0.5">
                <h2 className="font-display text-base font-semibold text-ink">{t("satisfaction.title")}</h2>
                <Link href="/panel-ejecutivo/satisfaction" className="text-xs text-brand hover:underline shrink-0">
                  {t("viewDetail")}
                </Link>
              </div>
              {!noScopeFilter && <div className="text-[10px] text-ink-faint mb-2.5">{t("satisfaction.networkWideNote")}</div>}
              <div className={`grid grid-cols-2 gap-3 ${noScopeFilter ? "mt-3" : ""}`}>
                <div>
                  <div className="text-[11px] text-ink-faint">{t("satisfaction.appRating")}</div>
                  <div className="font-display text-xl font-semibold text-ink mt-0.5">
                    {appReviews.summary.averageRating !== null ? appReviews.summary.averageRating.toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-faint">{t("satisfaction.complaints")}</div>
                  <div className="font-display text-xl font-semibold text-ink mt-0.5">{formatPct(complaints.pctOfReviews)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-faint">{t("profile.title")}</div>
                  <div className="font-display text-xl font-semibold text-ink mt-0.5">
                    {scopedProfileLoaded}/{scopedProfileTotal}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-faint">{t("satisfaction.fieldQualityWorst")}</div>
                  <div className="text-sm font-medium text-ink mt-1.5 truncate">
                    {scopedFieldQuality[0] ? scopedFieldQuality[0].facilityName : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link href="/market" className="text-sm text-brand hover:underline">
          {t("marketDetailLink")}
        </Link>
        <Link href="/forecast" className="text-sm text-brand hover:underline">
          {t("forecastDetailLink")}
        </Link>
        <Link href="/panel-ejecutivo/satisfaction" className="text-sm text-brand hover:underline">
          {t("satisfactionDetailLink")}
        </Link>
      </div>
    </div>
  );
}
