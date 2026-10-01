"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// Selector Operativo/Ejecutivo de /reports — reemplaza las dos rutas
// separadas que existían antes (/reports y /panel-ejecutivo/reports) por
// una sola página con un switch vía ?type=. Sin acceso a Leadership no hay
// nada para alternar (Operativo es la única vista posible), así que no
// tiene sentido mostrar un selector de una sola opción — mismo criterio
// que ya usa TopNav para esconder el link a Panel Ejecutivo.
export default function ReportTypeTabs({ hasExecutiveAccess }: { hasExecutiveAccess: boolean }) {
  const t = useTranslations("Reports");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!hasExecutiveAccess) return null;

  const activeType = searchParams.get("type") === "executive" ? "executive" : "ops";

  function hrefFor(type: "ops" | "executive"): string {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "ops") params.delete("type");
    else params.set("type", "executive");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const tabs: { type: "ops" | "executive"; labelKey: "tabs.ops" | "tabs.executive" }[] = [
    { type: "ops", labelKey: "tabs.ops" },
    { type: "executive", labelKey: "tabs.executive" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-sunken/60 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.type}
          href={hrefFor(tab.type)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeType === tab.type ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </div>
  );
}
