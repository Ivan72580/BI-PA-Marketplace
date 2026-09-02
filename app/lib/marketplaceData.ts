import { getPeriodMultiplier } from "./timeUtils";

type MarketplaceData = {
  metrics: {
    activeUsers: number;
    sessions: number;
    ctr: number;
    conversionRate: number;
    recurringUsers: number;
  };
  funnel: {
    views: number;
    clicks: number;
    addToCart: number;
    purchases: number;
  };
  topCategories: { name: string; value: number }[];
  userActivitySeries: number[];
};

export function getMarketplaceData(
  region: string,
  year: string,
  month: string
): MarketplaceData {
  const activeUsers =
    (region === "North" ? 12000 :
    region === "South" ? 7000 :
    9500) * getPeriodMultiplier(year, month);

  const sessions = Math.round(activeUsers * 1.8);
  const ctr = 12;
  const conversionRate = 4.2;
  const recurringUsers = Math.round(activeUsers * 0.35);

  const views = Math.round(activeUsers * 5);
  const clicks = Math.round(views * 0.12);
  const addToCart = Math.round(clicks * 0.4);
  const purchases = Math.round(addToCart * 0.6);

  const topCategories =
    region === "North"
      ? [
          { name: "Premium Courts", value: 40 },
          { name: "Training Sessions", value: 25 },
          { name: "Tournaments", value: 20 },
          { name: "Merchandising", value: 15 },
        ]
      : [
          { name: "Training Sessions", value: 35 },
          { name: "Premium Courts", value: 30 },
          { name: "Merchandising", value: 20 },
          { name: "Tournaments", value: 15 },
        ];

  const userActivitySeries =
    region === "North"
      ? [300, 450, 500, 480, 620, 700]
      : [200, 300, 350, 320, 400, 450];

  return {
    metrics: {
      activeUsers: Math.round(activeUsers),
      sessions,
      ctr,
      conversionRate,
      recurringUsers,
    },
    funnel: {
      views,
      clicks,
      addToCart,
      purchases,
    },
    topCategories,
    userActivitySeries,
  };
}