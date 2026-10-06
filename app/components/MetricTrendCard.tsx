"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import LineChart from "./charts/LineChart";
import ChangeBadge from "./ChangeBadge";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function MetricTrendCard({
  title,
  chartData,
  currentValue,
  priorValue,
  comparePeriodLabel,
  currentPeriodLabel,
  priorSeries,
}: {
  title: string;
  chartData: { labels: string[]; datasets: { label: string; data: number[]; borderColor: string; backgroundColor: string; tension: number }[] };
  currentValue: number;
  priorValue: number | null;
  comparePeriodLabel: string;
  currentPeriodLabel?: string;
  // Evolución del período anterior, alineada por posición con chartData.labels
  // (1.er bucket del anterior vs 1.er bucket del actual). `labels` son los buckets propios del anterior.
  priorSeries?: { labels: string[]; data: (number | null)[] } | null;
}) {
  const t = useTranslations("Trends.metricCard");
  const [showCompare, setShowCompare] = useState(false);
  const overlay = showCompare && !!priorSeries && priorSeries.data.length > 0;
  const withPrior = overlay
    ? {
        labels: chartData.labels,
        datasets: [
          { ...chartData.datasets[0], label: currentPeriodLabel ?? "" , bucketLabels: chartData.labels } as (typeof chartData.datasets)[number],
          {
            label: comparePeriodLabel,
            data: chartData.labels.map((_, i) => priorSeries!.data[i] ?? null),
            bucketLabels: priorSeries!.labels,
            borderColor: "#9ca3af",
            backgroundColor: "transparent",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 2,
            fill: false,
            tension: chartData.datasets[0].tension,
            spanGaps: false,
          } as unknown as (typeof chartData.datasets)[number],
        ],
      }
    : chartData;
  const delta = priorValue !== null ? currentValue - priorValue : null;

  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="flex items-center justify-between mb-1 gap-2">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {priorValue !== null && (
          <button
            type="button"
            onClick={() => setShowCompare((v) => !v)}
            className={`shrink-0 text-[10px] px-2 py-1 rounded-md transition-colors ${
              showCompare ? "bg-brand text-white" : "bg-surface-sunken text-ink-faint hover:text-ink-muted"
            }`}
          >
            {t("compareVs", { label: comparePeriodLabel })}
          </button>
        )}
      </div>

      {showCompare && priorValue !== null && (
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-lg font-semibold text-ink">{formatPct(currentValue)}</span>
          <ChangeBadge value={delta} unit="pts" />
          <span className="text-xs text-ink-faint">{t("vsLabel", { value: formatPct(priorValue) })}</span>
        </div>
      )}

      <LineChart data={withPrior} showLegend={overlay ? true : undefined} />
    </div>
  );
}
