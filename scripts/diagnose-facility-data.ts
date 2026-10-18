/**
 * Diagnóstico de SOLO LECTURA: cuántos perfiles/direcciones/coordenadas hay cargados y por qué
 * el mapa podría verse vacío. No escribe nada.
 *
 * Uso:
 *   npx tsx scripts/diagnose-facility-data.ts
 *   npx tsx scripts/diagnose-facility-data.ts "ruta/al/Facility_Profile_-_Sheet1.csv"   # además compara los Markets del Sheet contra los de la base
 */
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { normKey } from "./lib/facilitySheet";

const prisma = new PrismaClient();

async function main() {
  const [facilities, profiles, withAddress, withCity, withCoords, withRaw, withActive, games, gamesWithField] = await Promise.all([
    prisma.facility.count(),
    prisma.facilityProfile.count(),
    prisma.facilityProfile.count({ where: { address: { not: null } } }),
    prisma.facilityProfile.count({ where: { city: { not: null } } }),
    prisma.facilityProfile.count({ where: { latitude: { not: null } } }),
    prisma.facilityProfile.count({ where: { pricingRawText: { not: null } } }),
    prisma.facilityProfile.count({ where: { isActive: { not: null } } }),
    prisma.game.count(),
    prisma.game.count({ where: { fieldName: { not: null } } }),
  ]);
  console.log("== Conteos ==");
  console.log({ facilities, profiles, con_direccion: withAddress, con_ciudad: withCity, con_coordenadas: withCoords, con_texto_tarifa: withRaw, con_isActive: withActive });
  console.log({ partidos: games, partidos_con_fieldName: gamesWithField });

  const precision = await prisma.facilityProfile.groupBy({ by: ["geoPrecision"], _count: { _all: true } });
  console.log("\n== Precisión de coordenadas ==");
  console.log(precision.map((p) => `${p.geoPrecision ?? "sin coordenadas"}: ${p._count._all}`).join(" · "));

  const markets = await prisma.market.findMany({ select: { name: true, region: { select: { name: true } }, _count: { select: { facilities: true } } }, orderBy: { name: "asc" } });
  console.log("\n== Markets en la base (nombre · región · facilities) ==");
  for (const m of markets) console.log(`${m.name} · ${m.region.name} · ${m._count.facilities}`);

  const sample = await prisma.facilityProfile.findMany({
    take: 5, orderBy: { updatedAt: "desc" },
    select: { address: true, city: true, state: true, postalCode: true, latitude: true, longitude: true, geoPrecision: true, pricingModel: true, facility: { select: { name: true, market: { select: { name: true } } } } },
  });
  console.log("\n== 5 perfiles más recientes ==");
  for (const s of sample) console.log(JSON.stringify(s));

  const sheetPath = process.argv[2];
  if (sheetPath) {
    const rows = (parse(readFileSync(sheetPath), { columns: false, relax_column_count: true, skip_empty_lines: true }) as string[][]).slice(1);
    const dbKeys = new Set(markets.map((m) => normKey(m.name)));
    const sheetMarkets = new Map<string, number>();
    for (const r of rows) if (r[1]) sheetMarkets.set(r[1].trim(), (sheetMarkets.get(r[1].trim()) ?? 0) + 1);
    console.log("\n== Markets del Sheet que NO existen en la base (esas filas nunca matchean) ==");
    let lost = 0;
    for (const [name, n] of sheetMarkets) if (!dbKeys.has(normKey(name))) { console.log(`${name}: ${n} filas`); lost += n; }
    console.log(lost === 0 ? "(ninguno: todos los Markets del Sheet existen en la base)" : `Total de filas afectadas: ${lost}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
