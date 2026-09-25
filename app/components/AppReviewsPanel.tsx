import { getTranslations } from "next-intl/server";
import type { AppReviewSource } from "@prisma/client";
import type { AppReviewSummary, RecentAppReview } from "../lib/db/queries";
import KpiCard from "./KpiCard";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// Record<AppReviewSource, ...> en vez de un objeto literal indexado a mano
// — mismo criterio que TAG_KEY en GameReviewsPanel.tsx.
const SOURCE_KEY: Record<AppReviewSource, string> = { IOS: "ios", ANDROID: "android" };

export default async function AppReviewsPanel({
  summary,
  recentReviews,
}: {
  summary: AppReviewSummary;
  recentReviews: RecentAppReview[];
}) {
  const t = await getTranslations("PlayerSatisfaction.appReviews");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t("summary.totalReviews")} value={summary.totalReviews.toLocaleString("en-US")} />
        <KpiCard
          label={t("summary.averageRating")}
          value={summary.averageRating !== null ? summary.averageRating.toFixed(2) : "—"}
        />
        <KpiCard label={t("summary.replyRate")} value={formatPct(summary.replyRate)} />
        <KpiCard
          label={t("summary.averageReplyTimeDays")}
          value={summary.averageReplyTimeDays !== null ? t("summary.days", { n: summary.averageReplyTimeDays.toFixed(1) }) : "—"}
        />
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">{t("byPlatform.title")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-muted">
                <th className="py-1.5 px-2 font-normal">{t("byPlatform.headers.platform")}</th>
                <th className="py-1.5 px-2 font-normal">{t("byPlatform.headers.count")}</th>
                <th className="py-1.5 px-2 font-normal">{t("byPlatform.headers.avgRating")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.byPlatform.map((row) => (
                <tr key={row.source} className="border-b border-surface-sunken">
                  <td className="py-1.5 px-2 text-ink font-medium">{t(`byPlatform.labels.${SOURCE_KEY[row.source]}`)}</td>
                  <td className="py-1.5 px-2 text-ink">{row.count.toLocaleString("en-US")}</td>
                  <td className="py-1.5 px-2 text-ink">{row.averageRating.toFixed(2)}</td>
                </tr>
              ))}
              {summary.byPlatform.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-ink-faint">{t("byPlatform.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">{t("recent.title")}</h2>
        <div className="text-xs text-ink-faint mb-4">{t("recent.subtitle")}</div>
        <div className="flex flex-col gap-3">
          {recentReviews.map((r) => (
            <div key={r.id} className="border-b border-surface-sunken pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-sunken text-ink-muted uppercase tracking-wide">
                  {t(`byPlatform.labels.${SOURCE_KEY[r.source]}`)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-faint">{r.reviewDate}</span>
                  <span className="text-xs font-semibold text-brand">{"★".repeat(r.rating)}{"☆".repeat(Math.max(0, 5 - r.rating))}</span>
                </div>
              </div>
              <div className="text-sm text-ink-muted mt-1.5">{r.reviewText ?? t("recent.noText")}</div>
              {r.replied && r.replyText && (
                <div className="text-xs text-ink-faint mt-1.5 pl-3 border-l-2 border-border">
                  {t("recent.replyLabel")}: {r.replyText}
                </div>
              )}
            </div>
          ))}
          {recentReviews.length === 0 && <div className="text-sm text-ink-faint text-center py-4">{t("recent.empty")}</div>}
        </div>
      </div>
    </div>
  );
}
