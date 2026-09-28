"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Option = { id: string; name: string; regionId?: string; marketId?: string };

// Breadcrumb funcional para /daily: a diferencia de Trends/Market, acá no
// tiene sentido "subir un nivel y perder todo" — la facility es obligatoria
// para ver cualquier dato, así que cambiar de región/market tiene que poder
// hacerse en el lugar, sin pasar por la pantalla de selección completa.
//
// A diferencia de esas otras páginas, region/market NO navegan por sí
// solos: la página solo tiene que reaccionar cuando se termina de elegir
// una facility (siguen viéndose los datos de la facility actual mientras
// se cambia de región/market), así que esos dos selects son "borrador"
// (estado local) hasta que el tercero navega con los tres valores juntos.
// Si el borrador cambia de market y la facility actual no pertenece a él,
// el tercer select simplemente queda sin nada elegido (placeholder) — no
// hay ninguna facility "de ese market" para preseleccionar todavía.
export default function DailyBreadcrumb({
  regions,
  markets,
  facilities,
  sp,
  marketPlaceholder,
  facilityPlaceholder,
}: {
  regions: Option[];
  markets: Option[];
  facilities: Option[];
  sp: { regionId?: string; marketId?: string; facilityId?: string; date?: string };
  marketPlaceholder?: string;
  facilityPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const committedFacilityId = sp.facilityId ?? "";

  const [draftRegionId, setDraftRegionId] = useState(sp.regionId ?? "");
  const [draftMarketId, setDraftMarketId] = useState(sp.marketId ?? "");

  // Si la región/market "reales" cambian por otra vía (se buscó otra
  // facility con el buscador, o cualquier otra navegación externa a este
  // componente), el borrador tiene que seguir a eso — sin esto, el
  // breadcrumb quedaría mostrando una región/market vieja después de haber
  // navegado a otro lado. Ajustado durante el render (no en un useEffect,
  // que dispararía un re-render en cascada) — patrón recomendado por React
  // para "resetear estado cuando cambia una prop": https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastSeenRegionId, setLastSeenRegionId] = useState(sp.regionId ?? "");
  const [lastSeenMarketId, setLastSeenMarketId] = useState(sp.marketId ?? "");
  if ((sp.regionId ?? "") !== lastSeenRegionId || (sp.marketId ?? "") !== lastSeenMarketId) {
    setLastSeenRegionId(sp.regionId ?? "");
    setLastSeenMarketId(sp.marketId ?? "");
    setDraftRegionId(sp.regionId ?? "");
    setDraftMarketId(sp.marketId ?? "");
  }

  const filteredMarkets = draftRegionId ? markets.filter((m) => m.regionId === draftRegionId) : [];
  const filteredFacilities = draftMarketId ? facilities.filter((f) => f.marketId === draftMarketId) : [];

  // La facility que se está viendo deja de ser válida en cuanto el
  // borrador cambia de market (puede pertenecer a otro) — en ese caso el
  // select se muestra vacío en vez de seguir marcando la anterior.
  const facilityStillInDraftMarket = filteredFacilities.some((f) => f.id === committedFacilityId);
  const facilitySelectValue = facilityStillInDraftMarket ? committedFacilityId : "";

  // Único punto que navega de verdad: pasa los tres valores juntos, así
  // nunca queda una combinación a medio hacer en la URL.
  function goToFacility(facilityId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("regionId", draftRegionId);
    params.set("marketId", draftMarketId);
    params.set("facilityId", facilityId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectClass =
    "rounded-md border-none bg-transparent px-0.5 text-sm font-medium text-brand cursor-pointer focus:outline-none hover:text-brand/80 transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm mb-2">
      <select
        className={selectClass}
        value={draftRegionId}
        onChange={(e) => {
          setDraftRegionId(e.target.value);
          setDraftMarketId(""); // el market anterior puede no existir en la nueva región
        }}
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <span className="text-ink-faint">›</span>
      <select
        className={selectClass}
        value={draftMarketId}
        onChange={(e) => setDraftMarketId(e.target.value)}
      >
        {!draftMarketId && <option value="" disabled>{marketPlaceholder}</option>}
        {filteredMarkets.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <span className="text-ink-faint">›</span>
      <select
        className={`${selectClass} text-ink`}
        value={facilitySelectValue}
        onChange={(e) => {
          if (e.target.value) goToFacility(e.target.value);
        }}
      >
        {!facilitySelectValue && <option value="" disabled>{facilityPlaceholder}</option>}
        {filteredFacilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    </div>
  );
}
