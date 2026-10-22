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
import { extractFieldName } from "./lib/fieldName";
import { categorizeCancellation } from "./lib/cancellation";
import fs from "fs";
import path from "path";
import { notifyRevalidate } from "./lib/revalidate";

const prisma = new PrismaClient();

type CsvRow = {
  "Game ID": string;
  "Location": string;
  "Field": string;
  "Region": string; // = Market en nuestro modelo
  "Division": string; // = Region (East/West) en nuestro modelo
  "Organizer": string;
  "Date": string;
  "Time": string;
  "Day of the Week": string;
  "Game Size": string;
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

// Extrae el tipo/nombre de cancha de la columna "Field", cuando el dato
// tiene especificidad real — descarta lo que es solo un identificador
// (ej "Field #1", "Field #6", "2C", "J1") y deja esos casos en null (solo
// queda el Game Size para esa fila). Lógica validada contra los ~200.000
// valores reales del CSV de septiembre 2026 antes de aplicarla acá.
const FORMAT_TOKEN = /\d{1,2}\s*v\s*\d{1,2}/gi;
const CODE_FIELD = /\b[\da-z]{1,3}\s*fields?\b/gi; // "2C Field" (código ANTES de "Field")
const FIELD_IDENTIFIER = /\bfields?\s*#?\s*[\da-z]{1,3}\b/gi; // "Field #1", "Field A"
const KNOWN_REGION_LEAKAGE = new Set(["east", "west", "north", "south"]);
const BARE_CODE = /^[a-z]{1,2}\d{1,2}$|^\d{1,2}[a-z]{1,2}$|^\d{1,3}$/i;
const TRAILING_CODE = /\s+[a-z]{0,2}\d{1,3}[a-z]{0,2}$/i;

function cleanParensContent(full: string, inner: string): string {
  let stripped = inner.replace(FORMAT_TOKEN, "");
  stripped = stripped.replace(/[/\-&\s]+/g, "");
  if (stripped === "" || BARE_CODE.test(stripped.trim())) return " ";
  return `(${inner})`;
}

function extractFieldType(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  if (KNOWN_REGION_LEAKAGE.has(s.toLowerCase())) return null;

  s = s.replace(/\(([^)]*)\)/g, (full, inner) => cleanParensContent(full, inner));
  // Orden importa: el formato (ej "8v8") se saca ANTES de CODE_FIELD, si no
  // "8v8 Field" se confunde con un código de cancha de 3 caracteres.
  s = s.replace(FORMAT_TOKEN, " ");
  s = s.replace(CODE_FIELD, " ");
  s = s.replace(FIELD_IDENTIFIER, " ");
  s = s.replace(/[()]/g, " ");
  s = s.replace(/[/&]/g, " ");
  s = s.replace(/#\s*\d+\b/g, " ");
  s = s.replace(/-\s*\d+\b/g, " "); // "- 1", "- 2" sueltos de "6v6 - (1)"
  s = s.replace(/\s+/g, " ").trim().replace(/^[\s\-,]+|[\s\-,]+$/g, "");

  if (!s || BARE_CODE.test(s)) return null;

  // Sacar número/código de cancha pegado al final ("Turf Field 2" -> "Turf Field")
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(TRAILING_CODE, "").trim();
  }

  if (!s || BARE_CODE.test(s)) return null;
  return s;
}

// Normaliza las 291 variantes de texto libre del CSV en categorías
// consistentes y accionables para el motor de insights.

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


// Antes de leer el CSV: ¿la base tiene el esquema que este código espera? Un import contra una base a la que le
// faltan migraciones fallaba recién en el createMany (enum sin el valor nuevo) después de leer y procesar todo el
// archivo. Los valores de enum que faltan son fatales (el import no puede escribir); las migraciones pendientes
// en general solo avisan, porque no todas afectan al import.
async function checkSchema() {
  const labels = (await prisma.$queryRaw<{ label: string }[]>`SELECT unnest(enum_range(NULL::"CancellationCategory"))::text AS label`).map((r) => r.label);
  const missing = Object.values(CancellationCategory).filter((v) => !labels.includes(v));
  let pending: string[] = [];
  try {
    const applied = new Set((await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`).map((r) => r.migration_name));
    const dir = path.join(__dirname, "..", "prisma", "migrations");
    pending = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !applied.has(d.name)).map((d) => d.name).sort();
  } catch {
    // sin tabla de migraciones (base no gestionada por migrate): no se puede comparar
  }
  if (pending.length > 0) {
    console.warn(`AVISO: a la base le faltan ${pending.length} migración(es): ${pending.join(", ")}.`);
  }
  if (missing.length > 0) {
    console.error(`La base no tiene los valores ${missing.join(", ")} del enum CancellationCategory: está desactualizada respecto del código.`);
    console.error(`Aplicá las migraciones a ESA base y volvé a correr el import:  npx prisma migrate deploy  (con su DATABASE_URL / DIRECT_URL).`);
    process.exit(1);
  }
}

async function main() {
  await checkSchema();
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
    gameSize: string | null;
    fieldType: string | null;
    fieldName: string | null;
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
  const UPSERT_CONCURRENCY = 15; // por debajo del pool de conexiones de Prisma (connection_limit por defecto: 21 en este equipo)
  let totalSynced = 0;

  async function flushBatch() {
    if (pendingGames.length === 0) return;
    const ids = pendingGames.map((g) => g.id);

    // Upsert real en bloque, sin SQL crudo: borramos del lote los partidos
    // que ya existían (si los hay) y reinsertamos el lote entero. El efecto
    // neto es insertar los nuevos y actualizar los que cambiaron, en dos
    // operaciones masivas — no una por fila.
    //
    // Excepción: un partido con al menos una GameReview asociada NO se
    // puede borrar (game_reviews.gameId es RESTRICT — Postgres rechaza el
    // delete si hay una review colgando de ese id, y cascadear el delete
    // borraría reviews reales de jugadores cada vez que ese partido se
    // resincroniza, que es justo lo que no queremos). Para esos, en vez de
    // borrar+reinsertar, se actualiza cada uno individualmente — no rompe
    // la relación porque el id nunca deja de existir. Es más lento que el
    // camino en bloque, pero solo aplica a los partidos que ya tienen
    // reviews cargadas, no a todo el lote.
    // Tipo explícito por el mismo motivo que el resto de app/lib/db/*.ts: el
    // cliente de Prisma generado en este sandbox está desactualizado y
    // devuelve `any`, lo que arrastraría un implicit-any al callback de abajo.
    const reviewed = (await prisma.gameReview.findMany({
      where: { gameId: { in: ids } },
      select: { gameId: true },
      distinct: ["gameId"],
    })) as { gameId: number }[];
    const reviewedIds = new Set(reviewed.map((r) => r.gameId));

    const byId = new Map(pendingGames.map((g) => [g.id, g]));
    const safeToDeleteIds = ids.filter((id) => !reviewedIds.has(id));
    const mustUpdateIds = ids.filter((id) => reviewedIds.has(id));
    let toDeleteNow = safeToDeleteIds;

    if (toDeleteNow.length > 0) {
      // Borrar + reinsertar en UNA transacción: si el createMany falla (ej. un valor de enum que la
      // base todavía no conoce), el delete se revierte y los partidos quedan como estaban. Antes eran
      // dos operaciones sueltas y una falla en la segunda dejaba el lote borrado hasta el próximo import.
      // Si Postgres rechaza el delete por la FK de game_reviews (una review cargada entre el chequeo de
      // arriba y el delete, p. ej. otro import corriendo en paralelo), la transacción se revierte entera y
      // el lote se sincroniza fila por fila con upsert, que nunca borra el id.
      try {
        const [, created] = await prisma.$transaction([
          prisma.game.deleteMany({ where: { id: { in: toDeleteNow } } }),
          prisma.game.createMany({ data: toDeleteNow.map((id) => byId.get(id)!) }),
        ]);
        totalSynced += created.count;
        toDeleteNow = [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/game_reviews_gameId_fkey|23001|P2003/.test(msg)) throw err;
        console.warn(`  AVISO: ${toDeleteNow.length} partidos tienen reviews (FK game_reviews) — se sincronizan fila por fila.`);
      }
    }

    const upsertIds = [...mustUpdateIds, ...toDeleteNow];
    if (upsertIds.length > 0) {
      // upsert (no update) por si alguna vez aparece una review para un id
      // que todavía no llegó a crearse como Game — no debería pasar en la
      // práctica, pero así no revienta si pasa.
      // En tandas de UPSERT_CONCURRENCY: lanzar ~1000 upserts a la vez contra un pool de ~21 conexiones
      // hace que los últimos esperen más del timeout del pool (P2024) cuando la base responde lento.
      for (let i = 0; i < upsertIds.length; i += UPSERT_CONCURRENCY) {
        await Promise.all(
          upsertIds.slice(i, i + UPSERT_CONCURRENCY).map((id) => {
            const game = byId.get(id)!;
            const { id: _id, ...updateData } = game; // id va en el `where`, no hace falta repetirlo en `update`
            return prisma.game.upsert({ where: { id }, create: game, update: updateData });
          })
        );
      }
      totalSynced += upsertIds.length;
    }

    console.log(`  ${totalSynced} partidos sincronizados... (${upsertIds.length} actualizados fila por fila por tener reviews)`);
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
      gameSize: row["Game Size"]?.trim() || null,
      fieldType: extractFieldType(row["Field"]),
      fieldName: extractFieldName(row["Field"]),
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
  await notifyRevalidate();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
