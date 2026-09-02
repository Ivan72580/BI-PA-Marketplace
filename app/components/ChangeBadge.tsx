export default function ChangeBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return <span className="text-xs text-ink-faint">sin dato del período anterior</span>;
  }
  const isPositive = invert ? value < 0 : value > 0;
  const colorClass = value === 0 ? "text-ink-muted" : isPositive ? "text-brand" : "text-danger";
  const arrow = value === 0 ? "→" : value > 0 ? "↑" : "↓";
  return (
    <span className={`${colorClass} font-semibold text-sm`}>
      {arrow} {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}
