"use client";

import { useGlobal } from "../context/GlobalContext";
import { getFunnelData } from "../lib/funnelData";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

export default function FunnelPage() {
  const { region, year, month } = useGlobal();

  const data = getFunnelData(region, year, month);

  const stageData = {
    labels: data.stages.map((s) => s.name),
    datasets: [
      {
        label: "Users",
        data: data.stages.map((s) => s.users),
        backgroundColor: "#0ea5e9",
      },
    ],
  };

  const cohortData = {
    labels: ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"],
    datasets: [
      {
        label: "Retention %",
        data: data.cohortSeries,
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.2)",
        tension: 0.4,
      },
    ],
  };

  return (
    <div>
      <h1 style={{ marginBottom: "20px" }}>Funnel & Retention</h1>

      {/* RETENTION KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <KpiCard title="Retention D1" value={`${data.retention.day1}%`} />
        <KpiCard title="Retention D7" value={`${data.retention.day7}%`} />
        <KpiCard title="Retention D30" value={`${data.retention.day30}%`} />
      </div>

      {/* FUNNEL CHART */}
      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "30px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
        }}
      >
        <h3 style={{ marginBottom: "15px" }}>Funnel Stages</h3>
        <Bar data={stageData} />
      </div>

      {/* COHORT CHART */}
      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
        }}
      >
        <h3 style={{ marginBottom: "15px" }}>Retention Cohort</h3>
        <Line data={cohortData} />
      </div>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        background: "white",
        padding: "24px",
        borderRadius: "16px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
        transition: "all 0.2s ease",
        border: "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "30px",
          fontWeight: 600,
          marginTop: "12px",
          color: "#0f172a",
        }}
      >
        {value}
      </div>
    </div>
  );
}
