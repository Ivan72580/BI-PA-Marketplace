"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartData,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function LineChart({ data }: { data: ChartData<"line"> }) {
  return (
    <div style={{ height: 220 }}>
      <Line data={data} options={{ maintainAspectRatio: false }} />
    </div>
  );
}
