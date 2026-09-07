"use client";

import { useMemo, useState } from "react";

type PriceRow = {
  facilityId: string;
  name: string;
  avgPrice: number | null;
  avgPlayersPerGame: number | null;
  avgGamesPerMonth: number;
  grossProfitEstimate: number | null;
};

type SortKey = "name" | "avgPrice" | "avgPlayersPerGame" | "avgGamesPerMonth" | "grossProfitEstimate";
type SortDir = "desc" | "asc";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatUSD2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
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

export default function PriceTable({ rows }: { rows: PriceRow[] }) {
  // sortKey null = orden por default (partidos/mes, descendente)
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleClick(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      // tercer click: vuelve al default
      setSortKey(null);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const key = sortKey ?? "avgGamesPerMonth";
    const dir = sortKey === null ? "desc" : sortDir;
    const factor = dir === "desc" ? -1 : 1;

    return [...rows].sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name) * factor;
      const av = key === "avgPrice" ? a.avgPrice : key === "avgPlayersPerGame" ? a.avgPlayersPerGame : key === "avgGamesPerMonth" ? a.avgGamesPerMonth : a.grossProfitEstimate;
      const bv = key === "avgPrice" ? b.avgPrice : key === "avgPlayersPerGame" ? b.avgPlayersPerGame : key === "avgGamesPerMonth" ? b.avgGamesPerMonth : b.grossProfitEstimate;
      return ((av ?? -1) - (bv ?? -1)) * factor;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            <SortableTh label="Facility" sortableKey="name" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label="Ticket promedio" sortableKey="avgPrice" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label="Jugadores/partido" sortableKey="avgPlayersPerGame" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label="Partidos/mes" sortableKey="avgGamesPerMonth" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label="Gross profit estimado" sortableKey="grossProfitEstimate" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 30).map((f) => (
            <tr key={f.facilityId} className="border-b border-surface-sunken">
              <td className="py-1.5 px-2 text-ink">{f.name}</td>
              <td className="py-1.5 px-2 text-ink">{formatUSD2(f.avgPrice ?? 0)}</td>
              <td className="py-1.5 px-2 text-ink">{f.avgPlayersPerGame !== null ? f.avgPlayersPerGame.toFixed(1) : "—"}</td>
              <td className="py-1.5 px-2 text-ink">{f.avgGamesPerMonth}</td>
              <td className="py-1.5 px-2 text-ink">{f.grossProfitEstimate !== null ? formatUSD(f.grossProfitEstimate) : "—"}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="py-4 text-center text-ink-faint">Sin datos de precio en este filtro.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
