"use client";

import { useParams } from "next/navigation";
import { useGlobal } from "../../context/GlobalContext";
import { getOverviewData } from "../../lib/data";
import Breadcrumbs from "../../components/Breadcrumbs";
import AnalyticsDashboard from "../../components/AnalyticsDashboard";
import TopPerformancePanel from "../../components/TopPerformancePanel";
import InsightsPanel from "../../components/InsightsPanel";
import { generateInsights } from "../../lib/insightEngine";
import { getPeriodMultiplier } from "../../lib/timeUtils";
import Leaderboard from "../../components/Leaderboard";
import { useRouter } from "next/navigation";

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

import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

export default function RegionPage() {
  
  const router = useRouter();

  const params = useParams();

  const regionName = params.region as string;

  const { year, month } = useGlobal();

  const data = getOverviewData(regionName, year, month);

  const regionRevenueTrend = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  datasets: [
    {
      label: `${regionName} Revenue`,
      data: data.revenueSeries,
      borderColor: "#2563eb",
      backgroundColor: "rgba(37,99,235,0.2)",
      tension: 0.4
    }
  ]
};

const periodMultiplier = getPeriodMultiplier(year, month);

const facilityLeaderboard = [
  { label: "Padel Center North", value: Math.round(12400 * periodMultiplier) },
  { label: "Facility B", value: Math.round(10000 * periodMultiplier) },
  { label: "Facility C", value: Math.round(8200 * periodMultiplier) }
];

const cityLeaderboard = [
  { label: "City A", value: Math.round(25000 * periodMultiplier) },
  { label: "City B", value: Math.round(18000 * periodMultiplier) },
  { label: "City C", value: Math.round(9000 * periodMultiplier) }
];

const performanceData = {
  topFacility: {
    name: "Padel Center North",
    revenue: Math.round(12400 * periodMultiplier)
  },
  worstCity: {
    name: "City C",
    revenue: Math.round(4200 * periodMultiplier)
  },
  peakHour: {
    hour: "18h",
    occupancy: 92
  }
};

const revenueByCity = {
  labels: ["City A", "City B", "City C", "City D"],
  datasets: [
    {
      label: "Revenue",
      data: [25000, 18000, 12000, 9000].map((v) => Math.round(v * periodMultiplier)),
      backgroundColor: "#2563eb"
    }
  ]
};

// Usa las métricas ya calculadas (respetan region/year/month) en vez de
// pasarle a generateInsights una forma de objeto que no espera.
const insights = generateInsights({ metrics: data.metrics });

const revenueByFacility = {
  labels: ["Facility 1", "Facility 2", "Facility 3", "Facility 4"],
  datasets: [
    {
      label: "Revenue",
      data: [12000, 10000, 8000, 6000].map((v) => Math.round(v * periodMultiplier)),
      backgroundColor: "#16a34a"
    }
  ]
};

const occupancyByHour = {
  labels: ["8h","10h","12h","14h","16h","18h","20h","22h"],
  datasets: [
    {
      label: "Occupancy %",
      data: [40, 55, 65, 60, 80, 92, 85, 70],
      backgroundColor: "#f59e0b"
    }
  ]
};

  return (
  <div>

    <Breadcrumbs
      items={[
        { label: "Overview", href: "/" },
        { label: "Revenue", href: "/revenue" },
        { label: `${regionName} Region` }
      ]}
    />

    <TopPerformancePanel
  topFacility={performanceData.topFacility}
  worstCity={performanceData.worstCity}
  peakHour={performanceData.peakHour}
/>

      <InsightsPanel insights={insights.map((i) => i.message)} />

      <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "25px",
    marginBottom: "30px"
  }}
>

  <Leaderboard
    title="Top Facilities"
    items={facilityLeaderboard}
    baseRoute="facility"
  />

  <Leaderboard
    title="City Revenue Ranking"
    items={cityLeaderboard}
    baseRoute="city"
  />

</div>

    <AnalyticsDashboard
      title={`${regionName} Region Analysis`}
      trendData={regionRevenueTrend}
      breakdown1={revenueByCity}
      breakdown2={revenueByFacility}
      occupancy={occupancyByHour}
      onBreakdownClick={(city) => router.push(`/city/${city}`)}
    />

  </div>
);
}

