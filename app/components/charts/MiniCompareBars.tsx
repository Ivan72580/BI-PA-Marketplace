// Comparativa compacta de 2 (a veces N) barras horizontales — soporte
// visual para "Foco de la semana" y "Oportunidades a explorar" (Ivan,
// 2/10/26): cada tarjeta ya trae los dos números que la sustentan
// (findingValues), esto solo los dibuja uno al lado del otro en vez de
// obligar a leerlos en la oración. Deliberadamente NO es Chart.js (sería
// una barra de Chart.js por cada mitad de tarjeta, mucho peso para 2
// valores) — son <div> con ancho proporcional, que imprimen sin depender
// de que un canvas haya terminado de dibujar.
export type CompareRow = { label: string; value: number };

export default function MiniCompareBars({
  rows,
  formatValue,
  barColor = "bg-brand print:bg-ink",
}: {
  rows: CompareRow[];
  formatValue: (n: number) => string;
  barColor?: string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value), 0.0001);

  return (
    <div className="mt-2 space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="text-[10px] text-ink-faint w-[110px] shrink-0 truncate print:text-[7pt] print:w-[90px]">{row.label}</span>
          <div className="flex-1 h-[9px] rounded-full bg-surface-sunken overflow-hidden print:bg-transparent print:border print:border-border">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
          </div>
          <span className="text-[10px] font-semibold text-ink w-[40px] text-right shrink-0 print:text-[7pt]">{formatValue(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
