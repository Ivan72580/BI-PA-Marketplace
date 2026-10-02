import ChangeBadge from "../ChangeBadge";
import Sparkline from "../charts/Sparkline";

export type ReportKpiTile = {
  label: string;
  formattedValue: string;
  changeValue: number | null;
  unit?: "pct" | "pts";
  // true cuando un AUMENTO es una mala noticia (ej. tasa de cancelación) —
  // mismo prop que ya expone ChangeBadge, solo lo pasamos para arriba.
  invert?: boolean;
  priorLabel?: string;
  // Serie de `evolution` para este KPI (mismos 6 períodos que ya se traen
  // para el gráfico de evolución) — opcional porque no todos los KPIs
  // tienen una serie equivalente todavía (totalRevenue no se trackea por
  // período en MetricSeriesPoint). Ivan (2/10/26) pidió una más grande que
  // un sparkline mínimo, por eso la altura por defecto de Sparkline (44px)
  // en vez de algo tipo 16-20px.
  sparkline?: number[];
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
          {tile.sparkline && tile.sparkline.length >= 2 && (
            <div className="mt-2 print:mt-1.5">
              <Sparkline values={tile.sparkline} height={40} color={tile.invert ? "#cc3c29" : "#16755c"} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
