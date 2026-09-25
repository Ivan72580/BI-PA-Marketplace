import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import {
  getOverviewData,
  getMonthProjection,
  getRegionRanking,
  getRegionConfirmationRanking,
} from "../lib/db/queries";
import ChangeBadge from "./ChangeBadge";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// Vista de Leadership: a propósito NUNCA toma filtros de región/market/
// facility (a diferencia de Overview, que sigue lo que esté seleccionado en
// el FilterPanel) — siempre es la red completa, para que la lectura no
// dependa de qué haya quedado filtrado en otra pestaña. El ranking por
// región (East/West) es contenido nuevo: no existe en ninguna otra página
// hoy (Overview mira la red entera, Market compara markets/facilities
// dentro de una región).
export default async function LeadershipOverview({ month, locale }: { month: string; locale: Locale }) {
  const t = await getTranslations("Leadership");

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  const [overview, projection, regionVolume, regionConfirmation] = await Promise.all([
    getOverviewData({ dateFrom: monthStart, dateTo: monthEnd }, locale),
    getMonthProjection({}, locale),
    getRegionRanking({}, month),
    getRegionConfirmationRanking({}, month),
  ]);

  // Combina ambos rankings por regionId en una sola fila — el de volumen no
  // tiene el piso de MIN_GAMES_FOR_RANKING (una región siempre tiene mucho
  // más volumen que eso), así que es la lista base; la tasa de confirmación
  // se busca por id y queda "—" en el caso hipotético de que faltara.
  const confirmationByRegion = new Map(regionConfirmation.map((r) => [r.regionId, r]));
  const regionRows = regionVolume.map((r) => ({
    ...r,
    confirmation: confirmationByRegion.get(r.regionId) ?? null,
  }));

  return (
    <div>
      <div className="mb-6 pb-5 border-b border-border">
        <h1 className="font-display text-3xl font-bold text-ink">{t("pageTitle")}</h1>
        <div className="text-sm text-ink-faint mt-1">{t("subtitle")}</div>
      </div>

      <div className="rounded-xl bg-brand-soft border border-brand/20 px-4 py-3 mb-6 inline-block">
        {projection.available ? (
          <>
            <div className="text-sm text-brand font-medium">
              {t("projection.title", { month: projection.monthLabel, n: projection.projectedGames!.toLocaleString("en-US") })}
            </div>
            <div className="text-xs text-ink-faint mt-0.5">
              {t("projection.detail", {
                revenue: formatUSD(projection.projectedRevenue!),
                confirmed: projection.confirmedSoFar.toLocaleString("en-US"),
                elapsed: projection.daysElapsed,
                total: projection.daysInMonth,
              })}
            </div>
          </>
        ) : (
          <div className="text-sm text-ink-muted">
            {t("projection.notYetAvailable", { month: projection.monthLabel, day: projection.availableFromDay })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl bg-surface shadow-sm p-4">
          <div className="text-xs text-ink-faint">{t("kpis.confirmationRate")}</div>
          <div className="font-display text-2xl font-semibold text-ink mt-1">{formatPct(overview.confirmationRate)}</div>
        </div>
        <div className="rounded-2xl bg-surface shadow-sm p-4">
          <div className="text-xs text-ink-faint">{t("kpis.cancellationRate")}</div>
          <div className="font-display text-2xl font-semibold text-ink mt-1">{formatPct(overview.cancellationRate)}</div>
        </div>
        <div className="rounded-2xl bg-surface shadow-sm p-4">
          <div className="text-xs text-ink-faint">{t("kpis.avgFillRate")}</div>
          <div className="font-display text-2xl font-semibold text-ink mt-1">{formatPct(overview.avgFillRate)}</div>
        </div>
        <div className="rounded-2xl bg-surface shadow-sm p-4">
          <div className="text-xs text-ink-faint">{t("kpis.totalRevenue")}</div>
          <div className="font-display text-2xl font-semibold text-ink mt-1">{formatUSD(overview.totalRevenue)}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">{t("regionTable.title")}</h2>
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
                  <td className="py-1.5 px-2 text-ink">{r.confirmedGames.toLocaleString("en-US")}</td>
                  <td className="py-1.5 px-2">
                    <ChangeBadge value={r.changePct} />
                  </td>
                  <td className="py-1.5 px-2 text-ink">
                    {r.confirmation ? formatPct(r.confirmation.confirmationRate) : "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <ChangeBadge value={r.confirmation?.changePts ?? null} />
                  </td>
                </tr>
              ))}
              {regionRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-ink-faint">{t("regionTable.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-5">
        <Link href="/market" className="text-sm text-brand hover:underline">
          {t("marketDetailLink")}
        </Link>
        <Link href="/leadership/facilities" className="text-sm text-brand hover:underline">
          {t("facilityProfilesLink")}
        </Link>
      </div>
    </div>
  );
}
