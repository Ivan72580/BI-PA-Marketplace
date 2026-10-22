"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Los enlaces antiguos y las tarjetas del panorama apuntan a `?tab=<capa>`: al cambiar ese parámetro la página baja
// hasta esa capa (dejando espacio para el menú y la barra de capas, vía scroll-margin de LayerSection).
export default function ScrollToTab() {
  const tab = useSearchParams().get("tab");
  useEffect(() => {
    if (!tab) return;
    const el = document.getElementById(tab);
    if (!el) return;
    const raf = requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [tab]);
  return null;
}
