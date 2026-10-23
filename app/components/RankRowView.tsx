import Link from "next/link";
import ChangeBadge from "./ChangeBadge";

// Fila de un ranking con barra de fondo (formato A): las columnas de texto son fijas (posición, cambio, nombre, valor,
// detalle, variación) y la banda de color es proporcional al valor, por detrás. El contenedor (RankGrid) define las columnas
// y cada fila las hereda con subgrid, así todos los valores quedan alineados.

export const RANK_COLS = "grid-cols-[22px_40px_minmax(0,1fr)_auto_auto_auto]";
export const RANK_COLS_EXPANDABLE = "grid-cols-[22px_40px_minmax(0,1fr)_auto_auto_auto_14px]";

export function RankGrid({ expandable = false, children }: { expandable?: boolean; children: React.ReactNode }) {
  return <div className={`grid ${expandable ? RANK_COLS_EXPANDABLE : RANK_COLS} gap-x-2 gap-y-1.5`}>{children}</div>;
}

function RankIndicator({ rankChange }: { rankChange: number | null | undefined }) {
  if (rankChange === undefined) return <span />;
  if (rankChange === null) return <span className="text-[10px] text-ink-faint text-center" title="No estaba en el ranking del período anterior">nuevo</span>;
  if (rankChange === 0) return <span className="text-ink-faint text-center" title="Se mantuvo en la misma posición">—</span>;
  const up = rankChange > 0;
  return (
    <span
      className={`text-[11px] font-semibold text-center rounded-full py-0.5 bg-white/70 ${up ? "text-brand" : "text-danger"}`}
      title={up ? `Subió ${rankChange} posición(es)` : `Bajó ${Math.abs(rankChange)} posición(es)`}
    >
      {up ? "▲" : "▼"}{Math.abs(rankChange)}
    </span>
  );
}

export type RankRowViewProps = {
  rank: number;
  label: string;
  valueText: string;
  extra?: string;
  rankChange?: number | null;
  delta?: number | null;
  invertDelta?: boolean;
  /** 0–1: largo de la banda. */
  fraction: number;
  tone?: "brand" | "danger";
  /** 0–1: posición de la marca de referencia (ej. promedio de la red) y su texto al pasar el mouse. */
  marker?: number;
  markerTitle?: string;
  /** Banda con trazos finos: muestra chica. */
  small?: boolean;
  href?: string;
  onClick?: () => void;
  expanded?: boolean;
  expandable?: boolean;
  controls?: string;
};

export default function RankRowView(p: RankRowViewProps) {
  const cls = "group relative col-span-full grid grid-cols-subgrid items-center min-h-[42px] rounded-xl bg-surface-panel overflow-hidden px-3 text-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
  const body = (
    <>
      <span
        className={`absolute inset-y-0 left-0 rounded-xl transition-[filter] group-hover:saturate-150 ${p.tone === "danger" ? "rank-band-danger" : "rank-band-brand"} ${p.small ? "rank-small" : ""}`}
        style={{ width: `${Math.max(2, Math.min(1, p.fraction) * 100)}%` }}
        aria-hidden="true"
      />
      {p.marker !== undefined && <span className="rank-ref" style={{ left: `${p.marker * 100}%` }} title={p.markerTitle} aria-hidden="true" />}
      <span className="relative text-xs text-ink-muted">{p.rank}.</span>
      <span className="relative"><RankIndicator rankChange={p.rankChange} /></span>
      <span className="relative truncate font-medium text-ink group-hover:underline">{p.label}</span>
      <span className="relative text-right font-semibold text-ink tabular-nums">{p.valueText}</span>
      <span className="relative text-xs text-ink-muted whitespace-nowrap">{p.extra ?? ""}</span>
      <span className="relative">{p.delta !== undefined && <ChangeBadge value={p.delta} invert={p.invertDelta} />}</span>
      {p.expandable && <span aria-hidden="true" className={`relative text-[10px] text-ink-faint transition-transform ${p.expanded ? "rotate-90" : ""}`}>▶</span>}
    </>
  );
  if (p.href !== undefined) return <Link href={p.href} className={cls}>{body}</Link>;
  return (
    <button type="button" onClick={p.onClick} aria-expanded={p.expanded} aria-controls={p.controls} className={cls}>
      {body}
    </button>
  );
}
