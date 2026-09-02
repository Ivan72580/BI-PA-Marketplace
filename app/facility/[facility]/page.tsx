"use client";

import { useParams } from "next/navigation";
import { useGlobal } from "../../context/GlobalContext";
import { getPeriodMultiplier } from "../../lib/timeUtils";
import Breadcrumbs from "../../components/Breadcrumbs";
import AnalyticsDashboard from "../../components/AnalyticsDashboard";

export default function FacilityPage() {

  const params = useParams();
  const facilityName = params.facility as string;

  const { year, month } = useGlobal();
  const periodMultiplier = getPeriodMultiplier(year, month);

  const revenueTrend = {
    labels: ["Jan","Feb","Mar","Apr","May","Jun"],
    datasets: [
      {
        label: `${facilityName} Revenue`,
        data: [4000,5000,5500,5200,6000,6400].map((v) =>
          Math.round(v * periodMultiplier)
        ),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.2)",
        tension: 0.4
      }
    ]
  };

  const revenueByCourt = {
    labels: ["Court 1","Court 2","Court 3","Court 4"],
    datasets: [
      {
        label: "Revenue",
        data: [1800,1600,1500,1200].map((v) => Math.round(v * periodMultiplier)),
        backgroundColor: "#2563eb"
      }
    ]
  };

  const bookingsByCourt = {
    labels: ["Court 1","Court 2","Court 3","Court 4"],
    datasets: [
      {
        label: "Bookings",
        data: [120,110,100,80],
        backgroundColor: "#16a34a"
      }
    ]
  };

  const occupancyByHour = {
    labels: ["8h","10h","12h","14h","16h","18h","20h","22h"],
    datasets: [
      {
        label: "Occupancy %",
        data: [40,55,60,65,80,92,88,70],
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
          { label: facilityName }
        ]}
      />

      <AnalyticsDashboard
        title={`${facilityName} Facility Analysis`}
        trendData={revenueTrend}
        breakdown1={revenueByCourt}
        breakdown2={bookingsByCourt}
        occupancy={occupancyByHour}
      />

    </div>
  );
}