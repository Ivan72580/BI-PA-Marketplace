"use client";

import { useRouter } from "next/navigation";

import { Line, Bar } from "react-chartjs-2";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

export default function AnalyticsDashboard({
  title,
  trendData,
  breakdown1,
  breakdown2,
  occupancy,
  onBreakdownClick
}: any) {

  const router = useRouter();

  return (
    <div>

      <h1 style={{ marginBottom: "30px" }}>
        {title}
      </h1>

      {/* Trend */}

      <div
        style={{
          background: "white",
          padding: "25px",
          borderRadius: "16px",
          marginBottom: "30px",
          border: "1px solid #f1f5f9"
        }}
      >
        <h3 style={{ marginBottom: "20px" }}>
          Revenue Trend
        </h3>

        <Line data={trendData} />
      </div>

      {/* Breakdown */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "25px",
          marginBottom: "30px"
        }}
      >

        <div
          style={{
            background: "white",
            padding: "25px",
            borderRadius: "16px",
            border: "1px solid #f1f5f9"
          }}
        >
          <h3 style={{ marginBottom: "20px" }}>
            Breakdown A
          </h3>

          <Bar
  data={breakdown1}
  options={{
    onClick: (event, elements) => {

      if (!elements.length || !onBreakdownClick) return;

      const index = elements[0].index;
      const label = breakdown1.labels[index];

      onBreakdownClick(label);
    }
  }}
/>
        </div>

        <div
          style={{
            background: "white",
            padding: "25px",
            borderRadius: "16px",
            border: "1px solid #f1f5f9"
          }}
        >
          <h3 style={{ marginBottom: "20px" }}>
            Breakdown B
          </h3>

          <Bar data={breakdown2} />
        </div>

      </div>

      {/* Occupancy */}

      <div
        style={{
          background: "white",
          padding: "25px",
          borderRadius: "16px",
          border: "1px solid #f1f5f9"
        }}
      >
        <h3 style={{ marginBottom: "20px" }}>
          Occupancy by Hour
        </h3>

        <Bar data={occupancy} />
      </div>

    </div>
  );
}