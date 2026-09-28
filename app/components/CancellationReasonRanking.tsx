import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { getCancellationReasonRanking, type OverviewFilters } from "../lib/db/queries";
import { labelForCancellationCategory } from "../lib/db/shared";
import type { CancellationCategory } from "@prisma/client";
import type { Locale } from "@/i18n/config";
import type { ResolvedPeriod } from "../lib/period";
import { buildQuery, type SP } from "../lib/searchParams";
import RankingCard, { type RankingRow } from "./RankingCard";

// Mismo cálculo que NetworkOverview.tsx (no compartido en un util común —
// varios archivos de esta app ya duplican este helper chico en vez de
// centralizarlo, ver formatUSD/formatPct).
function pctDelta(current: number, prior: number | undefined): number | undefined {
  if (prior === undefined) return undefined;
  return prior !== 0 ? (current - prior) / Math.abs(prior) : undefined;
}

// Drill-down desde "Cancellation reasons" en Overview: qué facilities están
// involucradas en un motivo puntual, en el período filtrado, con cuánto
// cambió (% Y valor absoluto) contra el período de comparación de esa misma
// vista (mes anterior por default, ver resolvePartialPriorMonth en page.tsx).
export default async function CancellationReasonRanking({
  sp,
  filters,
  category,
  period,
  comparePeriod,
  compare,
}: {
  sp: SP;
  filters: OverviewFilters;
  category: CancellationCategory;
  period: ResolvedPeriod;
  comparePeriod: ResolvedPeriod | null;
  compare: boolean;
}) {
  const t = await getTranslations("Overview");
  const locale = (await getLocale()) as Locale;

  const priorRange =
    compare && comparePeriod?.dateFrom && comparePeriod?.dateTo
      ? { dateFrom: comparePeriod.dateFrom, dateTo: comparePeriod.dateTo }
      : null;
  const ranking = await getCancellationReasonRanking(filters, category, priorRange);

  const reasonLabel = labelForCancellationCategory(category, locale);
  const totalCount = ranking.reduce((sum, r) => sum + r.count, 0);

  const rows: RankingRow[] = ranking.map((r) => {
    // priorCount null = sin período de comparación (granularity "all"/"custom")
    // — distinto de 0, que es un valor real (pasó de 0 a N cancelaciones).
    const delta = r.priorCount === null ? undefined : pctDelta(r.count, r.priorCount);
    const absDelta = r.priorCount === null ? undefined : r.count - r.priorCount;
    return {
      facilityId: r.facilityId,
      marketId: r.marketId,
      regionId: r.regionId,
      label: r.name,
      value: r.count,
      extra: absDelta === undefined ? undefined : absDelta > 0 ? `+${absDelta}` : `${absDelta}`,
      delta,
    };
  });

  return (
    <div>
      <Link href={buildQuery(sp, { cancellationReason: undefined })} className="text-sm text-brand hover:underline inline-block mb-3">
        ‹ {t("cancellationRanking.back")}
      </Link>
      <h2 className="font-display text-2xl font-bold text-ink mb-1">{t("cancellationRanking.title", { reason: reasonLabel })}</h2>
      <p className="text-sm text-ink-faint mb-5">
        {t("cancellationRanking.subtitle", { count: totalCount.toLocaleString("en-US"), period: period.label })}
      </p>

      <RankingCard
        title={t("cancellationRanking.rankingTitle")}
        subtitle={compare && comparePeriod?.label ? t("cancellationRanking.rankingSubtitle", { period: comparePeriod.label }) : undefined}
        rows={rows}
        buildHref={(facilityId, marketId, regionId) => buildQuery(sp, { facilityId, marketId, regionId, cancellationReason: undefined })}
        formatValue={(v) => t("cancellationRanking.countSuffix", { n: v })}
        tone="danger"
        invertDelta
      />
    </div>
  );
}
