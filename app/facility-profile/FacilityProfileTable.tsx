"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// Listado de perfiles: buscador propio (solo filtra esta tabla), orden por cada columna con un clic en el
// encabezado y filtros por región, market y estado del perfil.

type T = (key: string, values?: Record<string, string | number>) => string;
export type ProfileRow = {
  facilityId: string; facilityName: string; marketName: string; regionName: string;
  hasProfile: boolean; coreFieldsFilled: number; coreFieldsTotal: number;
};
type SortKey = "facility" | "market" | "region" | "completion";
type Status = "" | "complete" | "incomplete" | "none";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ratio = (r: ProfileRow) => (r.coreFieldsTotal > 0 ? r.coreFieldsFilled / r.coreFieldsTotal : 0);
const statusOf = (r: ProfileRow): Exclude<Status, ""> => (!r.hasProfile ? "none" : r.coreFieldsFilled >= r.coreFieldsTotal ? "complete" : "incomplete");

export default function FacilityProfileTable({ rows, canEdit }: { rows: ProfileRow[]; canEdit: boolean }) {
  const t = useTranslations("FacilityProfile") as unknown as T;
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "region", dir: 1 });

  const regions = useMemo(() => [...new Set(rows.map((r) => r.regionName))].sort(), [rows]);
  const markets = useMemo(() => [...new Set(rows.filter((r) => !region || r.regionName === region).map((r) => r.marketName))].sort(), [rows, region]);

  const shown = useMemo(() => {
    const nq = norm(q);
    const list = rows.filter((r) =>
      (!nq || norm(`${r.facilityName} ${r.marketName} ${r.regionName}`).includes(nq)) &&
      (!region || r.regionName === region) && (!market || r.marketName === market) && (!status || statusOf(r) === status));
    const cmp = (a: ProfileRow, b: ProfileRow): number => {
      switch (sort.key) {
        case "facility": return a.facilityName.localeCompare(b.facilityName);
        case "market": return a.marketName.localeCompare(b.marketName) || a.facilityName.localeCompare(b.facilityName);
        case "region": return a.regionName.localeCompare(b.regionName) || a.marketName.localeCompare(b.marketName) || a.facilityName.localeCompare(b.facilityName);
        case "completion": return ratio(a) - ratio(b) || a.facilityName.localeCompare(b.facilityName);
      }
    };
    return [...list].sort((a, b) => cmp(a, b) * sort.dir);
  }, [rows, q, region, market, status, sort]);

  const active = !!(q || region || market || status);
  const th = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <th className="py-2 px-4 font-normal" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setSort({ key, dir: on ? (sort.dir === 1 ? -1 : 1) : 1 })} className={`inline-flex items-center gap-1 ${on ? "text-brand font-medium" : "text-ink-muted hover:text-ink"}`}>
          {label}<span aria-hidden="true" className="text-[10px]">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };
  const selCls = (on: boolean) => `w-full max-w-[200px] rounded-md border px-2 py-1 text-xs bg-surface ${on ? "border-brand text-brand" : "border-border text-ink-muted"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("table.search")}
          aria-label={t("table.search")}
          className="w-full sm:w-72 rounded-full border border-border bg-surface px-4 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <span className="text-xs text-ink-muted">{t("table.count", { shown: shown.length, total: rows.length })}</span>
        {active && (
          <button type="button" onClick={() => { setQ(""); setRegion(""); setMarket(""); setStatus(""); }} className="text-xs text-brand hover:underline">{t("table.clear")}</button>
        )}
      </div>

      <div className="rounded-2xl bg-surface shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[640px]">
          <thead>
            <tr className="text-left">
              {th("facility", t("table.facility"))}{th("market", t("table.market"))}{th("region", t("table.region"))}{th("completion", t("table.completion"))}
              <th className="py-2 px-4" />
            </tr>
            <tr className="border-b border-border">
              <th className="px-4 pb-2" />
              <th className="px-4 pb-2 text-left">
                <select value={market} onChange={(e) => setMarket(e.target.value)} aria-label={t("table.market")} className={selCls(!!market)}>
                  <option value="">{t("table.all")}</option>
                  {markets.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </th>
              <th className="px-4 pb-2 text-left">
                <select value={region} onChange={(e) => { setRegion(e.target.value); setMarket(""); }} aria-label={t("table.region")} className={selCls(!!region)}>
                  <option value="">{t("table.all")}</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </th>
              <th className="px-4 pb-2 text-left">
                <select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label={t("table.completion")} className={selCls(!!status)}>
                  <option value="">{t("table.all")}</option>
                  <option value="complete">{t("table.status.complete")}</option>
                  <option value="incomplete">{t("table.status.incomplete")}</option>
                  <option value="none">{t("table.status.none")}</option>
                </select>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.facilityId} className="border-b border-surface-sunken">
                <td className="py-2 px-4 text-ink font-medium">{r.facilityName}</td>
                <td className="py-2 px-4 text-ink-muted">{r.marketName}</td>
                <td className="py-2 px-4 text-ink-muted">{r.regionName}</td>
                <td className="py-2 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                      <div className="h-full bg-brand" style={{ width: `${ratio(r) * 100}%` }} />
                    </div>
                    <span className="text-xs text-ink-faint">{r.coreFieldsFilled}/{r.coreFieldsTotal}</span>
                  </div>
                </td>
                <td className="py-2 px-4 text-right">
                  <Link href={`/facility-profile/${r.facilityId}`} className="text-xs text-brand hover:underline">
                    {canEdit ? (r.hasProfile ? t("table.edit") : t("table.complete")) : t("table.view")}
                  </Link>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-ink-faint">{t("table.noMatch")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
