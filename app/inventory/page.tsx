import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { getFilterOptions, resolveFilterNames } from "../lib/db/queries";
import { getSlotInventory, SLOT_SORTS, MIN_SLOT_SAMPLE, type Slot, type SlotSort } from "../lib/db/inventory";
import { DAY_ORDER } from "../lib/db/shared";
import { weekdayAbbr, weekdayPlural } from "../lib/db/weekday";
import { resolvePeriod, todayISO, type Granularity, type ResolvedPeriod } from "../lib/period";
import { type SP } from "../lib/searchParams";
import type { Locale } from "@/i18n/config";
import FilterPanel from "../components/FilterPanel";

type InvSP = SP & { sort?: string; day?: string; limit?: string };

const PAGE_SIZE = 36;
const MAX_LIMIT = 300;

function resolve(sp: SP, locale: Locale, customLabel: string): ResolvedPeriod {
  // Mismo criterio que Overview y Mapa: default = mes en curso.
  const granularity = (sp.granularity as Granularity) || "month";
  if (granularity === "custom") {
    if (sp.customFrom && sp.customTo) {
      return { dateFrom: new Date(`${sp.customFrom}T00:00:00Z`), dateTo: new Date(`${sp.customTo}T23:59:59Z`), label: `${sp.customFrom} → ${sp.customTo}`, priorLabel: null };
    }
    return { label: customLabel, priorLabel: null };
  }
  return resolvePeriod(granularity, sp.period || todayISO(), undefined, undefined, locale);
}

function href(sp: InvSP, overrides: Partial<InvSP>): string {
  const merged = { ...sp, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, String(v));
  const qs = params.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

function rateTone(s: Slot): string {
  if (s.lowSample || s.confirmationRate === null) return "text-ink-faint";
  if (s.confirmationRate >= 0.8) return "text-brand";
  if (s.confirmationRate >= 0.5) return "text-warning";
  return "text-danger";
}

type T = (key: string, values?: Record<string, string | number>) => string;

function SlotCard({ s, t, locale }: { s: Slot; t: T; locale: Locale }) {
  const field = s.fieldName ?? t("fieldUnknown");
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/map/${s.facilityId}`} className="text-sm font-semibold text-ink hover:text-brand truncate block">{s.facilityName}</Link>
          <div className="text-[11px] text-ink-faint truncate">{s.marketName}</div>
        </div>
        <span className="text-[11px] font-semibold text-ink-muted bg-surface-sunken rounded-md px-1.5 py-0.5 shrink-0">{s.gameSize ?? "—"}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg font-bold text-ink">{weekdayAbbr(s.dayOfWeek, locale)} {s.time}</span>
        <span className={`text-xs ${s.fieldKnown ? "text-ink-muted" : "text-warning"}`}>{field}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className={`text-base font-bold ${rateTone(s)}`}>{pct(s.confirmationRate)}</div>
          <div className="text-[10px] text-ink-faint">{t("card.confirmation")}</div>
        </div>
        <div>
          <div className="text-base font-bold text-ink">{pct(s.fillRate)}</div>
          <div className="text-[10px] text-ink-faint">{t("card.fill")}</div>
        </div>
        <div>
          <div className="text-base font-bold text-ink">{usd(s.revenue)}</div>
          <div className="text-[10px] text-ink-faint">{t("card.revenue")}</div>
        </div>
      </div>

      <div className="flex items-center gap-1" aria-label={t("card.recent")}>
        {s.recent.map((o) => (
          <span
            key={o.date}
            title={`${o.date} · ${o.status === "CONFIRMED" ? t("card.confirmedShort", { n: o.players }) : t("card.cancelledShort")}`}
            className={`h-2.5 w-2.5 rounded-full ${o.status === "CONFIRMED" ? "bg-accent" : "bg-danger"}`}
          />
        ))}
        <span className="ml-auto text-[10px] text-ink-faint">{t("card.lastSeen", { date: s.lastDate })}</span>
      </div>

      <div className="text-[11px] text-ink-faint leading-snug border-t border-surface-sunken pt-2">
        {t("card.summary", {
          scheduled: s.scheduled, confirmed: s.confirmed, cancelled: s.cancelled,
          players: s.avgPlayers === null ? "—" : s.avgPlayers.toFixed(1),
          capacity: s.capacity === null ? "—" : s.capacity.toFixed(0),
          price: usd(s.avgPrice),
        })}
        {s.lowSample && <span className="block text-warning">{t("card.lowSample", { min: MIN_SLOT_SAMPLE })}</span>}
        {!s.fieldKnown && <span className="block text-warning">{t("card.unknownFieldNote")}</span>}
      </div>
    </div>
  );
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InvSP> }) {
  const [sp, rawLocale, t] = await Promise.all([searchParams, getLocale(), getTranslations("Inventory")]);
  const locale = rawLocale as Locale;
  const period = resolve(sp, locale, t("customRangeLabel"));
  const sort: SlotSort = SLOT_SORTS.includes(sp.sort as SlotSort) ? (sp.sort as SlotSort) : "volume";
  const day = DAY_ORDER.includes(sp.day ?? "") ? sp.day : undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, Number(sp.limit) || PAGE_SIZE));
  const filters = { regionId: sp.regionId, marketId: sp.marketId, facilityId: sp.facilityId, dateFrom: period.dateFrom, dateTo: period.dateTo };

  const [names, filterOptions, inv] = await Promise.all([
    resolveFilterNames(sp),
    getFilterOptions(),
    getSlotInventory(filters, { sort, limit, dayOfWeek: day }),
  ]);
  const hasFilter = Boolean(sp.regionId || sp.marketId || sp.facilityId);
  const scope = names.facilityName ?? names.marketName ?? names.regionName ?? t("allNetwork");
  const t2 = t as unknown as T;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-3xl font-bold text-ink">{t("title")}</h1>
        <div className="text-sm text-ink-faint mt-1">{t("subtitle", { scope, period: period.label })}</div>
      </div>

      <FilterPanel
        regions={filterOptions.regions}
        markets={filterOptions.markets}
        facilities={filterOptions.facilities}
        hasFilter={hasFilter}
        clearHref="/inventory"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-ink-faint mr-1">{t("sortLabel")}</span>
          {SLOT_SORTS.map((s) => (
            <Link key={s} href={href(sp, { sort: s === "volume" ? undefined : s, limit: undefined })}
              className={`rounded-full px-2.5 py-1 ${sort === s ? "bg-brand text-white" : "bg-surface text-ink-muted hover:text-ink"}`}>
              {t(`sort.${s}`)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-ink-faint mr-1">{t("dayLabel")}</span>
          <Link href={href(sp, { day: undefined, limit: undefined })} className={`rounded-full px-2.5 py-1 ${!day ? "bg-brand text-white" : "bg-surface text-ink-muted hover:text-ink"}`}>{t("allDays")}</Link>
          {DAY_ORDER.map((d) => (
            <Link key={d} href={href(sp, { day: d, limit: undefined })} className={`rounded-full px-2.5 py-1 ${day === d ? "bg-brand text-white" : "bg-surface text-ink-muted hover:text-ink"}`}>{weekdayAbbr(d, locale)}</Link>
          ))}
        </div>
      </div>

      {inv.slots.length === 0 ? (
        <div className="rounded-2xl bg-surface shadow-sm p-8 text-center text-sm text-ink-muted mt-4">
          {sort === "rateAsc" || sort === "rateDesc" || sort === "fillAsc" ? t("emptyRated", { min: MIN_SLOT_SAMPLE }) : t("empty")}
        </div>
      ) : (
        <>
          <div className="text-xs text-ink-faint mt-3">
            {t("count", {
              shown: inv.slots.length, total: inv.totalSlots.toLocaleString("en-US"),
              games: inv.totalScheduled.toLocaleString("en-US"),
              day: day ? weekdayPlural(day, locale) : t("allDays").toLowerCase(),
            })}
          </div>
          <div className="grid gap-3 mt-3 sm:grid-cols-2 xl:grid-cols-3">
            {inv.slots.map((s) => <SlotCard key={s.key} s={s} t={t2} locale={locale} />)}
          </div>
          {inv.slots.length < inv.totalSlots && inv.slots.length < MAX_LIMIT && (
            <div className="text-center mt-4">
              <Link href={href(sp, { limit: String(limit + PAGE_SIZE) })} className="inline-block rounded-full bg-surface px-4 py-2 text-sm text-ink-muted hover:text-ink shadow-sm">{t("showMore")}</Link>
            </div>
          )}
        </>
      )}

      {inv.truncated && <p className="mt-4 text-xs text-warning">{t("truncated")}</p>}
      {inv.unknownFieldSlots > 0 && <p className="mt-2 text-xs text-ink-faint">{t("unknownFieldFootnote", { n: inv.unknownFieldSlots })}</p>}
      <p className="mt-2 text-xs text-ink-faint flex flex-wrap items-center gap-x-3">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-accent" aria-hidden="true" />{t("legend.confirmed")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-danger" aria-hidden="true" />{t("legend.cancelled")}</span>
      </p>
      <p className="mt-2 text-xs text-ink-faint">{t("definition")}</p>
    </div>
  );
}
