"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type MonthlyRankingRow = {
  facilityId: string;
  name: string;
  marketId: string;
  regionId: string;
  confirmedGames: number;
  cancelledGames: number;
  conversionRate: number;
  medianLeadTime: number | null;
  avgWaitlist: number | null;
  occupancyRate: number;
};

type SortKey = "name" | "confirmedGames" | "cancelledGames" | "conversionRate" | "medianLeadTime" | "avgWaitlist" | "occupancyRate";
type SortDir = "desc" | "asc";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function SortableTh({ label, sortableKey, activeKey, sortDir, onSort }: { label: string; sortableKey: SortKey; activeKey: SortKey | null; sortDir: SortDir; onSort: (key: SortKey) => void }) {
  const isActive = activeKey === sortableKey;
  const arrow = isActive ? (sortDir === "desc" ? "▼" : "▲") : "";
  return (
    <th className="py-1.5 px-2 font-normal">
      <button type="button" onClick={() => onSort(sortableKey)} className={`hover:underline inline-flex items-center gap-1 ${isActive ? "text-ink font-medium" : "text-ink-muted"}`}>
        {label} <span className="text-[10px]">{arrow}</span>
      </button>
    </th>
  );
}

// Subpágina del Pareto (top80/others) — mismo patrón de sort de 3 clicks
// que el resto de las tablas de Market (Price/Engagement/Reputation), para
// que el comportamiento sea idéntico en toda la página.
export default function MonthlyRankingTable({ rows }: { rows: MonthlyRankingRow[] }) {
  const t = useTranslations("Market.ranking");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleClick(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortKey(null);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    // Sin sortKey: orden default (por partidos confirmados, descendente —
    // mismo orden con el que ya llegan las filas desde el backend).
    if (sortKey === null) return rows;
    const factor = sortDir === "desc" ? -1 : 1;
    function metric(r: MonthlyRankingRow): number | null {
      switch (sortKey) {
        case "confirmedGames": return r.confirmedGames;
        case "cancelledGames": return r.cancelledGames;
        case "conversionRate": return r.conversionRate;
        case "medianLeadTime": return r.medianLeadTime;
        case "avgWaitlist": return r.avgWaitlist;
        case "occupancyRate": return r.occupancyRate;
        default: return null;
      }
    }
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * factor;
      return ((metric(a) ?? -1) - (metric(b) ?? -1)) * factor;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            <SortableTh label={t("headers.facility")} sortableKey="name" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.confirmed")} sortableKey="confirmedGames" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.cancelled")} sortableKey="cancelledGames" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.conversion")} sortableKey="conversionRate" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.leadTime")} sortableKey="medianLeadTime" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.avgWaitlist")} sortableKey="avgWaitlist" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.occupancy")} sortableKey="occupancyRate" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.facilityId} className="border-b border-surface-sunken">
              <td className="py-1.5 px-2">
                <Link href={`/?${new URLSearchParams({ facilityId: r.facilityId, marketId: r.marketId, regionId: r.regionId }).toString()}`} className="text-brand hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="py-1.5 px-2 text-ink">{r.confirmedGames}</td>
              <td className="py-1.5 px-2 text-ink">{r.cancelledGames}</td>
              <td className="py-1.5 px-2 text-ink">{formatPct(r.conversionRate)}</td>
              <td className="py-1.5 px-2 text-ink">{r.medianLeadTime !== null ? r.medianLeadTime.toFixed(1) : "—"}</td>
              <td className="py-1.5 px-2 text-ink">{r.avgWaitlist !== null ? r.avgWaitlist.toFixed(1) : "—"}</td>
              <td className="py-1.5 px-2 text-ink">{formatPct(r.occupancyRate)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={7} className="py-4 text-center text-ink-faint">{t("empty")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
