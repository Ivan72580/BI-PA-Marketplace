"use client";

import { Fragment, useState } from "react";

// Forma genérica, agnóstica de la métrica — la usan tanto la vista de
// confirmados (rate = tasa de confirmación) como la de cancelados (rate =
// tasa de cancelación), mapeadas desde MustScheduleSlot/MustScheduleCancelSlot
// en la página. `matchingGames` es "confirmados" o "cancelados" según toque.
export type MustScheduleCalendarCell = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  rate: number;
  totalGames: number;
  matchingGames: number;
  trend: "up" | "down" | "flat";
  insight: string;
};

const DAY_KEYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function shortSize(formatLabel: string): string {
  const match = formatLabel.match(/\d{1,2}v\d{1,2}/i);
  return match ? match[0] : formatLabel;
}

const TREND_ARROW: Record<MustScheduleCalendarCell["trend"], string> = { up: "↗", down: "↘", flat: "→" };

// Mismo patrón visual que SlotCalendarView (grid día×hora, chips clickeables
// con popover) pero con su propio tipo de celda y su propio texto de
// popover — la metodología (tasa en ventana de 3 meses, exclusión de
// cancha-no-disponible) es distinta a la de Trends, así que reusar el
// componente original hubiera sido confuso. `tone` cambia el esquema de
// color: verde para confirmados, rojo para cancelados (antes solo existía
// el verde porque no había contraparte).
export default function MustScheduleCalendar({
  days,
  hours,
  cells,
  tone = "confirm",
  emptyLabel,
}: {
  days: string[];
  hours: string[];
  cells: MustScheduleCalendarCell[];
  tone?: "confirm" | "cancel";
  emptyLabel: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedGridKey, setExpandedGridKey] = useState<string | null>(null);
  const MAX_VISIBLE = 2;

  const bgClass = tone === "cancel" ? "bg-danger" : "bg-brand";
  const popoverBgClass = tone === "cancel" ? "bg-danger/95" : "bg-brand/95";
  const matchingLabel = tone === "cancel" ? "cancelados" : "confirmados";

  const grid = new Map<string, MustScheduleCalendarCell[]>();
  for (const c of cells) {
    const key = `${c.day}|${c.hour}`;
    const arr = grid.get(key) ?? [];
    arr.push(c);
    grid.set(key, arr);
  }

  if (cells.length === 0) {
    return <div className="text-sm text-ink-faint">{emptyLabel}</div>;
  }

  return (
    // overflow-x-auto por sí solo promueve el eje Y a "auto" también (regla
    // de la spec: si un eje no es "visible" y el otro sí, el "visible" pasa
    // a "auto") — eso es lo que estaba abriendo un scroll vertical propio y
    // recortando el popover en vez de dejarlo flotar por encima del resto
    // del calendario. overflow-y-visible lo neutraliza explícitamente.
    <div className="overflow-x-auto overflow-y-visible pb-2">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `44px repeat(${days.length}, 72px)`, minWidth: `${44 + days.length * 72}px` }}
      >
        <div />
        {days.map((d) => (
          <div key={d} className="text-xs font-semibold text-ink-muted text-center pb-1.5 truncate">{d.slice(0, 3)}</div>
        ))}

        {hours.map((h) => (
          <Fragment key={h}>
            <div className="text-[10px] text-ink-faint flex items-start justify-end pr-1.5 pt-1">{h.replace("h", "")}</div>
            {DAY_KEYS.map((dayKey) => {
              const gridKey = `${dayKey}|${h}`;
              const allSlotCells = (grid.get(gridKey) ?? []).sort((a, b) => b.rate - a.rate);
              const isExpanded = expandedGridKey === gridKey;
              const visibleCells = isExpanded ? allSlotCells : allSlotCells.slice(0, MAX_VISIBLE);
              const hiddenCount = allSlotCells.length - visibleCells.length;

              return (
                <div key={gridKey} className="relative min-h-[42px] rounded-md border border-border bg-surface-sunken/40 p-[3px] flex flex-col gap-[3px]">
                  {visibleCells.map((c) => {
                    const cellKey = `${c.day}|${c.hour}|${c.formatLabel}`;
                    const isSelected = selectedKey === cellKey;
                    return (
                      <div key={c.formatLabel} className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedKey(isSelected ? null : cellKey)}
                          title={`${c.formatLabel} — ${(c.rate * 100).toFixed(0)}% de ${tone === "cancel" ? "cancelación" : "confirmación"}`}
                          className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight truncate transition-[filter] hover:brightness-90 text-white ${bgClass} ${
                            isSelected ? "ring-2 ring-offset-1 ring-ink/40" : ""
                          }`}
                        >
                          <div className="font-semibold">{(c.rate * 100).toFixed(0)}% {TREND_ARROW[c.trend]}</div>
                          <div className="opacity-80 truncate">{shortSize(c.formatLabel)}</div>
                        </button>

                        {isSelected && (
                          <div className={`absolute z-30 top-full left-0 mt-1 w-64 rounded-2xl border border-white/20 p-3 shadow-xl backdrop-blur-md text-white ${popoverBgClass}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="text-xs font-semibold">{c.dayLabel} {c.hour} · {c.formatLabel}</div>
                              <button type="button" onClick={() => setSelectedKey(null)} className="text-white/70 hover:text-white text-xs shrink-0">✕</button>
                            </div>
                            <div className="text-xs leading-snug mb-1.5">{c.insight}</div>
                            <div className="text-[10px] text-white/80">{c.matchingGames} {matchingLabel} de {c.totalGames}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedGridKey(gridKey)}
                      className="text-[9px] text-ink-faint hover:text-ink-muted text-center leading-none py-[2px]"
                    >
                      +{hiddenCount} más
                    </button>
                  )}
                  {isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedGridKey(null)}
                      className="text-[9px] text-ink-faint hover:text-ink-muted text-center leading-none py-[2px]"
                    >
                      ver menos
                    </button>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
