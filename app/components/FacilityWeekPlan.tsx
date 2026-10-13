import Link from "next/link";
import { weekdayAbbr, weekdayLabel } from "../lib/db/weekday";
import type { FacilityPlan } from "../lib/db/facilityPlan";
import {
  GREEN_MIN_RATE, TREND_DELTA, RECENT_EDITIONS, FOLLOW_RECENT_DAYS, PLAN_FILTERS,
  type ClassifiedSlot, type Light, type PlanFilter,
} from "../lib/slotPlanCalc";
import { MUST_SCHEDULE_MIN_RATE, MUST_SCHEDULE_MIN_SAMPLE, MUST_SCHEDULE_WINDOW_MONTHS } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";

// "Próximos 7 días" de Pronóstico cuando hay un facility elegido: un calendario con una tarjeta
// por slot (mismo lenguaje visual que "A agendar" de Inventario) y un semáforo por tasa de
// demanda. Las definiciones viven en app/lib/slotPlanCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;

const LIGHTS: Light[] = ["green", "amber", "red"];
const DOT: Record<Light, string> = { green: "bg-accent", amber: "bg-warning", red: "bg-danger", gray: "bg-ink-faint" };
const TEXT: Record<Light, string> = { green: "text-brand", amber: "text-warning", red: "text-danger", gray: "text-ink-muted" };
const TINT: Record<Light, string> = { green: "bg-brand-soft/60", amber: "bg-warning-soft", red: "bg-danger-soft", gray: "bg-surface" };
const TREND_GLYPH = { up: "▲", down: "▼", flat: "▬" } as const;
const TREND_TONE = { up: "text-brand", down: "text-danger", flat: "text-ink-faint" } as const;

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

function shortDate(iso: string, locale: Locale) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function PriceLine({ c, t }: { c: ClassifiedSlot; t: T }) {
  const n = c.priceNote;
  if (!n) return <>{t("plan.card.priceUnknown")}</>;
  return <>{t(`plan.card.price.${n.kind}`, { price: usd(n.slot), avg: usd(n.facilityAvg), pct: `${Math.abs(n.pct * 100).toFixed(0)}%`, format: c.gameSize ?? "—" })}</>;
}

function Card({ c, t, locale }: { c: ClassifiedSlot; t: T; locale: Locale }) {
  const recentLow = c.light === "amber" && c.rate !== null && c.rate >= GREEN_MIN_RATE && c.lateRate !== null;
  return (
    <div className={`rounded-2xl shadow-sm hover:shadow-lg transition-shadow p-4 flex flex-col gap-2 ${TINT[c.light]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold text-ink leading-tight">{c.time}</div>
          <div className={`text-xs truncate ${c.fieldName ? "text-ink-muted" : "text-warning"}`}>{c.fieldName ?? t("plan.card.fieldUnknown")}</div>
        </div>
        <span className="text-[11px] font-semibold text-ink-muted bg-surface rounded-md px-1.5 py-0.5 shrink-0">{c.gameSize ?? "—"}</span>
      </div>

      {/* Semáforo: el color nunca va solo, siempre con su texto. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${TEXT[c.light]}`}>
          <i className={`inline-block h-3.5 w-3.5 rounded-full ${DOT[c.light]}`} aria-hidden="true" />
          {t(`plan.lights.${c.light}.short`)}
        </span>
        {c.secure && (
          <span className="rounded-full bg-ink text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5" title={t("plan.secure.desc", { days: FOLLOW_RECENT_DAYS })}>
            {t("plan.secure.badge")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className={`text-base font-bold ${TEXT[c.light]}`}>
            {pct(c.rate)} <span className={`text-[10px] ${TREND_TONE[c.trend]}`} title={t(`plan.trend.${c.trend}`)}>{TREND_GLYPH[c.trend]}</span>
          </div>
          <div className="text-[10px] text-ink-faint">{t("plan.card.demandRate")}</div>
        </div>
        <div>
          <div className="text-base font-bold text-ink">{pct(c.fillRate)}</div>
          <div className="text-[10px] text-ink-faint">{t("plan.card.fill")}</div>
        </div>
        <div>
          <div className="text-base font-bold text-ink">{usd(c.avgPrice)}</div>
          <div className="text-[10px] text-ink-faint">{t("plan.card.priceLabel")}</div>
        </div>
      </div>

      <div className="flex items-center gap-1" aria-label={t("plan.card.recent")}>
        {c.recent.map((o) => (
          <span key={o.date} title={`${o.date} · ${o.ok ? t("plan.card.confirmed") : t("plan.card.cancelled")}`} className={`h-2.5 w-2.5 rounded-full ${o.ok ? "bg-accent" : "bg-danger"}`} />
        ))}
        <span className="ml-auto text-[10px] text-ink-faint">{t("plan.card.lastSeen", { date: shortDate(c.lastDate, locale) })}</span>
      </div>

      <div className="text-[11px] text-ink-muted leading-snug border-t border-border pt-2 space-y-1">
        {c.light === "green" && <p>{t("plan.card.green", { confirmed: c.confirmed, base: c.base })}</p>}

        {c.light === "amber" && (
          <>
            <p>{t("plan.card.amber", { confirmed: c.confirmed, base: c.base, n: c.recentCancelled, last: c.recentEditions })}</p>
            {recentLow && <p className="text-warning">{t("plan.card.recentLow", { rate: pct(c.rate), late: pct(c.lateRate) })}</p>}
            {!recentLow && c.trend === "down" && c.earlyRate !== null && c.lateRate !== null && (
              <p className="text-warning">{t("plan.card.trendDown", { early: pct(c.earlyRate), late: pct(c.lateRate) })}</p>
            )}
            <p><PriceLine c={c} t={t} /></p>
          </>
        )}

        {c.light === "red" && (
          <>
            <p>{t("plan.card.red", { confirmed: c.confirmed, base: c.base })}</p>
            <p><PriceLine c={c} t={t} /></p>
          </>
        )}

        {c.light === "gray" && <p>{t("plan.card.gray", { base: c.base })}</p>}

        {c.secure && (
          <>
            <p className="text-ink">
              {t("plan.card.followLost", { n: c.fieldLost.length })}{" "}
              {c.light === "gray" ? t("plan.card.followWeak") : t("plan.card.followHealthy")}
            </p>
            <p className="text-ink-faint">
              {t("plan.card.followRefs")}{" "}
              {c.fieldLost.map((f) => (
                <span key={f.date} title={f.reason ?? t("plan.card.noReason")} className="inline-block mr-1 rounded bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted">{shortDate(f.date, locale)}</span>
              ))}
            </p>
          </>
        )}

        {!c.fieldName && <p className="text-warning">{t("plan.card.unknownFieldNote")}</p>}
      </div>
    </div>
  );
}

const matches = (s: ClassifiedSlot, f: PlanFilter | undefined) => !f || (f === "secure" ? s.secure : s.light === f);

export default function FacilityWeekPlan({
  plan, t, locale, filter, hrefFor,
}: {
  plan: FacilityPlan;
  t: T;
  locale: Locale;
  filter?: PlanFilter;
  hrefFor: (f: PlanFilter | undefined) => string;
}) {
  const total = plan.slots.length;
  const count = (f: PlanFilter) => plan.slots.filter((s) => matches(s, f)).length;
  const days = plan.week.map((d) => ({ ...d, shown: d.slots.filter((s) => matches(s, filter)) }));
  const dayLight = (d: (typeof days)[number], l: Light) => d.slots.filter((s) => s.light === l).length;
  const daySecure = (d: (typeof days)[number]) => d.slots.filter((s) => s.secure).length;
  const dayLabel = (iso: string, dow: string) => `${weekdayLabel(dow, locale)} ${shortDate(iso, locale)}`;

  return (
    <section className="rounded-2xl bg-surface shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("plan.week.title")}</h3>
        <p className="text-xs text-ink-faint mt-0.5 max-w-3xl">
          {t("plan.week.subtitle", { months: MUST_SCHEDULE_WINDOW_MONTHS, from: shortDate(plan.windowFrom, locale), to: shortDate(plan.windowTo, locale) })}
        </p>
      </div>

      {/* Leyenda y filtro del semáforo: el número es la cantidad de slots semanales del facility. */}
      <div className="flex flex-wrap gap-2">
        <Link href={hrefFor(undefined)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${!filter ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"}`}>
          {t("plan.filters.all")} · {total}
        </Link>
        {PLAN_FILTERS.map((f) => (
          <Link key={f} href={hrefFor(f)} title={f === "secure" ? t("plan.secure.desc", { days: FOLLOW_RECENT_DAYS }) : t(`plan.lights.${f}.desc`, { green: pct(GREEN_MIN_RATE), floor: pct(MUST_SCHEDULE_MIN_RATE) })}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"}`}>
            {f !== "secure" && <i className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[f]}`} aria-hidden="true" />}
            {f === "secure" ? t("plan.secure.label") : t(`plan.lights.${f}.label`)} · {count(f)}
          </Link>
        ))}
      </div>

      {/* Tira de la semana: cuántos slots de cada color toca cada fecha. */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {days.map((d) => (
          <a key={d.dateISO} href={`#d-${d.dateISO}`} className="rounded-xl bg-surface-sunken hover:bg-brand-soft transition-colors px-2.5 py-2 text-center">
            <div className="text-xs font-semibold text-ink">{weekdayAbbr(d.dayOfWeek, locale)}</div>
            <div className="text-[10px] text-ink-faint mb-1">{shortDate(d.dateISO, locale)}</div>
            <div className="flex justify-center gap-2 text-[11px] font-semibold text-ink">
              {LIGHTS.map((l) => (
                <span key={l} className="inline-flex items-center gap-0.5" title={t(`plan.lights.${l}.label`)}>
                  <i className={`inline-block h-2 w-2 rounded-full ${DOT[l]}`} aria-hidden="true" />{dayLight(d, l)}
                </span>
              ))}
            </div>
            {daySecure(d) > 0 && <div className="mt-1 text-[10px] font-bold text-ink">{t("plan.week.stripSecure", { n: daySecure(d) })}</div>}
          </a>
        ))}
      </div>

      {total === 0 ? (
        <div className="text-sm text-ink-faint py-6 text-center">{t("plan.week.empty")}</div>
      ) : (
        days.filter((d) => d.shown.length > 0).map((d) => (
          <div key={d.dateISO} id={`d-${d.dateISO}`} className="scroll-mt-20">
            <h4 className="font-display text-base font-bold text-ink mb-2 capitalize">
              {dayLabel(d.dateISO, d.dayOfWeek)} <span className="text-xs font-normal text-ink-faint">· {d.shown.length}</span>
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {d.shown.map((c) => <Card key={`${d.dateISO}|${c.key}`} c={c} t={t} locale={locale} />)}
            </div>
          </div>
        ))
      )}

      {plan.thinCount > 0 && <p className="text-xs text-ink-faint">{t("plan.week.thin", { n: plan.thinCount, min: MUST_SCHEDULE_MIN_SAMPLE })}</p>}
      {plan.truncated && <p className="text-xs text-warning">{t("plan.truncated")}</p>}
      <p className="text-xs text-ink-faint max-w-3xl">
        {t("plan.week.definition", {
          green: pct(GREEN_MIN_RATE), floor: pct(MUST_SCHEDULE_MIN_RATE), sample: MUST_SCHEDULE_MIN_SAMPLE, days: FOLLOW_RECENT_DAYS, last: RECENT_EDITIONS, delta: Math.round(TREND_DELTA * 100),
        })}
      </p>
      <p className="text-xs text-ink-faint max-w-3xl">{t("plan.week.limit")}</p>
    </section>
  );
}
