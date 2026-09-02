type Metrics = {
  revenueChange: number
  fillRateChange: number
  conversionChange: number
  retentionChange: number
}

export function getRootCauses(metrics: Metrics) {

  const causes: string[] = []

  if (metrics.revenueChange < -5) {
    causes.push("Revenue decline detected vs previous period.")
  }

  if (metrics.fillRateChange < -3) {
    causes.push("Fill rate dropped, suggesting supply-demand imbalance.")
  }

  if (metrics.conversionChange < -2) {
    causes.push("Conversion rate decreased, indicating weaker acquisition funnel.")
  }

  if (metrics.retentionChange <= -3) {
    causes.push("Retention weakening, potential churn risk.")
  }

  if (causes.length === 0) {
    causes.push("No major risk signals detected across KPIs.")
  }

  return causes
}