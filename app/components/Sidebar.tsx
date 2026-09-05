"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Íconos simples e inline (sin dependencia nueva) — se ven igual colapsado o expandido.
function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
function TrendsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}
function MarketIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const links: { href: string; label: string; icon: () => ReactNode }[] = [
  { href: "/", label: "Overview", icon: OverviewIcon },
  { href: "/trends", label: "Trends", icon: TrendsIcon },
  { href: "/market", label: "Market", icon: MarketIcon },
];

export default function Sidebar({ userMenu }: { userMenu: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const linkClass = (path: string) =>
    `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm mb-1 transition-colors ${
      pathname === path
        ? "bg-brand text-white font-medium"
        : "text-white/60 hover:text-white hover:bg-white/5"
    }`;

  if (collapsed) {
    return (
      <div className="w-14 h-full shrink-0 bg-[#0e1712] flex flex-col items-center py-6">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Mostrar navegación"
          className="text-white/50 hover:text-white text-sm px-2 py-1.5 rounded-md hover:bg-white/10 mb-6"
        >
          »
        </button>
        <nav className="flex flex-col items-center gap-1">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                title={l.label}
                className={`p-2.5 rounded-lg transition-colors ${
                  pathname === l.href ? "bg-brand text-white" : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon />
              </Link>
            );
          })}
        </nav>
        {/* El usuario/logout queda oculto a propósito cuando está colapsado */}
      </div>
    );
  }

  return (
    <div className="w-60 h-full shrink-0 bg-[#0e1712] px-5 py-6 flex flex-col">
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

      <nav className="flex-1">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              <Icon />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 mt-4 border-t border-white/10 px-1">{userMenu}</div>
    </div>
  );
}
