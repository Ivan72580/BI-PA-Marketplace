"use client";

import { useState } from "react";

// accent cambia solo el puntito junto al título (bg-accent de siempre, o
// bg-warning para secciones "no 100% reales" como Predicción) — el fondo
// de la tarjeta (bg-surface) es siempre el mismo, a propósito: la idea no
// es que parezca un borrador aparte, sino una tarjeta más con un matiz de
// color, tipo semáforo.
type Accent = "accent" | "warning";

const ACCENT_DOT: Record<Accent, string> = {
  accent: "bg-accent",
  warning: "bg-warning",
};

export default function GroupSection({
  title,
  children,
  defaultOpen = true,
  accent = "accent",
  badge,
  id,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: Accent;
  // Tag chico junto al título (ej. "Predicción") — mismo lugar donde antes
  // vivía a mano en cada página que lo necesitaba.
  badge?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // defaultOpen puede depender de qué día se esté mirando (ver Predicción
  // en app/daily/page.tsx: colapsada cuando ya hay datos reales para ese
  // día, abierta cuando no). Sin este ajuste, un cambio de defaultOpen en
  // un re-render (navegación client-side, sin remount) no movería `open`
  // porque useState solo lee su valor inicial una vez — mismo patrón de
  // "ajustar estado durante el render" ya usado en TopNav para cerrar el
  // menú mobile al cambiar de ruta, en vez de un efecto con setState
  // síncrono. Un toggle manual del usuario se respeta mientras defaultOpen
  // no cambie de nuevo.
  const [lastDefaultOpen, setLastDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== lastDefaultOpen) {
    setLastDefaultOpen(defaultOpen);
    setOpen(defaultOpen);
  }

  return (
    <div id={id} className="rounded-3xl bg-surface p-4 shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 mb-3 px-1 group"
      >
        <span className={`w-1 h-4 rounded-full ${ACCENT_DOT[accent]} shrink-0`} aria-hidden="true" />
        <div className="font-display text-sm font-semibold text-ink group-hover:text-brand transition-colors">{title}</div>
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-wide bg-warning text-white px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-faint ml-auto shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="space-y-5">{children}</div>}
    </div>
  );
}
