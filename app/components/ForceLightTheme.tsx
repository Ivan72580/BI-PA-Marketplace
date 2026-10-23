"use client";

import { useLayoutEffect } from "react";
import { notifyThemeChange } from "../lib/themeClient";

// Fuerza modo claro en toda la página mientras está montada (Reportes, login),
// sin tocar la preferencia guardada del usuario: al salir se restaura.
// La página además envuelve su contenido en data-theme="light", que ya pinta
// claro desde el HTML del servidor; esto cubre lo que vive fuera de ese
// subárbol (barra superior, fondo) y los gráficos de canvas, que leen la raíz.
export default function ForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    notifyThemeChange();
    return () => {
      if (previous) root.setAttribute("data-theme", previous);
      else root.removeAttribute("data-theme");
      notifyThemeChange();
    };
  }, []);
  return null;
}
