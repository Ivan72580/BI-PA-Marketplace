"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const monitorLinks = [
  { href: "/", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/market", label: "Market" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const linkClass = (path: string) =>
    `block rounded-lg px-4 py-2.5 text-sm mb-1 transition-colors ${
      pathname === path
        ? "bg-brand text-white font-medium"
        : "text-white/60 hover:text-white hover:bg-white/5"
    }`;

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 bg-[#0e1712] flex flex-col items-center py-6">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Mostrar navegación"
          className="text-white/50 hover:text-white text-sm px-2 py-1.5 rounded-md hover:bg-white/10"
        >
          »
        </button>
      </div>
    );
  }

  return (
    <div className="w-60 shrink-0 bg-[#0e1712] px-5 py-6">
      <div className="mb-8 px-1 flex items-center justify-between">
        <div>
          <div className="font-display text-lg font-semibold text-white">Plei</div>
          <div className="text-xs text-white/40">Marketplace Intelligence</div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Ocultar navegación"
          className="text-white/40 hover:text-white text-sm px-1.5 py-1 rounded-md hover:bg-white/10"
        >
          «
        </button>
      </div>

      <div className="text-xs text-white/35 mb-2 px-1">Monitor</div>
      <nav>
        {monitorLinks.map((l) => (
          <Link key={l.href} href={l.href} className={linkClass(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
