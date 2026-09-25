/**
 * Busca en la carpeta Descargas del usuario los exports más recientes de
 * cada fuente configurada, los copia a data/, y corre la sincronización
 * con la base para cada uno.
 *
 * Uso manual:
 *   npm run auto-import
 *
 * Uso automático: programalo en el Programador de Tareas de Windows para
 * que corra una vez por día (ver SETUP.md para el paso a paso).
 *
 * No borra nada de Descargas. Cada fuente es independiente: si no hay un
 * archivo nuevo de una fuente, esa fuente simplemente no se sincroniza esta
 * vez (no es un error) — las demás siguen su curso. Todos los importadores
 * son seguros de correr las veces que haga falta, con el mismo archivo o
 * con uno que lo reemplace (upsert o insert-only con dedupe según la
 * fuente — ver el comentario de cada script de import).
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const PROJECT_ROOT = path.join(__dirname, "..");
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");

type Source = {
  label: string;
  // events_output_2026-09-A1BC234.csv — año-mes, guion, 7 alfanuméricos
  filenamePattern: RegExp;
  targetFilename: string;
  npmScript: string;
};

const SOURCES: Source[] = [
  {
    label: "Eventos (events.csv)",
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
  },
  {
    label: "Player Satisfaction — reviews de la app",
    // recent_reviews_2026-09-25T0948.csv
    filenamePattern: /^recent_reviews_\d{4}-\d{2}-\d{2}T\d{4}\.csv$/i,
    targetFilename: "app-reviews.csv",
    npmScript: "db:import-app-reviews",
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
  fs.copyFileSync(latest, targetPath);
  console.log(`  Copiado a: ${targetPath}`);

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
