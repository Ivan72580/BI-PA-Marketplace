"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import FacilitySearch from "./FacilitySearch";

function MenuIcon({ open }: { open: boolean }) {
  // Mismo ícono, alterna entre "hamburguesa" y "cerrar" (X) con las mismas
  // 3 líneas rotando/colapsando — evita cargar un segundo ícono.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" className="transition-transform origin-center" style={open ? { transform: "translateY(6px) rotate(45deg)" } : undefined} />
      <line x1="4" y1="12" x2="20" y2="12" className="transition-opacity" style={open ? { opacity: 0 } : undefined} />
      <line x1="4" y1="18" x2="20" y2="18" className="transition-transform origin-center" style={open ? { transform: "translateY(-6px) rotate(-45deg)" } : undefined} />
    </svg>
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);
  // Cierra el menú mobile al cambiar de página (click en un link) — ajuste
  // de estado durante el render en vez de un efecto (patrón recomendado por
  // React para "resetear estado cuando cambia una prop", evita el
  // cascading-render que dispararía un setState síncrono dentro de un
  // useEffect con éste mismo fin).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  // Va primero (no al final) cuando el usuario tiene el permiso: es su vista
  // "default" en el sentido de ser la primera que ve, sin necesidad de un
  // redirect automático post-login — ver nota de entrega sobre por qué no
  // se implementó ese redirect todavía.
  const visibleLinks = showLeadershipLink ? [panelEjecutivoLink, ...links] : links;

  // Mismo patrón que UserMenuDropdown: click afuera o Escape cierra.
  useEffect(() => {
    if (!mobileOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (mobilePanelRef.current && !mobilePanelRef.current.contains(e.target as Node)) setMobileOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const navLinks = (variant: "inline" | "stacked") => (
    <>
      {visibleLinks.map((l) => {
        const Icon = l.icon;
        const isActive = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              variant === "inline"
                ? `relative flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap rounded-t-xl transition-colors ${
                    isActive ? "text-ink font-bold" : "text-white/75 font-medium hover:text-white hover:bg-white/5"
                  }`
                : `flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                    isActive ? "text-ink font-bold bg-[#f5fffa]" : "text-white/75 font-medium hover:text-white hover:bg-white/5"
                  }`
            }
          >
            {variant === "inline" && isActive && (
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
    </>
  );

  return (
    <div className="sticky top-0 z-40 bg-[#0b3b2e]/95 backdrop-blur-xl">
      <div className="flex items-center gap-1 px-4 md:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG de marca, next/image no optimiza SVGs sin habilitar dangerouslyAllowSVG */}
        <img src="/logo/plei-mark.svg" alt="Plei" width={32} height={32} className="pr-4 shrink-0 h-8 w-auto" />

        {/* lg+ : nav inline completo, como antes. Por debajo, se reemplaza
            por el botón de menú de más abajo — nunca los dos a la vez. */}
        <nav className="hidden lg:flex items-end self-stretch gap-1 flex-1 min-w-0 overflow-x-auto">
          {navLinks("inline")}
        </nav>
        <div className="flex-1 min-w-0 lg:hidden" />

        <div className="flex items-center gap-3 py-2 shrink-0">
          <div className="w-56 hidden lg:block">
            <FacilitySearch
              facilities={facilities}
              markets={markets}
              placeholder={t("facilitySearch.placeholder")}
              emptyMessageTemplate={t("facilitySearch.empty", { query: "{query}" })}
            />
          </div>

          {/* <lg : un solo botón abre un panel con la búsqueda y los links
              apilados — reemplaza tanto el nav como el buscador inline. */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? t("menu.close") : t("menu.open")}
            aria-expanded={mobileOpen}
            className="lg:hidden text-white/80 hover:text-white p-1.5 -mr-1"
          >
            <MenuIcon open={mobileOpen} />
          </button>

          {userMenu}
        </div>
      </div>

      {mobileOpen && (
        <div ref={mobilePanelRef} className="lg:hidden border-t border-white/10 px-4 py-3 space-y-3">
          <FacilitySearch
            facilities={facilities}
            markets={markets}
            placeholder={t("facilitySearch.placeholder")}
            emptyMessageTemplate={t("facilitySearch.empty", { query: "{query}" })}
          />
          <nav className="flex flex-col gap-0.5">{navLinks("stacked")}</nav>
        </div>
      )}
    </div>
  );
}
