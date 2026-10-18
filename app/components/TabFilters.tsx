"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import CollapsibleFilter from "./CollapsibleFilter";

type Option = { id: string; name: string; regionId?: string };

export default function TabFilters({
  regions,
  markets,
  showMonth = true,
  monthValue,
}: {
  regions: Option[];
  markets: Option[];
  showMonth?: boolean;
  // Mes que realmente se está mostrando (la página cae en el mes actual si la URL no trae ninguno): es el
  // resumen que queda visible con el filtro colapsado.
  monthValue?: string;
}) {
  const t = useTranslations("Market");
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
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectClass =
    "rounded-lg bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted cursor-pointer ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-brand/40 hover:text-ink hover:ring-border-strong transition-colors";

  const summary = showMonth ? (month || monthValue || null) : null;

  return (
    <CollapsibleFilter label={t("filter")} summary={summary} active={regionId !== "All" || marketId !== "All"}>
      <select className={selectClass} value={regionId} onChange={(e) => update({ regionId: e.target.value, marketId: undefined })}>
        <option value="All">{t("allRegions")}</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <select className={selectClass} value={marketId} onChange={(e) => update({ marketId: e.target.value })}>
        <option value="All">{t("allMarkets")}</option>
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
    </CollapsibleFilter>
  );
}
