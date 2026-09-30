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
function ForecastIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0-3.7 10.7c.4.4.7.9.7 1.5V17h6v-1.8c0-.6.3-1.1.7-1.5A6 6 0 0 0 12 3Z" />
      <line x1="9" y1="21" x2="15" y2="21" />
      <line x1="10" y1="17" x2="10" y2="18.5" />
      <line x1="14" y1="17" x2="14" y2="18.5" />
    </svg>
  );
}
function LeadershipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 3 7l9 5 9-5-9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </svg>
  );
}

// Las labels viven en messages/*.json (namespace TopNav) — labelKey referencia
// esa clave, se traduce en el render porque useTranslations es un hook.
type NavLink = { href: string; labelKey: "overview" | "trends" | "market" | "daily" | "forecast" | "panelEjecutivo"; icon: () => ReactNode };

const links: NavLink[] = [
  { href: "/", labelKey: "overview", icon: OverviewIcon },
  { href: "/trends", labelKey: "trends", icon: TrendsIcon },
  { href: "/market", labelKey: "market", icon: MarketIcon },
  { href: "/daily", labelKey: "daily", icon: DailyIcon },
  { href: "/forecast", labelKey: "forecast", icon: ForecastIcon },
];

const panelEjecutivoLink: NavLink = { href: "/panel-ejecutivo", labelKey: "panelEjecutivo", icon: LeadershipIcon };

export default function TopNav({
  userMenu,
  facilities,
  markets,
  showLeadershipLink = false,
}: {
  userMenu: ReactNode;
  facilities: { id: string; name: string; marketId: string }[];
  markets: { id: string; name: string; regionId: string }[];
  showLeadershipLink?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("TopNav");
  // Va primero (no al final) cuando el usuario tiene el permiso: es su vista
  // "default" en el sentido de ser la primera que ve, sin necesidad de un
  // redirect automático post-login — ver nota de entrega sobre por qué no
  // se implementó ese redirect todavía.
  const visibleLinks = showLeadershipLink ? [panelEjecutivoLink, ...links] : links;

  return (
    <div className="sticky top-0 z-40 bg-[#0b3b2e]/95 backdrop-blur-xl">
      <div className="flex items-center gap-1 px-4 md:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG de marca, next/image no optimiza SVGs sin habilitar dangerouslyAllowSVG */}
        <img src="/logo/plei-mark.svg" alt="Plei" width={32} height={32} className="pr-4 shrink-0 h-8 w-auto" />

        <nav className="flex items-end self-stretch gap-1 flex-1 min-w-0 overflow-x-auto">
          {visibleLinks.map((l) => {
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
            <FacilitySearch
              facilities={facilities}
              markets={markets}
              placeholder={t("facilitySearch.placeholder")}
              emptyMessageTemplate={t("facilitySearch.empty", { query: "{query}" })}
            />
          </div>
          {userMenu}
        </div>
      </div>
    </div>
  );
}
