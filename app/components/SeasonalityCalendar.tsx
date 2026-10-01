import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ChangeBadge from "./ChangeBadge";

export type SeasonalityMonthProjectionVM = {
  available: boolean;
  monthLabel: string;
  projectedGames: number | null;
  projectedRevenue: number | null;
  // Variación vs. el MES ANTERIOR completo (mismo criterio que la
  // Predicción de Overview) — NO es interanual, a propósito distinto del
  // gamesYoyPct/revenueYoyPct del resto de esta tarjeta. Se etiqueta aparte
  // en el render para no confundir las dos bases de comparación.
  changePctGames: number | null;
  changePctRevenue: number | null;
  confirmedSoFar: number;
  daysElapsed: number;
  daysInMonth: number;
  availableFromDay: number;
};

export type SeasonalityMonthCardVM = {
  monthIndex: number; // 0-11
  monthLabel: string; // ya localizado, corto (ej. "Ene" / "Jan")
  confirmedGames: number;
  priorConfirmedGames: number;
  revenue: number;
  priorRevenue: number;
  gamesYoyPct: number | null; // null = sin partidos confirmados el mismo mes del año anterior
  revenueYoyPct: number | null;
  // "future": ese mes todavía no llegó (año actual, mes posterior al de
  // hoy en el huso del negocio) — no hay nada que mostrar, a propósito no
  // se pinta como "0 partidos" (se leería como una caída real).
  // "current": mes en curso — los números son reales pero parciales.
  status: "past" | "current" | "future";
  // Link al detalle de ese mes en Overview (mismos filtros ya aplicados
  // acá) — null en los meses "future" (no hay nada que mostrar todavía).
  href: string | null;
  // Solo presente en la tarjeta del mes en curso — réplica de la
  // Predicción mensual de Overview (getMonthProjection), ya filtrada por
  // región/market/facility igual que el resto de esta página.
  projection?: SeasonalityMonthProjectionVM;
};

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Verde (alto volumen) a rojo (bajo volumen) en un solo degradé continuo —
// a diferencia del verde-de-intensidad-única de QuarterClimate, acá el
// pedido es específicamente un mapa de calor de dos colores con transición,
// así que se interpola el HUE (0=rojo .. 120=verde) en vez de la opacidad
// de un solo color. Lightness alto (pastel) para que el texto oscuro
// (text-ink) siga siendo legible encima.
function heatColor(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = clamped * 120;
  return `hsl(${hue.toFixed(0)}, 65%, 87%)`;
}

export default async function SeasonalityCalendar({
  months,
  year,
  cardCompare,
  cardCompareHref,
}: {
  months: SeasonalityMonthCardVM[];
  year: number;
  // Toggle para mostrar, al lado de cada valor, el valor crudo del mismo
  // mes el año anterior (no afecta al badge de variación %, que ya es la
  // comparación en sí — pedido explícito).
  cardCompare: boolean;
  cardCompareHref: string;
}) {
  const t = await getTranslations("Seasonality");
  const max = Math.max(...months.map((m) => m.confirmedGames), 1);

  return (
    <div className="rounded-3xl bg-surface p-4 shadow-md">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 px-1">
        <div className="font-display text-sm font-semibold text-ink">{t("calendar.title")}</div>
        <Link
          href={cardCompareHref}
          className={`text-[11px] rounded-full px-2.5 py-1 font-medium transition-colors ${
            cardCompare ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"
          }`}
        >
          {t(cardCompare ? "calendar.cardCompare.hide" : "calendar.cardCompare.show")}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {months.map((m) => {
          const isFuture = m.status === "future";
          const background = isFuture ? undefined : heatColor(m.confirmedGames / max);
          const cardClassName = `rounded-xl p-3 min-h-[128px] flex flex-col ${isFuture ? "bg-surface-sunken" : ""} ${
            m.href ? "hover:brightness-95 transition-[filter] cursor-pointer" : ""
          }`;

          const body = (
            <>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs font-semibold text-ink">{m.monthLabel}</span>
                {m.status === "current" && (
                  <span className="text-[9px] uppercase tracking-wide bg-warning text-white px-1.5 py-0.5 rounded-full shrink-0">
                    {t("calendar.current")}
                  </span>
                )}
              </div>

              {isFuture ? (
                <div className="text-xs text-ink-faint mt-auto">{t("calendar.future")}</div>
              ) : (
                <>
                  <div className="font-display text-xl font-bold text-ink leading-tight">{formatNum(m.confirmedGames)}</div>
                  <div className="text-[10px] text-ink-faint mb-0.5">{t("calendar.gamesLabel")}</div>
                  {cardCompare && (
                    <div className="text-[10px] text-ink-faint mb-1">
                      {t("calendar.priorValue", { year: year - 1, value: formatNum(m.priorConfirmedGames) })}
                    </div>
                  )}
                  <div className="mb-2">
                    <ChangeBadge value={m.gamesYoyPct} />
                  </div>

                  <div className="mt-auto pt-2 border-t border-white/40">
                    <div className="text-sm font-semibold text-ink">{formatUSD(m.revenue)}</div>
                    <div className="text-[10px] text-ink-faint mb-0.5">{t("calendar.revenueLabel")}</div>
                    {cardCompare && (
                      <div className="text-[10px] text-ink-faint mb-1">
                        {t("calendar.priorValue", { year: year - 1, value: formatUSD(m.priorRevenue) })}
                      </div>
                    )}
                    <ChangeBadge value={m.revenueYoyPct} />
                  </div>

                  {m.projection && (
                    <div className="mt-2 pt-2 -mx-3 -mb-3 px-3 pb-3 rounded-b-xl border-t border-brand/20 bg-brand-soft/70">
                      <div className="text-[9px] font-semibold text-brand mb-1 uppercase tracking-wide">
                        {t("projection.title", { month: m.projection.monthLabel })}
                      </div>
                      {m.projection.available ? (
                        <>
                          <div className="flex items-baseline gap-1 flex-wrap">
                            <span className="text-sm font-bold text-ink">{formatNum(m.projection.projectedGames ?? 0)}</span>
                            <span className="text-[9px] text-ink-faint">{t("projection.gamesLabel")}</span>
                            {m.projection.changePctGames !== null && <ChangeBadge value={m.projection.changePctGames} />}
                          </div>
                          <div className="flex items-baseline gap-1 flex-wrap mt-0.5">
                            <span className="text-sm font-bold text-ink">{formatUSD(m.projection.projectedRevenue ?? 0)}</span>
                            <span className="text-[9px] text-ink-faint">{t("projection.revenueLabel")}</span>
                            {m.projection.changePctRevenue !== null && <ChangeBadge value={m.projection.changePctRevenue} />}
                          </div>
                          <div className="text-[9px] text-ink-faint mt-1 leading-snug">
                            {t("projection.basedOn", {
                              confirmed: m.projection.confirmedSoFar.toLocaleString("en-US"),
                              elapsed: m.projection.daysElapsed,
                              total: m.projection.daysInMonth,
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-ink-faint">
                          {t("projection.notYetAvailable", { month: m.projection.monthLabel, day: m.projection.availableFromDay })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          );

          return m.href ? (
            <Link key={m.monthIndex} href={m.href} title={t("calendar.clickHint")} className={cardClassName} style={background ? { background } : undefined}>
              {body}
            </Link>
          ) : (
            <div key={m.monthIndex} className={cardClassName} style={background ? { background } : undefined}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
