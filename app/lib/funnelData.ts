import { getPeriodMultiplier } from "./timeUtils";

type FunnelData = {
  stages: {
    name: string;
    users: number;
    dropOff: number;
  }[];
  retention: {
    day1: number;
    day7: number;
    day30: number;
  };
  cohortSeries: number[];
};

export function getFunnelData(
  region: string,
  year: string,
  month: string
): FunnelData {
  const baseUsers =
    (region === "North" ? 10000 :
    region === "South" ? 6000 :
    8000) * getPeriodMultiplier(year, month);

  const visits = Math.round(baseUsers);
  const productViews = Math.round(visits * 0.75);
  const addToCart = Math.round(productViews * 0.4);
  const purchases = Math.round(addToCart * 0.6);

  const stages = [
    { name: "Visits", users: visits, dropOff: 0 },
    {
      name: "Product Views",
      users: productViews,
      dropOff: Math.round((1 - productViews / visits) * 100),
    },
    {
      name: "Add to Cart",
      users: addToCart,
      dropOff: Math.round((1 - addToCart / productViews) * 100),
    },
    {
      name: "Purchases",
      users: purchases,
      dropOff: Math.round((1 - purchases / addToCart) * 100),
    },
  ];

  const retention = {
    day1: 68,
    day7: 42,
    day30: 28,
  };

  const cohortSeries =
    region === "North"
      ? [100, 82, 74, 68, 60, 55, 48]
      : [100, 78, 70, 60, 52, 45, 38];

  return {
    stages,
    retention,
    cohortSeries,
  };
}