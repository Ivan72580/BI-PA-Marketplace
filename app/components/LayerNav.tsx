"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Barra de capas de /facility: queda pegada justo debajo del menú general (que también es fijo), con fondo
// sólido para no superponerse con el contenido, y marca con color la capa que se está leyendo según el scroll.
// Mide el menú general en vivo y publica --layer-offset (menú + esta barra) para que las anclas aterricen
// justo debajo de ambos (las capas usan scroll-mt-[var(--layer-offset)]).

export type LayerItem = { id: string; label: string; built: boolean };

const ACTIVE: Record<string, string> = {
  pronostico: "bg-warning-fill text-ink",
};
const ACTIVE_DEFAULT = "bg-brand-fill text-white";

export default function LayerNav({ layers, label, soon }: { layers: LayerItem[]; label: string; soon: string }) {
  const barRef = useRef<HTMLElement>(null);
  const [top, setTop] = useState(64);
  const [active, setActive] = useState(layers[0]?.id ?? "");

  const measure = useCallback(() => {
    const nav = document.querySelector<HTMLElement>("[data-topnav]");
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    setTop(navH);
    const barH = barRef.current?.getBoundingClientRect().height ?? 0;
    document.documentElement.style.setProperty("--layer-offset", `${Math.round(navH + barH + 12)}px`);
    return navH + barH;
  }, []);

  const update = useCallback(() => {
    const line = measure() + 24;
    let current = layers[0]?.id ?? "";
    for (const l of layers) {
      if (!l.built) continue;
      const el = document.getElementById(l.id);
      if (el && el.getBoundingClientRect().top <= line) current = l.id;
    }
    // Al llegar al fondo de la página, la última capa visible gana aunque su borde superior no llegue a la línea.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      const built = layers.filter((l) => l.built && document.getElementById(l.id));
      if (built.length) current = built[built.length - 1].id;
    }
    setActive(current);
  }, [layers, measure]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Las capas llegan en streaming: al cambiar el alto del documento se vuelve a calcular.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); ro.disconnect(); };
  }, [update]);

  return (
    <nav
      ref={barRef}
      aria-label={label}
      style={{ top }}
      className="sticky z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-2.5 mb-6 bg-canvas/90 backdrop-blur shadow-[0_10px_18px_-14px_rgb(0_0_0/0.55)] overflow-x-auto"
    >
      <ul className="flex items-center gap-1.5 min-w-max">
        {layers.map((l) =>
          l.built ? (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                aria-current={active === l.id ? "true" : undefined}
                className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-300 ${
                  active === l.id ? `${ACTIVE[l.id] ?? ACTIVE_DEFAULT} shadow-md` : "bg-surface text-ink shadow-sm hover:text-brand hover:shadow-md"
                }`}
              >
                {l.label}
              </a>
            </li>
          ) : (
            <li key={l.id}>
              <span title={soon} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-ink-faint/70 cursor-default">
                {l.label}
              </span>
            </li>
          )
        )}
      </ul>
    </nav>
  );
}
