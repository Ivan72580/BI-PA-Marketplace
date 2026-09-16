"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import FacilitySearch from "./FacilitySearch";

function OverviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
function TrendsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}
function MarketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

export default function TopNav({
  userMenu,
  facilities,
  markets,
}: {
  userMenu: ReactNode;
  facilities: { id: string; name: string; marketId: string }[];
  markets: { id: string; name: string; regionId: string }[];
}) {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-40 bg-[#0b3b2e]/95 backdrop-blur-xl border-b border-white/5">
      <div className="flex items-center gap-1 px-4 md:px-6">
        <div className="font-display text-base font-semibold text-white pr-4 shrink-0">Plei</div>

        <nav className="flex items-end gap-1 flex-1 min-w-0 overflow-x-auto">
          {links.map((l) => {
            const Icon = l.icon;
            const isActive = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-xl transition-colors ${
                  isActive ? "bg-[#f5fffa] text-ink" : "text-white/75 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 py-2 shrink-0">
          <div className="w-56 hidden sm:block">
            <FacilitySearch facilities={facilities} markets={markets} />
          </div>
          {userMenu}
        </div>
      </div>
    </div>
  );
}
