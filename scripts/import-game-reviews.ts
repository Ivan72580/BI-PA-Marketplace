/**
 * Sincroniza el CSV de reviews por partido (export del dashboard de
 * satisfacción — no es events.csv) con la base de datos.
 *
 * Uso:
 *   npx tsx scripts/import-game-reviews.ts /ruta/al/archivo.csv
 *
 * A diferencia de import-csv.ts, este CSV no trae un ID de review estable
 * (no hay columna "Review ID"), así que en vez de un ID real se usa
 * reviewKey (gameId + teléfono hasheado + fecha, ver scripts/lib/reviewKeys.ts)
 * para identificar "la misma review" entre una exportación y la siguiente.
 * Es un upsert real, igual criterio que import-csv.ts usa para Game:
 *   - reviewKey ya existe → se actualiza (rating/tags/reviewText pueden
 *     haber cambiado, ej. una edición).
 *   - reviewKey nuevo → se agrega.
 *   - Una review que ya teníamos y no aparece en este archivo (típico de
 *     un export incremental más chico, por rango de fecha) queda como
 *     está — este script nunca borra filas que no vinieron en el CSV.
 * Correr esto de nuevo con el mismo archivo, o con un export más grande o
 * más chico, siempre da el mismo resultado (idempotente).
 *
 * El teléfono del jugador NUNCA se guarda en texto plano (decisión de
 * Ivan, 25 sep 2026) — se hashea antes de tocar la base.
 *
 * Requiere que los partidos ya existan (correr antes npm run db:import).
 * Requiere DATABASE_URL y DIRECT_URL en .env.
 */

import { PrismaClient, GameReviewTag } from "@prisma/client";
import { parse } from "csv-parse/sync";
import fs from "fs";
import { hashPhone, gameReviewKey } from "./lib/reviewKeys";

const prisma = new PrismaClient();

type CsvRow = {
  "Date": string;
  "Rating": string;
  "Tags": string;
  "Review Text": string;
  "Game ID": string;
  "Game Date": string;
  "Average Game Rating": string;
  "Game": string;
  "Organizer": string;
  "Region": string; // = Market en nuestro modelo
  "Location": string; // = Facility en nuestro modelo
  "Player Phone": string;
};

// Catálogo cerrado real al 25 sep 2026 (9 valores, ver mapa de campos en
// el Project) — "Wasn't/Wasn't Competitive" trae dos variantes de tilde en
// el CSV de origen, ambas se normalizan al mismo tag.
const TAG_MAP: Record<string, GameReviewTag> = {
  "friendly players": GameReviewTag.FRIENDLY_PLAYERS,
  "competitive game": GameReviewTag.COMPETITIVE_GAME,
  "wasn't competitive": GameReviewTag.NOT_COMPETITIVE,
  "wasn’t competitive": GameReviewTag.NOT_COMPETITIVE,
  "good players": GameReviewTag.GOOD_PLAYERS,
  "issues with other players": GameReviewTag.ISSUES_WITH_OTHER_PLAYERS,
  "field quality was great": GameReviewTag.FIELD_QUALITY_GREAT,
  "field quality was good": GameReviewTag.FIELD_QUALITY_GOOD,
  "issues with field conditions": GameReviewTag.FIELD_CONDITIONS_ISSUES,
};

function parseTags(raw: string): GameReviewTag[] {
  if (!raw?.trim()) return [];
  const tags: GameReviewTag[] = [];
  for (const part of raw.split(";")) {
    const tag = TAG_MAP[part.trim().toLowerCase()];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

type PendingRow = {
  gameId: number;
  date: Date;
  rating: number;
  tags: GameReviewTag[];
  reviewText: string | null;
  playerPhoneHash: string | null;
  reviewKey: string;
};

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Uso: npx tsx scripts/import-game-reviews.ts /ruta/al/archivo.csv");
    process.exit(1);
  }

  const raw = fs.readFileSync(path, "utf-8");
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true });
  console.log(`Leídas ${rows.length} filas. Importando...`);

  console.log("Cargando IDs de partidos existentes...");
  const existingGames = (await prisma.game.findMany({ select: { id: true } })) as { id: number }[];
  const existingGameIds = new Set(existingGames.map((g) => g.id));

  // Map en vez de array: si dos filas del MISMO archivo caen en el mismo
  // reviewKey (puede pasar — el mismo jugador reseñando el mismo partido el
  // mismo día más de una vez), se quedan con la última en vez de mandar dos
  // filas con la misma clave única a createMany, que rompería todo el lote
  // con un error de constraint.
  const pending = new Map<string, PendingRow>();
  const BATCH_SIZE = 2000;
  let totalNuevas = 0;
  let totalActualizadas = 0;
  let skippedNoGame = 0;
  let skippedBadData = 0;

  async function flushBatch() {
    if (pending.size === 0) return;
    const rows = Array.from(pending.values());
    const keys = Array.from(pending.keys());

    // Upsert real en bloque, mismo patrón que import-csv.ts para Game:
    // contamos cuántas de estas claves ya existían (para reportar
    // nuevas/actualizadas por separado), borramos esas filas del lote y
    // reinsertamos el lote entero — el efecto neto es insertar lo nuevo y
    // actualizar lo que cambió, en operaciones masivas.
    const existingCount = await prisma.gameReview.count({ where: { reviewKey: { in: keys } } });
    await prisma.gameReview.deleteMany({ where: { reviewKey: { in: keys } } });
    const result = await prisma.gameReview.createMany({ data: rows });

    totalActualizadas += existingCount;
    totalNuevas += result.count - existingCount;
    console.log(`  ${totalNuevas} nuevas, ${totalActualizadas} actualizadas...`);
    pending.clear();
  }

  for (const row of rows) {
    const gameId = toIntOrNull(row["Game ID"]);
    const rating = toIntOrNull(row["Rating"]);
    if (gameId === null || rating === null) {
      skippedBadData++;
      continue;
    }
    if (!existingGameIds.has(gameId)) {
      // El partido tiene que existir ya (viene de events.csv) — si no,
      // queda huérfana y se omite; reintentable corriendo este import de
      // nuevo después de sincronizar events.csv.
      skippedNoGame++;
      continue;
    }

    const reviewKey = gameReviewKey({ gameId: row["Game ID"], date: row["Date"], playerPhone: row["Player Phone"] });
    pending.set(reviewKey, {
      gameId,
      date: new Date(row["Date"]),
      rating,
      tags: parseTags(row["Tags"]),
      reviewText: row["Review Text"]?.trim() || null,
      playerPhoneHash: hashPhone(row["Player Phone"]),
      reviewKey,
    });

    if (pending.size >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  console.log(
    `Listo. Nuevas: ${totalNuevas}. Actualizadas: ${totalActualizadas}. Omitidas (Game inexistente): ${skippedNoGame}. Omitidas (datos incompletos): ${skippedBadData}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
