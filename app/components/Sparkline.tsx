// Mini gráfico de línea estilo apps de trading: sin ejes, sin grilla, sin
// leyenda — solo la forma de la variación. Es un SVG estático (no necesita
// "use client": no hay interactividad de React) pero cada punto lleva un
// <title> nativo del navegador — al pasar el mouse muestra "label: valor"
// sin sumar JS. Un caller puede seguir pasando números sueltos (sin label,
// el tooltip muestra solo el valor) para no romper nada existente.
export type SparklinePoint = number | { label?: string; value: number };

function toPoint(p: SparklinePoint): { label?: string; value: number } {
  return typeof p === "number" ? { value: p } : p;
}

export default function Sparkline({
  points,
  width = 108,
  height = 34,
  formatValue,
}: {
  points: SparklinePoint[]; // números sueltos, o {label, value} para tooltip con contexto
  width?: number;
  height?: number;
  // Cómo mostrar `value` en el tooltip de cada punto. Default: el número tal cual.
  formatValue?: (v: number) => string;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-[10px] text-ink-faint">sin historial</div>;
  }

  const normalized = points.map(toPoint);
  const values = normalized.map((p) => p.value);

  const PAD = 3; // margen interno para que la línea no se corte en los bordes
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - PAD * 2) / (normalized.length - 1);

  const coords = normalized.map((p, i) => {
    const x = PAD + i * stepX;
    const y = PAD + (height - PAD * 2) * (1 - (p.value - min) / range);
    return { x, y, label: p.label, value: p.value };
  });
  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];

  const rising = values[values.length - 1] >= values[0];
  const color = rising ? "#16755c" : "#ff4b33";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0">
      <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => {
        const shownValue = formatValue ? formatValue(c.value) : `${c.value}`;
        return (
          <circle key={i} cx={c.x} cy={c.y} r={6} fill="transparent">
            <title>{c.label ? `${c.label}: ${shownValue}` : shownValue}</title>
          </circle>
        );
      })}
      <circle cx={last.x} cy={last.y} r={2} fill={color} />
    </svg>
  );
}
