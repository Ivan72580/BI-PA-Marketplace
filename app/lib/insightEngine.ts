type Insight = {
  type: "positive" | "warning" | "negative";
  message: string;
};

export function generateInsights(data: any): Insight[] {

  const insights: Insight[] = [];

  const revenueChange = data.metrics.revenueChange;
  const fillRate = data.metrics.fillRate;
  const conversion = data.metrics.conversion;

  // Revenue growth
  if (revenueChange > 10) {
    insights.push({
      type: "positive",
      message: "Revenue is growing strongly vs previous period."
    });
  }

  if (revenueChange < -10) {
    insights.push({
      type: "negative",
      message: "Revenue has dropped significantly vs previous period."
    });
  }

  // Fill rate health
  if (fillRate < 70) {
    insights.push({
      type: "warning",
      message: "Fill rate is below optimal level."
    });
  }

  // Conversion opportunity
  if (conversion < 15) {
    insights.push({
      type: "warning",
      message: "Conversion rate suggests acquisition inefficiencies."
    });
  }

  return insights;
}