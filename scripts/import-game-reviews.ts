/**
 * Sincroniza el CSV de reviews por partido (export del dashboard de
 * satisfacción — no es events.csv) con la base de datos.
 *
 * Uso:
 *   npx tsx scripts/import-game-reviews.ts /ruta/al/archivo.csv
 *
 * A diferencia de import-csv.ts, este CSV no trae un ID de review estable
 * (no hay columna "Review ID"), así que el dedupe NO es por ID: cada fila
 * se hashea (Game ID + fecha + rating + tags + texto + teléfono-hasheado) y
 * se inserta con skipDuplicates. Efecto práctico:
 *   - Correr esto de nuevo con el mismo archivo, o con un export más
 *     grande que lo incluya (resync completo) → nunca duplica.
 *   - Un export más chico y acotado por fecha (solo lo nuevo) → agrega
 *     justo esas filas.
 *   - Limitación conocida: si una review se edita después de exportada, el
 *     hash cambia y queda como fila nueva en vez de actualizar la vieja —
 *     no hay forma de distinguir "edición" de "review nueva" sin un ID real
 *     en el CSV de origen. Poco frecuente en la práctica, pero vale saberlo.
 *
 * El teléfono del jugador NUNCA se guarda en texto plano (decisión de
 * Ivan, 25 sep 2026) — se hashea antes de tocar la base, y ese mismo hash
 * es el que entra al hash de contenido (así tampoco queda de paso en el
 * sourceHash).
 *
 * Requiere que los partidos ya existan (correr antes npm run db:import).
 * Requiere DATABASE_URL y DIRECT_URL en .env.
 */

import { PrismaClient, GameReviewTag } from "@prisma/client";
import { parse } from "csv-parse/sync";
import fs from "fs";
import crypto from "crypto";

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

// Normaliza el teléfono ANTES de hashear, para que el mismo número real
// siempre produzca el mismo hash aunque el formato de texto varíe entre
// filas o entre exports. Se queda solo con los dígitos y, si el resultado
// tiene 10 dígitos (el caso del 99.7% de las filas — EE.UU. sin código de
// país), le agrega el "1" — mismo criterio que usa el resto del dataset
// (+1XXXXXXXXXX). Números de otros países ya vienen con su código y se
// dejan como están.
function hashPhone(raw: string | undefined): string | null {
  const digits = raw?.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function sourceHash(row: CsvRow): string {
  const parts = [row["Game ID"], row["Date"], row["Rating"], row["Tags"], row["Review Text"], hashPhone(row["Player Phone"]) ?? ""];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

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

  type PendingRow = {
    gameId: number;
    date: Date;
    rating: number;
    tags: GameReviewTag[];
    reviewText: string | null;
    playerPhoneHash: string | null;
    sourceHash: string;
  };
  const pending: PendingRow[] = [];
  const BATCH_SIZE = 2000;
  let totalInserted = 0;
  let skippedNoGame = 0;
  let skippedBadData = 0;

  async function flushBatch() {
    if (pending.length === 0) return;
    const result = await prisma.gameReview.createMany({ data: pending, skipDuplicates: true });
    totalInserted += result.count;
    console.log(`  ${totalInserted} reviews nuevas insertadas...`);
    pending.length = 0;
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

    pending.push({
      gameId,
      date: new Date(row["Date"]),
      rating,
      tags: parseTags(row["Tags"]),
      reviewText: row["Review Text"]?.trim() || null,
      playerPhoneHash: hashPhone(row["Player Phone"]),
      sourceHash: sourceHash(row),
    });

    if (pending.length >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  console.log(
    `Listo. Insertadas: ${totalInserted}. Omitidas (Game inexistente): ${skippedNoGame}. Omitidas (datos incompletos): ${skippedBadData}.`
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
