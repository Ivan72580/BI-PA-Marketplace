"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { setLastModule } from "../lib/actions/module";
import { moduleForPath, type AppModule } from "../lib/module";

// Se monta una sola vez en RootLayout (cubre toda la app) y avisa en
// segundo plano en qué módulo está el usuario ahora (según el registro de
// app/lib/module.ts), para que /entrada sepa dónde aterrizarlo la próxima
// vez que inicie sesión. Las rutas que no son de ningún módulo (/reports,
// /admin…) no cambian el último módulo. No bloquea ni cambia nada visible;
// si la llamada falla el peor caso es que /entrada use el valor anterior.
export default function ModuleTracker() {
  const pathname = usePathname();
  const lastSent = useRef<AppModule | null>(null);

  useEffect(() => {
    // No se puede llamar "module" a esta variable (regla de Next.js:
    // no-assign-module-variable, choca con el "module" de CommonJS).
    const activeModule = moduleForPath(pathname);
    if (!activeModule || lastSent.current === activeModule) return;
    lastSent.current = activeModule;
    void setLastModule(activeModule);
  }, [pathname]);

  return null;
}
