type Metrics = {
  revenue: number
  growth: number
  conversion: number
  occupancy: number
  retention: number
}

export function calculatePerformanceScore(metrics: Metrics) {

  const revenueScore = Math.min(metrics.revenue / 200000, 1) * 30
  const growthScore = Math.max(Math.min(metrics.growth / 20, 1), -1) * 20
  const conversionScore = Math.min(metrics.conversion / 25, 1) * 15
  const occupancyScore = Math.min(metrics.occupancy / 100, 1) * 20
  const retentionScore = Math.min(metrics.retention / 60, 1) * 15

  const score =
    revenueScore +
    growthScore +
    conversionScore +
    occupancyScore +
    retentionScore

  return Math.round(score)
}

export function rankByPerformance(entities: any[]) {

  return entities
    .map((entity) => {

      const metrics = entity.metrics || {
        revenue: entity.revenue || 0,
        growth: entity.growth || 0,
        conversion: entity.conversion || 0,
        occupancy: entity.occupancy || 0,
        retention: entity.retention || 0
      }

      return {
        ...entity,
        score: calculatePerformanceScore(metrics)
      }
    })
    .sort((a, b) => b.score - a.score)
}