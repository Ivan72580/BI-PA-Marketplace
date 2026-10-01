import ChangeBadge from "../ChangeBadge";

export type ReportKpiTile = {
  label: string;
  formattedValue: string;
  changeValue: number | null;
  unit?: "pct" | "pts";
  // true cuando un AUMENTO es una mala noticia (ej. tasa de cancelación) —
  // mismo prop que ya expone ChangeBadge, solo lo pasamos para arriba.
  invert?: boolean;
  priorLabel?: string;
};

export default function ReportKpiStrip({ tiles }: { tiles: ReportKpiTile[] }) {
  return (
    <div className="flex flex-wrap gap-2.5 print:gap-2">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex-1 min-w-[140px] rounded-xl bg-surface-sunken p-3 print:p-2 print:rounded-md print:border print:border-border"
        >
          <div className="text-[10px] uppercase tracking-wide text-ink-muted mb-1 print:text-[7pt]">{tile.label}</div>
          <div className="font-display text-lg font-bold text-ink leading-tight print:text-[13pt]">{tile.formattedValue}</div>
          <div className="mt-0.5 flex items-baseline gap-1 flex-wrap">
            <ChangeBadge value={tile.changeValue} unit={tile.unit} invert={tile.invert} />
            {tile.priorLabel && <span className="text-[10px] text-ink-faint print:text-[7pt]">{tile.priorLabel}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
