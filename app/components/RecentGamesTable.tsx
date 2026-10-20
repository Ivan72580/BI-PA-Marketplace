"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

// Partidos recientes de la facility: cada columna se ordena con un clic en el encabezado y se filtra con el
// selector de abajo (día, cancha, formato, estado).

type T = (key: string, values?: Record<string, string | number>) => string;
export type RecentRow = {
  date: string; time: string; dayKey: string; dayLabel: string; dateLabel: string; field: string; size: string;
  status: string; statusLabel: string; kind: "confirmed" | "field" | "cancelled"; players: number | null; maxPlayers: number; price: number | null;
};
type SortKey = "date" | "field" | "size" | "status" | "players" | "price";

const usd2 = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));

export default function RecentGamesTable({ rows, truncated }: { rows: RecentRow[]; truncated: boolean }) {
  const t = useTranslations("Facility360") as unknown as T;
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [f, setF] = useState({ date: "", field: "", size: "", status: "" });

  const opts = useMemo(() => {
    const uniq = (g: (r: RecentRow) => string) => [...new Set(rows.map(g))].filter(Boolean);
    return {
      date: [...new Map(rows.map((r) => [r.date, r.dateLabel])).entries()].sort((a, b) => b[0].localeCompare(a[0])),
      field: uniq((r) => r.field).sort(),
      size: uniq((r) => r.size).sort(),
      status: uniq((r) => r.statusLabel).sort(),
    };
  }, [rows]);

  const shown = useMemo(() => {
    const val = (r: RecentRow): string | number => {
      switch (sort.key) {
        case "date": return `${r.date} ${r.time}`;
        case "field": return r.field;
        case "size": return r.size;
        case "status": return r.statusLabel;
        case "players": return r.players ?? -1;
        case "price": return r.price ?? -1;
      }
    };
    return rows
      .filter((r) => (!f.date || r.date === f.date) && (!f.field || r.field === f.field) && (!f.size || r.size === f.size) && (!f.status || r.statusLabel === f.status))
      .sort((a, b) => {
        const x = val(a), y = val(b);
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
  }, [rows, f, sort]);

  const th = (key: SortKey, label: string, right = false) => {
    const on = sort.key === key;
    return (
      <th className={`py-1.5 px-2 font-medium ${right ? "text-right" : "text-left"}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setSort({ key, dir: on ? (sort.dir === 1 ? -1 : 1) : key === "date" ? -1 : 1 })} className={`inline-flex items-center gap-1 uppercase tracking-wide text-[10px] ${on ? "text-brand" : "text-ink-faint hover:text-ink"}`}>
          {label}<span aria-hidden="true" className="text-[9px]">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };
  const sel = (key: keyof typeof f, options: string[] | [string, string][]) => (
    <select value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} aria-label={t("now.recent.filter")} className={`w-full max-w-[150px] rounded-md border px-1.5 py-1 text-[11px] font-normal bg-surface ${f[key] ? "border-brand text-brand" : "border-border text-ink-muted"}`}>
      <option value="">{t("now.recent.all")}</option>
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  );
  const active = Object.values(f).some(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-ink-muted">{t("now.recent.count", { shown: shown.length, total: rows.length })}</span>
        {active && <button type="button" onClick={() => setF({ date: "", field: "", size: "", status: "" })} className="text-xs text-brand hover:underline">{t("now.recent.clear")}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr>{th("date", t("now.recent.date"))}{th("field", t("now.recent.field"))}{th("size", t("now.recent.format"))}{th("status", t("now.recent.status"))}{th("players", t("now.recent.players"), true)}{th("price", t("now.recent.price"), true)}</tr>
            <tr className="border-b border-surface-sunken">
              <th className="px-2 pb-2 text-left">{sel("date", opts.date)}</th>
              <th className="px-2 pb-2 text-left">{sel("field", opts.field)}</th>
              <th className="px-2 pb-2 text-left">{sel("size", opts.size)}</th>
              <th className="px-2 pb-2 text-left">{sel("status", opts.status)}</th>
              <th /><th />
            </tr>
          </thead>
          <tbody>
            {shown.map((g, i) => (
              <tr key={`${g.date}-${g.time}-${g.field}-${i}`} className="border-t border-surface-sunken">
                <td className="py-1.5 px-2 whitespace-nowrap text-ink">{g.dayLabel} {g.dateLabel} · {g.time}</td>
                <td className="py-1.5 px-2 text-ink-muted">{g.field || "—"}</td>
                <td className="py-1.5 px-2 text-ink-muted">{g.size || "—"}</td>
                <td className="py-1.5 px-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${g.kind === "confirmed" ? "bg-brand-soft text-brand" : g.kind === "field" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"}`}>{g.statusLabel}</span>
                </td>
                <td className="py-1.5 px-2 text-right text-ink-muted">{g.players === null ? "—" : `${g.players}/${g.maxPlayers}`}</td>
                <td className="py-1.5 px-2 text-right text-ink-muted">{usd2(g.price)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-ink-faint text-sm">{t("now.recent.noMatch")}</td></tr>}
          </tbody>
        </table>
      </div>
      {truncated && <p className="text-[11px] text-ink-faint mt-2">{t("now.recent.truncated")}</p>}
    </div>
  );
}
