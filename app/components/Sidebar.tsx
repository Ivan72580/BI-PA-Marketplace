"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const monitorLinks = [
  { href: "/", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/market", label: "Market" },
];

const demoLinks = [
  { href: "/funnel", label: "Funnel" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `block rounded-lg px-4 py-2.5 text-sm mb-1 transition-colors ${
      pathname === path
        ? "bg-brand text-white font-medium"
        : "text-white/60 hover:text-white hover:bg-white/5"
    }`;

  return (
    <div className="w-60 shrink-0 bg-[#0e1712] px-5 py-6">
      <div className="mb-8 px-1">
        <div className="font-display text-lg font-semibold text-white">Plei</div>
        <div className="text-xs text-white/40">Marketplace Intelligence</div>
      </div>

      <div className="text-xs text-white/35 mb-2 px-1">Monitor</div>
      <nav className="mb-6">
        {monitorLinks.map((l) => (
          <Link key={l.href} href={l.href} className={linkClass(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="text-xs text-white/35 mb-2 px-1">Demo · datos de ejemplo</div>
      <nav>
        {demoLinks.map((l) => (
          <Link key={l.href} href={l.href} className={linkClass(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
