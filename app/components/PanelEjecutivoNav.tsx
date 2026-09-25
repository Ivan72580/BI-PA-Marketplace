"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

// Barra de pestañas del cluster /panel-ejecutivo — antes eran 3 rutas
// sueltas sin nada que las uniera visualmente (page.tsx, facilities/*,
// satisfaction/*); esto les da un chrome compartido sin dejar de ser rutas
// reales e independientes (compartibles, se pueden abrir en pestañas del
// navegador distintas, etc.).
type Tab = { href: string; labelKey: "overview" | "facilities" | "satisfaction" };

const tabs: Tab[] = [
  { href: "/panel-ejecutivo", labelKey: "overview" },
  { href: "/panel-ejecutivo/facilities", labelKey: "facilities" },
  { href: "/panel-ejecutivo/satisfaction", labelKey: "satisfaction" },
];

export default function PanelEjecutivoNav() {
  const pathname = usePathname();
  const t = useTranslations("PanelEjecutivoNav");

  return (
    <nav className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => {
        // La pestaña de Resumen matchea solo la ruta exacta (si no,
        // matchearía como prefijo de las otras dos, que empiezan igual).
        // Facilities y Satisfaction matchean también sus rutas hijas — así
        // el detalle de una facility puntual (/panel-ejecutivo/facilities/x)
        // sigue resaltando la pestaña "Facility Profiles".
        const isActive =
          tab.href === "/panel-ejecutivo"
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive ? "text-brand border-brand" : "text-ink-faint border-transparent hover:text-ink"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
