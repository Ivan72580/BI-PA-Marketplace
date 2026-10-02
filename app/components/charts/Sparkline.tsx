// Mini-gráfico de línea liviano (SVG inline, sin Chart.js) para series
// cortas (6 períodos: evolution del reporte) donde un LineChart completo
// (ejes, tooltip, leyenda — ver LineChart.tsx) sería demasiado para el
// espacio disponible (un tile de KPI, una tarjeta de "Foco"/"Oportunidades").
// Ivan (2/10/26) pidió soporte visual por sección sin repetir lo que ya está
// en la web — esto es nuevo (el Ops Report hoy no tiene ningún gráfico) y
// más compacto que el LineChart que el Ejecutivo ya usa para lo mismo.
//
// No usa Chart.js a propósito: no hace falta canvas/interactividad para una
// serie de 4-6 puntos, y un <svg> con viewBox se imprime tal cual en el PDF
// (window.print() imprime el DOM — ver ReportSection.tsx) sin depender de
// que el canvas ya haya terminado de dibujar.
export default function Sparkline({
  values,
  height = 44,
  color = "#16755c", // mismo verde que ya usa LineChart/ExecutiveReportDocument para "evolution"
  fill = true,
}: {
  values: number[];
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (values.length < 2) return null;

  const width = 100; // viewBox lógico; el SVG escala a 100% del contenedor
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // evita división por 0 cuando la serie es plana

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * height;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full print:w-full"
      style={{ height }}
      role="img"
      aria-label="Tendencia reciente"
    >
      {fill && <path d={areaPath} fill={color} opacity={0.12} stroke="none" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r={2.2} fill={color} />
    </svg>
  );
}
