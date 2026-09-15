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
  green: { chipStrong: "bg-brand text-white", chip: "bg-brand-soft text-brand", panel: "bg-brand-soft border-brand/30" },
  red: { chipStrong: "bg-danger text-white", chip: "bg-danger-soft text-danger", panel: "bg-danger-soft border-danger/30" },
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
  const [selected, setSelected] = useState<SlotConsistencyCell | null>(null);
  const colors = COLOR[colorScheme];

  const grid = new Map<string, SlotConsistencyCell[]>();
  for (const c of cells) {
    const key = `${c.day}|${c.hour}`;
    const arr = grid.get(key) ?? [];
    arr.push(c);
    grid.set(key, arr);
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(96px, 1fr))`, minWidth: `${52 + days.length * 96}px` }}
        >
          <div />
          {days.map((d) => (
            <div key={d} className="text-xs font-medium text-ink-muted text-center pb-1.5">{d}</div>
          ))}

          {hours.map((h) => (
            <Fragment key={h}>
              <div className="text-[11px] text-ink-faint flex items-start justify-end pr-1.5 pt-1.5">{h}</div>
              {DAY_KEYS.map((dayKey) => {
                const gridKey = `${dayKey}|${h}`;
                const slotCells = (grid.get(gridKey) ?? []).filter(
                  (c) => !suppressedKeys?.has(`${c.day}|${c.hour}|${c.formatLabel}`)
                );
                return (
                  <div key={gridKey} className="min-h-[54px] rounded-lg border border-border bg-surface-sunken/40 p-1 flex flex-col gap-1">
                    {slotCells.map((c) => {
                      const isHighlight = c.consistencyPct >= HIGHLIGHT_THRESHOLD;
                      const isSelected = selected?.day === c.day && selected?.hour === c.hour && selected?.formatLabel === c.formatLabel;
                      return (
                        <button
                          key={c.formatLabel}
                          type="button"
                          onClick={() => setSelected(isSelected ? null : c)}
                          className={`text-left rounded px-1.5 py-1 text-[10px] leading-tight transition-opacity hover:opacity-80 ${
                            isHighlight ? colors.chipStrong : colors.chip
                          } ${isSelected ? "ring-2 ring-offset-1 ring-ink/40" : ""}`}
                        >
                          <div className="font-medium truncate" title={c.formatLabel}>{c.formatLabel}</div>
                          <div className="opacity-90">{(c.consistencyPct * 100).toFixed(0)}%</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {selected && (
        <div className={`mt-4 rounded-xl border p-4 ${colors.panel}`}>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <div className="text-sm font-semibold text-ink">
              {selected.dayLabel} {selected.hour} · {selected.formatLabel}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-ink-faint hover:text-ink shrink-0">
              cerrar ✕
            </button>
          </div>
          <div className="text-sm text-ink mb-2">{selected.insight}</div>
          <div className="text-xs text-ink-faint">
            {(selected.consistencyPct * 100).toFixed(0)}% de consistencia · {selected.monthsPresent} de {selected.totalMonthsObserved} meses observados · {selected.selectedMonthCount} este mes · {selected.priorYearCount} el mismo mes del año pasado
          </div>
        </div>
      )}
    </div>
  );
}
