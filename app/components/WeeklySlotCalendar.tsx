import Link from "next/link";
import type { WeeklyCalendarDay, WeeklySlotCell, WeeklySlotTier, FacilityUnavailableFlag } from "../lib/db/queries";

// Sin "use client": no hay estado ni interacción más allá de los <Link> de
// siempre — mismo criterio que ForecastDayCard en app/daily/page.tsx, que
// recibe `t` ya resuelto como prop en vez de usar el hook useTranslations.
type Translator = (key: string, values?: Record<string, string | number>) => string;

function formatPctCompact(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const TIER_CLASSES: Record<WeeklySlotTier, string> = {
  strong: "border-brand/25 bg-brand-soft/50 text-brand hover:bg-brand-soft",
  moderate: "border-warning/30 bg-warning-soft/50 text-ink-muted hover:bg-warning-soft",
  weak: "border-danger/25 bg-danger-soft/40 text-danger hover:bg-danger-soft",
};

function TrendMark({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "flat") return null;
  return (
    <span className={trend === "up" ? "text-brand" : "text-danger"} aria-hidden="true">
      {trend === "up" ? "↑" : "↓"}
    </span>
  );
}

// Calendario de la semana (próximos 7 días reales) a nivel slot, más el
// indicador de cancha no disponible — ver el comentario largo en
// getWeeklySlotForecastImpl (app/lib/db/daily.ts) para la metodología.
// A propósito sin texto explicativo por celda: un valor (tasa + flecha de
// tendencia) que linkea a Trends para el detalle real, nada más.
export default function WeeklySlotCalendar({
  weekDays,
  cells,
  unavailableFlags,
  trendsHref,
  t,
}: {
  weekDays: WeeklyCalendarDay[];
  cells: WeeklySlotCell[];
  unavailableFlags: FacilityUnavailableFlag[];
  trendsHref: string;
  t: Translator;
}) {
  const byDate = new Map<string, WeeklySlotCell[]>();
  for (const c of cells) {
    const arr = byDate.get(c.dateISO) ?? [];
    arr.push(c);
    byDate.set(c.dateISO, arr);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-2 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />{t("weeklyCalendar.legend.strong")}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />{t("weeklyCalendar.legend.moderate")}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger" aria-hidden="true" />{t("weeklyCalendar.legend.weak")}</span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {weekDays.map((day) => {
            const dayCells = byDate.get(day.dateISO) ?? [];
            return (
              <div key={day.dateISO} className="rounded-xl border border-border/70 bg-surface-sunken/40 p-2.5 min-w-[152px] shrink-0">
                <div className="flex items-baseline justify-between gap-1 mb-1.5">
                  <span className="text-sm font-semibold text-ink">{day.dayLabel}</span>
                  <span className="text-[10px] text-ink-faint">{day.dateLabel}</span>
                </div>
                {dayCells.length === 0 ? (
                  <div className="text-[11px] text-ink-faint py-1.5">{t("weeklyCalendar.noData")}</div>
                ) : (
                  <ul className="space-y-1">
                    {dayCells.map((cell) => (
                      <li key={`${cell.hour}-${cell.formatLabel}`}>
                        <Link
                          href={trendsHref}
                          className={`flex items-center justify-between gap-1.5 rounded-lg border px-1.5 py-1 text-[11px] transition-colors ${TIER_CLASSES[cell.tier]}`}
                        >
                          <span className="truncate">{cell.hour} · {cell.formatLabel}</span>
                          <span className="font-semibold shrink-0 flex items-center gap-0.5">
                            {formatPctCompact(cell.confirmationRate)}
                            <TrendMark trend={cell.trend} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border/70 p-3">
        <div className="text-xs font-semibold text-ink mb-1.5">{t("weeklyCalendar.unavailable.title")}</div>
        {unavailableFlags.length === 0 ? (
          <div className="text-[11px] text-ink-faint">{t("weeklyCalendar.unavailable.empty")}</div>
        ) : (
          <ul className="space-y-1">
            {unavailableFlags.map((f) => (
              <li key={`${f.day}-${f.hour}-${f.formatLabel}`}>
                <Link
                  href={trendsHref}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                    f.classification === "recurring"
                      ? "border-danger/25 bg-danger-soft/40 hover:bg-danger-soft/60"
                      : "border-border bg-surface hover:bg-surface-sunken/60"
                  }`}
                >
                  <span className="truncate text-ink-muted">
                    {f.dayLabel} {f.dateLabel} · {f.hour} · {f.formatLabel}
                  </span>
                  <span className={`shrink-0 font-medium whitespace-nowrap ${f.classification === "recurring" ? "text-danger" : "text-ink-muted"}`}>
                    {f.classification === "recurring" ? t("weeklyCalendar.unavailable.recurring") : t("weeklyCalendar.unavailable.isolated")}
                    {" "}
                    {t("weeklyCalendar.unavailable.countLabel", { n: f.count })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
