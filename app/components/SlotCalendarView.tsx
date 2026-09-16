"use client";

import { Fragment, useState } from "react";

type SlotConsistencyCell = {
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  consistencyPct: number;
  monthsPresent: number;
  totalMonthsObserved: number;
  selectedMonthCount: number;
  priorYearCount: number;
  priorMonthCount: number;
  insight: string;
};

const DAY_KEYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HIGHLIGHT_THRESHOLD = 0.75;

const COLOR = {
  green: { chipStrong: "bg-brand text-white", chip: "bg-brand-soft text-brand", panel: "bg-brand/95 border-white/20" },
  red: { chipStrong: "bg-danger text-white", chip: "bg-danger-soft text-danger", panel: "bg-danger/95 border-white/20" },
} as const;

export default function SlotCalendarView({
  days,
  hours,
  cells,
  colorScheme = "green",
  suppressedKeys,
}: {
  days: string[];
  hours: string[];
  cells: SlotConsistencyCell[];
  colorScheme?: "green" | "red";
  // Slots ("day|hour|formatLabel") ya resaltados en el calendario opuesto —
  // se ocultan acá para no mostrar el mismo slot marcado en los dos lados.
  suppressedKeys?: Set<string>;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedGridKey, setExpandedGridKey] = useState<string | null>(null);
  const colors = COLOR[colorScheme];
  const MAX_VISIBLE = 2;

  const grid = new Map<string, SlotConsistencyCell[]>();
  for (const c of cells) {
    const key = `${c.day}|${c.hour}`;
    const arr = grid.get(key) ?? [];
    arr.push(c);
    grid.set(key, arr);
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `38px repeat(${days.length}, minmax(56px, 1fr))`, minWidth: `${38 + days.length * 56}px` }}
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
              const allSlotCells = (grid.get(gridKey) ?? [])
                .filter((c) => !suppressedKeys?.has(`${c.day}|${c.hour}|${c.formatLabel}`))
                .sort((a, b) => b.consistencyPct - a.consistencyPct);
              const isExpanded = expandedGridKey === gridKey;
              const visibleCells = isExpanded ? allSlotCells : allSlotCells.slice(0, MAX_VISIBLE);
              const hiddenCount = allSlotCells.length - visibleCells.length;

              return (
                <div key={gridKey} className="relative min-h-[26px] rounded border border-border bg-surface-sunken/40 p-[2px] flex flex-col gap-[2px]">
                  {visibleCells.map((c) => {
                    const isHighlight = c.consistencyPct >= HIGHLIGHT_THRESHOLD;
                    const cellKey = `${c.day}|${c.hour}|${c.formatLabel}`;
                    const isSelected = selectedKey === cellKey;
                    return (
                      <div key={c.formatLabel} className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedKey(isSelected ? null : cellKey)}
                          title={`${c.formatLabel} — ${(c.consistencyPct * 100).toFixed(0)}%`}
                          className={`w-full text-left rounded px-1 py-0.5 text-[9px] leading-tight truncate transition-[filter] hover:brightness-90 ${
                            isHighlight ? colors.chipStrong : colors.chip
                          } ${isSelected ? "ring-2 ring-offset-1 ring-ink/40" : ""}`}
                        >
                          {(c.consistencyPct * 100).toFixed(0)}%
                        </button>

                        {isSelected && (
                          <div
                            className={`absolute z-30 top-full left-0 mt-1 w-56 rounded-2xl border p-3 shadow-xl backdrop-blur-md text-white ${colors.panel}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="text-xs font-semibold">{c.dayLabel} {c.hour} · {c.formatLabel}</div>
                              <button type="button" onClick={() => setSelectedKey(null)} className="text-white/70 hover:text-white text-xs shrink-0">✕</button>
                            </div>
                            <div className="text-xs leading-snug mb-1.5">{c.insight}</div>
                            <div className="text-[10px] text-white/80">
                              {c.monthsPresent} de {c.totalMonthsObserved} meses · {c.selectedMonthCount} este mes · {c.priorYearCount} año pasado
                            </div>
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
