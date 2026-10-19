import Link from "next/link";
import { weekdayPlural } from "../lib/db/weekday";
import { DAY_ORDER } from "../lib/db/shared";
import { SECURE_MIN_RATE, SECURE_MIN_WEEKS, RECENT_CANCEL_DAYS, RECENT_CANCEL_MIN, type ScheduleBoard as Board, type ScheduleCard, type ScheduleFocus } from "../lib/db/mustScheduleBoard";
import { MUST_SCHEDULE_MIN_RATE, MUST_SCHEDULE_MIN_SAMPLE, MUST_SCHEDULE_WINDOW_MONTHS } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";

// Vista "A agendar" de Inventario: tarjetas de slots que, según los últimos 3 meses, conviene
// tener publicados sí o sí (definición única en app/lib/mustSchedule.ts), como una agenda:
// secciones por día y, dentro de cada día, franjas por hora de inicio (la franja de las 17 junta
// los partidos que arrancan entre 17:00 y 17:59).

type T = (key: string, values?: Record<string, string | number>) => string;
export type ScheduleOrder = "time" | "rateDesc" | "rateAsc";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const TREND_GLYPH = { up: "▲", down: "▼", flat: "▬" } as const;
const TREND_TONE = { up: "text-brand", down: "text-danger", flat: "text-ink-faint" } as const;

// Orden "día operativo": empieza a las 6 AM y da la vuelta por la madrugada (igual que el resto de la app).
const hourOf = (time: string) => parseInt(time, 10) || 0;
const opKey = (h: number) => (h - 6 + 24) % 24;
const minutesOf = (time: string) => (parseInt(time.slice(3, 5), 10) || 0);

function Card({ c, t }: { c: ScheduleCard; t: T }) {
  const ring = c.focus === "avoid" ? "ring-1 ring-danger/40" : c.focus === "secure" ? "ring-1 ring-brand/40" : "";
  return (
    <div className={`rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-3 flex flex-col gap-1.5 ${ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/map/${c.facilityId}`} className="text-sm font-semibold text-ink hover:text-brand truncate block">{c.facilityName}</Link>
          <div className="text-[11px] text-ink-faint truncate">
            {c.marketName} · <span className={c.fieldName ? "" : "text-warning"}>{c.fieldName ?? t("fieldUnknown")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {c.focus && (
            <span className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 ${c.focus === "avoid" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}>
              {t(`schedule.focus.${c.focus}Tag`)}
            </span>
          )}
          <span className="text-[11px] font-semibold text-ink-muted bg-surface-sunken rounded-md px-1.5 py-0.5">{c.gameSize ?? "—"}</span>
        </div>
      </div>

      <div className="flex items-end gap-3">
        <span className="font-display text-lg font-bold text-ink leading-none">{c.time}</span>
        <div className="flex items-end gap-3 ml-auto text-right">
          <div>
            <div className={`text-base font-bold leading-none ${c.focus === "avoid" ? "text-danger" : "text-brand"}`}>
              {pct(c.demandRate)} <span className={`text-[10px] ${TREND_TONE[c.trend]}`} title={t(`schedule.trend.${c.trend}`)}>{TREND_GLYPH[c.trend]}</span>
            </div>
            <div className="text-[10px] text-ink-faint">{t("schedule.card.demandRate")}</div>
          </div>
          <div>
            <div className="text-sm font-bold text-ink leading-none">{pct(c.fillRate)}</div>
            <div className="text-[10px] text-ink-faint">{t("card.fill")}</div>
          </div>
          <div>
            <div className="text-sm font-bold text-ink leading-none">{usd(c.avgPrice)}</div>
            <div className="text-[10px] text-ink-faint">{t("schedule.card.price")}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1" aria-label={t("card.recent")}>
        {c.recent.map((o) => (
          <span key={o.date} title={`${o.date} · ${o.status === "CONFIRMED" ? t("legend.confirmed") : t("legend.cancelled")}`} className={`h-2 w-2 rounded-full ${o.status === "CONFIRMED" ? "bg-accent" : "bg-danger"}`} />
        ))}
        <span className="ml-auto text-[10px] text-ink-faint">{t("card.lastSeen", { date: c.lastDate })}</span>
      </div>

      <div className="text-[11px] text-ink-faint leading-snug border-t border-surface-sunken pt-1.5">
        {t("schedule.card.summary", { confirmed: c.confirmed, base: c.demandBase })} · {t("schedule.card.weeks", { n: c.weeks })}
        {c.avoidReason === "recentCancels" && <span className="block text-danger">{t("schedule.card.recentCancels", { n: c.recentCancelled, days: RECENT_CANCEL_DAYS })}</span>}
        {c.avoidReason === "lowRate" && <span className="block text-danger">{t("schedule.card.lowRate", { rate: `${Math.round(MUST_SCHEDULE_MIN_RATE * 100)}%` })}</span>}
        {c.fieldUnavailable > 0 && <span className="block text-warning">{t("schedule.card.fieldLost", { n: c.fieldUnavailable })}</span>}
        {!c.fieldName && <span className="block text-warning">{t("card.unknownFieldNote")}</span>}
      </div>
    </div>
  );
}

function sortCards(cards: ScheduleCard[], order: ScheduleOrder): ScheduleCard[] {
  const byTime = (a: ScheduleCard, b: ScheduleCard) => minutesOf(a.time) - minutesOf(b.time) || a.facilityName.localeCompare(b.facilityName);
  if (order === "rateDesc") return [...cards].sort((a, b) => b.demandRate - a.demandRate || byTime(a, b));
  if (order === "rateAsc") return [...cards].sort((a, b) => a.demandRate - b.demandRate || byTime(a, b));
  return [...cards].sort(byTime);
}

export default function ScheduleBoard({ board, t, locale, day, focus, order }: { board: Board | null; t: T; locale: Locale; day?: string; focus?: ScheduleFocus; order: ScheduleOrder }) {
  if (!board) {
    return <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted mt-4">{t("empty")}</div>;
  }
  // Sin foco: solo los que califican. Con foco: las marcadas (Evitar incluye slots que no califican).
  const visible = board.cards.filter((c) => (focus ? c.focus === focus : c.qualifies));
  const byDay = DAY_ORDER.filter((d) => !day || d === day)
    .map((d) => {
      const dayCards = visible.filter((c) => c.dayOfWeek === d);
      const hours = [...new Set(dayCards.map((c) => hourOf(c.time)))].sort((a, b) => opKey(a) - opKey(b));
      return { d, count: dayCards.length, bands: hours.map((h) => ({ h, cards: sortCards(dayCards.filter((c) => hourOf(c.time) === h), order) })) };
    })
    .filter((g) => g.count > 0);
  const shown = byDay.reduce((s, g) => s + g.count, 0);
  const total = focus === "secure" ? board.totalSecure : focus === "avoid" ? board.totalAvoid : board.totalQualifying;

  return (
    <div>
      <div className="text-xs text-ink-faint mt-3">
        {t("schedule.count", { shown, total, from: board.windowFrom, to: board.windowTo })}
      </div>

      {byDay.length === 0 ? (
        <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted mt-4">{t("schedule.empty")}</div>
      ) : (
        byDay.map((g) => (
          <section key={g.d} className="mt-6">
            <h2 className="font-display text-base font-bold text-ink mb-1 capitalize">
              {weekdayPlural(g.d, locale)} <span className="text-xs font-normal text-ink-faint">· {g.count}</span>
            </h2>
            {g.bands.map((b) => (
              <div key={b.h} className="grid grid-cols-[3.25rem_1fr] gap-x-3 py-2 border-t border-surface-sunken first:border-t-0">
                <div className="pt-1">
                  <div className="font-display text-sm font-bold text-ink">{String(b.h).padStart(2, "0")}:00</div>
                  <div className="text-[10px] text-ink-faint">{b.cards.length}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {b.cards.map((c) => <Card key={c.key} c={c} t={t} />)}
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      {board.truncated && <p className="mt-4 text-xs text-warning">{t("truncated")}</p>}
      <p className="mt-4 text-xs text-ink-faint max-w-3xl">
        {t("schedule.definition", {
          months: MUST_SCHEDULE_WINDOW_MONTHS,
          rate: `${Math.round(MUST_SCHEDULE_MIN_RATE * 100)}%`,
          sample: MUST_SCHEDULE_MIN_SAMPLE,
          week: board.weekKey,
        })}
      </p>
      <p className="mt-2 text-xs text-ink-faint max-w-3xl">{t("schedule.focusDefinition", {
        secureWeeks: SECURE_MIN_WEEKS,
        secureRate: `${Math.round(SECURE_MIN_RATE * 100)}%`,
        minRate: `${Math.round(MUST_SCHEDULE_MIN_RATE * 100)}%`,
        cancelMin: RECENT_CANCEL_MIN,
        cancelDays: RECENT_CANCEL_DAYS,
      })}</p>
      <p className="mt-2 text-xs text-ink-faint">{t("schedule.limit")}</p>
    </div>
  );
}
