/**
 * Sincroniza el CSV de reviews de tienda de apps (iOS/Android) con la base.
 *
 * Uso:
 *   npx tsx scripts/import-app-reviews.ts /ruta/al/archivo.csv
 *
 * El CSV no trae un ID de review estable, así que en vez de un ID real se
 * usa reviewKey (fecha de review + plataforma, ver scripts/lib/reviewKeys.ts)
 * para identificar "la misma review" entre una exportación y la siguiente.
 * Es un upsert real, igual criterio que import-csv.ts usa para Game:
 *   - reviewKey ya existe → se actualiza (rating/texto/respuesta pueden
 *     haber cambiado — el caso real más común es que se agregue una
 *     respuesta después de que ya la habíamos importado).
 *   - reviewKey nuevo → se agrega.
 *   - Una review que ya teníamos y no aparece en este archivo queda como
 *     está — este script nunca borra filas que no vinieron en el CSV.
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
import { appReviewKey } from "./lib/reviewKeys";

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

type PendingRow = {
  reviewDate: Date;
  source: AppReviewSource;
  rating: number;
  reviewText: string | null;
  replyText: string | null;
  replyDate: Date | null;
  replied: boolean;
  replyTimeDays: number | null;
  reviewKey: string;
};

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Uso: npx tsx scripts/import-app-reviews.ts /ruta/al/archivo.csv");
    process.exit(1);
  }

  const raw = fs.readFileSync(path, "utf-8");
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true });
  console.log(`Leídas ${rows.length} filas. Importando...`);

  // Map en vez de array: si dos filas del mismo archivo caen en el mismo
  // reviewKey (misma fecha+plataforma — ver el comentario del archivo), se
  // quedan con la última en vez de mandar dos filas con la misma clave
  // única a createMany, que rompería todo el lote con un error de
  // constraint.
  const pending = new Map<string, PendingRow>();
  const BATCH_SIZE = 2000;
  let totalNuevas = 0;
  let totalActualizadas = 0;
  let skipped = 0;

  async function flushBatch() {
    if (pending.size === 0) return;
    const rows = Array.from(pending.values());
    const keys = Array.from(pending.keys());

    const existingCount = await prisma.appReview.count({ where: { reviewKey: { in: keys } } });
    await prisma.appReview.deleteMany({ where: { reviewKey: { in: keys } } });
    const result = await prisma.appReview.createMany({ data: rows });

    totalActualizadas += existingCount;
    totalNuevas += result.count - existingCount;
    pending.clear();
  }

  for (const row of rows) {
    const source = toSource(row["Source"]);
    const rating = toIntOrNull(row["Rating"]);
    if (!source || rating === null || !row["Review Date"]?.trim()) {
      skipped++;
      continue;
    }

    const reviewKey = appReviewKey({ reviewDate: row["Review Date"], source: row["Source"] });
    pending.set(reviewKey, {
      reviewDate: new Date(row["Review Date"]),
      source,
      rating,
      reviewText: row["Review Text"]?.trim() || null,
      replyText: row["Reply Text"]?.trim() || null,
      replyDate: row["Reply Date"]?.trim() ? new Date(row["Reply Date"]) : null,
      replied: row["Reply Status"]?.trim().toLowerCase() === "replied",
      replyTimeDays: toFloatOrNull(row["Reply Time (days)"]),
      reviewKey,
    });

    if (pending.size >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  console.log(`Listo. Nuevas: ${totalNuevas}. Actualizadas: ${totalActualizadas}. Omitidas por datos incompletos: ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
