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

// Datasets pueden traer `bucketLabels` (etiqueta propia de cada punto) para el tooltip:
// útil al superponer otro período, donde el punto n no tiene la misma etiqueta que el eje.
type DatasetWithBuckets = { label?: string; bucketLabels?: string[] };

export default function LineChart({ data, showLegend }: { data: ChartData<"line">; showLegend?: boolean }) {
  const haloData = { ...data, datasets: withHaloStyle(data.datasets) };
  return (
    <div style={{ height: 220 }}>
      <Line
        data={haloData}
        options={{
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          scales: { y: { beginAtZero: true } },
          plugins: {
            // undefined = comportamiento por defecto de Chart.js (no cambia los demás gráficos).
            legend: showLegend === undefined ? undefined : { display: showLegend, labels: { boxWidth: 12, boxHeight: 2 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const ds = ctx.dataset as unknown as DatasetWithBuckets;
                  const bucket = ds.bucketLabels?.[ctx.dataIndex];
                  const name = [ds.label, bucket].filter(Boolean).join(" · ");
                  return `${name ? `${name}: ` : ""}${ctx.formattedValue}`;
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
