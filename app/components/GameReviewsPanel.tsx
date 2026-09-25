import { getTranslations } from "next-intl/server";
import type { GameReviewTag } from "@prisma/client";
import type { GameReviewSummary, FacilityFieldQualityRow, RecentGameReview, PlayerComplaintsSummary } from "../lib/db/queries";
import KpiCard from "./KpiCard";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// Etiqueta legible por tag — separado de la traducción de la UI general
// porque el valor viene directo de la base (enum), no de un texto libre.
const TAG_KEY: Record<GameReviewTag, string> = {
  FRIENDLY_PLAYERS: "friendlyPlayers",
  COMPETITIVE_GAME: "competitiveGame",
  NOT_COMPETITIVE: "notCompetitive",
  GOOD_PLAYERS: "goodPlayers",
  ISSUES_WITH_OTHER_PLAYERS: "issuesWithOtherPlayers",
  FIELD_QUALITY_GREAT: "fieldQualityGreat",
  FIELD_QUALITY_GOOD: "fieldQualityGood",
  FIELD_CONDITIONS_ISSUES: "fieldConditionsIssues",
};

export default async function GameReviewsPanel({
  summary,
  complaints,
  facilityFieldQuality,
  recentReviews,
}: {
  summary: GameReviewSummary;
  complaints: PlayerComplaintsSummary;
  facilityFieldQuality: FacilityFieldQualityRow[];
  recentReviews: RecentGameReview[];
}) {
  const t = await getTranslations("PlayerSatisfaction.gameReviews");
  const tTag = await getTranslations("PlayerSatisfaction.gameReviews.tags.labels");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t("summary.totalReviews")} value={summary.totalReviews.toLocaleString("en-US")} />
        <KpiCard
          label={t("summary.averageRating")}
          value={summary.averageRating !== null ? summary.averageRating.toFixed(2) : "—"}
        />
        <KpiCard
          label={t("summary.playerComplaints")}
          value={formatPct(complaints.pctOfReviews)}
          sublabel={t("summary.playerComplaintsSublabel", { n: complaints.totalReviewsWithComplaint.toLocaleString("en-US") })}
        />
        <KpiCard
          label={t("summary.dateRange")}
          value={summary.earliestDate && summary.latestDate ? `${summary.earliestDate} → ${summary.latestDate}` : "—"}
        />
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">{t("tags.title")}</h2>
        <div className="text-xs text-ink-faint mb-4">{t("tags.subtitle")}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">{t("tags.headers.tag")}</th>
                <th className="py-1.5 px-2 font-normal">{t("tags.headers.count")}</th>
                <th className="py-1.5 px-2 font-normal">{t("tags.headers.pct")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.tagCounts.map((row) => (
                <tr key={row.tag} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2 text-ink font-medium">{tTag(TAG_KEY[row.tag])}</td>
                  <td className="py-1.5 px-2 text-ink">{row.count.toLocaleString("en-US")}</td>
                  <td className="py-1.5 px-2 text-ink-muted">{formatPct(row.pctOfReviews)}</td>
                </tr>
              ))}
              {summary.tagCounts.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-ink-faint">{t("tags.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">{t("fieldQuality.title")}</h2>
        <div className="text-xs text-ink-faint mb-4">{t("fieldQuality.subtitle", { min: 5 })}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">{t("fieldQuality.headers.facility")}</th>
                <th className="py-1.5 px-2 font-normal">{t("fieldQuality.headers.market")}</th>
                <th className="py-1.5 px-2 font-normal">{t("fieldQuality.headers.reviews")}</th>
                <th className="py-1.5 px-2 font-normal">{t("fieldQuality.headers.avgRating")}</th>
                <th className="py-1.5 px-2 font-normal">{t("fieldQuality.headers.positivePct")}</th>
                <th className="py-1.5 px-2 font-normal">{t("fieldQuality.headers.negativePct")}</th>
              </tr>
            </thead>
            <tbody>
              {facilityFieldQuality.map((row) => (
                <tr key={row.facilityId} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2 text-ink font-medium">{row.facilityName}</td>
                  <td className="py-1.5 px-2 text-ink-muted">{row.marketName}</td>
                  <td className="py-1.5 px-2 text-ink">{row.totalReviews.toLocaleString("en-US")}</td>
                  <td className="py-1.5 px-2 text-ink">{row.averageRating.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-ink">{formatPct(row.pctFieldQualityPositive)}</td>
                  <td className={`py-1.5 px-2 font-medium ${row.pctFieldQualityNegative > 0 ? "text-danger" : "text-ink"}`}>
                    {formatPct(row.pctFieldQualityNegative)}
                  </td>
                </tr>
              ))}
              {facilityFieldQuality.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-ink-faint">{t("fieldQuality.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RecentGameReviewsList reviews={recentReviews} />
    </div>
  );
}

async function RecentGameReviewsList({ reviews }: { reviews: RecentGameReview[] }) {
  const t = await getTranslations("PlayerSatisfaction.gameReviews.recent");
  const tTag = await getTranslations("PlayerSatisfaction.gameReviews.tags.labels");

  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5">
      <h2 className="font-display text-lg font-semibold text-ink mb-1">{t("title")}</h2>
      <div className="text-xs text-ink-faint mb-4">{t("subtitle")}</div>
      <div className="flex flex-col gap-3">
        {reviews.map((r) => (
          <div key={r.id} className="border-b border-surface-sunken pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-medium text-ink">{r.facilityName}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-faint">{r.date}</span>
                <span className="text-xs font-semibold text-brand">{"★".repeat(r.rating)}{"☆".repeat(Math.max(0, 5 - r.rating))}</span>
              </div>
            </div>
            {r.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {r.tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-sunken text-ink-muted">
                    {tTag(TAG_KEY[tag])}
                  </span>
                ))}
              </div>
            )}
            <div className="text-sm text-ink-muted mt-1.5">{r.reviewText ?? t("noText")}</div>
          </div>
        ))}
        {reviews.length === 0 && <div className="text-sm text-ink-faint text-center py-4">{t("empty")}</div>}
      </div>
    </div>
  );
}
