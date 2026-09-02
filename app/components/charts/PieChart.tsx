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
      <Pie data={data} options={{ maintainAspectRatio: false, plugins: { legend: { display: showLegend, position: "right" } } }} />
    </div>
  );
}
