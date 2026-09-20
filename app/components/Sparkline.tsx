// Mini gráfico de línea estilo apps de trading: sin ejes, sin grilla, sin
// leyenda — solo la forma de la variación. Es un SVG estático (no necesita
// "use client": no hay interactividad, se puede calcular server-side) para
// no sumar peso de JS por algo tan chico.
export default function Sparkline({
  points,
  width = 108,
  height = 34,
}: {
  points: number[]; // valores 0-100 (ej. tasa de confirmación en %)
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-[10px] text-ink-faint">sin historial</div>;
  }

  const PAD = 3; // margen interno para que la línea no se corte en los bordes
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (width - PAD * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = PAD + i * stepX;
    const y = PAD + (height - PAD * 2) * (1 - (p - min) / range);
    return { x, y };
  });
  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];

  const rising = points[points.length - 1] >= points[0];
  const color = rising ? "#16755c" : "#ff4b33";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0">
      <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2} fill={color} />
    </svg>
  );
}
