type QuarterClimatePoint = { quarter: number; label: string; confirmationRate: number; totalGames: number };

export default function QuarterClimate({ points }: { points: QuarterClimatePoint[] }) {
  const max = Math.max(...points.map((p) => p.confirmationRate), 0.01);

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 w-full sm:w-[220px]">
      <div className="text-xs text-ink-faint mb-2 text-center">Estacionalidad histórica</div>
      <div className="grid grid-cols-4 gap-1.5">
        {points.map((p) => {
          const intensity = 0.12 + (p.confirmationRate / max) * 0.4;
          return (
            <div
              key={p.quarter}
              title={`${p.label} — ${(p.confirmationRate * 100).toFixed(0)}% de confirmación histórica (${p.totalGames.toLocaleString("en-US")} partidos)`}
              className="rounded-lg py-2 text-center"
              style={{ background: `rgba(13,110,79,${intensity.toFixed(2)})` }}
            >
              <div className="text-[10px] font-semibold text-ink">{p.label}</div>
              <div className="text-[10px] text-ink">{(p.confirmationRate * 100).toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-ink-faint mt-2 text-center">Confirmación por trimestre — todo el histórico</div>
    </div>
  );
}
