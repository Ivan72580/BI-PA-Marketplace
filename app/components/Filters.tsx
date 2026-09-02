"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Option = { id: string; name: string; regionId?: string; marketId?: string };

export default function Filters({
  regions,
  markets,
  facilities,
}: {
  regions: Option[];
  markets: Option[];
  facilities: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const regionId = searchParams.get("regionId") ?? "All";
  const marketId = searchParams.get("marketId") ?? "All";
  const facilityId = searchParams.get("facilityId") ?? "All";
  const granularity = searchParams.get("granularity") ?? "all";
  const compare = searchParams.get("compare") === "1";

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

  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={regionId}
        onChange={(e) => update({ regionId: e.target.value, marketId: undefined, facilityId: undefined })}
      >
        <option value="All">Todas las regiones</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <select
        value={marketId}
        onChange={(e) => update({ marketId: e.target.value, facilityId: undefined })}
      >
        <option value="All">Todos los markets</option>
        {filteredMarkets.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      <select
        value={facilityId}
        onChange={(e) => update({ facilityId: e.target.value })}
      >
        <option value="All">Todas las facilities</option>
        {filteredFacilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>

      <select
        value={granularity}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value === "all") {
            params.delete("granularity");
          } else {
            params.set("granularity", e.target.value);
          }
          params.delete("period"); // resetea el ancla al cambiar de granularidad
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        <option value="all">Todo el histórico</option>
        <option value="year">Por año</option>
        <option value="quarter">Por trimestre</option>
        <option value="month">Por mes</option>
        <option value="week">Por semana</option>
        <option value="day">Por día</option>
      </select>

      {granularity !== "all" && (
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#334155" }}>
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => update({ compare: e.target.checked ? "1" : undefined })}
          />
          Comparar vs. año anterior
        </label>
      )}
    </div>
  );
}
