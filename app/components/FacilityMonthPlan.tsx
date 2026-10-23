import Link from "next/link";
import { weekdayAbbr, weekdayLabel, weekdayPlural } from "../lib/db/weekday";
import type { FacilityPlan } from "../lib/db/facilityPlan";
import { CELL_MIN_BASE, DAY_MIN_BASE, GREEN_MIN_RATE, type CellBand, type PlanFilter, type Trend } from "../lib/slotPlanCalc";
import { MUST_SCHEDULE_MIN_RATE, MUST_SCHEDULE_WINDOW_MONTHS } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";

// "Próximos 30 días" de Pronóstico cuando hay un facility elegido: qué esperar de cada día y
// horario según los últimos 3 meses, y dónde mirar primero. Definiciones en app/lib/slotPlanCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;

export type SeasonContextItem = {
  month: number; // 0-11
  level: "high" | "mid" | "low" | null;
  index: number | null;
  unavailRate: number | null;
  unavailTrendPp: number | null; // 0.05 = +5 puntos vs el año previo
};
export type SeasonContext = { items: SeasonContextItem[]; provisional: boolean; completeMonths: number; hasIndex: boolean };

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const TREND_GLYPH: Record<Trend, string> = { up: "▲", down: "▼", flat: "▬" };
const TREND_TONE: Record<Trend, string> = { up: "text-brand", down: "text-danger", flat: "text-ink-faint" };
const BAND_TONE: Record<CellBand, string> = {
  green: "bg-brand-soft text-brand",
  amber: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  thin: "text-ink-faint",
};
const BAND_DOT: Record<CellBand, string> = { green: "bg-brand-fill", amber: "bg-warning-fill", red: "bg-danger-fill", thin: "bg-surface-sunken border border-border" };
const TIER_TONE = { better: "bg-brand-soft text-brand", weaker: "bg-warning-soft text-warning", typical: "", insufficient: "text-ink-faint" } as const;

function shortDate(iso: string, locale: Locale) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
}
function monthName(month: number, locale: Locale) {
  return new Date(Date.UTC(2026, month, 1)).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "long", timeZone: "UTC" });
}

function Tile({ label, value, note, href, dot }: { label: string; value: string; note?: string; href?: string; dot?: string }) {
  const body = (
    <div className="rounded-xl bg-surface-sunken p-3 h-full">
      <div className="text-xs text-ink-faint mb-1 flex items-center gap-1.5">{dot && <i className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />}{label}</div>
      <div className="font-display text-lg font-bold text-ink">{value}</div>
      {note && <div className="text-[11px] text-ink-muted mt-0.5">{note}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90 transition-opacity">{body}</Link> : body;
}

export default function FacilityMonthPlan({
  plan, season, t, locale, weekHrefFor,
}: {
  plan: FacilityPlan;
  season: SeasonContext | null;
  t: T;
  locale: Locale;
  weekHrefFor: (f: PlanFilter | undefined) => string;
}) {
  const m = plan.month;
  const counts = (f: PlanFilter) => plan.slots.filter((s) => (f === "secure" ? s.secure : s.light === f)).length;
  const better = m.weekdays.filter((d) => d.tier === "better");
  const weaker = m.weekdays.filter((d) => d.tier === "weaker");
  const names = (ds: typeof better) => ds.map((d) => weekdayPlural(d.dayOfWeek, locale)).join(", ");
  const overall = m.overallRate;

  return (
    <section className="rounded-2xl bg-surface shadow-sm p-5 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("plan.month.title")}</h3>
        <p className="text-xs text-ink-faint mt-0.5 max-w-3xl">
          {t("plan.month.subtitle", { months: MUST_SCHEDULE_WINDOW_MONTHS, from: shortDate(plan.windowFrom, locale), to: shortDate(plan.windowTo, locale) })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label={t("plan.month.tiles.rate")} value={pct(overall)} note={t("plan.month.tiles.rateNote", { base: m.overallBase })} />
        <Tile label={t("plan.lights.green.label")} value={String(counts("green"))} note={t("plan.month.tiles.openWeek")} href={weekHrefFor("green")} dot={BAND_DOT.green} />
        <Tile label={t("plan.lights.amber.label")} value={String(counts("amber"))} note={t("plan.month.tiles.openWeek")} href={weekHrefFor("amber")} dot={BAND_DOT.amber} />
        <Tile label={t("plan.lights.red.label")} value={String(counts("red"))} note={t("plan.month.tiles.openWeek")} href={weekHrefFor("red")} dot={BAND_DOT.red} />
        <Tile label={t("plan.secure.label")} value={String(counts("secure"))} note={t("plan.month.tiles.openWeek")} href={weekHrefFor("secure")} />
      </div>

      {/* Días de la semana */}
      <div>
        <h4 className="text-sm font-medium text-ink">{t("plan.month.days.title")}</h4>
        <p className="text-xs text-ink-faint mb-3">
          {better.length || weaker.length
            ? [better.length ? t("plan.month.days.better", { days: names(better) }) : "", weaker.length ? t("plan.month.days.weaker", { days: names(weaker) }) : ""].filter(Boolean).join(" ")
            : t("plan.month.days.even")}
        </p>
        <div className="space-y-2">
          {m.weekdays.map((d) => (
            <div key={d.dayOfWeek} className="grid grid-cols-[3.2rem_1fr_auto] sm:grid-cols-[4rem_1fr_17rem] items-center gap-3 text-sm">
              <span className="font-medium text-ink">{weekdayAbbr(d.dayOfWeek, locale)}</span>
              <div className="relative h-3 rounded-full bg-surface-sunken" title={d.rate !== null ? `${pct(d.rate)} · ${d.confirmed}/${d.base}` : undefined}>
                {d.rate !== null && <div className={`h-3 rounded-full ${d.tier === "weaker" ? "bg-warning-fill" : "bg-brand-fill"}`} style={{ width: `${Math.max(2, d.rate * 100)}%` }} />}
                {overall !== null && <div className="absolute top-[-3px] h-[18px] w-px bg-ink" style={{ left: `${overall * 100}%` }} aria-hidden="true" />}
              </div>
              <div className="flex items-center justify-end gap-2 text-xs">
                <span className="font-semibold text-ink tabular-nums">{pct(d.rate)}</span>
                <span className={TREND_TONE[d.trend]} title={t(`plan.trend.${d.trend}`)}>{TREND_GLYPH[d.trend]}</span>
                {d.tier !== "typical" && (
                  <span className={`hidden sm:inline whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIER_TONE[d.tier]}`}>{t(`plan.month.days.tier.${d.tier}`, { min: DAY_MIN_BASE })}</span>
                )}
                <span className="hidden sm:inline whitespace-nowrap text-ink-faint">{t("plan.month.days.dates", { n: d.occurrences })}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint mt-2">{t("plan.month.days.legend", { avg: pct(overall) })}</p>
      </div>

      {/* Horarios por día */}
      {m.times.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink">{t("plan.month.matrix.title")}</h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted my-2">
            {(["green", "amber", "red", "thin"] as CellBand[]).map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <i className={`inline-block h-3 w-3 rounded-full ${BAND_DOT[b]}`} />
                {t(`plan.month.matrix.legend.${b}`, { green: pct(GREEN_MIN_RATE), floor: pct(MUST_SCHEDULE_MIN_RATE), min: CELL_MIN_BASE })}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-1 min-w-full">
              <thead>
                <tr>
                  <th className="w-12" />
                  {m.times.map((tm) => <th key={tm} className="font-medium text-ink-muted px-1 pb-1 text-center whitespace-nowrap">{tm}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.weekdays.map((d) => (
                  <tr key={d.dayOfWeek}>
                    <th className="text-left font-medium text-ink pr-2 whitespace-nowrap">{weekdayAbbr(d.dayOfWeek, locale)}</th>
                    {m.times.map((tm) => {
                      const c = m.cells.find((x) => x.dayOfWeek === d.dayOfWeek && x.time === tm);
                      if (!c || (c.base === 0 && c.fieldLost === 0)) return <td key={tm} className="text-center text-ink-faint">·</td>;
                      return (
                        <td key={tm} className={`rounded-md text-center px-1.5 py-1 min-w-[3.2rem] ${BAND_TONE[c.band]}`}
                          title={`${weekdayLabel(d.dayOfWeek, locale)} ${tm} · ${pct(c.rate)} · ${c.confirmed}/${c.base}${c.fieldLost ? ` · ${t("plan.month.matrix.fieldLost", { n: c.fieldLost })}` : ""}`}>
                          <div className="font-semibold tabular-nums">{c.base > 0 ? pct(c.rate) : "—"}{c.trend === "down" && c.band !== "thin" ? <span className="text-danger"> ▼</span> : null}</div>
                          <div className="text-[9px] opacity-70">n={c.base}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-faint mt-1">{t("plan.month.matrix.note")}</p>
        </div>
      )}

      {/* Fáciles de confirmar / riesgo según el día */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-medium text-ink mb-2">{t("plan.month.easy.title")}</h4>
          {m.easyTimes.length === 0 ? (
            <p className="text-sm text-ink-faint">{t("plan.month.easy.empty", { green: pct(GREEN_MIN_RATE) })}</p>
          ) : (
            <ul className="space-y-1.5">
              {m.easyTimes.map((e) => (
                <li key={e.time} className="flex items-baseline justify-between gap-3 text-sm">
                  <span><span className="font-display font-bold text-ink">{e.time}</span> <span className="text-ink-muted">· {e.days.map((d) => weekdayAbbr(d, locale)).join(", ")}</span></span>
                  <span className="text-xs text-brand font-semibold tabular-nums shrink-0">{pct(e.rate)} <span className="text-ink-faint font-normal">· n={e.base}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-sm font-medium text-ink mb-2">{t("plan.month.risk.title")}</h4>
          {m.riskByDay.length === 0 ? (
            <p className="text-sm text-ink-faint">{t("plan.month.risk.empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {m.riskByDay.map((r) => (
                <li key={r.dayOfWeek} className="text-sm">
                  <span className="font-medium text-ink">{weekdayLabel(r.dayOfWeek, locale)}</span>
                  <span className="text-ink-muted"> · </span>
                  {r.cells.map((c, i) => (
                    <span key={c.time} className="text-ink-muted">
                      {i > 0 && ", "}
                      <span className={`font-semibold ${c.band === "red" ? "text-danger" : "text-warning"}`}>{c.time}</span> <span className="text-xs tabular-nums">{pct(c.rate)}</span>{c.trend === "down" && <span className="text-danger text-[10px]"> ▼</span>}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-ink-faint mt-2">{t("plan.month.risk.note", { floor: pct(MUST_SCHEDULE_MIN_RATE), green: pct(GREEN_MIN_RATE) })}</p>
        </div>
      </div>

      {/* Contexto para una expectativa correcta */}
      <div className="rounded-xl bg-surface-sunken p-4 space-y-2">
        <h4 className="text-sm font-medium text-ink">{t("plan.month.context.title")}</h4>
        {season && season.items.length > 0 ? (
          <ul className="space-y-1 text-sm text-ink-muted">
            {season.items.map((s) => (
              <li key={s.month}>
                <span className="font-medium text-ink capitalize">{monthName(s.month, locale)}</span>
                {": "}
                {s.index !== null && s.level
                  ? t("plan.month.context.level", { level: t(`plan.month.context.levels.${s.level}`), index: s.index.toFixed(2), provisional: season.provisional ? t("plan.month.context.provisional") : "" })
                  : t("plan.month.context.noIndex")}
                {s.unavailRate !== null && (
                  <> {t("plan.month.context.unavail", { rate: pct(s.unavailRate), trend: s.unavailTrendPp === null ? "" : t(s.unavailTrendPp > 0 ? "plan.month.context.unavailUp" : "plan.month.context.unavailDown", { pp: Math.abs(s.unavailTrendPp * 100).toFixed(0) }) })}</>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{t("plan.month.context.noHistory", { n: season?.completeMonths ?? 0 })}</p>
        )}
        <p className="text-[11px] text-ink-faint">{t("plan.month.context.note")}</p>
      </div>

      {plan.truncated && <p className="text-xs text-warning">{t("plan.truncated")}</p>}
    </section>
  );
}
