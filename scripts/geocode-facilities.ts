/**
 * Resuelve latitud/longitud de cada FacilityProfile a partir de su dirección (Nominatim / OpenStreetMap).
 *
 * Uso (desde tu máquina, necesita internet):
 *   npx tsx scripts/geocode-facilities.ts                 # solo los que todavía no tienen coordenadas
 *   npx tsx scripts/geocode-facilities.ts --limit 10      # prueba con 10
 *   npx tsx scripts/geocode-facilities.ts --dry-run       # consulta y muestra, no escribe en la DB
 *   npx tsx scripts/geocode-facilities.ts --force         # reintenta también los ya resueltos (nunca los MANUAL)
 *
 * - Respeta el límite de Nominatim: 1 consulta por segundo (~10 min para ~480 facilities).
 * - Se puede cortar y volver a correr: continúa donde quedó.
 * - Cada coordenada guarda su precisión: ADDRESS (calle) o POSTAL_CODE (centro aproximado del ZIP).
 * - Si el perfil no tiene ciudad, la completa con la que devuelve Nominatim.
 * - Escribe geocode-report.csv con lo que no se pudo resolver.
 * - Opcional: GEOCODE_EMAIL=tu@mail.com (Nominatim lo pide para uso sostenido).
 */
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { buildQueries, pickResult, type NominatimHit } from "./lib/geocode";

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function search(q: string): Promise<NominatimHit[]> {
  const email = process.env.GEOCODE_EMAIL;
  const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "3", countrycodes: "us,ca" });
  if (email) params.set("email", email);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "plei-marketplace-intelligence/1.0 (internal BI tool)", "Accept-Language": "en" },
  });
  if (res.status === 429) throw new Error("Nominatim limitó las consultas (429). Esperá unos minutos y volvé a correr.");
  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
  return (await res.json()) as NominatimHit[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const li = args.indexOf("--limit");
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : undefined;

  const profiles = await prisma.facilityProfile.findMany({
    where: {
      OR: [{ address: { not: null } }, { postalCode: { not: null } }],
      NOT: { geoPrecision: "MANUAL" },
      ...(force ? {} : { latitude: null }),
    },
    select: { id: true, address: true, postalCode: true, state: true, city: true, facility: { select: { name: true, market: { select: { name: true } } } } },
    orderBy: { id: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`Facilities a geocodificar: ${profiles.length}${dryRun ? " (dry-run)" : ""}`);
  const failures: string[] = [["facility", "market", "direccion", "motivo"].map(csv).join(",")];
  let ok = 0, approx = 0, failed = 0;

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const label = `${p.facility.name} (${p.facility.market.name})`;
    let result = null;
    for (const query of buildQueries(p)) {
      const hits = await search(query.q);
      await sleep(1100);
      result = pickResult(hits, query, p.state);
      if (result) break;
    }
    if (!result) {
      failed++;
      failures.push([p.facility.name, p.facility.market.name, p.address ?? "", "sin resultado válido"].map(csv).join(","));
      console.log(`[${i + 1}/${profiles.length}] ✗ ${label}`);
      continue;
    }
    if (result.precision === "ADDRESS") ok++;
    else approx++;
    console.log(`[${i + 1}/${profiles.length}] ${result.precision === "ADDRESS" ? "✓" : "~"} ${label} → ${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)} (${result.precision})`);
    if (!dryRun) {
      await prisma.facilityProfile.update({
        where: { id: p.id },
        data: {
          latitude: result.latitude, longitude: result.longitude,
          geoPrecision: result.precision, geocodedAt: new Date(),
          ...(p.city ? {} : result.city ? { city: result.city } : {}),
        },
      });
    }
  }

  writeFileSync("geocode-report.csv", failures.join("\n"), "utf8");
  console.log(`\nListo. Exactas (dirección): ${ok} · Aproximadas (ZIP/ciudad): ${approx} · Sin resolver: ${failed}`);
  console.log("Reporte de fallidos: geocode-report.csv");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
