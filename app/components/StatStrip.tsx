import type { ReactNode } from "react";

// Fila de indicadores compactos (cifra grande + etiqueta + una línea de contexto). Se usa en las pestañas de
// Market para que cada una abra con números antes que con texto.

export type Stat = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
};

const TONE = { default: "text-ink", good: "text-brand", bad: "text-danger", warn: "text-warning" } as const;

export default function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${stats.length >= 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : ""}`}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-surface shadow-sm p-4 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint truncate">{s.label}</div>
          <div className={`font-display text-2xl font-bold mt-1 truncate ${TONE[s.tone ?? "default"]}`}>{s.value}</div>
          {s.sub && <div className="text-xs text-ink-muted mt-0.5 truncate">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
