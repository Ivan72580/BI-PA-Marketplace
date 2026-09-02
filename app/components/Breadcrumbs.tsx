"use client";

import Link from "next/link";

type Crumb = {
  label: string;
  href?: string;
};

export default function Breadcrumbs({ items }: { items: Crumb[] }) {

  return (
    <div
      style={{
        fontSize: "14px",
        color: "#64748b",
        marginBottom: "20px"
      }}
    >
      {items.map((item, index) => {

        const isLast = index === items.length - 1;

        return (
          <span key={index}>

            {item.href && !isLast ? (
              <Link
                href={item.href}
                style={{
                  color: "#2563eb",
                  textDecoration: "none"
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}

            {!isLast && " > "}

          </span>
        );
      })}
    </div>
  );
}