"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type ReputationRow = {
  facilityId: string;
  name: string;
  marketId: string;
  regionId: string;
  tierLabel: string;
  tierClass: string;
  confirmedGames: number;
  regionRank: number | null;
  regionTotal: number;
  marketRank: number | null;
  marketTotal: number;
};

type SortKey = "name" | "confirmedGames" | "regionRank" | "marketRank";
type SortDir = "desc" | "asc";

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

// Mismo patrón client-side de sort de 3 clicks que PriceTable/EngagementTable
// (Market) — así las 3 tablas de Market se comportan igual entre sí. El
// orden "sin sortKey" es el que ya trae `rows` (por reputationScore
// descendente, calculado en MarketDashboard) — no se recalcula acá.
export default function ReputationTable({ rows }: { rows: ReputationRow[] }) {
  const t = useTranslations("Market.reputation");
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
    if (sortKey === null) return rows;
    const factor = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * factor;
      if (sortKey === "regionRank") return ((a.regionRank ?? Infinity) - (b.regionRank ?? Infinity)) * factor;
      if (sortKey === "marketRank") return ((a.marketRank ?? Infinity) - (b.marketRank ?? Infinity)) * factor;
      return (a.confirmedGames - b.confirmedGames) * factor;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            <SortableTh label={t("headers.facility")} sortableKey="name" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <th className="py-1.5 px-2 font-normal">{t("headers.level")}</th>
            <SortableTh label={t("headers.confirmed")} sortableKey="confirmedGames" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.rankRegion")} sortableKey="regionRank" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.rankMarket")} sortableKey="marketRank" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 50).map((f) => (
            <tr key={f.facilityId} className="border-b border-surface-sunken">
              <td className="py-1.5 px-2">
                <Link href={`/?${new URLSearchParams({ facilityId: f.facilityId, marketId: f.marketId, regionId: f.regionId }).toString()}`} className="text-brand hover:underline">
                  {f.name}
                </Link>
              </td>
              <td className="py-1.5 px-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${f.tierClass}`}>{f.tierLabel}</span></td>
              <td className="py-1.5 px-2 text-ink">{f.confirmedGames}</td>
              <td className="py-1.5 px-2 text-ink-muted">{f.regionRank ? t("rankOf", { rank: f.regionRank, total: f.regionTotal }) : "—"}</td>
              <td className="py-1.5 px-2 text-ink-muted">{f.marketRank ? t("rankOf", { rank: f.marketRank, total: f.marketTotal }) : "—"}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="py-4 text-center text-ink-faint">{t("empty")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
