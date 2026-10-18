/**
 * Importa notas al Registro semanal desde un CSV (columnas: date, topic, text, createdAt opcional).
 * Pensado para traer las notas que se cargaron en el artefacto "Bitácora semanal" antes de que
 * existiera /weekly-log.
 *
 * Uso:
 *   npx tsx scripts/import-weekly-log.ts data/weekly-log-artifact.csv --email tu@empresa.com          # dry-run
 *   npx tsx scripts/import-weekly-log.ts data/weekly-log-artifact.csv --email tu@empresa.com --apply  # escribe
 *
 * - Todas las notas quedan a nombre de la cuenta de --email (tiene que haber iniciado sesión al
 *   menos una vez en la app, que es cuando se crea su fila en users).
 * - El tema se vincula a una facility con el mismo criterio que la página (nombre igual, sin
 *   importar mayúsculas ni acentos, y solo si no se repite en otro market).
 * - Se puede correr más de una vez: salta las notas que ya existen (misma persona, día y texto).
 */
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { isISODate, matchFacilityId } from "../app/lib/weeklyLog";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const file = process.argv[2];
  const email = arg("--email")?.toLowerCase().trim();
  const apply = process.argv.includes("--apply");
  if (!file || file.startsWith("--") || !email) {
    console.error("Uso: npx tsx scripts/import-weekly-log.ts <archivo.csv> --email <cuenta> [--apply]");
    process.exit(1);
  }

  const rows = parse(readFileSync(file), { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No existe la cuenta ${email} en users. Iniciá sesión una vez en la app y volvé a correr.`);
    const facilities = await prisma.facility.findMany({ select: { id: true, name: true } });

    let created = 0, skipped = 0, invalid = 0;
    for (const r of rows) {
      const date = r.date?.trim();
      const text = r.text?.trim();
      const topic = r.topic?.trim() || null;
      if (!isISODate(date) || !text) { invalid++; continue; }
      const day = new Date(`${date}T00:00:00Z`);
      const exists = await prisma.weeklyLogEntry.findFirst({ where: { authorId: user.id, date: day, text } });
      if (exists) { skipped++; continue; }
      const facilityId = matchFacilityId(topic, facilities);
      const facilityName = facilityId ? facilities.find((f) => f.id === facilityId)?.name : null;
      console.log(`${apply ? "+" : "(dry-run)"} ${date} [${topic ?? "—"}${facilityName ? ` → facility ${facilityName}` : topic ? " → sin vincular" : ""}] ${text.slice(0, 70)}${text.length > 70 ? "…" : ""}`);
      if (apply) {
        const createdAt = Number(r.createdAt);
        await prisma.weeklyLogEntry.create({
          data: { date: day, text, topic, facilityId, authorId: user.id, ...(Number.isFinite(createdAt) && createdAt > 0 ? { createdAt: new Date(createdAt) } : {}) },
        });
      }
      created++;
    }
    console.log(`\n${apply ? "Creadas" : "Se crearían"}: ${created} · ya existentes: ${skipped} · filas inválidas: ${invalid}`);
    if (!apply) console.log("Dry-run: no se escribió nada. Agregá --apply para importar.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
