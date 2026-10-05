/**
 * Lógica pura de geocodificación (sin red ni DB) para scripts/geocode-facilities.ts.
 * Servicio: Nominatim (OpenStreetMap), gratis y sin API key, a 1 consulta/seg.
 */

export type GeoPrecision = "ADDRESS" | "POSTAL_CODE";

export type GeoQuery = { q: string; precision: GeoPrecision };

// Plus-code de Google ("QPFX+MJ Decatur, GA") — Nominatim no lo entiende.
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\s*/i;

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC", ontario: "ON", quebec: "QC", "british columbia": "BC", alberta: "AB",
};

/** Limpia una dirección del Sheet: toma la primera si vienen varias, saca comillas y plus-codes. */
export function cleanAddress(raw: string): string {
  let a = raw.replace(/["“”]/g, "").trim();
  a = a.split(/\s+-\s+/)[0]; // "A - B": se queda con la primera dirección
  a = a.replace(/\b([A-Z]\d[A-Z])(\d[A-Z]\d)\b/g, "$1 $2"); // L4K4X2 -> L4K 4X2
  return a.replace(PLUS_CODE, "").replace(/\s+/g, " ").trim();
}

/** Saca "Unit F", "Ste 4D", "Suite 510", "#12" y códigos sueltos tipo "SC1" que confunden al servicio. */
export function stripUnits(address: string): string {
  return address
    .replace(/,?\s*\b(unit|ste|suite|apt|apartment|bldg|building|floor|fl)\.?\s*#?\s*[\w-]+/gi, "")
    .replace(/,?\s*#\s*[\w-]+/g, "")
    .replace(/,\s*[A-Z]{1,3}\d{1,3}\s*(?=,)/g, "") // ", SC1,"
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** Estado y ZIP/código postal leídos de la propia dirección (el perfil a veces los trae vacíos: "Texas 77433", "ON L4K4X2"). */
export function locationHints(address: string): { state: string | null; zip: string | null } {
  const a = address.replace(/\s+/g, " ");
  const ca = a.match(/\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/);
  const us = a.match(/\b(\d{5})(?:-\d{4})?\b\s*(?:,\s*(?:USA|US))?\s*$/);
  const zip = ca ? `${ca[1]} ${ca[2]}` : us ? us[1] : null;
  let state: string | null = null;
  const abbr = a.match(/,\s*([A-Z]{2})\b[ ,]*(?:\d{5}|[A-Z]\d[A-Z])?/);
  if (abbr) state = abbr[1];
  if (!state) {
    const low = a.toLowerCase();
    for (const [name, code] of Object.entries(US_STATES)) {
      if (new RegExp(`\\b${name}\\b`).test(low)) { state = code; break; }
    }
  }
  return { state, zip };
}

/**
 * Consultas a probar, de más a menos precisa:
 *   1. dirección completa (limpia)   2. sin unit/suite   3. calle + ZIP   4. centro del ZIP / ciudad.
 * Las dos últimas son aproximadas salvo que el servicio resuelva a nivel calle.
 */
export function buildQueries(p: { address: string | null; postalCode: string | null; state: string | null; city: string | null }): GeoQuery[] {
  const out: GeoQuery[] = [];
  const raw = (p.address ?? "").trim();
  const hasPlus = PLUS_CODE.test(raw);
  const address = cleanAddress(raw);
  const hints = locationHints(address);
  const zip = p.postalCode ?? hints.zip;
  const state = p.state ?? hints.state;
  if (address && !hasPlus) {
    out.push({ q: address, precision: "ADDRESS" });
    const noUnit = stripUnits(address);
    if (noUnit && noUnit !== address) out.push({ q: noUnit, precision: "ADDRESS" });
    const street = noUnit.split(",")[0]?.trim();
    if (street && zip && /\d/.test(street)) out.push({ q: `${street}, ${zip}`, precision: "ADDRESS" });
  }
  // Con plus-code, lo que queda ("Decatur, GA 30032") ya es solo ciudad/ZIP.
  if (hasPlus && address) out.push({ q: address, precision: "POSTAL_CODE" });
  if (zip && state) out.push({ q: `${zip}, ${state}`, precision: "POSTAL_CODE" });
  else if (zip) out.push({ q: zip, precision: "POSTAL_CODE" });
  else if (p.city && state) out.push({ q: `${p.city}, ${state}`, precision: "POSTAL_CODE" });
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
