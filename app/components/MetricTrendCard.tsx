"use client";

import { useState } from "react";
import LineChart from "./charts/LineChart";
import ChangeBadge from "./ChangeBadge";

export default function MetricTrendCard({
  title,
  chartData,
  currentValue,
  priorValue,
  comparePeriodLabel,
  formatValue,
}: {
  title: string;
  chartData: { labels: string[]; datasets: { label: string; data: number[]; borderColor: string; backgroundColor: string; tension: number }[] };
  currentValue: number;
  priorValue: number | null;
  comparePeriodLabel: string;
  formatValue: (v: number) => string;
}) {
  const [showCompare, setShowCompare] = useState(false);
  const delta = priorValue !== null ? currentValue - priorValue : null;

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
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
            Comparar vs. {comparePeriodLabel}
          </button>
        )}
      </div>

      {showCompare && priorValue !== null && (
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-lg font-semibold text-ink">{formatValue(currentValue)}</span>
          <ChangeBadge value={delta} />
          <span className="text-xs text-ink-faint">vs. {formatValue(priorValue)}</span>
        </div>
      )}

      <LineChart data={chartData} />
    </div>
  );
}
