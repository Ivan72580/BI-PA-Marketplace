import Link from "next/link";
import { weekdayAbbr, weekdayLabel } from "../lib/db/weekday";
import type { FacilityPlan } from "../lib/db/facilityPlan";
import {
  REVIEW_MIN_RATE, TREND_DELTA, UNSTABLE_LOOKBACK, UNSTABLE_MIN_CANCELLED, FOLLOW_RECENT_DAYS,
  type ClassifiedSlot, type SlotGroup,
} from "../lib/slotPlanCalc";
import { MUST_SCHEDULE_MIN_RATE, MUST_SCHEDULE_MIN_SAMPLE, MUST_SCHEDULE_WINDOW_MONTHS } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";

// "Próximos 7 días" de Pronóstico cuando hay un facility elegido: un calendario con una tarjeta
// por slot (mismo lenguaje visual que "A agendar" de Inventario), en tres grupos. Las
// definiciones viven en app/lib/slotPlanCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;

const GROUPS: SlotGroup[] = ["consistent", "review", "follow"];
const GROUP_TONE: Record<SlotGroup, string> = {
  consistent: "bg-brand-soft text-brand",
  review: "bg-warning-soft text-warning",
  follow: "bg-surface-sunken text-ink border border-border-strong",
};
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
  const values = { price: usd(n.slot), avg: usd(n.facilityAvg), pct: `${Math.abs(n.pct * 100).toFixed(0)}%`, format: c.gameSize ?? "—" };
  return <>{t(`plan.card.price.${n.kind}`, values)}</>;
}

function Card({ c, t, locale }: { c: ClassifiedSlot; t: T; locale: Locale }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold text-ink leading-tight">{c.time}</div>
          <div className={`text-xs truncate ${c.fieldName ? "text-ink-muted" : "text-warning"}`}>{c.fieldName ?? t("plan.card.fieldUnknown")}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${GROUP_TONE[c.group]}`}>{t(`plan.groups.${c.group}.badge`)}</span>
          <span className="text-[11px] font-semibold text-ink-muted bg-surface-sunken rounded-md px-1.5 py-0.5">{c.gameSize ?? "—"}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-base font-bold text-brand">
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

      <div className="text-[11px] text-ink-muted leading-snug border-t border-surface-sunken pt-2 space-y-1">
        {c.group === "consistent" && <p>{t("plan.card.consistent", { confirmed: c.confirmed, base: c.base })}</p>}

        {c.group === "review" && (
          <>
            {c.trend === "down" && c.earlyRate !== null && c.lateRate !== null && (
              <p className="text-warning">{t("plan.card.trendDown", { early: pct(c.earlyRate), late: pct(c.lateRate) })}</p>
            )}
            {c.unstable && <p className="text-warning">{t("plan.card.unstable", { n: c.recentCancelled, last: UNSTABLE_LOOKBACK })}</p>}
            <p><PriceLine c={c} t={t} /></p>
          </>
        )}

        {c.group === "follow" && (
          <>
            <p>
              {t("plan.card.followLost", { n: c.fieldLost.length })}{" "}
              {c.base >= MUST_SCHEDULE_MIN_SAMPLE
                ? t("plan.card.followHealthy", { rate: pct(c.rate), base: c.base })
                : t("plan.card.followWeak", { base: c.base })}
            </p>
            <p className="text-ink-faint">
              {t("plan.card.followRefs")}{" "}
              {c.fieldLost.map((f) => (
                <span key={f.date} title={f.reason ?? t("plan.card.noReason")} className="inline-block mr-1 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">{shortDate(f.date, locale)}</span>
              ))}
            </p>
          </>
        )}

        {!c.fieldName && <p className="text-warning">{t("plan.card.unknownFieldNote")}</p>}
      </div>
    </div>
  );
}

export default function FacilityWeekPlan({
  plan, t, locale, group, hrefFor,
}: {
  plan: FacilityPlan;
  t: T;
  locale: Locale;
  group?: SlotGroup;
  hrefFor: (g: SlotGroup | undefined) => string;
}) {
  const counts = Object.fromEntries(GROUPS.map((g) => [g, plan.slots.filter((s) => s.group === g).length])) as Record<SlotGroup, number>;
  const total = plan.slots.length;
  const days = plan.week.map((d) => ({ ...d, shown: d.slots.filter((s) => !group || s.group === group) }));
  const dayCount = (d: (typeof days)[number], g: SlotGroup) => d.slots.filter((s) => s.group === g).length;
  const dayLabel = (iso: string, dow: string) => `${weekdayLabel(dow, locale)} ${shortDate(iso, locale)}`;

  return (
    <section className="rounded-2xl bg-surface shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("plan.week.title")}</h3>
        <p className="text-xs text-ink-faint mt-0.5 max-w-3xl">
          {t("plan.week.subtitle", { months: MUST_SCHEDULE_WINDOW_MONTHS, from: shortDate(plan.windowFrom, locale), to: shortDate(plan.windowTo, locale) })}
        </p>
      </div>

      {/* Filtro por grupo: el número es la cantidad de slots semanales del facility en ese grupo. */}
      <div className="flex flex-wrap gap-2">
        <Link href={hrefFor(undefined)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${!group ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"}`}>
          {t("plan.groups.all")} · {total}
        </Link>
        {GROUPS.map((g) => (
          <Link key={g} href={hrefFor(g)} title={t(`plan.groups.${g}.desc`, { rate: `${Math.round(REVIEW_MIN_RATE * 100)}%` })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${group === g ? "bg-brand text-white" : "bg-surface-sunken text-ink-muted hover:bg-brand-soft"}`}>
            {t(`plan.groups.${g}.label`)} · {counts[g]}
          </Link>
        ))}
      </div>

      {/* Tira de la semana: un vistazo de cuántos slots de cada grupo toca cada fecha. */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {days.map((d) => (
          <a key={d.dateISO} href={`#d-${d.dateISO}`} className="rounded-xl bg-surface-sunken hover:bg-brand-soft transition-colors px-2.5 py-2 text-center">
            <div className="text-xs font-semibold text-ink">{weekdayAbbr(d.dayOfWeek, locale)}</div>
            <div className="text-[10px] text-ink-faint mb-1">{shortDate(d.dateISO, locale)}</div>
            <div className="flex justify-center gap-1.5 text-[11px] font-semibold">
              <span className="text-brand" title={t("plan.groups.consistent.label")}>{dayCount(d, "consistent")}</span>
              <span className="text-warning" title={t("plan.groups.review.label")}>{dayCount(d, "review")}</span>
              <span className="text-ink-muted" title={t("plan.groups.follow.label")}>{dayCount(d, "follow")}</span>
            </div>
          </a>
        ))}
      </div>
      <p className="text-[10px] text-ink-faint -mt-2">{t("plan.week.stripLegend")}</p>

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

      {plan.gapCount > 0 && (
        <p className="text-xs text-warning">{t("plan.week.gap", { n: plan.gapCount, min: pct(MUST_SCHEDULE_MIN_RATE), reviewRate: pct(REVIEW_MIN_RATE) })}</p>
      )}
      {plan.truncated && <p className="text-xs text-warning">{t("plan.truncated")}</p>}
      <p className="text-xs text-ink-faint max-w-3xl">
        {t("plan.week.definition", {
          min: pct(MUST_SCHEDULE_MIN_RATE), sample: MUST_SCHEDULE_MIN_SAMPLE, reviewRate: pct(REVIEW_MIN_RATE),
          delta: Math.round(TREND_DELTA * 100), cancelled: UNSTABLE_MIN_CANCELLED, last: UNSTABLE_LOOKBACK, days: FOLLOW_RECENT_DAYS,
        })}
      </p>
      <p className="text-xs text-ink-faint max-w-3xl">{t("plan.week.limit")}</p>
    </section>
  );
}
