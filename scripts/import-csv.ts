/**
 * Sincroniza el CSV de eventos (export de Hex) con la base de datos.
 *
 * Uso:
 *   npx tsx scripts/import-csv.ts /ruta/al/archivo.csv
 *
 * Requiere DATABASE_URL y DIRECT_URL configuradas en .env (ver SETUP.md).
 * Es un upsert real: si un partido ya existía y algo cambió (por ejemplo,
 * el rating se cargó recién ahora, días después de jugado), la nueva
 * corrida lo actualiza — no lo deja pisado con el dato viejo para siempre.
 * Seguro de correr las veces que haga falta.
 */

import { PrismaClient, CancellationCategory, GameStatus } from "@prisma/client";
import { parse } from "csv-parse/sync";
import fs from "fs";

const prisma = new PrismaClient();

type CsvRow = {
  "Game ID": string;
  "Location": string;
  "Region": string; // = Market en nuestro modelo
  "Division": string; // = Region (East/West) en nuestro modelo
  "Organizer": string;
  "Date": string;
  "Time": string;
  "Day of the Week": string;
  "Min Players": string;
  "Max Players": string;
  "Final Players": string;
  "Waitlist Players": string;
  "Dropped Players": string;
  "Status": string;
  "Players Missing": string;
  "Cancellation Reason": string;
  "Confirmation Lead Time": string;
  "Event Revenue": string;
  "Game Price": string;
  "Revenue per Player": string;
  "Rating Count": string;
  "Average Rating": string;
};

// Normaliza las 291 variantes de texto libre del CSV en categorías
// consistentes y accionables para el motor de insights.
function categorizeCancellation(raw: string | undefined | null): CancellationCategory | null {
  if (!raw) return null;
  const r = raw.trim().toLowerCase();
  if (!r || r === "na" || r === "n/a") return CancellationCategory.OTHER;

  if (r.includes("not enough players") || r.includes("last minute drop")) {
    return CancellationCategory.NOT_ENOUGH_PLAYERS;
  }
  if (r.includes("field time") || r.includes("facility") || r.includes("contact with the facility")) {
    return CancellationCategory.FACILITY_UNAVAILABLE;
  }
  if (r.includes("weather")) {
    return CancellationCategory.WEATHER;
  }
  if (r.includes("maintenance") || r.includes("construction")) {
    return CancellationCategory.MAINTENANCE;
  }
  if (r.includes("holiday")) {
    return CancellationCategory.HOLIDAY;
  }
  return CancellationCategory.OTHER;
}

function toIntOrNull(v: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloatOrNull(v: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Uso: npx tsx scripts/import-csv.ts /ruta/al/archivo.csv");
    process.exit(1);
  }

  const raw = fs.readFileSync(path, "utf-8");
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true });

  console.log(`Leídas ${rows.length} filas. Importando...`);

  // 1) Regiones (East/West) y Markets, deduplicados
  const regionCache = new Map<string, string>(); // name -> id
  const marketCache = new Map<string, string>(); // "region|market" -> id
  const facilityCache = new Map<string, string>(); // "market|facility" -> id

  let skipped = 0;
  type GameRow = {
    id: number;
    facilityId: string;
    organizer: string;
    date: Date;
    time: string;
    dayOfWeek: string;
    minPlayers: number;
    maxPlayers: number;
    finalPlayers: number;
    waitlistPlayers: number;
    droppedPlayers: number;
    status: GameStatus;
    playersMissing: number | null;
    cancellationReasonRaw: string | null;
    cancellationCategory: CancellationCategory | null;
    confirmationLeadTime: number | null;
    eventRevenue: number | null;
    gamePrice: number | null;
    revenuePerPlayer: number | null;
    ratingCount: number | null;
    averageRating: number | null;
  };
  const pendingGames: GameRow[] = [];
  const BATCH_SIZE = 2000;
  let totalSynced = 0;

  async function flushBatch() {
    if (pendingGames.length === 0) return;
    const ids = pendingGames.map((g) => g.id);

    // Upsert real en bloque, sin SQL crudo: borramos del lote los partidos
    // que ya existían (si los hay) y reinsertamos el lote entero. El efecto
    // neto es insertar los nuevos y actualizar los que cambiaron, en dos
    // operaciones masivas — no una por fila.
    await prisma.game.deleteMany({ where: { id: { in: ids } } });
    const result = await prisma.game.createMany({ data: pendingGames });

    totalSynced += result.count;
    console.log(`  ${totalSynced} partidos sincronizados...`);
    pendingGames.length = 0;
  }

  console.log("Paso 1/2: resolviendo regiones, markets y facilities...");

  for (const row of rows) {
    const regionName = row["Division"]?.trim();
    const marketName = row["Region"]?.trim();
    const facilityName = row["Location"]?.trim();
    const gameId = toIntOrNull(row["Game ID"]);

    if (!regionName || !marketName || !facilityName || gameId === null) {
      skipped++;
      continue;
    }

    // Region
    let regionId: string;
    const cachedRegionId = regionCache.get(regionName);
    if (cachedRegionId) {
      regionId = cachedRegionId;
    } else {
      const region = await prisma.region.upsert({
        where: { name: regionName },
        update: {},
        create: { name: regionName },
      });
      regionId = region.id;
      regionCache.set(regionName, regionId);
    }

    // Market
    const marketKey = `${regionName}|${marketName}`;
    let marketId: string;
    const cachedMarketId = marketCache.get(marketKey);
    if (cachedMarketId) {
      marketId = cachedMarketId;
    } else {
      const market = await prisma.market.upsert({
        where: { name_regionId: { name: marketName, regionId } },
        update: {},
        create: { name: marketName, regionId },
      });
      marketId = market.id;
      marketCache.set(marketKey, marketId);
    }

    // Facility
    const facilityKey = `${marketId}|${facilityName}`;
    let facilityId: string;
    const cachedFacilityId = facilityCache.get(facilityKey);
    if (cachedFacilityId) {
      facilityId = cachedFacilityId;
    } else {
      const facility = await prisma.facility.upsert({
        where: { name_marketId: { name: facilityName, marketId } },
        update: {},
        create: { name: facilityName, marketId },
      });
      facilityId = facility.id;
      facilityCache.set(facilityKey, facilityId);
    }

    const status = row["Status"]?.trim().toLowerCase() === "confirmed"
      ? GameStatus.CONFIRMED
      : GameStatus.CANCELLED;

    pendingGames.push({
      id: gameId,
      facilityId,
      organizer: row["Organizer"]?.trim() || "Unknown",
      date: new Date(row["Date"]),
      time: row["Time"]?.trim() || "",
      dayOfWeek: row["Day of the Week"]?.trim() || "",
      minPlayers: toIntOrNull(row["Min Players"]) ?? 0,
      maxPlayers: toIntOrNull(row["Max Players"]) ?? 0,
      finalPlayers: toIntOrNull(row["Final Players"]) ?? 0,
      waitlistPlayers: toIntOrNull(row["Waitlist Players"]) ?? 0,
      droppedPlayers: toIntOrNull(row["Dropped Players"]) ?? 0,
      status,
      playersMissing: toIntOrNull(row["Players Missing"]),
      cancellationReasonRaw: row["Cancellation Reason"]?.trim() || null,
      cancellationCategory: categorizeCancellation(row["Cancellation Reason"]),
      confirmationLeadTime: toFloatOrNull(row["Confirmation Lead Time"]),
      eventRevenue: toFloatOrNull(row["Event Revenue"]),
      gamePrice: toFloatOrNull(row["Game Price"]),
      revenuePerPlayer: toFloatOrNull(row["Revenue per Player"]),
      ratingCount: toIntOrNull(row["Rating Count"]),
      averageRating: toFloatOrNull(row["Average Rating"]),
    });

    // Cuando junta un lote completo, lo inserta de una sola vez.
    if (pendingGames.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  console.log("Paso 2/2: sincronizando el último lote...");
  await flushBatch(); // el resto de filas que no llegó a completar un lote

  console.log(`Listo. Sincronizados: ${totalSynced}. Omitidos por datos incompletos: ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
