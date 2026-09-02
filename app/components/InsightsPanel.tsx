"use client";

export default function InsightsPanel({ insights }: any) {

  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        borderRadius: "16px",
        border: "1px solid #f1f5f9",
        marginBottom: "30px"
      }}
    >
      <h3 style={{ marginBottom: "15px" }}>
        Automated Insights
      </h3>

      <ul style={{ paddingLeft: "20px" }}>
        {insights.map((insight: string, index: number) => (
          <li key={index} style={{ marginBottom: "8px" }}>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  );
}