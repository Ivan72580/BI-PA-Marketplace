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
  getPlayerComplaintsSummary,
  getAppReviewSatisfaction,
  listFacilityProfileStatus,
} from "../lib/db/queries";
import { gamesPerPeriodAverage, formatPerPeriod, todayISO } from "../lib/period";
import ChangeBadge from "./ChangeBadge";

type Translator = (key: string, values?: Record<string, string | number>) => string;
type Severity = "critical" | "notable" | "info";
type Alert = { text: string; severity: Severity; href?: string };

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

// ---------- Tarjeta KPI compacta ----------
// Un valor grande + un badge de variación opcional + una línea de contexto
// opcional — nunca una explicación. `delta` undefined = sin badge (KPIs sin
// comparación útil, ej. rating); `delta` null = "sin datos previos" (mismo
// criterio que ChangeBadge en el resto de la app).
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
// nueva. Los umbrales de "Game Health" (confirmación<50%, motivo>35% de las
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
    fieldQualityWorst: Awaited<ReturnType<typeof getGameReviewSatisfaction>>["facilityFieldQuality"][number] | undefined;
    profileLoaded: number;
    profileTotal: number;
  },
  t: Translator
): Alert[] {
  const { overview, networkForecast: nf, dailyRisk, forecastRisk, regionRows, fieldQualityWorst, profileLoaded, profileTotal } = data;
  const alerts: Alert[] = [];

  if (overview.confirmationRate < 0.5) {
    alerts.push({ text: t("alerts.lowConfirmation", { pct: formatPct(overview.confirmationRate) }), severity: "critical" });
  }

  const topReason = overview.cancellationBreakdown[0];
  if (topReason && topReason.pct > 0.35) {
    alerts.push({
      text: t("alerts.topReason", { reason: topReason.label, pct: (topReason.pct * 100).toFixed(0), count: topReason.count }),
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

  const worstRegion = [...regionRows]
    .filter((r) => r.confirmation?.changePts !== null && r.confirmation !== null)
    .sort((a, b) => (a.confirmation!.changePts as number) - (b.confirmation!.changePts as number))[0];
  if (worstRegion && (worstRegion.confirmation!.changePts as number) <= -0.03) {
    alerts.push({
      text: t("alerts.regionDrop", { region: worstRegion.regionName, pts: Math.abs((worstRegion.confirmation!.changePts as number) * 100).toFixed(0) }),
      severity: "notable",
    });
  }

  if (fieldQualityWorst) {
    alerts.push({
      text: t("alerts.fieldQualityWorst", { facility: fieldQualityWorst.facilityName, pct: (fieldQualityWorst.pctFieldQualityNegative * 100).toFixed(0) }),
      severity: "info",
      href: "/panel-ejecutivo/satisfaction",
    });
  }

  if (profileTotal > 0 && profileLoaded === 0) {
    alerts.push({
      text: t("alerts.profileCoverageEmpty", { total: profileTotal }),
      severity: "info",
      href: "/panel-ejecutivo/facilities",
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// Vista de Leadership: a propósito NUNCA toma filtros de región/market/
// facility (a diferencia de Overview, que sigue lo que esté seleccionado en
// el FilterPanel) — siempre es la red completa. Es un monitor: los números
// y las alertas son el contenido, no hay texto explicando el porqué de cada
// uno — para eso está el resto de la app (Overview/Daily/Trends/Market/
// Forecast/Satisfaction), a la que esta página linkea en vez de duplicar.
export default async function LeadershipOverview({ month, locale }: { month: string; locale: Locale }) {
  const t = await getTranslations("Leadership");

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  // Comparación contra el MISMO TRAMO de días del mes anterior (no el mes
  // anterior completo) — mismo criterio que la fila de KPIs hero de Overview
  // (app/page.tsx, resolvePartialPriorMonth): un mes a mitad de camino
  // siempre "pierde" contra un mes anterior entero. Esto es intencionalmente
  // DISTINTO de la comparación de la tabla por región más abajo (mes
  // anterior completo, heredada de getRegionRanking/getRegionConfirmation-
  // Ranking) — están etiquetadas por separado para que no se lean como el
  // mismo criterio.
  const dayOfMonth = new Date().getUTCDate();
  const priorMonthStart = new Date(Date.UTC(year, monthNum - 2, 1));
  const priorPartialEnd = new Date(priorMonthStart);
  priorPartialEnd.setUTCDate(priorMonthStart.getUTCDate() + dayOfMonth - 1);
  priorPartialEnd.setUTCHours(23, 59, 59, 999);

  const today = todayISO();

  const [
    overview,
    priorOverview,
    projection,
    regionVolume,
    regionConfirmation,
    extended,
    dailyRisk,
    networkForecast,
    forecastRisk,
    gameReviews,
    complaints,
    appReviews,
    profileStatus,
  ] = await Promise.all([
    getOverviewData({ dateFrom: monthStart, dateTo: monthEnd }, locale),
    getOverviewData({ dateFrom: priorMonthStart, dateTo: priorPartialEnd }, locale),
    getMonthProjection({}, locale),
    getRegionRanking({}, month),
    getRegionConfirmationRanking({}, month),
    getExtendedMetrics({ dateFrom: monthStart, dateTo: monthEnd }),
    getDailyRiskFacilities(today),
    getNetworkForecast({}, "week", today),
    getForecastRiskFacilities({}, "week", today),
    getGameReviewSatisfaction(),
    getPlayerComplaintsSummary(),
    getAppReviewSatisfaction(),
    listFacilityProfileStatus(),
  ]);

  const confirmationByRegion = new Map(regionConfirmation.map((r) => [r.regionId, r]));
  const regionRows = regionVolume.map((r) => ({
    ...r,
    confirmation: confirmationByRegion.get(r.regionId) ?? null,
  }));

  const perPeriod = (n: number) => {
    const avg = gamesPerPeriodAverage(n, monthStart, monthEnd);
    return avg ? formatPerPeriod(avg, locale) : undefined;
  };

  // Deltas de la fila hero — null cuando el mes anterior no tiene datos
  // (mismo caso que ChangeBadge ya maneja como "sin datos previos").
  const hasPrior = priorOverview.totalGames > 0;
  const gamesDelta = hasPrior && priorOverview.confirmedGames > 0 ? (overview.confirmedGames - priorOverview.confirmedGames) / priorOverview.confirmedGames : null;
  const confirmationDelta = hasPrior ? overview.confirmationRate - priorOverview.confirmationRate : null;
  const cancellationDelta = hasPrior ? overview.cancellationRate - priorOverview.cancellationRate : null;
  const fillRateDelta = hasPrior ? overview.avgFillRate - priorOverview.avgFillRate : null;
  const revenueDelta = hasPrior && priorOverview.totalRevenue > 0 ? (overview.totalRevenue - priorOverview.totalRevenue) / priorOverview.totalRevenue : null;
  const avgRevenueDelta =
    hasPrior && priorOverview.avgRevenuePerGame > 0 ? (overview.avgRevenuePerGame - priorOverview.avgRevenuePerGame) / priorOverview.avgRevenuePerGame : null;

  const fieldQualityWorst = gameReviews.facilityFieldQuality[0];
  const profileLoaded = profileStatus.filter((r) => r.hasProfile).length;
  const profileTotal = profileStatus.length;

  const alerts = buildAlerts(
    { overview, networkForecast, dailyRisk, forecastRisk, regionRows, fieldQualityWorst, profileLoaded, profileTotal },
    t
  );

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

      {/* Alertas: primero en la página a propósito — es lo que Leadership
          quiere ver antes que ningún número suelto. */}
      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">{t("alerts.title")}</h2>
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
          {alerts.length === 0 && <div className="text-sm text-ink-faint px-1">{t("alerts.empty")}</div>}
        </div>
      </div>

      {/* KPIs hero — mes en curso vs. mismo tramo del mes anterior. El
          caption es a propósito: la tabla por región más abajo compara
          contra el mes anterior COMPLETO (otro criterio), así que sin esto
          las dos filas de badges en la misma página podrían leerse como
          inconsistentes entre sí cuando en realidad es intencional. */}
      <div className="text-[11px] text-ink-faint -mb-1">{t("kpis.compareCaption")}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <KpiTile label={t("kpis.confirmedGames")} value={formatNum(overview.confirmedGames)} delta={gamesDelta} sub={perPeriod(overview.confirmedGames)} />
        <KpiTile label={t("kpis.confirmationRate")} value={formatPct(overview.confirmationRate)} delta={confirmationDelta} deltaUnit="pts" />
        <KpiTile label={t("kpis.cancellationRate")} value={formatPct(overview.cancellationRate)} delta={cancellationDelta} deltaUnit="pts" invert />
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
        {/* Comparación por región */}
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

        <div className="space-y-4">
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

          {/* Player Satisfaction — rollup, el detalle vive en /panel-ejecutivo/satisfaction */}
          <div className="rounded-2xl bg-surface shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold text-ink">{t("satisfaction.title")}</h2>
              <Link href="/panel-ejecutivo/satisfaction" className="text-xs text-brand hover:underline shrink-0">
                {t("viewDetail")}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-ink-faint">{t("satisfaction.gameRating")}</div>
                <div className="font-display text-xl font-semibold text-ink mt-0.5">
                  {gameReviews.summary.averageRating !== null ? gameReviews.summary.averageRating.toFixed(2) : "—"}
                </div>
              </div>
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
                  {profileLoaded}/{profileTotal}
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
