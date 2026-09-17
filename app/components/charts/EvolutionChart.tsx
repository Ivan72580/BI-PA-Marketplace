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
  type Plugin,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { withHaloStyle } from "@/app/lib/chartHalo";

// Plugin propio: dibuja el valor de cada punto directamente sobre el gráfico,
// para no depender de pasar el mouse por encima. No requiere ninguna
// dependencia nueva (chartjs-plugin-datalabels u otra), solo Canvas API.
const valueLabelsPlugin: Plugin<"line"> = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((point, index) => {
        const raw = dataset.data[index];
        if (raw === null || raw === undefined) return;
        ctx.save();
        ctx.font = "600 10px var(--font-sans), sans-serif";
        ctx.fillStyle = (dataset.borderColor as string) ?? "#0b3b2e";
        ctx.textAlign = "center";
        ctx.fillText(`${raw}%`, point.x, point.y - 8);
        ctx.restore();
      });
    });
  },
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function EvolutionChart({ data }: { data: ChartData<"line"> }) {
  const haloData = { ...data, datasets: withHaloStyle(data.datasets) };
  return (
    <div style={{ height: 240 }}>
      <Line
        data={haloData}
        plugins={[valueLabelsPlugin]}
        options={{
          maintainAspectRatio: false,
          layout: { padding: { top: 16 } },
          interaction: { intersect: false, mode: "index" },
          plugins: { legend: { position: "bottom" } },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}%` } } },
        }}
      />
    </div>
  );
}
