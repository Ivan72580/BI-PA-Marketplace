"use client";

import { useRouter } from "next/navigation";

export default function Leaderboard({
  title,
  items,
  baseRoute
}: any) {

  const router = useRouter();

  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
      }}
    >

      <h3 style={{ marginBottom: "15px" }}>
        {title}
      </h3>

      {items.map((item: any, index: number) => (

        <div
          key={index}
          onClick={() => router.push(`/${baseRoute}/${item.label}`)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 0",
            cursor: "pointer",
            borderBottom: "1px solid #eee"
          }}
        >

          <span>
            {index + 1}. {item.label}
          </span>

          <span style={{ fontWeight: 600 }}>
            {item.value}
          </span>

        </div>

      ))}

    </div>
  );
}