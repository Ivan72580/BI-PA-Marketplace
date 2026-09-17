"use client";

import { Fragment, useState } from "react";

type MustScheduleSlot = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  confirmationRate: number;
  totalGames: number;
  confirmedGames: number;
  trend: "up" | "down" | "flat";
  insight: string;
};

const DAY_KEYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function shortSize(formatLabel: string): string {
  const match = formatLabel.match(/\d{1,2}v\d{1,2}/i);
  return match ? match[0] : formatLabel;
}

const TREND_ARROW: Record<MustScheduleSlot["trend"], string> = { up: "↗", down: "↘", flat: "→" };

// Mismo patrón visual que SlotCalendarView (grid día×hora, chips clickeables
// con popover) pero con su propio tipo de celda y su propio texto de
// popover — la metodología (tasa de confirmación en ventana de 3 meses,
// exclusión de cancha-no-disponible) es distinta a la de Trends, así que
// reusar el componente original con textos de "meses observados" hubiera
// sido confuso. Un solo esquema de color (verde) porque acá solo se
// muestran slots que ya superaron el umbral — no hay contraparte roja.
export default function MustScheduleCalendar({
  days,
  hours,
  cells,
}: {
  days: string[];
  hours: string[];
  cells: MustScheduleSlot[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedGridKey, setExpandedGridKey] = useState<string | null>(null);
  const MAX_VISIBLE = 2;

  const grid = new Map<string, MustScheduleSlot[]>();
  for (const c of cells) {
    const key = `${c.day}|${c.hour}`;
    const arr = grid.get(key) ?? [];
    arr.push(c);
    grid.set(key, arr);
  }

  if (cells.length === 0) {
    return <div className="text-sm text-ink-faint">Todavía no hay slots que superen el 55% de confirmación en los últimos 3 meses con muestra suficiente.</div>;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `38px repeat(${days.length}, 56px)`, minWidth: `${38 + days.length * 56}px` }}
      >
        <div />
        {days.map((d) => (
          <div key={d} className="text-[10px] font-medium text-ink-muted text-center pb-1 truncate">{d.slice(0, 3)}</div>
        ))}

        {hours.map((h) => (
          <Fragment key={h}>
            <div className="text-[9px] text-ink-faint flex items-start justify-end pr-1 pt-0.5">{h.replace("h", "")}</div>
            {DAY_KEYS.map((dayKey) => {
              const gridKey = `${dayKey}|${h}`;
              const allSlotCells = (grid.get(gridKey) ?? []).sort((a, b) => b.confirmationRate - a.confirmationRate);
              const isExpanded = expandedGridKey === gridKey;
              const visibleCells = isExpanded ? allSlotCells : allSlotCells.slice(0, MAX_VISIBLE);
              const hiddenCount = allSlotCells.length - visibleCells.length;

              return (
                <div key={gridKey} className="relative min-h-[34px] rounded border border-border bg-surface-sunken/40 p-[2px] flex flex-col gap-[2px]">
                  {visibleCells.map((c) => {
                    const cellKey = `${c.day}|${c.hour}|${c.formatLabel}`;
                    const isSelected = selectedKey === cellKey;
                    return (
                      <div key={c.formatLabel} className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedKey(isSelected ? null : cellKey)}
                          title={`${c.formatLabel} — ${(c.confirmationRate * 100).toFixed(0)}% de confirmación`}
                          className={`w-full text-left rounded px-1 py-0.5 text-[9px] leading-tight truncate transition-[filter] hover:brightness-90 bg-brand text-white ${
                            isSelected ? "ring-2 ring-offset-1 ring-ink/40" : ""
                          }`}
                        >
                          <div className="font-semibold">{(c.confirmationRate * 100).toFixed(0)}% {TREND_ARROW[c.trend]}</div>
                          <div className="opacity-80 truncate">{shortSize(c.formatLabel)}</div>
                        </button>

                        {isSelected && (
                          <div className="absolute z-30 top-full left-0 mt-1 w-60 rounded-2xl border border-white/20 p-3 shadow-xl backdrop-blur-md text-white bg-brand/95">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="text-xs font-semibold">{c.dayLabel} {c.hour} · {c.formatLabel}</div>
                              <button type="button" onClick={() => setSelectedKey(null)} className="text-white/70 hover:text-white text-xs shrink-0">✕</button>
                            </div>
                            <div className="text-xs leading-snug mb-1.5">{c.insight}</div>
                            <div className="text-[10px] text-white/80">{c.confirmedGames} confirmados de {c.totalGames}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedGridKey(gridKey)}
                      className="text-[8px] text-ink-faint hover:text-ink-muted text-center leading-none py-[1px]"
                    >
                      +{hiddenCount} más
                    </button>
                  )}
                  {isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedGridKey(null)}
                      className="text-[8px] text-ink-faint hover:text-ink-muted text-center leading-none py-[1px]"
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
