"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import FacilitySearch from "./FacilitySearch";

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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const links: { href: string; label: string; icon: () => ReactNode }[] = [
  { href: "/", label: "Overview", icon: OverviewIcon },
  { href: "/trends", label: "Trends", icon: TrendsIcon },
  { href: "/market", label: "Market", icon: MarketIcon },
];

export default function Sidebar({
  userMenu,
  facilities,
  markets,
}: {
  userMenu: ReactNode;
  facilities: { id: string; name: string; marketId: string }[];
  markets: { id: string; name: string; regionId: string }[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const linkClass = (path: string) =>
    `flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm mb-1 transition-colors ${
      pathname === path
        ? "bg-brand text-white font-medium"
        : "text-white/75 hover:text-white hover:bg-white/5"
    }`;

  return (
    <>
      {/* Desktop / tablet ancho: rail vertical, colapsable, oculto en mobile */}
      <div className="hidden md:block h-full">
        {collapsed ? (
          <div className="w-14 h-full shrink-0 bg-[#0b3b2e]/95 backdrop-blur-xl border-r border-white/5 flex flex-col items-center py-6">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Mostrar navegación"
              className="text-white/70 hover:text-white text-sm px-2 py-1.5 rounded-md hover:bg-white/10 mb-6"
            >
              »
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Buscar facility"
              className="p-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors mb-2"
            >
              <SearchIcon />
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
                      pathname === l.href ? "bg-brand text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon />
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : (
          <div className="w-60 h-full shrink-0 bg-[#0b3b2e]/95 backdrop-blur-xl border-r border-white/5 px-5 py-6 flex flex-col">
            <div className="mb-8 px-1 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-semibold text-white">Plei</div>
                <div className="text-xs text-white/60">Marketplace Intelligence</div>
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                title="Ocultar navegación"
                className="text-white/60 hover:text-white text-sm px-1.5 py-1 rounded-md hover:bg-white/10"
              >
                «
              </button>
            </div>

            <div className="mb-5">
              <FacilitySearch facilities={facilities} markets={markets} />
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
        )}
      </div>

      {/* Mobile: barra fija abajo, no ocupa ancho de pantalla */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b3b2e]/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 py-2">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] ${
                pathname === l.href ? "text-white" : "text-white/70"
              }`}
            >
              <Icon />
              {l.label}
            </Link>
          );
        })}
        <div className="text-[10px]">{userMenu}</div>
      </div>
    </>
  );
}
