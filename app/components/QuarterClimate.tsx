import { getTranslations } from "next-intl/server";

type QuarterClimatePoint = { quarter: number; label: string; confirmationRate: number; totalGames: number };

// Sin "use client": es un Server Component puro (sin hooks), renderizado
// directamente por trends/page.tsx — puede quedarse async y usar
// getTranslations() acá mismo (no cachea con unstable_cache, así que no
// aplica la restricción de dynamic APIs que sí afecta a app/lib/db/trends.ts).
export default async function QuarterClimate({ points }: { points: QuarterClimatePoint[] }) {
  const t = await getTranslations("Trends.quarterClimate");
  const max = Math.max(...points.map((p) => p.confirmationRate), 0.01);

  return (
    <div className="rounded-2xl bg-surface shadow-sm p-4 w-full sm:w-[220px]">
      <div className="text-xs text-ink-faint mb-2 text-center">{t("title")}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {points.map((p) => {
          const intensity = 0.12 + (p.confirmationRate / max) * 0.4;
          return (
            <div
              key={p.quarter}
              title={t("tooltip", { label: p.label, pct: (p.confirmationRate * 100).toFixed(0), n: p.totalGames.toLocaleString("en-US") })}
              className="rounded-lg py-2 text-center"
              style={{ background: `rgba(22,117,92,${intensity.toFixed(2)})` }}
            >
              <div className="text-[10px] font-semibold text-ink">{p.label}</div>
              <div className="text-[10px] text-ink">{(p.confirmationRate * 100).toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-ink-faint mt-2 text-center">{t("footer")}</div>
    </div>
  );
}
