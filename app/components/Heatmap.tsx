import { Fragment } from "react";

type HeatmapCell = {
  day: string;
  dayLabel: string;
  hour: string;
  count: number;
  cancelledCount: number;
  cancellationRate: number;
  reasonBreakdown: { label: string; count: number }[];
};

function cellColor(intensity: number, tone: "red" | "green") {
  const rgb = tone === "red" ? "185,28,28" : "13,110,79";
  return `rgba(${rgb},${intensity.toFixed(2)})`;
}

export default function Heatmap({
  days,
  hours,
  cells,
  maxCount,
  metric,
}: {
  days: string[];
  hours: string[];
  cells: HeatmapCell[];
  maxCount: number;
  metric: "count" | "rate" | "confirmed";
}) {
  const cellMap = new Map(cells.map((c) => [`${c.day}|${c.hour}`, c]));
  const dayKeys = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const maxConfirmed = Math.max(1, ...cells.map((c) => c.count - c.cancelledCount));

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

        {dayKeys.map((dayKey, i) => (
          <Fragment key={dayKey}>
            <div className="text-xs text-ink-muted flex items-center">{days[i]}</div>
            {hours.map((h) => {
              const cell = cellMap.get(`${dayKey}|${h}`);
              const confirmedCount = (cell?.count ?? 0) - (cell?.cancelledCount ?? 0);

              let value: number;
              let intensity: number;
              let tone: "red" | "green";
              let label: string;

              if (metric === "rate") {
                value = cell?.cancellationRate ?? 0;
                intensity = value;
                tone = "red";
                label = `${(value * 100).toFixed(0)}% cancelación (${cell?.count ?? 0} partidos)`;
                if (cell && cell.reasonBreakdown.length > 0) {
                  const breakdown = cell.reasonBreakdown.map((r) => `  ${r.label}: ${r.count}`).join("\n");
                  label += `\n${breakdown}`;
                }
              } else if (metric === "confirmed") {
                value = confirmedCount;
                intensity = maxConfirmed > 0 ? value / maxConfirmed : 0;
                tone = "green";
                label = `${confirmedCount} confirmados`;
              } else {
                value = cell?.count ?? 0;
                intensity = maxCount > 0 ? value / maxCount : 0;
                tone = "green";
                label = `${cell?.count ?? 0} partidos (confirmados + cancelados)`;
              }

              return (
                <div
                  key={`${dayKey}-${h}`}
                  title={`${days[i]} ${h} — ${label}`}
                  className="aspect-square rounded"
                  style={{ background: (cell?.count ?? 0) > 0 ? cellColor(Math.max(intensity, 0.08), tone) : "var(--color-surface-sunken)" }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
