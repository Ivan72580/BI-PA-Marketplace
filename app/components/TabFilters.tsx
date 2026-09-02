"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Option = { id: string; name: string; regionId?: string };

export default function TabFilters({
  regions,
  markets,
  showMonth = true,
}: {
  regions: Option[];
  markets: Option[];
  showMonth?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const regionId = searchParams.get("regionId") ?? "All";
  const marketId = searchParams.get("marketId") ?? "All";
  const month = searchParams.get("month") ?? "";

  const filteredMarkets = regionId === "All" ? markets : markets.filter((m) => m.regionId === regionId);

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "All") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const selectClass =
    "rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-sm text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <select className={selectClass} value={regionId} onChange={(e) => update({ regionId: e.target.value, marketId: undefined })}>
        <option value="All">Todas las regiones</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <select className={selectClass} value={marketId} onChange={(e) => update({ marketId: e.target.value })}>
        <option value="All">Todos los markets</option>
        {filteredMarkets.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      {showMonth && (
        <input
          type="month"
          value={month}
          onChange={(e) => update({ month: e.target.value })}
          className={selectClass}
        />
      )}
    </div>
  );
}
