/**
 * Lógica pura de geocodificación (sin red ni DB) para scripts/geocode-facilities.ts.
 * Servicio: Nominatim (OpenStreetMap), gratis y sin API key, a 1 consulta/seg.
 */

export type GeoPrecision = "ADDRESS" | "POSTAL_CODE";

export type GeoQuery = { q: string; precision: GeoPrecision };

// Plus-code de Google ("QPFX+MJ Decatur, GA") — Nominatim no lo entiende.
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\s*/i;

/**
 * Consultas a probar, de más a menos precisa. La dirección completa primero;
 * si falla, el centro del ZIP (ciudad + estado si no hay ZIP).
 */
export function buildQueries(p: { address: string | null; postalCode: string | null; state: string | null; city: string | null }): GeoQuery[] {
  const out: GeoQuery[] = [];
  const address = (p.address ?? "").trim();
  const hasPlus = PLUS_CODE.test(address);
  const cleaned = address.replace(PLUS_CODE, "").trim();
  if (address && !hasPlus) out.push({ q: address, precision: "ADDRESS" });
  // Con plus-code, lo que queda ("Decatur, GA 30032") ya es solo ciudad/ZIP.
  if (hasPlus && cleaned) out.push({ q: cleaned, precision: "POSTAL_CODE" });
  if (p.postalCode && p.state) out.push({ q: `${p.postalCode}, ${p.state}`, precision: "POSTAL_CODE" });
  else if (p.city && p.state) out.push({ q: `${p.city}, ${p.state}`, precision: "POSTAL_CODE" });
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.q) ? false : (seen.add(x.q), true)));
}

export type NominatimHit = {
  lat: string;
  lon: string;
  place_rank?: number;
  address?: Record<string, string>;
};

export type GeoResult = { latitude: number; longitude: number; precision: GeoPrecision; city: string | null };

/**
 * Valida y convierte la respuesta. Rechaza resultados fuera del estado esperado
 * (evita que "Winder, GA" caiga en otro estado) y baja la precisión a
 * POSTAL_CODE si Nominatim solo resolvió a nivel ciudad/zona (place_rank < 26).
 */
export function pickResult(hits: NominatimHit[], query: GeoQuery, expectedState: string | null): GeoResult | null {
  for (const h of hits) {
    const lat = parseFloat(h.lat), lon = parseFloat(h.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const iso = h.address?.["ISO3166-2-lvl4"] ?? "";
    if (expectedState && iso && !iso.endsWith(`-${expectedState.toUpperCase()}`)) continue;
    const addressLevel = (h.place_rank ?? 0) >= 26;
    const precision: GeoPrecision = query.precision === "ADDRESS" && addressLevel ? "ADDRESS" : "POSTAL_CODE";
    const a = h.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
    return { latitude: lat, longitude: lon, precision, city };
  }
  return null;
}
