import { getTranslations } from "next-intl/server";
import ChangeBadge from "./ChangeBadge";

export type SeasonalityMonthCardVM = {
  monthIndex: number; // 0-11
  monthLabel: string; // ya localizado, corto (ej. "Ene" / "Jan")
  confirmedGames: number;
  revenue: number;
  gamesYoyPct: number | null; // null = sin partidos confirmados el mismo mes del año anterior
  revenueYoyPct: number | null;
  // "future": ese mes todavía no llegó (año actual, mes posterior al de
  // hoy en el huso del negocio) — no hay nada que mostrar, a propósito no
  // se pinta como "0 partidos" (se leería como una caída real).
  // "current": mes en curso — los números son reales pero parciales.
  status: "past" | "current" | "future";
};

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Grilla de 12 tarjetas (una por mes), coloreadas como mapa de calor según
// volumen de partidos confirmados — mismo criterio de intensidad relativa
// que QuarterClimate (0.12 + (valor/máximo del conjunto mostrado) * 0.4),
// extendido acá con el valor real + variación % (vs. mismo mes, año
// anterior) y revenue simple + su propia variación.
//
// A propósito NO es una GroupSection: esa vista siempre trae un botón para
// colapsar, y el pedido explícito es que el calendario por mes en tarjetas
// nunca se pierda de vista — vive en un contenedor fijo, siempre expandido.
export default async function SeasonalityCalendar({ months }: { months: SeasonalityMonthCardVM[] }) {
  const t = await getTranslations("Seasonality.calendar");
  const max = Math.max(...months.map((m) => m.confirmedGames), 1);

  return (
    <div className="rounded-3xl bg-surface p-4 shadow-md">
      <div className="font-display text-sm font-semibold text-ink mb-3 px-1">{t("title")}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {months.map((m) => {
          const isFuture = m.status === "future";
          const intensity = isFuture ? 0.04 : 0.12 + (m.confirmedGames / max) * 0.4;
          return (
            <div
              key={m.monthIndex}
              className="rounded-xl p-3 min-h-[116px] flex flex-col"
              style={{ background: `rgba(22,117,92,${intensity.toFixed(2)})` }}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs font-semibold text-ink">{m.monthLabel}</span>
                {m.status === "current" && (
                  <span className="text-[9px] uppercase tracking-wide bg-warning text-white px-1.5 py-0.5 rounded-full shrink-0">
                    {t("current")}
                  </span>
                )}
              </div>

              {isFuture ? (
                <div className="text-xs text-ink-faint mt-auto">{t("future")}</div>
              ) : (
                <>
                  <div className="font-display text-xl font-bold text-ink leading-tight">{formatNum(m.confirmedGames)}</div>
                  <div className="text-[10px] text-ink-faint mb-1.5">{t("gamesLabel")}</div>
                  <div className="mb-2">
                    <ChangeBadge value={m.gamesYoyPct} />
                  </div>

                  <div className="mt-auto pt-2 border-t border-white/40">
                    <div className="text-sm font-semibold text-ink">{formatUSD(m.revenue)}</div>
                    <div className="text-[10px] text-ink-faint mb-1">{t("revenueLabel")}</div>
                    <ChangeBadge value={m.revenueYoyPct} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
