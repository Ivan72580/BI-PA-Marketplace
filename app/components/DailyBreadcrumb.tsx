"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Option = { id: string; name: string; regionId?: string; marketId?: string };

// Breadcrumb funcional para /daily: a diferencia de Trends/Market, acá no
// tiene sentido "subir un nivel y perder todo" — la facility es obligatoria
// para ver cualquier dato, así que cambiar de región/market/facility tiene
// que poder hacerse en el lugar, sin pasar por la pantalla de selección
// completa. Mismo criterio de cascada que FilterPanel (cambiar región limpia
// market+facility, cambiar market limpia facility) pero con el look de
// breadcrumb en vez de 3 selectores en una barra.
export default function DailyBreadcrumb({
  regions,
  markets,
  facilities,
  sp,
}: {
  regions: Option[];
  markets: Option[];
  facilities: Option[];
  sp: { regionId?: string; marketId?: string; facilityId?: string; date?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const regionId = sp.regionId ?? "";
  const marketId = sp.marketId ?? "";
  const facilityId = sp.facilityId ?? "";

  const filteredMarkets = regionId ? markets.filter((m) => m.regionId === regionId) : [];
  const filteredFacilities = marketId ? facilities.filter((f) => f.marketId === marketId) : [];

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectClass =
    "rounded-md border-none bg-transparent px-0.5 text-sm font-medium text-brand cursor-pointer focus:outline-none hover:text-brand/80 transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm mb-2">
      <select className={selectClass} value={regionId} onChange={(e) => update({ regionId: e.target.value, marketId: undefined, facilityId: undefined })}>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <span className="text-ink-faint">›</span>
      <select className={selectClass} value={marketId} onChange={(e) => update({ marketId: e.target.value, facilityId: undefined })}>
        {filteredMarkets.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <span className="text-ink-faint">›</span>
      <select className={`${selectClass} text-ink`} value={facilityId} onChange={(e) => update({ facilityId: e.target.value })}>
        {filteredFacilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    </div>
  );
}
