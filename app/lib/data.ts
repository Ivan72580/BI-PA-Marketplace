import { getPeriodMultiplier } from "./timeUtils";

type OverviewData = {
  metrics: {
    revenue: number;
    revenueChange: number;

    fillRate: number;
    fillRateChange: number;

    conversion: number;
    conversionChange: number;

    retention: number;
    retentionChange: number;
  };
  revenueSeries: number[];
previousRevenueSeries: number[];
occupancySeries: number[];
};

export function getOverviewData(
  region: string,
  year: string,
  month: string
): OverviewData {
  const periodMultiplier = getPeriodMultiplier(year, month);

  const baseRevenue =
    (region === "North" ? 180000 :
    region === "South" ? 120000 :
    142300) * periodMultiplier;

  const revenueBaseData =
    region === "North"
      ? [30000, 32000, 35000, 33000, 36000, 40000]
      : region === "South"
      ? [15000, 18000, 20000, 17000, 22000, 25000]
      : [20000, 25000, 27000, 24000, 30000, 35000];

  const revenueSeries = revenueBaseData.map((value) =>
    Math.round(value * periodMultiplier)
  );

  const previousRevenueSeries = revenueSeries.map(v => Math.round(v * 0.92));

  const occupancySeries =
    region === "North"
      ? [60, 72, 85, 78, 92, 95, 88, 70]
      : region === "South"
      ? [30, 45, 50, 40, 60, 65, 55, 35]
      : [45, 60, 72, 55, 88, 92, 75, 58];

  const previousRevenue = baseRevenue * 0.92;

return {
  metrics: {
    revenue: baseRevenue,
    revenueChange: Math.round(((baseRevenue - previousRevenue) / previousRevenue) * 100),

    fillRate: 81,
    fillRateChange: -2,

    conversion: 19,
    conversionChange: 1,

    retention: 38,
    retentionChange: -3,
  },
  revenueSeries,
  previousRevenueSeries,
  occupancySeries,
};
}

export function getOverviewInsight(metrics: any) {

  const insights: string[] = []

  if (metrics.revenueChange > 8) {
    insights.push("🚀 Revenue is accelerating vs previous period.")
  }

  if (metrics.revenueChange < -8) {
    insights.push("⚠ Revenue decline detected vs previous period.")
  }

  if (metrics.fillRateChange < -3) {
    insights.push("⚠ Fill rate weakening, possible supply-demand imbalance.")
  }

  if (metrics.conversionChange < -2) {
    insights.push("⚠ Conversion decline suggests funnel inefficiency.")
  }

  if (metrics.retentionChange <= -3) {
    insights.push("⚠ Retention weakening, churn risk increasing.")
  }

  if (insights.length === 0) {
    insights.push("✅ Performance remains stable across main KPIs.")
  }

  return insights
}

export function getTrendLabel(change: number) {
  if (change >= 8) return "↑ accelerating";
  if (change >= 3) return "↑ improving";
  if (change > -3) return "→ stable";
  if (change > -8) return "⚠ weakening";
  return "↓ declining";
}

export const citiesData = [

  { name: "City A", revenue: 25000, occupancy: 82 },
  { name: "City B", revenue: 18000, occupancy: 74 },
  { name: "City C", revenue: 12000, occupancy: 69 },
  { name: "City D", revenue: 9000, occupancy: 61 }

];

export const facilitiesData = [

  { name: "Facility 1", revenue: 12000, occupancy: 78 },
  { name: "Facility 2", revenue: 10000, occupancy: 72 },
  { name: "Facility 3", revenue: 8000, occupancy: 52 },
  { name: "Facility 4", revenue: 6000, occupancy: 48 }

];