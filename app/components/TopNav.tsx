"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
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
function DailyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <circle cx="8" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Las labels viven en messages/*.json (namespace TopNav) — labelKey referencia
// esa clave, se traduce en el render porque useTranslations es un hook.
const links: { href: string; labelKey: "overview" | "trends" | "market" | "daily"; icon: () => ReactNode }[] = [
  { href: "/", labelKey: "overview", icon: OverviewIcon },
  { href: "/trends", labelKey: "trends", icon: TrendsIcon },
  { href: "/market", labelKey: "market", icon: MarketIcon },
  { href: "/daily", labelKey: "daily", icon: DailyIcon },
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
  const t = useTranslations("TopNav");

  return (
    <div className="sticky top-0 z-40 bg-[#0b3b2e]/95 backdrop-blur-xl">
      <div className="flex items-center gap-1 px-4 md:px-6">
        <div className="font-display text-base font-semibold text-white pr-4 shrink-0">Plei</div>

        <nav className="flex items-end self-stretch gap-1 flex-1 min-w-0 overflow-x-auto">
          {links.map((l) => {
            const Icon = l.icon;
            const isActive = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap rounded-t-xl transition-colors ${
                  isActive ? "text-ink font-bold" : "text-white/75 font-medium hover:text-white hover:bg-white/5"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="topnav-active-bg"
                    className="absolute inset-0 rounded-t-xl bg-[#f5fffa]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon />
                  {t(l.labelKey)}
                </span>
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
