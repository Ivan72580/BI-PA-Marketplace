/**
 * Busca en la carpeta Descargas del usuario el archivo de export más
 * reciente (patrón: events_output_YYYY-MM-XXXXXXX.csv), lo copia a
 * data/events.csv, y corre la sincronización con la base.
 *
 * Uso manual:
 *   npm run auto-import
 *
 * Uso automático: programalo en el Programador de Tareas de Windows para
 * que corra una vez por día (ver SETUP.md para el paso a paso).
 *
 * No borra nada de Descargas — si no hay un archivo nuevo desde la última
 * vez, vuelve a sincronizar el mismo (es seguro, el importador hace upsert).
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const PROJECT_ROOT = path.join(__dirname, "..");
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
const TARGET_PATH = path.join(PROJECT_ROOT, "data", "events.csv");

// events_output_2026-09-A1BC234.csv — año-mes, guion, 7 alfanuméricos
const FILENAME_PATTERN = /^events_output_\d{4}-\d{2}-[A-Za-z0-9]{7}\.csv$/i;

function findLatestExport(): string | null {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error(`No se encontró la carpeta de Descargas en: ${DOWNLOADS_DIR}`);
    return null;
  }

  const matches = fs
    .readdirSync(DOWNLOADS_DIR)
    .filter((name) => FILENAME_PATTERN.test(name))
    .map((name) => {
      const fullPath = path.join(DOWNLOADS_DIR, name);
      return { name, fullPath, mtime: fs.statSync(fullPath).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime); // más reciente primero

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    console.log(`Se encontraron ${matches.length} exports en Descargas — usando el más reciente: ${matches[0].name}`);
  }

  return matches[0].fullPath;
}

function main() {
  console.log(`Buscando exports en: ${DOWNLOADS_DIR}`);
  const latest = findLatestExport();

  if (!latest) {
    console.log('No se encontró ningún archivo "events_output_*.csv" en Descargas. Nada para hacer — salgo sin error.');
    return;
  }

  console.log(`Encontrado: ${latest}`);
  fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
  fs.copyFileSync(latest, TARGET_PATH);
  console.log(`Copiado a: ${TARGET_PATH}`);

  console.log("Sincronizando con la base (upsert)...");
  execSync("npm run db:import", { stdio: "inherit", cwd: PROJECT_ROOT });

  console.log("Listo.");
}

main();
