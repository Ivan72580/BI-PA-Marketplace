import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { getFilterOptions } from "../lib/db/queries";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { hasLevel } from "../lib/module";
import { getRecentWeeklyLogTopics, getWeeklyLogEntries } from "../lib/db/weeklyLog";
import { todayISO } from "../lib/period";
import { addDaysISO, defaultWeekAnchor, formatDay, isISODate, weekRange } from "../lib/weeklyLog";
import WeeklyLogBoard from "./WeeklyLogBoard";
import PageHeader from "../components/PageHeader";

// Registro semanal: notas sueltas del equipo durante la semana (lunes a
// domingo) y un reporte armado a partir de ellas. ?week=<cualquier día de la
// semana> navega; sin parámetro, la semana en curso (el lunes, la que acaba de terminar).
export default async function WeeklyLogPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const today = todayISO();
  const anchor = isISODate(sp.week) ? sp.week : defaultWeekAnchor(today);
  const range = weekRange(anchor);
  const isCurrentWeek = range.from === weekRange(today).from;

  const [t, rawLocale, current, entries, topics, filterOptions] = await Promise.all([
    getTranslations("WeeklyLog"),
    getLocale(),
    getCurrentUserWithAccess(),
    getWeeklyLogEntries(range),
    getRecentWeeklyLogTopics(addDaysISO(today, -84)),
    getFilterOptions(),
  ]);
  const locale = rawLocale as Locale;
  const user = current?.user ?? null;
  // VIEW: lee el registro; EDIT: además anota (ver app/lib/module.ts).
  const canEdit = hasLevel(current?.access.TEAM, "EDIT");

  const fmt = (iso: string) => formatDay(iso, locale, { weekday: "short", day: "numeric", month: "short" });
  const rangeLabel = t("range", { from: fmt(range.from), to: fmt(range.to) });
  const marketName = new Map(filterOptions.markets.map((m) => [m.id, m.name]));

  const navBtn = "rounded-full bg-surface px-3 py-1 text-sm text-ink shadow-sm hover:shadow-md transition-shadow";

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
        <nav className="flex items-center gap-2" aria-label={t("weekNav")}>
          <Link href={`/weekly-log?week=${addDaysISO(range.from, -7)}`} className={navBtn} aria-label={t("prevWeek")}>‹</Link>
          <span className="font-display text-base font-semibold text-ink px-1">{rangeLabel}</span>
          <Link href={`/weekly-log?week=${addDaysISO(range.from, 7)}`} className={navBtn} aria-label={t("nextWeek")}>›</Link>
          {!isCurrentWeek && (
            <Link href="/weekly-log" className={navBtn}>{t("thisWeek")}</Link>
          )}
        </nav>
        }
      />

      {!user ? (
        <p className="rounded-2xl bg-surface shadow-sm p-5 text-sm text-ink-muted">{t("noUser")}</p>
      ) : (
        <WeeklyLogBoard
          // key: al cambiar de semana se descarta el estado local (filtro,
          // edición abierta, reporte armado) de la semana anterior.
          key={range.from}
          range={range}
          rangeLabel={rangeLabel}
          today={today}
          isCurrentWeek={isCurrentWeek}
          entries={entries}
          me={{ id: user.id, isAdmin: user.role === "ADMIN", canEdit }}
          facilities={filterOptions.facilities.map((f) => ({ id: f.id, name: f.name, market: marketName.get(f.marketId) ?? "" }))}
          recentTopics={topics}
        />
      )}
    </div>
  );
}
