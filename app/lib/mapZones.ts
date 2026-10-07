// Agrupación pura (sin DB) de facilities en zonas para el mapa. Vive aparte de
// app/lib/db/map.ts para poder probarla sin Prisma.

export type MapFacility = {
  id: string;
  name: string;
  marketName: string;
  regionName: string;
  latitude: number;
  longitude: number;
  approximate: boolean; // true = punto aproximado (centro del ZIP/ciudad)
  city: string | null;
  state: string | null;
  postalCode: string | null;
  confirmedGames: number;
  cancelledGames: number;
  demandCancelledGames: number; // cancelados que hablan de demanda (base de confirmationRate)
  scheduledGames: number; // publicados = confirmados + cancelados
  confirmationRate: number | null; // % de demanda
  revenue: number;
  fields: number | null; // canchas distintas con partidos en el período
  gamesPerField: number | null; // confirmados / canchas
};

export type MapZone = {
  key: string;
  label: string; // "Doral, FL"
  latitude: number; // centroide ponderado por partidos confirmados
  longitude: number;
  facilities: MapFacility[]; // ordenadas por confirmados desc
  confirmedGames: number;
  cancelledGames: number;
  demandCancelledGames: number;
  scheduledGames: number;
  confirmationRate: number | null;
  revenue: number;
  fields: number | null;
  gamesPerField: number | null;
  approximateShare: number; // fracción de facilities con punto aproximado
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Clave y etiqueta de zona: ciudad + estado; si no hay ciudad, ZIP; si tampoco, el market. */
export function zoneOf(f: Pick<MapFacility, "city" | "state" | "postalCode" | "marketName">): { key: string; label: string } {
  const state = (f.state ?? "").trim().toUpperCase();
  const city = (f.city ?? "").trim();
  if (city) return { key: `c|${city.toLowerCase()}|${state}`, label: state ? `${titleCase(city)}, ${state}` : titleCase(city) };
  if (f.postalCode) return { key: `z|${f.postalCode}`, label: `ZIP ${f.postalCode}` };
  return { key: `m|${f.marketName.toLowerCase()}`, label: f.marketName };
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export function buildZones(facilities: MapFacility[]): MapZone[] {
  const byZone = new Map<string, { label: string; items: MapFacility[] }>();
  for (const f of facilities) {
    const z = zoneOf(f);
    const entry = byZone.get(z.key) ?? { label: z.label, items: [] };
    entry.items.push(f);
    byZone.set(z.key, entry);
  }
  const zones: MapZone[] = [];
  for (const [key, { label, items }] of byZone) {
    items.sort((a, b) => b.confirmedGames - a.confirmedGames || a.name.localeCompare(b.name));
    const confirmed = items.reduce((s, f) => s + f.confirmedGames, 0);
    const cancelled = items.reduce((s, f) => s + f.cancelledGames, 0);
    const demandCancelled = items.reduce((s, f) => s + f.demandCancelledGames, 0);
    const weight = (f: MapFacility) => (confirmed > 0 ? f.confirmedGames : 1);
    const wSum = items.reduce((s, f) => s + weight(f), 0) || 1;
    const latitude = items.reduce((s, f) => s + f.latitude * weight(f), 0) / wSum;
    const longitude = items.reduce((s, f) => s + f.longitude * weight(f), 0) / wSum;
    const withFields = items.filter((f) => f.fields !== null && f.fields > 0);
    const fields = withFields.length > 0 ? withFields.reduce((s, f) => s + (f.fields ?? 0), 0) : null;
    // Juegos por cancha de la zona: solo con las facilities que tienen cancha identificada,
    // para no inflar el ratio dividiendo partidos de todas por canchas de algunas.
    const gamesPerField = fields ? withFields.reduce((s, f) => s + f.confirmedGames, 0) / fields : null;
    zones.push({
      key, label, latitude, longitude, facilities: items,
      confirmedGames: confirmed, cancelledGames: cancelled, demandCancelledGames: demandCancelled, scheduledGames: confirmed + cancelled,
      confirmationRate: ratio(confirmed, confirmed + demandCancelled),
      revenue: items.reduce((s, f) => s + f.revenue, 0),
      fields, gamesPerField,
      approximateShare: items.filter((f) => f.approximate).length / items.length,
    });
  }
  return zones.sort((a, b) => b.confirmedGames - a.confirmedGames || a.label.localeCompare(b.label));
}
