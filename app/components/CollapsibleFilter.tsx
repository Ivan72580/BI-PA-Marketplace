"use client";

import { useRef, useState, type ReactNode } from "react";

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="10" y1="17" x2="14" y2="17" />
    </svg>
  );
}

// Contenedor de filtros que vive colapsado en un ícono (+ un resumen opcional, p. ej. el período) y se
// expande al pasar el mouse, al enfocarlo con teclado o al tocarlo (en pantallas táctiles no hay hover).
// El panel abierto se superpone, anclado a la derecha, y no empuja el resto de la página.
//
// Se queda abierto mientras haya algo enfocado dentro: el desplegable nativo de un <select> saca al mouse
// del panel y, sin esto, lo cerraría a mitad de elegir.
export default function CollapsibleFilter({
  label,
  summary,
  active = false,
  defaultOpen = false,
  children,
}: {
  /** Texto accesible del botón (ej. "Filtro"). No se dibuja. */
  label: string;
  /** Contexto que no conviene esconder (ej. el período): queda visible junto al ícono aunque el panel esté cerrado. */
  summary?: ReactNode;
  /** Hay algún filtro distinto del default: se marca con un punto. */
  active?: boolean;
  /** Arranca abierto y fijado (útil para vistas previas y pruebas; en la app arranca colapsado). */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(defaultOpen);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = hover || pinned || focused;

  return (
    <div
      ref={rootRef}
      className="relative h-9 print:hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* Colapsado: ocupa su lugar en el flujo y se vuelve invisible al abrir, para no mover nada. */}
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setPinned((v) => !v)}
        className={`h-9 flex items-center gap-2 rounded-full bg-surface px-3 text-ink-muted shadow-sm transition-colors hover:text-ink ${open ? "invisible" : ""}`}
      >
        <FilterIcon />
        {summary && <span className="text-xs font-medium text-ink whitespace-nowrap">{summary}</span>}
        {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
      </button>

      {open && (
        <div className="absolute right-0 top-0 z-30 flex w-max max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl bg-surface p-1.5 pl-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">{children}</div>
          <button
            type="button"
            aria-label={label}
            aria-expanded
            onClick={() => setPinned((v) => !v)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <FilterIcon />
          </button>
        </div>
      )}
    </div>
  );
}
