import Link from "next/link";
import { weekdayAbbr, weekdayLabel } from "../lib/db/weekday";
import type { FacilityPlan } from "../lib/db/facilityPlan";
import {
  GREEN_MIN_RATE, TREND_DELTA, RECENT_EDITIONS, FOLLOW_RECENT_DAYS, PLAN_FILTERS,
  type ClassifiedSlot, type Light, type PlanFilter,
} from "../lib/slotPlanCalc";
import { RESERVE_MIN_RATE } from "../lib/reserveAdvice";
import { MUST_SCHEDULE_MIN_RATE, MUST_SCHEDULE_MIN_SAMPLE, MUST_SCHEDULE_WINDOW_MONTHS } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";
import Glossary from "./Glossary";

// "Próximos 7 días" de Pronóstico cuando hay un facility elegido: un calendario semanal clásico
// (una columna por fecha, un renglón compacto por slot) con el semáforo por tasa de demanda. El
// detalle completo de cada slot (las tarjetas de siempre) queda un clic más abajo. Las
// definiciones viven en app/lib/slotPlanCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;

const DOT: Record<Light, string> = { green: "bg-accent", amber: "bg-warning-fill", red: "bg-danger", gray: "bg-ink-faint" };
const TEXT: Record<Light, string> = { green: "text-brand", amber: "text-warning", red: "text-danger", gray: "text-ink-muted" };
const TINT: Record<Light, string> = { green: "bg-brand-soft/60", amber: "bg-warning-soft", red: "bg-danger-soft", gray: "bg-surface" };
const BAR: Record<Light, string> = { green: "border-accent", amber: "border-warning", red: "border-danger", gray: "border-ink-faint" };
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
          <span className={`rounded-full text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 ${c.reserve?.level === "strong" ? "bg-ink text-white" : "border border-ink text-ink"}`} title={t("plan.secure.desc", { days: FOLLOW_RECENT_DAYS, rate: pct(RESERVE_MIN_RATE) })}>
            {t(c.reserve?.level === "strong" ? "plan.secure.badge" : "plan.secure.badgeTest")}
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

        {c.secure && c.reserve && (
          <>
            <p className="text-ink">
              {t("plan.card.followLost", { n: c.fieldLost.length })}{" "}
              {t(c.reserve.level === "strong" ? "plan.card.reserveStrong" : "plan.card.reserveTest", {
                players: c.reserve.playersAtLoss, usual: c.reserve.baseline.toFixed(1), rate: pct(c.rate),
              })}
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

// Renglón compacto del calendario: hora, tasa de demanda con su tendencia, cancha y formato. El
// semáforo va en la barra lateral, el puntito y el texto oculto (nunca solo color); el detalle
// completo está en el tooltip y en las tarjetas de más abajo.
function Chip({ c, t }: { c: ClassifiedSlot; t: T }) {
  const detail = [
    `${c.time} · ${c.fieldName ?? t("plan.card.fieldUnknown")} · ${c.gameSize ?? "—"}`,
    `${t(`plan.lights.${c.light}.label`)} · ${t("plan.card.demandRate")} ${pct(c.rate)} (${c.confirmed}/${c.base})`,
    c.secure ? t(c.reserve?.level === "strong" ? "plan.secure.badge" : "plan.secure.badgeTest") : "",
  ].filter(Boolean).join("\n");
  return (
    <div className={`rounded-lg border-l-[3px] px-2 py-1.5 ${TINT[c.light]} ${BAR[c.light]}`} title={detail}>
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 font-display text-sm font-bold text-ink leading-none">
          <i className={`inline-block h-2 w-2 rounded-full ${DOT[c.light]}`} aria-hidden="true" />
          {c.time}
          <span className="sr-only">{t(`plan.lights.${c.light}.label`)}</span>
        </span>
        <span className={`text-xs font-semibold tabular-nums ${TEXT[c.light]}`}>
          {pct(c.rate)}
          <span className={`ml-0.5 text-[9px] ${TREND_TONE[c.trend]}`} title={t(`plan.trend.${c.trend}`)}>{TREND_GLYPH[c.trend]}</span>
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-ink-muted">
        <span className="truncate">{c.fieldName ?? "—"}</span>
        <span className="shrink-0">{c.gameSize ?? ""}</span>
      </div>
      {c.secure && (
        <span className={`mt-1 inline-block rounded-full text-[9px] font-bold uppercase tracking-wide px-1.5 py-px ${c.reserve?.level === "strong" ? "bg-ink text-white" : "border border-ink text-ink"}`}>{t(c.reserve?.level === "strong" ? "plan.secure.badge" : "plan.secure.badgeTest")}</span>
      )}
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
          <Link key={f} href={hrefFor(f)} title={f === "secure" ? t("plan.secure.desc", { days: FOLLOW_RECENT_DAYS, rate: pct(RESERVE_MIN_RATE) }) : t(`plan.lights.${f}.desc`, { green: pct(GREEN_MIN_RATE), floor: pct(MUST_SCHEDULE_MIN_RATE) })}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"}`}>
            {f !== "secure" && <i className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[f]}`} aria-hidden="true" />}
            {f === "secure" ? t("plan.secure.label") : t(`plan.lights.${f}.label`)} · {count(f)}
          </Link>
        ))}
      </div>

      {total === 0 ? (
        <div className="text-sm text-ink-faint py-6 text-center">{t("plan.week.empty")}</div>
      ) : (
        <>
          {/* Calendario: una columna por fecha; en pantallas angostas se desliza horizontalmente. */}
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="grid grid-cols-7 gap-2 min-w-[980px]">
              {days.map((d, i) => (
                <div key={d.dateISO} id={`d-${d.dateISO}`} className="flex flex-col gap-1.5 scroll-mt-20">
                  <div className={`rounded-lg px-2 py-1.5 text-center ${i === 0 ? "bg-brand text-white" : "bg-surface-sunken text-ink"}`}>
                    <div className="text-xs font-semibold capitalize">{weekdayAbbr(d.dayOfWeek, locale)}{i === 0 ? ` · ${t("plan.week.today")}` : ""}</div>
                    <div className={`text-[10px] ${i === 0 ? "text-white/80" : "text-ink-faint"}`}>{shortDate(d.dateISO, locale)}</div>
                  </div>
                  {d.shown.length === 0 ? (
                    <div className="text-center text-xs text-ink-faint py-2">—</div>
                  ) : (
                    d.shown.map((c) => <Chip key={`${d.dateISO}|${c.key}`} c={c} t={t} />)
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detalle: las tarjetas completas de cada slot, plegadas para no ensuciar el calendario. */}
          <details className="group rounded-xl bg-surface-sunken px-4 py-3">
            <summary className="cursor-pointer select-none text-sm font-medium text-ink">{t("plan.week.detailToggle")}</summary>
            <div className="mt-4 space-y-5">
              {days.filter((d) => d.shown.length > 0).map((d) => (
                <div key={d.dateISO}>
                  <h4 className="font-display text-base font-bold text-ink mb-2 capitalize">
                    {dayLabel(d.dateISO, d.dayOfWeek)} <span className="text-xs font-normal text-ink-faint">· {d.shown.length}</span>
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {d.shown.map((c) => <Card key={`${d.dateISO}|${c.key}`} c={c} t={t} locale={locale} />)}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {plan.thinCount > 0 && <p className="text-xs text-ink-faint">{t("plan.week.thin", { n: plan.thinCount, min: MUST_SCHEDULE_MIN_SAMPLE })}</p>}
      {plan.truncated && <p className="text-xs text-warning">{t("plan.truncated")}</p>}
      <Glossary items={[
        {
          term: t("plan.week.glossTerm"),
          def: t("plan.week.definition", {
            green: pct(GREEN_MIN_RATE), floor: pct(MUST_SCHEDULE_MIN_RATE), sample: MUST_SCHEDULE_MIN_SAMPLE, days: FOLLOW_RECENT_DAYS, last: RECENT_EDITIONS, delta: Math.round(TREND_DELTA * 100),
          }),
        },
        { term: t("plan.week.limitTerm"), def: t("plan.week.limit") },
      ]} />
    </section>
  );
}
