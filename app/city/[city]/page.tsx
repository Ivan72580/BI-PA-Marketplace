"use client";

import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useGlobal } from "../../context/GlobalContext";
import { getPeriodMultiplier } from "../../lib/timeUtils";
import Breadcrumbs from "../../components/Breadcrumbs";
import AnalyticsDashboard from "../../components/AnalyticsDashboard";

export default function CityPage() {
  const router = useRouter();

  const params = useParams();
  
  const cityName = params.city as string;

  const { year, month } = useGlobal();

  // datasets simulados, ajustados por el filtro global de año/mes
  const periodMultiplier = getPeriodMultiplier(year, month);

  const revenueTrend = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        label: `${cityName} Revenue`,
        data: [12000, 14000, 16000, 15000, 18000, 20000].map((v) =>
          Math.round(v * periodMultiplier)
        ),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.2)",
        tension: 0.4
      }
    ]
  };

  const revenueByFacility = {
    labels: ["Facility A", "Facility B", "Facility C"],
    datasets: [
      {
        label: "Revenue",
        data: [12000, 10000, 8000].map((v) => Math.round(v * periodMultiplier)),
        backgroundColor: "#2563eb"
      }
    ]
  };

  const bookingsByFacility = {
    labels: ["Facility A", "Facility B", "Facility C"],
    datasets: [
      {
        label: "Bookings",
        data: [320, 280, 210],
        backgroundColor: "#16a34a"
      }
    ]
  };

  const occupancyByHour = {
    labels: ["8h","10h","12h","14h","16h","18h","20h","22h"],
    datasets: [
      {
        label: "Occupancy %",
        data: [45, 55, 65, 60, 80, 92, 85, 70],
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
          { label: cityName }
        ]}
      />

      <AnalyticsDashboard
  title={`${cityName} City Analysis`}
  trendData={revenueTrend}
  breakdown1={revenueByFacility}
  breakdown2={bookingsByFacility}
  occupancy={occupancyByHour}
  onBreakdownClick={(facility: string) =>
  router.push(`/facility/${facility}`)
}
/>

    </div>
  );
}