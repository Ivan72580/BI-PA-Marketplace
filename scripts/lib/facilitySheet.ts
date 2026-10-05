/**
 * Parsers puros para el Sheet "Facility Profile" (Airtable). Sin acceso a DB:
 * todo lo que decide qué se escribe y qué se marca para revisión vive acá,
 * para poder probarlo contra el CSV real sin tocar la base.
 *
 * Criterio general: conservador. Si el texto de tarifas no es inequívoco (varias
 * tarifas, sin unidad, mezcla de tarifa fija y revenue share) NO se inventa un
 * valor tipado — se guarda el texto crudo y se marca el motivo en `flags`.
 */

export type RateUnit = "PER_HOUR" | "PER_PLAYER" | "FLAT_FEE";
export type PricingModel = "FIXED_RATE" | "REVENUE_SHARE";

export function normKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

// ---------- Columnas del Sheet (con corrimientos) ----------
export type SheetCells = {
  facilityName: string;
  market: string;
  facilityType: string;
  pricing: string;
  address: string;
  rest: string[]; // desde "Field Type" en adelante, sin normalizar
};

export type ParsedTail = {
  indoorOutdoor: "INDOOR" | "OUTDOOR" | "MIXED" | null;
  fieldTypeNotes: string[]; // "Futsal", "Event Venue"…
  website: string | null;
  isActive: boolean;
  flags: string[];
};

// Algunas filas tienen la dirección vacía y todo lo siguiente corrido hacia
// la derecha (URL en "Field Type", Indoor/Outdoor en "Active facility",
// "checked" en una columna sin nombre). En vez de asumir posiciones se
// clasifica cada celda por lo que ES.
export function parseTail(rest: string[]): ParsedTail {
  const flags: string[] = [];
  let website: string | null = null;
  let active = false;
  const io = new Set<"INDOOR" | "OUTDOOR">();
  const notes: string[] = [];
  for (const raw of rest) {
    const cell = raw.trim();
    if (!cell) continue;
    if (/^checked$/i.test(cell)) { active = true; continue; }
    if (/^https?:\/\//i.test(cell) || /^www\./i.test(cell)) { website = cell; flags.push("fila corrida (URL en Field Type)"); continue; }
    if (/@/.test(cell) && !/\s/.test(cell) && cell.includes(".")) { notes.push(cell); flags.push("fila corrida (email en Field Type)"); continue; }
    for (const part of cell.split(/[,/]/).map((p) => p.trim()).filter(Boolean)) {
      if (/^indoor$/i.test(part)) io.add("INDOOR");
      else if (/^outdoor$/i.test(part)) io.add("OUTDOOR");
      else notes.push(part);
    }
  }
  const indoorOutdoor = io.size === 2 ? "MIXED" : io.has("INDOOR") ? "INDOOR" : io.has("OUTDOOR") ? "OUTDOOR" : null;
  return { indoorOutdoor, fieldTypeNotes: notes, website, isActive: active, flags };
}

export function parseFacilityTypes(raw: string): string[] {
  return Array.from(new Set(raw.split(",").map((t) => t.trim()).filter(Boolean)));
}

// ---------- Dirección ----------
export type ParsedAddress = { address: string | null; city: string | null; state: string | null; postalCode: string | null; flags: string[] };

export function parseAddress(raw: string): ParsedAddress {
  const address = raw.replace(/\s*\n\s*/g, ", ").replace(/\s+/g, " ").trim();
  if (!address) return { address: null, city: null, state: null, postalCode: null, flags: ["sin dirección"] };
  const flags: string[] = [];
  // "…, Ciudad, ST 12345" (US) o "…, Toronto, ON M5V 3A8" (Canadá)
  const m = address.match(/(?:^|,)\s*([^,]+?),\s*([A-Z]{2})\s+([A-Z0-9]{3,5}(?:[ -][A-Z0-9]{3,4})?)\s*(?:,\s*(?:USA|US|Canada))?$/);
  if (!m) return { address, city: null, state: null, postalCode: null, flags: ["dirección sin formato Ciudad, ST ZIP"] };
  let city: string | null = m[1].trim();
  const state = m[2];
  const postalCode = m[3];
  if (/\d/.test(city)) {
    // "680 Lee St SW Atlanta" (sin coma antes de la ciudad) o plus-code
    // ("QPFX+MJ Decatur"): no hay forma confiable de separar la ciudad.
    flags.push("ciudad no separable (zona por ZIP)");
    city = null;
  }
  if (!/^\d{5}$/.test(postalCode)) flags.push("ZIP no estándar US (¿Canadá?)");
  return { address, city, state, postalCode, flags };
}

// ---------- Tarifas ----------
export type ParsedPricing = {
  model: PricingModel | null;
  fixedRate: number | null;
  rateUnit: RateUnit | null;
  revenueSharePct: number | null;
  flags: string[];
};

function toNum(s: string): number {
  // "95,5" → 95.5 ; "1,200" → 1200
  const t = s.trim();
  if (/^\d+,\d{1,2}$/.test(t)) return parseFloat(t.replace(",", "."));
  return parseFloat(t.replace(/,/g, ""));
}

function unitAfter(text: string, idx: number): RateUnit | null {
  const ctx = text.slice(idx, idx + 28).toLowerCase();
  if (/^\s*(\/|per\s+|an?\s+|each\s+)?\s*(player|jugador|head)\b/.test(ctx)) return "PER_PLAYER";
  if (/^\s*(\/|per\s+|an?\s+)?\s*(hr|hour|hours|h)\b/.test(ctx)) return "PER_HOUR";
  if (/^\s*(hr|hour)\b/.test(ctx)) return "PER_HOUR";
  if (/^\s*(\/|\s)\s*flat/.test(ctx) || /^\s*flat/.test(ctx)) return "FLAT_FEE";
  return null;
}

export function parsePricing(raw: string | null | undefined): ParsedPricing {
  const text = (raw ?? "").replace(/ /g, " ").trim();
  const flags: string[] = [];
  const out: ParsedPricing = { model: null, fixedRate: null, rateUnit: null, revenueSharePct: null, flags };
  if (!text) { flags.push("sin tarifa"); return out; }

  if (/^free$/i.test(text)) { out.model = "FIXED_RATE"; out.fixedRate = 0; out.rateUnit = "FLAT_FEE"; flags.push("gratis"); return out; }

  // Revenue share: el % que corresponde a Plei.
  const shareContext = /rev(enue)?[\s-]*share|split|% of revenue|\breceive\s+\d|\bplei\b[^\n]{0,30}\d+(\.\d+)?\s*%|\d+(\.\d+)?\s*%[^\n]{0,40}\bplei\b/i.test(text);
  let share: number | null = null;
  if (shareContext) {
    const after = text.match(/\bplei\b[^\n%$]{0,30}?(\d{1,2}(?:\.\d+)?)\s*%/i);
    const before = text.match(/(\d{1,2}(?:\.\d+)?)\s*%[^\n]{0,40}\bplei\b/i);
    const generic = text.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*of\s*revenue/i);
    // "N% of revenue" sin nombrar a Plei no dice de quién es el N%.
    const hit = after ?? before ?? (/\bplei\b/i.test(text) ? generic : null);
    if (hit) share = parseFloat(hit[1]);
    else flags.push("revenue share sin % para Plei (¿formato A/B?)");
  }

  // Montos en USD con su unidad.
  const amounts: { value: number; unit: RateUnit | null }[] = [];
  const re = /\$\s*(\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) amounts.push({ value: toNum(m[1]), unit: unitAfter(text, m.index + m[0].length) });
  const distinct = new Set(amounts.map((a) => `${a.value}|${a.unit}`));

  if (share !== null) out.revenueSharePct = share;
  if (share !== null && amounts.length === 0) out.model = "REVENUE_SHARE";
  else if (share !== null && amounts.length > 0) flags.push("mezcla revenue share y montos fijos (revisar)");

  if (share === null && amounts.length > 0) {
    const simple = text.split("\n").filter((l) => l.trim()).length === 1 && text.length <= 60 && !/\bor\b|resident|\d+\s*(w\/|without|with)/i.test(text);
    if (distinct.size === 1 && !simple) {
      flags.push("un solo monto pero con condiciones (no se tipifica)");
    } else if (distinct.size === 1) {
      const a = amounts[0];
      if (a.unit) { out.model = "FIXED_RATE"; out.fixedRate = a.value; out.rateUnit = a.unit; }
      else flags.push("monto sin unidad (hora/jugador)");
    } else {
      flags.push("varias tarifas (peak/off-peak, por cancha o por formato)");
    }
  }
  if (share === null && amounts.length === 0) flags.push("sin monto ni % reconocible");

  if (text.split("\n").filter((l) => l.trim()).length > 1 || text.length > 90 ||
      /discount|\boff\b|launch|promo|coupon|free\b|peak/i.test(text)) {
    flags.push("tiene notas/condiciones");
  }
  return out;
}
