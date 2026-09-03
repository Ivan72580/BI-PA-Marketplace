"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
} from "chart.js";
import { Pie } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function PieChart({ data, showLegend = true }: { data: ChartData<"pie">; showLegend?: boolean }) {
  return (
    <div style={{ height: 220 }}>
      <Pie
        data={data}
        options={{
          maintainAspectRatio: false,
          plugins: {
            legend: { display: showLegend, position: "right" },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const values = (ctx.dataset.data as number[]) ?? [];
                  const total = values.reduce((s, v) => s + (v ?? 0), 0);
                  const value = (ctx.raw as number) ?? 0;
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                  return `${ctx.label}: ${value.toLocaleString("en-US")} (${pct}%)`;
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
