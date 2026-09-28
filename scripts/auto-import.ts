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
 * vez (no es un error) — las demás siguen su curso. Lo mismo aplica si una
 * fuente falla de verdad (ver "Aislamiento entre fuentes" más abajo): las
 * otras dos igual se procesan.
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
 *
 * Registro de corridas (logs/auto-import.log):
 * Corriendo desde el Programador de Tareas, la ventana de cmd.exe se cierra
 * sola apenas termina el proceso (haya salido bien o mal) — no da tiempo a
 * leer nada en pantalla. Por eso, ADEMÁS de imprimir por consola, cada línea
 * se guarda en logs/auto-import.log (se crea solo, no se versiona en git).
 * Si un día "no pasa nada" o parece cortarse a mitad de camino, ese archivo
 * tiene el detalle completo de la última corrida — incluida la salida real
 * del import (npm run db:import, etc.) y el error si lo hubo.
 *
 * Aislamiento entre fuentes:
 * Si una fuente encuentra su archivo pero falla al copiarlo/mezclarlo o al
 * sincronizarlo con la base, esa fuente queda marcada como fallida en el
 * log, pero el script sigue con las demás — no se corta todo por un
 * problema de una sola fuente (antes de este cambio, cualquier error real
 * —no solo el caso "no hay archivo nuevo", que nunca fue un error— frenaba
 * el for entero y las fuentes siguientes ni se intentaban).
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { mergeCsvIntoMaster } from "./lib/csvMerge";
import { gameReviewKey, appReviewKey } from "./lib/reviewKeys";

const PROJECT_ROOT = path.join(__dirname, "..");
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "auto-import.log");

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

// ---------- Logging a archivo (ver comentario de cabecera) ----------

function log(line: string): void {
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // Si ni el log se puede escribir (disco lleno, permisos), no hay nada
    // más que hacer — ya se imprimió por consola al menos.
  }
}

function logError(context: string, error: unknown): void {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  log(`  ERROR en ${context}: ${detail}`);
}

// Espera activa breve entre reintentos — el script es sincrónico de punta a
// punta (fs.*Sync, execSync) para no reescribir todo a async solo por esto.
function sleepSync(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* espera */
  }
}

// El archivo recién descargado puede estar momentáneamente bloqueado (el
// antivirus lo está escaneando, o el navegador todavía lo está terminando
// de escribir) — reintentar unos segundos antes de tratarlo como error de
// verdad evita que una corrida falle por algo que se resuelve solo.
function waitUntilReadable(filePath: string, attempts = 5, delayMs = 1500): void {
  for (let i = 1; i <= attempts; i++) {
    try {
      const fd = fs.openSync(filePath, "r");
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      log(`  Archivo todavía no accesible (${(err as NodeJS.ErrnoException).code ?? "?"}), reintentando en ${delayMs}ms (${i}/${attempts})...`);
      sleepSync(delayMs);
    }
  }
}

// Corre "npm run <npmScript>" capturando toda su salida (antes quedaba con
// stdio:"inherit", así que si la ventana se cerraba sola, esa salida se
// perdía para siempre) — ahora se guarda entera en el log, haya salido bien
// o mal.
function runNpmScript(npmScript: string): void {
  try {
    const output = execSync(`npm run ${npmScript}`, { cwd: PROJECT_ROOT, encoding: "utf-8" });
    if (output.trim()) log(output.trimEnd());
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    if (e.stdout?.trim()) log(e.stdout.trimEnd());
    if (e.stderr?.trim()) log(e.stderr.trimEnd());
    throw new Error(`falló "npm run ${npmScript}" (ver salida arriba)`);
  }
}

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
    log(`  Se encontraron ${matches.length} archivos — usando el más reciente: ${matches[0].name}`);
  }

  return matches[0].fullPath;
}

// Lanza si algo falla — el llamador (main) decide qué hacer con eso, para
// que una fuente rota no le impida correr a las demás.
function runSource(source: Source): void {
  log(`\n${source.label}:`);
  const latest = findLatestMatch(source.filenamePattern);

  if (!latest) {
    log(`  No se encontró ningún archivo nuevo en Descargas para esta fuente. Nada para hacer.`);
    return;
  }

  log(`  Encontrado: ${latest}`);
  waitUntilReadable(latest);

  const targetPath = path.join(PROJECT_ROOT, "data", source.targetFilename);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (source.mergeKeyFn) {
    const result = mergeCsvIntoMaster(latest, targetPath, source.mergeKeyFn);
    log(`  Mezclado sobre el archivo madre: ${result.added} nuevas, ${result.updated} actualizadas, ${result.unchanged} sin cambios (total: ${result.total}).`);
  } else {
    fs.copyFileSync(latest, targetPath);
    log(`  Copiado a: ${targetPath}`);
  }

  log("  Sincronizando con la base...");
  runNpmScript(source.npmScript);
  log(`  ${source.label}: listo.`);
}

function main(): void {
  log(`\n=== auto-import — ${new Date().toISOString()} ===`);
  log(`Buscando exports en: ${DOWNLOADS_DIR}`);

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    log(`No se encontró la carpeta de Descargas en: ${DOWNLOADS_DIR}`);
    process.exitCode = 1;
    return;
  }

  let hadError = false;
  for (const source of SOURCES) {
    try {
      runSource(source);
    } catch (err) {
      hadError = true;
      logError(source.label, err);
      log(`  Esta fuente falló — se sigue de todos modos con las que quedan.`);
    }
  }

  log(hadError ? "\nListo, con errores (ver detalle arriba y en logs/auto-import.log)." : "\nListo.");
  if (hadError) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  // Red de seguridad final: nada debería llegar hasta acá (main ya aísla
  // cada fuente), pero si algo lo hace, que quede en el log antes de que el
  // proceso termine, en vez de perderse con el cierre de la ventana.
  logError("main()", err);
  process.exitCode = 1;
}
