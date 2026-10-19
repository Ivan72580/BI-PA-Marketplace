"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ChangeBadge from "./ChangeBadge";

type PriceRow = {
  facilityId: string;
  name: string;
  marketId: string;
  regionId: string;
  avgPrice: number | null;
  avgPlayersPerGame: number | null;
  avgGamesPerMonth: number;
  revenueEstimate: number | null;
  history: (number | null)[]; // ticket promedio por mes, del más viejo al mes elegido
  changePct: number | null; // variación del ticket promedio contra el mes anterior
};

type SortKey = "name" | "avgPrice" | "changePct" | "avgPlayersPerGame" | "avgGamesPerMonth" | "revenueEstimate";
type SortDir = "desc" | "asc";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatUSD2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

// Mini línea de los últimos meses (escala propia de cada fila: muestra la forma, el valor exacto está en el tooltip).
function Sparkline({ values, months }: { values: (number | null)[]; months: string[] }) {
  const pts = values.map((v, i) => (v === null ? null : { v, i })).filter((p): p is { v: number; i: number } => p !== null);
  if (pts.length < 2) return <span className="text-ink-faint">—</span>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const W = 84, H = 22, pad = 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v: number) => (max === min ? H / 2 : H - pad - ((v - min) * (H - 2 * pad)) / (max - min));
  const last = pts[pts.length - 1];
  const title = values.map((v, i) => `${months[i] ?? ""}: ${v === null ? "—" : formatUSD2(v)}`).join("\n");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      <polyline fill="none" stroke="currentColor" className="text-ink-muted" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.5" className="fill-brand" />
    </svg>
  );
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

export default function PriceTable({ rows, months }: { rows: PriceRow[]; months: string[] }) {
  const t = useTranslations("Market.price");
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
      const av = key === "avgPrice" ? a.avgPrice : key === "changePct" ? a.changePct : key === "avgPlayersPerGame" ? a.avgPlayersPerGame : key === "avgGamesPerMonth" ? a.avgGamesPerMonth : a.revenueEstimate;
      const bv = key === "avgPrice" ? b.avgPrice : key === "changePct" ? b.changePct : key === "avgPlayersPerGame" ? b.avgPlayersPerGame : key === "avgGamesPerMonth" ? b.avgGamesPerMonth : b.revenueEstimate;
      return ((av ?? -1) - (bv ?? -1)) * factor;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            <SortableTh label={t("headers.facility")} sortableKey="name" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.avgTicket")} sortableKey="avgPrice" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.vsPrior")} sortableKey="changePct" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <th className="py-1.5 px-2 font-normal text-ink-muted">{t("headers.trend", { n: months.length })}</th>
            <SortableTh label={t("headers.playersPerGame")} sortableKey="avgPlayersPerGame" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.gamesPerMonth")} sortableKey="avgGamesPerMonth" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
            <SortableTh label={t("headers.revenue")} sortableKey="revenueEstimate" activeKey={sortKey} sortDir={sortDir} onSort={handleClick} />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 30).map((f) => (
            <tr key={f.facilityId} className="border-b border-surface-sunken">
              <td className="py-1.5 px-2">
                <Link href={`/?regionId=${f.regionId}&marketId=${f.marketId}&facilityId=${f.facilityId}`} className="text-brand hover:underline">
                  {f.name}
                </Link>
              </td>
              <td className="py-1.5 px-2 text-ink">{formatUSD2(f.avgPrice ?? 0)}</td>
              <td className="py-1.5 px-2"><ChangeBadge value={f.changePct} /></td>
              <td className="py-1.5 px-2"><Sparkline values={f.history} months={months} /></td>
              <td className="py-1.5 px-2 text-ink">{f.avgPlayersPerGame !== null ? f.avgPlayersPerGame.toFixed(1) : "—"}</td>
              <td className="py-1.5 px-2 text-ink">{f.avgGamesPerMonth}</td>
              <td className="py-1.5 px-2 text-ink">{f.revenueEstimate !== null ? formatUSD(f.revenueEstimate) : "—"}</td>
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
