import { Fragment } from "react";

type SlotConsistencyCell = {
  day: string;
  dayLabel: string;
  hour: string;
  consistencyPct: number;
  monthsPresent: number;
  totalMonthsObserved: number;
  selectedMonthCount: number;
  priorYearCount: number;
};

const DAY_KEYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Los slots con >=75% de consistencia son el dato importante de este
// heatmap — reciben una escala fuerte y bien diferenciada. Por debajo de
// ese umbral es más un dato de contexto, así que se ve todo parejo y
// apagado a propósito.
const HIGHLIGHT_THRESHOLD = 0.75;

const COLOR_RGB: Record<"green" | "red", string> = {
  green: "13,110,79",
  red: "185,28,28",
};

function cellBackground(consistency: number, rgb: string): string {
  if (consistency <= 0) return "var(--color-surface-sunken)";
  if (consistency >= HIGHLIGHT_THRESHOLD) {
    const t = (consistency - HIGHLIGHT_THRESHOLD) / (1 - HIGHLIGHT_THRESHOLD); // 0..1
    const intensity = 0.55 + t * 0.45; // 0.55..1.0, bien diferenciado
    return `rgba(${rgb},${intensity.toFixed(2)})`;
  }
  return `rgba(${rgb},0.14)`; // parejo y apagado — no es lo relevante acá
}

export default function SlotConsistencyHeatmap({
  days,
  hours,
  cells,
  selectedMonthLabel,
  priorYearLabel,
  colorScheme = "green",
  suppressedKeys,
}: {
  days: string[];
  hours: string[];
  cells: SlotConsistencyCell[];
  selectedMonthLabel: string;
  priorYearLabel: string;
  colorScheme?: "green" | "red";
  // Slots ("day|hour") que ya están resaltados en el heatmap opuesto — se
  // muestran apagados acá aunque su propio dato califique, para no generar
  // la confusión de ver el mismo slot marcado como "no puede faltar" y
  // "evitar" al mismo tiempo.
  suppressedKeys?: Set<string>;
}) {
  const cellMap = new Map(cells.map((c) => [`${c.day}|${c.hour}`, c]));
  const rgb = COLOR_RGB[colorScheme];

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `44px repeat(${hours.length}, 18px)`, width: `${44 + hours.length * 21}px` }}
      >
        <div />
        {hours.map((h) => (
          <div key={h} className="text-[10px] text-ink-faint text-center">{h.replace("h", "")}</div>
        ))}

        {DAY_KEYS.map((dayKey, i) => (
          <Fragment key={dayKey}>
            <div className="text-xs text-ink-muted flex items-center">{days[i]}</div>
            {hours.map((h) => {
              const cellKey = `${dayKey}|${h}`;
              const cell = cellMap.get(cellKey);
              const isSuppressed = suppressedKeys?.has(cellKey) ?? false;
              const consistency = isSuppressed ? 0 : cell?.consistencyPct ?? 0;

              const changeText =
                cell && cell.priorYearCount > 0
                  ? `${cell.selectedMonthCount > cell.priorYearCount ? "+" : ""}${cell.selectedMonthCount - cell.priorYearCount} vs. ${priorYearLabel}`
                  : cell && cell.selectedMonthCount > 0
                  ? `sin dato de ${priorYearLabel}`
                  : "";

              const suppressedNote = isSuppressed ? "\n(no se resalta acá — ya es un slot destacado en el heatmap opuesto)" : "";

              const title = cell
                ? `${days[i]} ${h} — ${(cell.consistencyPct * 100).toFixed(0)}% de consistencia (${cell.monthsPresent} de ${cell.totalMonthsObserved} meses)\n${selectedMonthLabel}: ${cell.selectedMonthCount} confirmados\n${priorYearLabel}: ${cell.priorYearCount} confirmados${changeText ? `\n${changeText}` : ""}${suppressedNote}`
                : "";

              return (
                <div
                  key={`${dayKey}-${h}`}
                  title={title}
                  className="aspect-square rounded"
                  style={{ background: cellBackground(consistency, rgb) }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
