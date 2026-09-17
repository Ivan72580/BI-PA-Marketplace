"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { withHaloStyle } from "@/app/lib/chartHalo";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function LineChart({ data }: { data: ChartData<"line"> }) {
  const haloData = { ...data, datasets: withHaloStyle(data.datasets) };
  return (
    <div style={{ height: 220 }}>
      <Line
        data={haloData}
        options={{
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          scales: { y: { beginAtZero: true } },
        }}
      />
    </div>
  );
}
