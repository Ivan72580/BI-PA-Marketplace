import type { NormalizedBreakdownRow } from "./ScopeBreakdownTable";

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

// Soporte visual de "Desglose" (Ivan, 2/10/26): la tabla ya muestra los
// números exactos por región/market/cancha — esto agrega una lectura a
// simple vista de qué fila pesa más en confirmados, antes de entrar al
// detalle de la tabla. Se limita a las primeras 6 filas (ya vienen
// ordenadas por confirmedGames desc, ver normalizeBreakdownRows/
// getScopeBreakdown) para no duplicar la tabla completa en otro formato —
// "no muy extenso", como pidió Ivan.
const MAX_ROWS = 6;

export default function BreakdownBars({ rows }: { rows: NormalizedBreakdownRow[] }) {
  if (rows.length === 0) return null;
  const top = [...rows].sort((a, b) => b.confirmedGames - a.confirmedGames).slice(0, MAX_ROWS);
  const max = Math.max(...top.map((r) => r.confirmedGames), 1);

  return (
    <div className="space-y-1 mb-3 print:mb-2">
      {top.map((row) => (
        <div key={row.name} className="flex items-center gap-2">
          <span className="text-[10px] text-ink-muted w-[120px] shrink-0 truncate print:text-[7pt] print:w-[100px]">{row.name}</span>
          <div className="flex-1 h-[10px] rounded-full bg-surface-sunken overflow-hidden print:bg-transparent print:border print:border-border">
            <div
              className="h-full rounded-full bg-brand print:bg-ink"
              style={{ width: `${Math.max(4, (row.confirmedGames / max) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold text-ink w-[44px] text-right shrink-0 print:text-[7pt]">{formatNum(row.confirmedGames)}</span>
        </div>
      ))}
    </div>
  );
}
