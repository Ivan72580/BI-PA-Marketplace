import Link from "next/link";
import { weekdayAbbr, weekdayPlural } from "../lib/db/weekday";
import { DAY_ORDER } from "../lib/db/shared";
import type { ScheduleBoard as Board, ScheduleCard } from "../lib/db/mustScheduleBoard";
import { MUST_SCHEDULE_MIN_RATE, MUST_SCHEDULE_MIN_SAMPLE, MUST_SCHEDULE_WINDOW_MONTHS } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";

// Vista "A agendar" de Inventario: tarjetas de slots que, según los últimos 3 meses, conviene
// tener publicados sí o sí (definición única en app/lib/mustSchedule.ts), agrupadas por día.

type T = (key: string, values?: Record<string, string | number>) => string;

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const TREND_GLYPH = { up: "▲", down: "▼", flat: "▬" } as const;
const TREND_TONE = { up: "text-brand", down: "text-danger", flat: "text-ink-faint" } as const;

function Card({ c, t, locale }: { c: ScheduleCard; t: T; locale: Locale }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/map/${c.facilityId}`} className="text-sm font-semibold text-ink hover:text-brand truncate block">{c.facilityName}</Link>
          <div className="text-[11px] text-ink-faint truncate">{c.marketName}</div>
        </div>
        <span className="text-[11px] font-semibold text-ink-muted bg-surface-sunken rounded-md px-1.5 py-0.5 shrink-0">{c.gameSize ?? "—"}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg font-bold text-ink">{weekdayAbbr(c.dayOfWeek, locale)} {c.time}</span>
        <span className={`text-xs ${c.fieldName ? "text-ink-muted" : "text-warning"}`}>{c.fieldName ?? t("fieldUnknown")}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-base font-bold text-brand">
            {pct(c.demandRate)} <span className={`text-[10px] ${TREND_TONE[c.trend]}`} title={t(`schedule.trend.${c.trend}`)}>{TREND_GLYPH[c.trend]}</span>
          </div>
          <div className="text-[10px] text-ink-faint">{t("schedule.card.demandRate")}</div>
        </div>
        <div>
          <div className="text-base font-bold text-ink">{pct(c.fillRate)}</div>
          <div className="text-[10px] text-ink-faint">{t("card.fill")}</div>
        </div>
        <div>
          <div className="text-base font-bold text-ink">{usd(c.avgPrice)}</div>
          <div className="text-[10px] text-ink-faint">{t("schedule.card.price")}</div>
        </div>
      </div>

      <div className="flex items-center gap-1" aria-label={t("card.recent")}>
        {c.recent.map((o) => (
          <span key={o.date} title={`${o.date} · ${o.status === "CONFIRMED" ? t("legend.confirmed") : t("legend.cancelled")}`} className={`h-2.5 w-2.5 rounded-full ${o.status === "CONFIRMED" ? "bg-accent" : "bg-danger"}`} />
        ))}
        <span className="ml-auto text-[10px] text-ink-faint">{t("card.lastSeen", { date: c.lastDate })}</span>
      </div>

      <div className="text-[11px] text-ink-faint leading-snug border-t border-surface-sunken pt-2">
        {t("schedule.card.summary", { confirmed: c.confirmed, base: c.demandBase })}
        {c.fieldUnavailable > 0 && <span className="block text-warning">{t("schedule.card.fieldLost", { n: c.fieldUnavailable })}</span>}
        {!c.fieldName && <span className="block text-warning">{t("card.unknownFieldNote")}</span>}
      </div>
    </div>
  );
}

export default function ScheduleBoard({ board, t, locale, day }: { board: Board | null; t: T; locale: Locale; day?: string }) {
  if (!board) {
    return <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted mt-4">{t("empty")}</div>;
  }
  const byDay = DAY_ORDER.map((d) => ({ d, cards: board.cards.filter((c) => c.dayOfWeek === d) })).filter((g) => g.cards.length > 0 && (!day || g.d === day));
  const shown = byDay.reduce((s, g) => s + g.cards.length, 0);

  return (
    <div>
      <div className="text-xs text-ink-faint mt-3">
        {t("schedule.count", { shown, total: board.totalQualifying, from: board.windowFrom, to: board.windowTo })}
      </div>

      {byDay.length === 0 ? (
        <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted mt-4">{t("schedule.empty")}</div>
      ) : (
        byDay.map((g) => (
          <section key={g.d} className="mt-5">
            <h2 className="font-display text-base font-bold text-ink mb-2 capitalize">
              {weekdayPlural(g.d, locale)} <span className="text-xs font-normal text-ink-faint">· {g.cards.length}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.cards.map((c) => <Card key={c.key} c={c} t={t} locale={locale} />)}
            </div>
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
      <p className="mt-2 text-xs text-ink-faint">{t("schedule.limit")}</p>
    </div>
  );
}
