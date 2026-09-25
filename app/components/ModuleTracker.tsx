"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { setLastModule } from "../lib/actions/module";
import type { AppModule } from "../lib/module";

// Se monta una sola vez en RootLayout (cubre toda la app) y avisa en
// segundo plano en qué módulo está el usuario ahora — Executive si está
// bajo /panel-ejecutivo, Magic para cualquier otra ruta (Overview/Trends/
// Market/Daily, y cualquier otra página que no sea Executive) — para que
// /entrada sepa dónde aterrizarlo la próxima vez que inicie sesión. No
// bloquea ni cambia nada visible; si la llamada falla el peor caso es que
// /entrada use el valor anterior.
export default function ModuleTracker() {
  const pathname = usePathname();
  const lastSent = useRef<AppModule | null>(null);

  useEffect(() => {
    // No se puede llamar "module" a esta variable (regla de Next.js:
    // no-assign-module-variable, choca con el "module" de CommonJS).
    const activeModule: AppModule = pathname.startsWith("/panel-ejecutivo") ? "EXECUTIVE" : "MAGIC";
    if (lastSent.current === activeModule) return;
    lastSent.current = activeModule;
    void setLastModule(activeModule);
  }, [pathname]);

  return null;
}
