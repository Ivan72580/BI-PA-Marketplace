"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

export type SlotSummaryRow = {
  key: string;
  day: string;
  dayLabel: string;
  hour: string;
  formatLabel: string;
  pct: number;
  detail: string;
};

type SortKey = "dayLabel" | "hour" | "formatLabel" | "pct";
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function SortableTh({ label, sortKey, activeSortKey, sortDir, onSort }: { label: string; sortKey: SortKey; activeSortKey: SortKey; sortDir: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  const isActive = activeSortKey === sortKey;
  return (
    <th className="py-1.5 px-2 font-normal text-left">
      <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1 hover:underline ${isActive ? "text-ink font-medium" : "text-ink-muted"}`}>
        {label} <span className="text-[9px]">{isActive ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

export default function SlotSummaryTable({ rows, colorScheme = "green" }: { rows: SlotSummaryRow[]; colorScheme?: "green" | "red" }) {
  const t = useTranslations("Trends.summaryTable");
  const [sortKey, setSortKey] = useState<SortKey>("dayLabel");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "pct" ? "desc" : "asc");
    }
  }

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "dayLabel") return (DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)) * factor;
      if (sortKey === "hour") return a.hour.localeCompare(b.hour, undefined, { numeric: true }) * factor;
      if (sortKey === "formatLabel") return a.formatLabel.localeCompare(b.formatLabel) * factor;
      return (a.pct - b.pct) * factor;
    });
  }, [rows, sortKey, sortDir]);

  const textColor = colorScheme === "green" ? "text-brand" : "text-danger";

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <SortableTh label={t("day")} sortKey="dayLabel" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTh label={t("hour")} sortKey="hour" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTh label={t("format")} sortKey="formatLabel" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTh label={t("pct")} sortKey="pct" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th className="py-1.5 px-2 font-normal text-left text-ink-muted">{t("detail")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className="border-b border-surface-sunken">
              <td className="py-1.5 px-2 text-ink">{r.dayLabel}</td>
              <td className="py-1.5 px-2 text-ink">{r.hour}</td>
              <td className="py-1.5 px-2 text-ink-muted">{r.formatLabel}</td>
              <td className={`py-1.5 px-2 font-semibold ${textColor}`}>{(r.pct * 100).toFixed(0)}%</td>
              <td className="py-1.5 px-2 text-ink-faint text-xs">{r.detail}</td>
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
