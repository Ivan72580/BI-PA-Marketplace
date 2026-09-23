"use client";

import { useState, useMemo, useRef, useEffect, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

type Facility = { id: string; name: string; marketId: string };
type Market = { id: string; name: string; regionId: string };

// Componente genérico: la barra de navegación lo usa "tal cual" (variant
// "nav", angosto, sobre fondo oscuro, siempre a /trends) y /daily lo reusa
// como buscador principal para entrar directo a una facility (variant
// "panel", más ancho, sobre fondo claro, con destino configurable vía
// buildHref) — mismo componente, mismo comportamiento de teclado/filtro,
// sin duplicar la lógica de búsqueda en dos archivos.
export default function FacilitySearch({
  facilities,
  markets,
  buildHref,
  placeholder,
  emptyMessage,
  variant = "nav",
  autoFocus = false,
}: {
  facilities: Facility[];
  markets: Market[];
  // Si no se pasa, mantiene el comportamiento histórico (ir a /trends) —
  // así el uso en TopNav no cambia.
  buildHref?: (facility: Facility, market: Market) => string;
  placeholder?: string;
  emptyMessage?: (query: string) => string;
  variant?: "nav" | "panel";
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isPanel = variant === "panel";

  const marketById = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return facilities.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, facilities]);

  // Mantiene visible la opción resaltada cuando se navega con las flechas
  // y la lista tiene scroll.
  useEffect(() => {
    itemRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToFacility(f: Facility) {
    const market = marketById.get(f.marketId);
    if (!market) return;
    setQuery("");
    setOpen(false);
    const href = buildHref ? buildHref(f, market) : `/trends?regionId=${market.regionId}&marketId=${market.id}&facilityId=${f.id}`;
    router.push(href);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[highlighted];
      if (target) goToFacility(target);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          width={isPanel ? "15" : "13"}
          height={isPanel ? "15" : "13"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${isPanel ? "left-3 text-ink-faint" : "left-2.5 text-white/50"}`}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Buscar facility..."}
          autoFocus={autoFocus}
          className={
            isPanel
              ? "w-full rounded-xl border border-border-strong bg-surface text-ink placeholder:text-ink-faint text-sm pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 transition-colors"
              : "w-full rounded-lg bg-white/10 text-white placeholder:text-white/40 text-xs pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30 focus:bg-white/15 transition-colors"
          }
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl bg-surface shadow-xl py-1 max-h-64 overflow-y-auto">
          {results.map((f, i) => (
            <button
              key={f.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => goToFacility(f)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors truncate block ${
                i === highlighted ? "bg-brand-soft text-ink" : "text-ink hover:bg-brand-soft"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl bg-surface shadow-xl py-3 px-3 text-xs text-ink-faint">
          {emptyMessage ? emptyMessage(query) : `Sin resultados para "${query}"`}
        </div>
      )}
    </div>
  );
}
