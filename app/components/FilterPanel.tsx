"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { resolvePeriod, shiftAnchor, todayISO, type Granularity } from "../lib/period";
import type { Locale } from "@/i18n/config";

type Option = { id: string; name: string; regionId?: string; marketId?: string };

// Los labels viven en messages/*.json (namespace FilterPanel.granularity,
// clave = value) — se traducen en el render vía t(`granularity.${value}`).
const GRANULARITY_VALUES: Granularity[] = ["month", "year", "semester", "quarter", "week", "day", "custom", "all"];

// input type="week" usa formato ISO 8601 ("2026-W35") — estas dos funciones
// convierten entre eso y nuestro anchor YYYY-MM-DD (lunes de esa semana).
function isoWeekValue(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayNr = (d.getUTCDay() + 6) % 7; // Lunes=0 .. Domingo=6
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(thursday.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const weekNumber = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${thursday.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function isoWeekToDate(isoWeek: string): string {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime());
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNr);
  const targetMonday = new Date(week1Monday.getTime());
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return targetMonday.toISOString().slice(0, 10);
}

export default function FilterPanel({
  regions,
  markets,
  facilities,
  showTimeControls = true,
  showFacility = true,
  hasFilter = false,
  clearHref,
  bare = false,
}: {
  regions: Option[];
  markets: Option[];
  facilities: Option[];
  showTimeControls?: boolean;
  showFacility?: boolean;
  hasFilter?: boolean;
  clearHref?: string;
  // Sin el chip "FILTRO", sin borde inferior ni margen — para cuando el
  // selector ya vive dentro de otro contenedor con su propio fondo/borde
  // (ej. el banner de selección de Trends) y no debe generar una caja
  // dentro de otra caja.
  bare?: boolean;
}) {
  const t = useTranslations("FilterPanel");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const regionId = searchParams.get("regionId") ?? "All";
  const marketId = searchParams.get("marketId") ?? "All";
  const facilityId = searchParams.get("facilityId") ?? "All";
  const granularity = (searchParams.get("granularity") as Granularity) || "month";
  const anchor = searchParams.get("period") || todayISO();
  const customFrom = searchParams.get("customFrom") ?? "";
  const customTo = searchParams.get("customTo") ?? "";

  const period = granularity !== "custom" && granularity !== "all" ? resolvePeriod(granularity, anchor, undefined, undefined, locale) : null;
  const prevAnchor = period ? shiftAnchor(granularity, anchor, -1) : anchor;
  const nextAnchor = period ? shiftAnchor(granularity, anchor, 1) : anchor;

  const filteredMarkets = regionId === "All" ? markets : markets.filter((m) => m.regionId === regionId);
  const marketIdsInRegion = new Set(filteredMarkets.map((m) => m.id));
  const filteredFacilities =
    marketId !== "All"
      ? facilities.filter((f) => f.marketId === marketId)
      : facilities.filter((f) => regionId === "All" || marketIdsInRegion.has(f.marketId ?? ""));

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "All" || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectClass =
    "rounded-md border border-border bg-surface/60 px-2 py-0.5 text-xs text-ink-muted cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand/30 hover:border-border-strong hover:text-ink transition-colors";

  return (
    <div className={bare ? "flex flex-wrap items-center gap-2" : "border-b border-border/70 px-1 py-1.5 mb-5 flex flex-wrap items-center gap-1.5"}>
      {!bare && <span className="text-[10px] text-ink-faint mr-0.5 uppercase tracking-wide">{t("filterLabel")}</span>}

      <select
        className={selectClass}
        value={regionId}
        onChange={(e) => update({ regionId: e.target.value, marketId: undefined, facilityId: undefined })}
      >
        <option value="All">{t("allRegions")}</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={marketId}
        onChange={(e) => update({ marketId: e.target.value, facilityId: undefined })}
      >
        <option value="All">{t("allMarkets")}</option>
        {filteredMarkets.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      {showFacility && (
        <select
          className={selectClass}
          value={facilityId}
          onChange={(e) => update({ facilityId: e.target.value })}
        >
          <option value="All">{t("allFacilities")}</option>
          {filteredFacilities.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}

      {showTimeControls && (
        <>
          <span className="w-px h-3.5 bg-border mx-0.5" />

          <select
            className={selectClass}
            value={granularity}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams.toString());
              const value = e.target.value as Granularity;
              if (value === "month") params.delete("granularity");
              else params.set("granularity", value);
              params.delete("period");
              params.delete("customFrom");
              params.delete("customTo");
              router.push(`${pathname}?${params.toString()}`, { scroll: false });
            }}
          >
            {GRANULARITY_VALUES.map((value) => (
              <option key={value} value={value}>{t(`granularity.${value}`)}</option>
            ))}
          </select>

          {granularity === "custom" && (
            <span className="flex items-center gap-1">
              <input type="date" value={customFrom} onChange={(e) => update({ customFrom: e.target.value })} className={selectClass} />
              <span className="text-[10px] text-ink-faint">{t("dateRangeTo")}</span>
              <input type="date" value={customTo} onChange={(e) => update({ customTo: e.target.value })} className={selectClass} />
            </span>
          )}

          {granularity !== "custom" && granularity !== "all" && period && (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => update({ period: prevAnchor })} className="text-ink-faint hover:text-brand text-sm px-0.5 leading-none">‹</button>
              {granularity === "month" && (
                <input type="month" value={anchor.slice(0, 7)} onChange={(e) => update({ period: `${e.target.value}-01` })} className={selectClass} />
              )}
              {granularity === "day" && (
                <input type="date" value={anchor} onChange={(e) => update({ period: e.target.value })} className={selectClass} />
              )}
              {granularity === "week" && (
                <input
                  type="week"
                  value={isoWeekValue(anchor)}
                  onChange={(e) => e.target.value && update({ period: isoWeekToDate(e.target.value) })}
                  className={selectClass}
                />
              )}
              {granularity !== "month" && granularity !== "day" && granularity !== "week" && (
                <span className="text-xs text-ink-muted min-w-[90px] text-center">{period.label}</span>
              )}
              <button type="button" onClick={() => update({ period: nextAnchor })} className="text-ink-faint hover:text-brand text-sm px-0.5 leading-none">›</button>
            </span>
          )}
        </>
      )}

      {hasFilter && clearHref && (
        <Link href={clearHref} className="text-[11px] text-ink-faint hover:text-brand ml-auto shrink-0">
          {t("clear")}
        </Link>
      )}
    </div>
  );
}
