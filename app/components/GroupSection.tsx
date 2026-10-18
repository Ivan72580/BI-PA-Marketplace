"use client";

import { useState } from "react";

// accent cambia solo el puntito junto al título (verde de siempre, o ámbar para secciones "no 100 %
// reales" como Predicción). Sin tarjeta de fondo: la sección es un título con una línea fina y su
// contenido; las tarjetas de adentro son las que llevan borde y sombra, así no hay cajas dentro de cajas.
type Accent = "accent" | "warning";

const ACCENT_DOT: Record<Accent, string> = {
  accent: "bg-accent",
  warning: "bg-warning-fill",
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
  // Tag chico junto al título (ej. "Predicción").
  badge?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // defaultOpen puede depender de qué día se esté mirando (ver Predicción en app/daily/page.tsx). Sin este
  // ajuste, un cambio de defaultOpen en un re-render (navegación client-side, sin remount) no movería
  // `open` porque useState solo lee su valor inicial: patrón de "ajustar estado durante el render".
  const [lastDefaultOpen, setLastDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== lastDefaultOpen) {
    setLastDefaultOpen(defaultOpen);
    setOpen(defaultOpen);
  }

  return (
    <section id={id}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 pb-2.5 border-b border-border group text-left ${open ? "mb-4" : ""}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${ACCENT_DOT[accent]} shrink-0`} aria-hidden="true" />
        <h2 className="font-display text-sm font-semibold text-ink group-hover:text-brand transition-colors">{title}</h2>
        {badge && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-warning-soft text-warning px-2 py-0.5 rounded-full">
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
    </section>
  );
}
