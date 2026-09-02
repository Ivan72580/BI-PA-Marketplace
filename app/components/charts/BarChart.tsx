"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartData,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function BarChart({ data }: { data: ChartData<"bar"> }) {
  return (
    <div style={{ height: 220 }}>
      <Bar data={data} options={{ maintainAspectRatio: false }} />
    </div>
  );
}
