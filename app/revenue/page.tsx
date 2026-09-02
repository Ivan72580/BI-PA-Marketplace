"use client";

import { useGlobal } from "../context/GlobalContext";
import { getOverviewData } from "../lib/data";
import { useRouter } from "next/navigation";
import Breadcrumbs from "../components/Breadcrumbs";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from "chart.js";

import { Line, Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

export default function RevenuePage() {
  const router = useRouter();

  const { region, year, month } = useGlobal();
  
  const data = getOverviewData(region, year, month);
  

  const revenueTrend = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        label: "Revenue",
        data: data.revenueSeries,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.2)",
        tension: 0.4
      }
    ]
  };

  const revenueByRegion = {
    labels: ["North", "South", "East", "West"],
    datasets: [
      {
        label: "Revenue",
        data: [70000, 42000, 21000, 15000],
        backgroundColor: "#2563eb"
      }
    ]
  };

  const revenueByFacility = {
    labels: ["Padel", "Tennis", "Soccer", "Pickleball"],
    datasets: [
      {
        data: [45, 30, 15, 10],
        backgroundColor: [
          "#2563eb",
          "#16a34a",
          "#f59e0b",
          "#ef4444"
        ]
      }
    ]
  };

  const revenueByHour = {
    labels: ["8h", "10h", "12h", "14h", "16h", "18h", "20h", "22h"],
    datasets: [
      {
        label: "Revenue",
        data: [5000, 8000, 10000, 12000, 18000, 25000, 22000, 14000],
        backgroundColor: "#16a34a"
      }
    ]
  };

  return (
    <div>

      <Breadcrumbs
  items={[
    { label: "Overview", href: "/" },
    { label: "Revenue" }
  ]}
/>

      <h1 style={{ marginBottom: "30px" }}>
        Revenue Analysis
      </h1>

      {/* Revenue Trend */}

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

        <Line data={revenueTrend} />
      </div>

      {/* Middle charts */}

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
            Revenue by Region
          </h3>

          <Bar
  data={revenueByRegion}
  options={{
    onClick: (event, elements) => {

      if (!elements.length) return;

      const index = elements[0].index;
      const region = revenueByRegion.labels[index];

      router.push(`/region/${region}`);
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
            Revenue by Facility Type
          </h3>

          <Doughnut data={revenueByFacility} />
        </div>

      </div>

      {/* Revenue by hour */}

      <div
        style={{
          background: "white",
          padding: "25px",
          borderRadius: "16px",
          border: "1px solid #f1f5f9"
        }}
      >
        <h3 style={{ marginBottom: "20px" }}>
          Revenue by Time of Day
        </h3>

        <Bar data={revenueByHour} />
      </div>

    </div>
  );
}