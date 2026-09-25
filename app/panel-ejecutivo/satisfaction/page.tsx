import { getTranslations } from "next-intl/server";
import { getGameReviewSatisfaction, getPlayerComplaintsSummary, getAppReviewSatisfaction } from "../../lib/db/queries";
import Tabs from "../../components/Tabs";
import GameReviewsPanel from "../../components/GameReviewsPanel";
import AppReviewsPanel from "../../components/AppReviewsPanel";

// El chequeo de acceso ahora vive una sola vez en layout.tsx. El link
// "volver" también se sacó de acá: la barra de pestañas del layout ya cubre
// esa navegación.
export default async function PlayerSatisfactionPage() {
  const [t, gameReviewData, complaints, appReviewData] = await Promise.all([
    getTranslations("PlayerSatisfaction"),
    getGameReviewSatisfaction(),
    getPlayerComplaintsSummary(),
    getAppReviewSatisfaction(),
  ]);

  return (
    <div>
      <div className="mb-6 pb-5 border-b border-border">
        <h1 className="font-display text-2xl font-bold text-ink">{t("pageTitle")}</h1>
        <div className="text-sm text-ink-faint mt-1">{t("subtitle")}</div>
      </div>

      <div className="rounded-xl bg-brand-soft border border-brand/20 px-4 py-3 mb-6 text-sm text-ink-muted">
        {t("caveat")}
      </div>

      <Tabs
        tabs={[
          {
            id: "gameReviews",
            label: t("tabs.gameReviews"),
            content: (
              <GameReviewsPanel
                summary={gameReviewData.summary}
                complaints={complaints}
                facilityFieldQuality={gameReviewData.facilityFieldQuality}
                recentReviews={gameReviewData.recentReviews}
              />
            ),
          },
          {
            id: "appReviews",
            label: t("tabs.appReviews"),
            content: <AppReviewsPanel summary={appReviewData.summary} recentReviews={appReviewData.recentReviews} />,
          },
        ]}
      />
    </div>
  );
}
