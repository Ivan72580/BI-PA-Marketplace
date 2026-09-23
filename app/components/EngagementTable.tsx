"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type EngagementRow = {
  facilityId: string;
  name: string;
  marketId: string;
  regionId: string;
  conversionRate: number;
  abandonmentRate: number;
  nearMissCancelledCount: number;
  nearMissCancelledPct: number;
  cancelledGames: number;
};

type SortKey = "name" | "conversionRate" | "abandonmentRate" | "nearMissCancelledCount";
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

export default function EngagementTable({ rows }: { rows: EngagementRow[] }) {
  const t = useTranslations("Market.engagementTable");
  // sortKey null = orden por default (casi llegan, descendente)
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
    const key = sortKey ?? "nearMissCancelledCount";
    const dir = sortKey === null ? "desc" : sortDir;
    const factor = dir === "desc" ? -1 : 1;

    return [...rows].sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name) * factor;
      const av = key === "conversionRate" ? a.conversionRate : key === "abandonmentRate" ? a.abandonmentRate : a.nearMissCancelledCount;
      const bv = key === "conversionRate" ? b.conversionRate : key === "abandonmentRate" ? b.abandonmentRate : b.nearMissCancelledCount;
      return (av - bv) * factor;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            <SortableTh label={t("headers.facility")} sortableKey="name" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.conversion")} sortableKey="conversionRate" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.abandonment")} sortableKey="abandonmentRate" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.nearMiss")} sortableKey="nearMissCancelledCount" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 30).map((f) => (
            <tr key={f.facilityId} className="border-b border-surface-sunken">
              <td className="py-1.5 px-2">
                <Link href={`/trends?regionId=${f.regionId}&marketId=${f.marketId}&facilityId=${f.facilityId}`} className="text-brand hover:underline">
                  {f.name}
                </Link>
              </td>
              <td className="py-1.5 px-2 text-ink">{formatPct(f.conversionRate)}</td>
              <td className="py-1.5 px-2 text-ink">{formatPct(f.abandonmentRate)}</td>
              <td className="py-1.5 px-2 text-ink-muted">{f.nearMissCancelledCount} ({f.cancelledGames > 0 ? formatPct(f.nearMissCancelledPct) : "—"})</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={4} className="py-4 text-center text-ink-faint">{t("empty")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
