"use client";

export default function TopPerformancePanel({
  topFacility,
  worstCity,
  peakHour
}: any) {

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "20px",
        marginBottom: "30px"
      }}
    >

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid #f1f5f9"
        }}
      >
        <h4 style={{ marginBottom: "10px", color: "#64748b" }}>
          Top Facility
        </h4>

        <div style={{ fontWeight: "600" }}>
          {topFacility.name}
        </div>

        <div style={{ color: "#16a34a" }}>
          ${topFacility.revenue}
        </div>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid #f1f5f9"
        }}
      >
        <h4 style={{ marginBottom: "10px", color: "#64748b" }}>
          Lowest City
        </h4>

        <div style={{ fontWeight: "600" }}>
          {worstCity.name}
        </div>

        <div style={{ color: "#dc2626" }}>
          ${worstCity.revenue}
        </div>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid #f1f5f9"
        }}
      >
        <h4 style={{ marginBottom: "10px", color: "#64748b" }}>
          Peak Hour
        </h4>

        <div style={{ fontWeight: "600" }}>
          {peakHour.hour}
        </div>

        <div style={{ color: "#2563eb" }}>
          {peakHour.occupancy}% occupancy
        </div>
      </div>

    </div>
  );
}