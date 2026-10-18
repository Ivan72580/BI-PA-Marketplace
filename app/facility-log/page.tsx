import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { getFilterOptions } from "../lib/db/queries";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { hasLevel } from "../lib/module";
import { getFacilityLogEntries, getFacilityLogSummaryRows, getRecentLogTopics, getWeeklyNotesForFacility } from "../lib/db/facilityLog";
import { LOG_KINDS, summarizeLog, type LogKind } from "../lib/facilityLog";
import { addDaysISO, formatDay } from "../lib/weeklyLog";
import { todayISO } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import PageHeader from "../components/PageHeader";
import FacilityLogBoard from "./FacilityLogBoard";

type SP = { regionId?: string; marketId?: string; facilityId?: string; kind?: string; limit?: string };

const PAGE_SIZE = 30;
const MAX_LIMIT = 300;

function href(sp: SP, overrides: Partial<SP>) {
  const merged = { ...sp, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/facility-log?${qs}` : "/facility-log";
}

// Bitácora de Facilities: lo que el equipo registra sobre la relación con cada facility. Todo el módulo Equipo
// (y quien tenga Ejecutivo además de Equipo) ve lo mismo: aportes, totales y, en Fase 2, el estado calculado.
// Con una facility elegida funciona como su ficha: totales, línea de tiempo y notas del Registro semanal.
export default async function FacilityLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayISO();
  const kind = LOG_KINDS.includes(sp.kind as LogKind) ? (sp.kind as LogKind) : undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, Number(sp.limit) || PAGE_SIZE));
  const scope = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId };

  const [t, rawLocale, current, filterOptions] = await Promise.all([
    getTranslations("FacilityLog"),
    getLocale(),
    getCurrentUserWithAccess(),
    getFilterOptions(),
  ]);
  const locale = rawLocale as Locale;
  const user = current?.user ?? null;
  const canEdit = hasLevel(current?.access.TEAM, "EDIT");

  const [{ rows, hasMore }, summaryRows, topics, weeklyNotes] = await Promise.all([
    getFacilityLogEntries(scope, { kind, limit, meId: user?.id ?? null }),
    getFacilityLogSummaryRows(scope),
    getRecentLogTopics(),
    sp.facilityId ? getWeeklyNotesForFacility(sp.facilityId, addDaysISO(today, -90)) : Promise.resolve([]),
  ]);
  const summary = summarizeLog(summaryRows, today);

  const regionName = sp.regionId ? filterOptions.regions.find((r) => r.id === sp.regionId)?.name : undefined;
  const marketName = sp.marketId ? filterOptions.markets.find((m) => m.id === sp.marketId)?.name : undefined;
  const facilityName = sp.facilityId ? filterOptions.facilities.find((f) => f.id === sp.facilityId)?.name : undefined;
  const marketNameById = new Map(filterOptions.markets.map((m) => [m.id, m.name]));
  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);

  const facilities = [...filterOptions.facilities]
    .map((f) => ({ id: f.id, name: f.name, market: marketNameById.get(f.marketId) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.market.localeCompare(b.market));

  const stat = (label: string, value: string) => (
    <div className="rounded-2xl bg-surface shadow-sm px-4 py-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold text-ink">{value}</div>
    </div>
  );

  const emptyMessage = kind ? t("list.emptyFiltered") : sp.facilityId ? t("list.emptyFacility") : t("list.empty");

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader
        scope={facilityName ?? marketName ?? regionName}
        title={t("title")}
        subtitle={t("subtitle")}
        filter={
          <FilterPanel
            regions={filterOptions.regions}
            markets={filterOptions.markets}
            facilities={filterOptions.facilities}
            showTimeControls={false}
            hasFilter={hasFilter}
            clearHref="/facility-log"
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(t("stats.entries"), summary.total.toLocaleString("en-US"))}
        {stat(t("stats.people"), String(summary.contributors))}
        {stat(t("stats.recent"), t("stats.recentValue", { neg: summary.recentNegative, pos: summary.recentPositive }))}
        {stat(t("stats.last"), summary.lastDate ? formatDay(summary.lastDate, locale, { day: "numeric", month: "short", year: "numeric" }) : t("stats.none"))}
      </div>

      <div className="inline-flex gap-0.5 rounded-full bg-surface-panel p-1 text-sm">
        {([undefined, ...LOG_KINDS] as (LogKind | undefined)[]).map((k) => (
          <Link
            key={k ?? "all"}
            href={href(sp, { kind: k, limit: undefined })}
            className={`rounded-full px-4 py-1.5 transition-colors ${kind === k ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted font-medium hover:text-ink"}`}
          >
            {t(k ? `kindFilter.${k}` : "kindFilter.all")}
          </Link>
        ))}
      </div>

      {!user ? (
        <p className="rounded-2xl bg-surface shadow-sm p-5 text-sm text-ink-muted">{t("noUser")}</p>
      ) : (
        <FacilityLogBoard
          rows={rows}
          me={{ id: user.id, isAdmin: user.role === "ADMIN", canEdit }}
          facilities={facilities}
          topics={topics}
          defaultFacilityId={sp.facilityId ?? ""}
          today={today}
          emptyMessage={emptyMessage}
        />
      )}

      {hasMore && (
        <div>
          <Link href={href(sp, { limit: String(Math.min(MAX_LIMIT, limit + PAGE_SIZE)) })} scroll={false} className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm hover:shadow-md transition-shadow">
            {t("actions.loadMore")}
          </Link>
        </div>
      )}

      {sp.facilityId && (
        <section>
          <div className="mb-3 border-b border-border pb-2.5">
            <h2 className="font-display text-sm font-semibold text-ink">{t("weekly.title")}</h2>
            <p className="text-xs text-ink-faint">{t("weekly.subtitle")}</p>
          </div>
          {weeklyNotes.length === 0 ? (
            <p className="rounded-2xl bg-surface-sunken p-5 text-sm text-ink-muted">{t("weekly.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {weeklyNotes.map((n) => (
                <li key={n.id} className="rounded-2xl bg-surface shadow-sm px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                    <span>{formatDay(n.date, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span aria-hidden="true">·</span>
                    <span>{n.authorName}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
