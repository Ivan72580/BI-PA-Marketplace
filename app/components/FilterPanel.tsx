"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { resolvePeriod, shiftAnchor, todayISO, type Granularity } from "../lib/period";

type Option = { id: string; name: string; regionId?: string; marketId?: string };

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "month", label: "Por mes" },
  { value: "year", label: "Por año" },
  { value: "semester", label: "Por semestre" },
  { value: "quarter", label: "Por trimestre" },
  { value: "week", label: "Por semana" },
  { value: "day", label: "Por día" },
  { value: "custom", label: "Rango personalizado" },
  { value: "all", label: "Todo el histórico" },
];

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
}: {
  regions: Option[];
  markets: Option[];
  facilities: Option[];
  showTimeControls?: boolean;
  showFacility?: boolean;
  hasFilter?: boolean;
  clearHref?: string;
}) {
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

  const period = granularity !== "custom" && granularity !== "all" ? resolvePeriod(granularity, anchor) : null;
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
    router.push(`${pathname}?${params.toString()}`);
  }

  const selectClass =
    "rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <div className="rounded-xl bg-surface-panel border border-border px-5 py-4 mb-6 flex flex-wrap items-center gap-3">
      <span className="text-xs text-ink-muted mr-1">Filtrar por</span>

      <select
        className={selectClass}
        value={regionId}
        onChange={(e) => update({ regionId: e.target.value, marketId: undefined, facilityId: undefined })}
      >
        <option value="All">Todas las regiones</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={marketId}
        onChange={(e) => update({ marketId: e.target.value, facilityId: undefined })}
      >
        <option value="All">Todos los markets</option>
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
          <option value="All">Todas las facilities</option>
          {filteredFacilities.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}

      {showTimeControls && (
        <>
          <span className="w-px h-5 bg-border-strong mx-1" />

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
              router.push(`${pathname}?${params.toString()}`);
            }}
          >
            {GRANULARITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {granularity === "custom" && (
            <span className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={(e) => update({ customFrom: e.target.value })} className={selectClass} />
              <span className="text-xs text-ink-faint">a</span>
              <input type="date" value={customTo} onChange={(e) => update({ customTo: e.target.value })} className={selectClass} />
            </span>
          )}

          {granularity !== "custom" && granularity !== "all" && period && (
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => update({ period: prevAnchor })} className="text-brand text-lg px-1">‹</button>
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
                <span className="text-sm font-medium text-ink min-w-[110px] text-center">{period.label}</span>
              )}
              <button type="button" onClick={() => update({ period: nextAnchor })} className="text-brand text-lg px-1">›</button>
            </span>
          )}
        </>
      )}

      {hasFilter && clearHref && (
        <Link href={clearHref} className="text-sm text-brand hover:underline ml-auto shrink-0">
          Limpiar filtros
        </Link>
      )}
    </div>
  );
}
