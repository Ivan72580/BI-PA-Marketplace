/**
 * Busca en la carpeta Descargas del usuario los exports más recientes de
 * cada fuente configurada y sincroniza cada una con la base. Pensado para
 * programarse una vez por día en el Programador de Tareas de Windows (ver
 * SETUP.md) — un solo script para las tres fuentes, igual que antes solo
 * cubría events.csv.
 *
 * Uso manual:
 *   npm run auto-import
 *
 * No borra nada de Descargas. Cada fuente es independiente: si no hay un
 * archivo nuevo de una fuente, esa fuente simplemente no se sincroniza esta
 * vez (no es un error) — las demás siguen su curso.
 *
 * Dos formas de tratar el archivo encontrado en Descargas, según la fuente:
 *   - events.csv: se copia directo como "archivo madre" (data/events.csv,
 *     lo pisa) — siempre es una exportación completa, y el import ya hace
 *     upsert real por Game ID en la base, así que no hace falta más.
 *   - Player Satisfaction (reviews de partido / reviews de la app): se
 *     MEZCLA sobre el archivo madre en vez de pisarlo (ver
 *     scripts/lib/csvMerge.ts), porque a diferencia de events.csv, un
 *     export nuevo puede ser más chico (por rango de fecha) — pisar el
 *     archivo madre con uno más chico perdería el historial que solo vivía
 *     ahí. Cada fila nueva que ya existía (mismo reviewKey) actualiza al
 *     archivo madre; una fila nueva de verdad se agrega; una fila vieja que
 *     no vino en este export queda como estaba.
 * En ambos casos, el import a la base es un upsert real (por Game ID o por
 * reviewKey según la fuente) — así que da lo mismo si se lo corre sobre el
 * archivo madre completo o sobre el export nuevo solo; se deja siempre
 * sobre el archivo madre ya mezclado, por consistencia.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { mergeCsvIntoMaster } from "./lib/csvMerge";
import { gameReviewKey, appReviewKey } from "./lib/reviewKeys";

const PROJECT_ROOT = path.join(__dirname, "..");
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");

type Source = {
  label: string;
  filenamePattern: RegExp;
  targetFilename: string;
  npmScript: string;
  // Si está presente, el archivo encontrado se mezcla sobre el archivo
  // madre (data/<targetFilename>) en vez de pisarlo — ver comentario del
  // archivo. La función recibe una fila cruda del CSV (columnas originales)
  // y devuelve la clave de identidad de esa fila.
  mergeKeyFn?: (row: Record<string, string>) => string;
};

const SOURCES: Source[] = [
  {
    label: "Eventos (events.csv)",
    // events_output_2026-09-A1BC234.csv — año-mes, guion, 7 alfanuméricos
    filenamePattern: /^events_output_\d{4}-\d{2}-[A-Za-z0-9]{7}\.csv$/i,
    targetFilename: "events.csv",
    npmScript: "db:import",
  },
  {
    label: "Player Satisfaction — reviews por partido",
    // export_2026-09-25T0000.csv — fecha + hora de generación del export
    filenamePattern: /^export_\d{4}-\d{2}-\d{2}T\d{4}\.csv$/i,
    targetFilename: "game-reviews.csv",
    npmScript: "db:import-game-reviews",
    mergeKeyFn: (row) => gameReviewKey({ gameId: row["Game ID"], date: row["Date"], playerPhone: row["Player Phone"] }),
  },
  {
    label: "Player Satisfaction — reviews de la app",
    // recent_reviews_2026-09-25T0948.csv
    filenamePattern: /^recent_reviews_\d{4}-\d{2}-\d{2}T\d{4}\.csv$/i,
    targetFilename: "app-reviews.csv",
    npmScript: "db:import-app-reviews",
    mergeKeyFn: (row) => appReviewKey({ reviewDate: row["Review Date"], source: row["Source"] }),
  },
];

function findLatestMatch(pattern: RegExp): string | null {
  const matches = fs
    .readdirSync(DOWNLOADS_DIR)
    .filter((name) => pattern.test(name))
    .map((name) => {
      const fullPath = path.join(DOWNLOADS_DIR, name);
      return { name, fullPath, mtime: fs.statSync(fullPath).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime); // más reciente primero

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    console.log(`  Se encontraron ${matches.length} archivos — usando el más reciente: ${matches[0].name}`);
  }

  return matches[0].fullPath;
}

function runSource(source: Source): void {
  console.log(`\n${source.label}:`);
  const latest = findLatestMatch(source.filenamePattern);

  if (!latest) {
    console.log(`  No se encontró ningún archivo nuevo en Descargas para esta fuente. Nada para hacer.`);
    return;
  }

  const targetPath = path.join(PROJECT_ROOT, "data", source.targetFilename);
  console.log(`  Encontrado: ${latest}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (source.mergeKeyFn) {
    const result = mergeCsvIntoMaster(latest, targetPath, source.mergeKeyFn);
    console.log(`  Mezclado sobre el archivo madre: ${result.added} nuevas, ${result.updated} actualizadas, ${result.unchanged} sin cambios (total: ${result.total}).`);
  } else {
    fs.copyFileSync(latest, targetPath);
    console.log(`  Copiado a: ${targetPath}`);
  }

  console.log("  Sincronizando con la base...");
  execSync(`npm run ${source.npmScript}`, { stdio: "inherit", cwd: PROJECT_ROOT });
}

function main() {
  console.log(`Buscando exports en: ${DOWNLOADS_DIR}`);

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error(`No se encontró la carpeta de Descargas en: ${DOWNLOADS_DIR}`);
    return;
  }

  for (const source of SOURCES) {
    runSource(source);
  }

  console.log("\nListo.");
}

main();
