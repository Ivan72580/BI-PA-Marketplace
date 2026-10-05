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
function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <polyline points="6 9 12 15 18 9" />
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
function SeasonalityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <rect x="6" y="12" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="10.5" y="12" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.55" />
      <rect x="15" y="12" width="3" height="3" rx="0.5" stroke="none" opacity="0.25" fill="currentColor" />
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
// "reports" salió de acá (ver UserMenuDropdown): con 7 tabs la barra
// quedaba apretada en pantallas medianas, y Reportes no es una vista que
// se consulte con la misma frecuencia que el resto — vive ahora como link
// dentro del menú de usuario, con su propio selector Operativo/Ejecutivo.
type NavKey = "overview" | "trends" | "market" | "map" | "daily" | "forecast" | "seasonality" | "panelEjecutivo";
type NavLink = { href: string; labelKey: NavKey; icon: () => ReactNode };
type GroupKey = "performance" | "market";

// Navegación agrupada (aprobada por Ivan): RESUMEN / RENDIMIENTO / MERCADO.
// Resumen es una página sola, así que va como link directo; los otros dos
// grupos se despliegan. Cada ítem lleva una línea de "qué responde" (TopNav.desc.*).
const overviewLink: NavLink = { href: "/", labelKey: "overview", icon: OverviewIcon };
const groups: { key: GroupKey; children: NavLink[] }[] = [
  {
    key: "performance",
    children: [
      { href: "/trends", labelKey: "trends", icon: TrendsIcon },
      { href: "/daily", labelKey: "daily", icon: DailyIcon },
      { href: "/seasonality", labelKey: "seasonality", icon: SeasonalityIcon },
      { href: "/forecast", labelKey: "forecast", icon: ForecastIcon },
    ],
  },
  {
    key: "market",
    children: [
      { href: "/market", labelKey: "market", icon: MarketIcon },
      { href: "/map", labelKey: "map", icon: MapIcon },
    ],
  },
];

const panelEjecutivoLink: NavLink = { href: "/panel-ejecutivo", labelKey: "panelEjecutivo", icon: LeadershipIcon };

// "/" solo es activo en "/" exacto; el resto también en sus subrutas (/map/[id]).
const isLinkActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

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
  const directLinks = showLeadershipLink ? [panelEjecutivoLink, overviewLink] : [overviewLink];
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);
  const navRef = useRef<HTMLElement>(null);
  // Cerrar el desplegable al navegar (mismo patrón de ajuste durante el render que el menú mobile).
  const [groupPathname, setGroupPathname] = useState(pathname);
  if (pathname !== groupPathname) {
    setGroupPathname(pathname);
    setOpenGroup(null);
  }
  useEffect(() => {
    if (!openGroup) return;
    function down(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [openGroup]);

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

  const inlineClass = (active: boolean) =>
    `relative flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap rounded-t-xl transition-colors ${
      active ? "text-ink font-bold" : "text-white/75 font-medium hover:text-white hover:bg-white/5"
    }`;
  const stackedClass = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-colors ${
      active ? "text-ink font-bold bg-[#f5fffa]" : "text-white/75 font-medium hover:text-white hover:bg-white/5"
    }`;
  const activeBg = (
    <motion.span
      layoutId="topnav-active-bg"
      className="absolute inset-0 rounded-t-xl bg-[#f5fffa]"
      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
    />
  );

  const linkItem = (l: NavLink, variant: "inline" | "stacked") => {
    const Icon = l.icon;
    const active = isLinkActive(pathname, l.href);
    return (
      <Link key={l.href} href={l.href} className={variant === "inline" ? inlineClass(active) : stackedClass(active)}>
        {variant === "inline" && active && activeBg}
        <span className="relative flex items-center gap-2">
          <Icon />
          {t(l.labelKey)}
        </span>
      </Link>
    );
  };

  const navLinks = (variant: "inline" | "stacked") => (
    <>
      {directLinks.map((l) => linkItem(l, variant))}
      {groups.map((g) => {
        const active = g.children.some((c) => isLinkActive(pathname, c.href));
        if (variant === "stacked") {
          return (
            <div key={g.key} className="pt-2">
              <div className="px-3 pb-1 text-[10px] uppercase tracking-wide text-white/40">{t(`groups.${g.key}`)}</div>
              {g.children.map((c) => linkItem(c, "stacked"))}
            </div>
          );
        }
        const open = openGroup === g.key;
        return (
          <div key={g.key} className="relative flex items-end self-stretch">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenGroup(open ? null : g.key)}
              className={inlineClass(active)}
            >
              {active && activeBg}
              <span className="relative flex items-center gap-2">
                {t(`groups.${g.key}`)}
                <ChevronIcon open={open} />
              </span>
            </button>
            {open && (
              <div className="absolute left-0 top-full mt-0 w-72 rounded-xl bg-[#0b3b2e] border border-white/10 shadow-xl p-1.5 z-50">
                {g.children.map((c) => {
                  const Icon = c.icon;
                  const childActive = isLinkActive(pathname, c.href);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${childActive ? "bg-white/10" : "hover:bg-white/5"}`}
                    >
                      <span className="mt-0.5 text-white/80"><Icon /></span>
                      <span>
                        <span className={`block text-sm ${childActive ? "text-white font-bold" : "text-white/90 font-medium"}`}>{t(c.labelKey)}</span>
                        <span className="block text-[11px] leading-snug text-white/55">{t(`desc.${c.labelKey}`)}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
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
        <nav ref={navRef} className="hidden lg:flex items-end self-stretch gap-1 flex-1 min-w-0">
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
