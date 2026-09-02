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
  type Plugin,
} from "chart.js";
import { Line } from "react-chartjs-2";

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
        ctx.fillStyle = (dataset.borderColor as string) ?? "#12161c";
        ctx.textAlign = "center";
        ctx.fillText(`${raw}%`, point.x, point.y - 8);
        ctx.restore();
      });
    });
  },
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function EvolutionChart({ data }: { data: ChartData<"line"> }) {
  return (
    <div style={{ height: 240 }}>
      <Line
        data={data}
        plugins={[valueLabelsPlugin]}
        options={{
          maintainAspectRatio: false,
          layout: { padding: { top: 16 } },
          plugins: { legend: { position: "bottom" } },
          scales: { y: { ticks: { callback: (v) => `${v}%` } } },
        }}
      />
    </div>
  );
}
