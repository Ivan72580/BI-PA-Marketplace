/**
 * Sincroniza el CSV de reviews de tienda de apps (iOS/Android) con la base.
 *
 * Uso:
 *   npx tsx scripts/import-app-reviews.ts /ruta/al/archivo.csv
 *
 * Mismo criterio de dedupe que import-game-reviews.ts: el CSV no trae un ID
 * estable, así que cada fila se hashea (fecha + fuente + rating + texto +
 * fecha de respuesta) y se inserta con skipDuplicates — nunca duplica al
 * reimportar el mismo export o uno más grande que lo incluya.
 *
 * A diferencia de GameReview, esto NO tiene vínculo a facility ni a
 * partido — es sentimiento de red completa sobre la app (App Store / Play
 * Store), no atribuible a una ubicación puntual.
 *
 * Requiere DATABASE_URL y DIRECT_URL en .env.
 */

import { PrismaClient, AppReviewSource } from "@prisma/client";
import { parse } from "csv-parse/sync";
import fs from "fs";
import crypto from "crypto";

const prisma = new PrismaClient();

type CsvRow = {
  "Review Date": string;
  "Source": string;
  "Rating": string;
  "Review Text": string;
  "Reply Text": string;
  "Reply Date": string;
  "Reply Status": string;
  "Reply Time (days)": string;
};

function toIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloatOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toSource(raw: string | undefined): AppReviewSource | null {
  const s = raw?.trim().toLowerCase();
  if (s === "ios") return AppReviewSource.IOS;
  if (s === "android") return AppReviewSource.ANDROID;
  return null;
}

function sourceHash(row: CsvRow): string {
  const parts = [row["Review Date"], row["Source"], row["Rating"], row["Review Text"], row["Reply Date"]];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Uso: npx tsx scripts/import-app-reviews.ts /ruta/al/archivo.csv");
    process.exit(1);
  }

  const raw = fs.readFileSync(path, "utf-8");
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true });
  console.log(`Leídas ${rows.length} filas. Importando...`);

  type PendingRow = {
    reviewDate: Date;
    source: AppReviewSource;
    rating: number;
    reviewText: string | null;
    replyText: string | null;
    replyDate: Date | null;
    replied: boolean;
    replyTimeDays: number | null;
    sourceHash: string;
  };
  const pending: PendingRow[] = [];
  const BATCH_SIZE = 2000;
  let totalInserted = 0;
  let skipped = 0;

  async function flushBatch() {
    if (pending.length === 0) return;
    const result = await prisma.appReview.createMany({ data: pending, skipDuplicates: true });
    totalInserted += result.count;
    pending.length = 0;
  }

  for (const row of rows) {
    const source = toSource(row["Source"]);
    const rating = toIntOrNull(row["Rating"]);
    if (!source || rating === null || !row["Review Date"]?.trim()) {
      skipped++;
      continue;
    }

    pending.push({
      reviewDate: new Date(row["Review Date"]),
      source,
      rating,
      reviewText: row["Review Text"]?.trim() || null,
      replyText: row["Reply Text"]?.trim() || null,
      replyDate: row["Reply Date"]?.trim() ? new Date(row["Reply Date"]) : null,
      replied: row["Reply Status"]?.trim().toLowerCase() === "replied",
      replyTimeDays: toFloatOrNull(row["Reply Time (days)"]),
      sourceHash: sourceHash(row),
    });

    if (pending.length >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  console.log(`Listo. Insertadas: ${totalInserted}. Omitidas por datos incompletos: ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
